// Terminal backend for doomgeneric. See ../../CONTRACT.md for the protocol.
// stdin:  "s <cols> <rows>", "k <name>", "q"
// stdout: "F <rows>" + rows ANSI lines, "S key=val ...", "L <text>"
#include "doomkeys.h"
#include "doomgeneric.h"
#include "doomstat.h"
#include "d_player.h"
#include "d_items.h"
#include "p_mobj.h"
#include "r_state.h"
#include "m_fixed.h"

#include <ctype.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <unistd.h>

#define KEYQUEUE_SIZE 64
static int release_ms = 180;
static int min_frame_ms = 50;   /* ~20 fps, set via "f <fps>" */
#define MAX_COLS 400
#define MAX_ROWS 200

static int out_fd = -1;             /* real stdout; fd 1 is redirected to stderr */
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static unsigned short key_queue[KEYQUEUE_SIZE];
static unsigned int kq_w = 0, kq_r = 0;

/* held keys: doom key -> last press time (0 = not held) */
static uint32_t held_until[256];

static volatile int cols = 0, rows = 0;
enum { MODE_BLOCKS, MODE_ASCII, MODE_MONO, MODE_BRAILLE };
static volatile int mode = MODE_BLOCKS;
static const char RAMP[] = " .:-=+*#%@";
static unsigned char lum_lut[256]; /* gamma-stretched luminance -> ramp index */
static uint32_t last_frame_ms = 0;
static char last_msg[256] = "";
static int last_state = -1, last_gs = -1, last_kills = 0, last_health = 100;
static volatile int want_snapshot = 0;

static uint32_t now_ms(void) {
    struct timespec ts; clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

static void out_write(const char *buf, size_t n) {
    while (n > 0) {
        ssize_t w = write(out_fd, buf, n);
        if (w <= 0) exit(0);          /* UI went away */
        buf += w; n -= (size_t)w;
    }
}

static void out_line(const char *s) {
    char buf[600];
    int n = snprintf(buf, sizeof buf, "%s\n", s);
    out_write(buf, (size_t)n);
}

static void enqueue(int pressed, unsigned char key) {
    key_queue[kq_w] = (unsigned short)((pressed << 8) | key);
    kq_w = (kq_w + 1) % KEYQUEUE_SIZE;
}

static int name_to_key(const char *n) {
    if (!strcmp(n, "up")) return KEY_UPARROW;
    if (!strcmp(n, "down")) return KEY_DOWNARROW;
    if (!strcmp(n, "left")) return KEY_LEFTARROW;
    if (!strcmp(n, "right")) return KEY_RIGHTARROW;
    if (!strcmp(n, "fire")) return KEY_FIRE;
    if (!strcmp(n, "use")) return KEY_USE;
    if (!strcmp(n, "run")) return KEY_RSHIFT;
    if (!strcmp(n, "strafel")) return KEY_STRAFE_L;
    if (!strcmp(n, "strafer")) return KEY_STRAFE_R;
    if (!strcmp(n, "enter")) return KEY_ENTER;
    if (!strcmp(n, "esc")) return KEY_ESCAPE;
    if (!strcmp(n, "tab")) return KEY_TAB;
    if (!strcmp(n, "pause")) return KEY_PAUSE;
    if (!strcmp(n, "backspace")) return KEY_BACKSPACE;
    if (!strcmp(n, "space")) return KEY_USE;
    if (strlen(n) == 1 && isprint((unsigned char)n[0])) return tolower((unsigned char)n[0]);
    return -1;
}

static void *reader_thread(void *arg) {
    (void)arg;
    char line[256];
    while (fgets(line, sizeof line, stdin)) {
        line[strcspn(line, "\r\n")] = 0;
        pthread_mutex_lock(&lock);
        if (line[0] == 's') {
            int c = 0, r = 0;
            if (sscanf(line + 1, "%d %d", &c, &r) == 2 && c > 0 && r > 0) {
                cols = c > MAX_COLS ? MAX_COLS : c;
                rows = r > MAX_ROWS ? MAX_ROWS : r;
            }
        } else if (line[0] == 'k' && line[1] == ' ') {
            int k = name_to_key(line + 2);
            if (k >= 0) {
                if (!held_until[k]) enqueue(1, (unsigned char)k);
                held_until[k] = now_ms() + release_ms;
            }
        } else if (line[0] == 'm' && line[1] == ' ') {
            if (!strcmp(line + 2, "blocks")) mode = MODE_BLOCKS;
            else if (!strcmp(line + 2, "ascii")) mode = MODE_ASCII;
            else if (!strcmp(line + 2, "mono")) mode = MODE_MONO;
            else if (!strcmp(line + 2, "braille")) mode = MODE_BRAILLE;
        } else if (line[0] == 'c' && line[1] == ' ') {
            /* type a string into Doom, e.g. "c iddqd" (cheats) */
            for (const char *q = line + 2; *q; q++) {
                int k = tolower((unsigned char)*q);
                if (!isprint(k)) continue;
                enqueue(1, (unsigned char)k);
                enqueue(0, (unsigned char)k);
            }
        } else if (line[0] == 'a') {
            want_snapshot = 1;            /* emit one "A <rows>" mono snapshot (80x24) */
        } else if (line[0] == 'f') {
            int fps = atoi(line + 1);
            if (fps >= 1 && fps <= 35) min_frame_ms = 1000 / fps;
        } else if (line[0] == 'r') {
            int ms = atoi(line + 1);
            if (ms >= 30 && ms <= 2000) release_ms = ms;
        } else if (line[0] == 'q') {
            pthread_mutex_unlock(&lock);
            exit(0);
        }
        pthread_mutex_unlock(&lock);
    }
    exit(0); /* stdin closed: parent died */
    return NULL;
}

static void release_expired(void) {
    uint32_t t = now_ms();
    for (int k = 0; k < 256; k++) {
        if (held_until[k] && (int32_t)(t - held_until[k]) >= 0) {
            held_until[k] = 0;
            enqueue(0, (unsigned char)k);
        }
    }
}

void DG_Init(void) {
    out_fd = dup(1);
    dup2(2, 1);                 /* Doom's own printf noise goes to stderr */
    setvbuf(stdout, NULL, _IONBF, 0);
    pthread_t th;
    pthread_create(&th, NULL, reader_thread, NULL);
    pthread_detach(th);
    for (int i = 0; i < 256; i++) {
        double v = pow(i / 255.0, 0.55);          /* lift Doom's dark palette */
        lum_lut[i] = (unsigned char)(v * (strlen(RAMP) - 1) + 0.5);
    }
    out_line("L engine ready");
}

/* Encode frame as half-block cells: fg = top pixel, bg = bottom pixel. */
static char frame_buf[MAX_ROWS * (MAX_COLS * 48 + 16) + 64];

static void emit_frame(int c, int r) {
    /* Fit a 4:3 image (Doom's intended aspect) inside c x 2r pixels, centered, black bars. */
    int px_w = c, px_h = r * 2;
    if (px_w * 3 > px_h * 4) px_w = px_h * 4 / 3; else px_h = px_w * 3 / 4;
    if (px_h < 2) px_h = 2;
    int x0 = (c - px_w) / 2;
    int y0 = ((r * 2 - px_h) / 2) & ~1;           /* even so cells align */
    int row0 = y0 / 2, row1 = row0 + (px_h + 1) / 2;
    char *p = frame_buf;
    p += sprintf(p, "F %d\n", r);
    for (int y = 0; y < r; y++) {
        int prev_fg = -1, prev_bg = -1;
        if (y < row0 || y >= row1) {
            p += sprintf(p, "\x1b[0m\x1b[38;2;0;0;0m\x1b[48;2;0;0;0m");
            for (int x = 0; x < c; x++) { memcpy(p, "\xe2\x96\x80", 3); p += 3; }
            memcpy(p, "\x1b[0m\n", 5); p += 5;
            continue;
        }
        int sy0 = ((y - row0) * 2) * DOOMGENERIC_RESY / px_h;
        int sy1 = ((y - row0) * 2 + 1) * DOOMGENERIC_RESY / px_h;
        if (sy0 >= DOOMGENERIC_RESY) sy0 = DOOMGENERIC_RESY - 1;
        if (sy1 >= DOOMGENERIC_RESY) sy1 = DOOMGENERIC_RESY - 1;
        for (int x = 0; x < c; x++) {
            uint32_t top = 0, bot = 0;
            if (x >= x0 && x < x0 + px_w) {
                int sx = (x - x0) * DOOMGENERIC_RESX / px_w;
                top = DG_ScreenBuffer[sy0 * DOOMGENERIC_RESX + sx] & 0xffffff;
                bot = DG_ScreenBuffer[sy1 * DOOMGENERIC_RESX + sx] & 0xffffff;
            }
            if ((int)top != prev_fg) {
                p += sprintf(p, "\x1b[38;2;%u;%u;%um", (top >> 16) & 255, (top >> 8) & 255, top & 255);
                prev_fg = (int)top;
            }
            if ((int)bot != prev_bg) {
                p += sprintf(p, "\x1b[48;2;%u;%u;%um", (bot >> 16) & 255, (bot >> 8) & 255, bot & 255);
                prev_bg = (int)bot;
            }
            memcpy(p, "\xe2\x96\x80", 3); p += 3;   /* upper half block */
        }
        memcpy(p, "\x1b[0m\n", 5); p += 5;
    }
    out_write(frame_buf, (size_t)(p - frame_buf));
}

/* ASCII modes: one char per cell from a luminance ramp; ascii = coloured fg, mono = plain text. */
static void emit_frame_ascii_to(char *dst, int c, int r, int colour, int snapshot) {
    int px_w = c, px_h = r * 2;
    if (px_w * 3 > px_h * 4) px_w = px_h * 4 / 3; else px_h = px_w * 3 / 4;
    if (px_h < 2) px_h = 2;
    int x0 = (c - px_w) / 2;
    int y0 = ((r * 2 - px_h) / 2) & ~1;
    int row0 = y0 / 2, row1 = row0 + (px_h + 1) / 2;
    char *p = dst;
    p += sprintf(p, "%c %d\n", snapshot ? 'A' : 'F', r);
    for (int y = 0; y < r; y++) {
        int prev_fg = -1;
        for (int x = 0; x < c; x++) {
            char ch = ' ';
            uint32_t col = 0;
            if (y >= row0 && y < row1 && x >= x0 && x < x0 + px_w) {
                int sy0 = ((y - row0) * 2) * DOOMGENERIC_RESY / px_h;
                int sy1 = sy0 + 1 < DOOMGENERIC_RESY ? sy0 + 1 : sy0;
                int sx = (x - x0) * DOOMGENERIC_RESX / px_w;
                uint32_t a = DG_ScreenBuffer[sy0 * DOOMGENERIC_RESX + sx];
                uint32_t b = DG_ScreenBuffer[sy1 * DOOMGENERIC_RESX + sx];
                int rr = (((a >> 16) & 255) + ((b >> 16) & 255)) / 2;
                int gg = (((a >> 8) & 255) + ((b >> 8) & 255)) / 2;
                int bb = ((a & 255) + (b & 255)) / 2;
                int lum = (rr * 299 + gg * 587 + bb * 114) / 1000;   /* 0..255 */
                ch = RAMP[lum_lut[lum]];
                /* brighten colour so dark ramp chars stay legible */
                int boost = 255 - lum; 
                rr += (boost * rr) / 512; gg += (boost * gg) / 512; bb += (boost * bb) / 512;
                if (rr > 255) rr = 255;
                if (gg > 255) gg = 255;
                if (bb > 255) bb = 255;
                col = ((uint32_t)rr << 16) | ((uint32_t)gg << 8) | (uint32_t)bb;
            }
            if (colour && ch != ' ' && (int)col != prev_fg) {
                p += sprintf(p, "\x1b[38;2;%u;%u;%um", (col >> 16) & 255, (col >> 8) & 255, col & 255);
                prev_fg = (int)col;
            }
            *p++ = ch;
        }
        if (colour) { memcpy(p, "\x1b[0m", 4); p += 4; }
        *p++ = '\n';
    }
    out_write(dst, (size_t)(p - dst));
}

static void emit_frame_ascii(int c, int r, int colour) { emit_frame_ascii_to(frame_buf, c, r, colour, 0); }

/* Braille mode: 2x4 dots per cell, ordered dither on gamma-lifted luminance, fg = cell colour. */
static const int BAYER[4][4] = { {0,8,2,10}, {12,4,14,6}, {3,11,1,9}, {15,7,13,5} };
static void emit_frame_braille(int c, int r) {
    int px_w = c * 2, px_h = r * 4;
    if (px_w * 3 > px_h * 4) px_w = px_h * 4 / 3; else px_h = px_w * 3 / 4;
    int cw = px_w / 2, ch_ = px_h / 4;
    int cx0 = (c - cw) / 2, cy0 = (r - ch_) / 2;
    static const int BIT[2][4] = { {0x01,0x02,0x04,0x40}, {0x08,0x10,0x20,0x80} };
    char *p = frame_buf;
    p += sprintf(p, "F %d\n", r);
    for (int y = 0; y < r; y++) {
        int prev_fg = -1;
        for (int x = 0; x < c; x++) {
            if (y < cy0 || y >= cy0 + ch_ || x < cx0 || x >= cx0 + cw) { *p++ = ' '; continue; }
            int bits = 0; long sr = 0, sg = 0, sb = 0;
            for (int dx = 0; dx < 2; dx++) for (int dy = 0; dy < 4; dy++) {
                int px = (x - cx0) * 2 + dx, py = (y - cy0) * 4 + dy;
                int sx = px * DOOMGENERIC_RESX / px_w, sy = py * DOOMGENERIC_RESY / px_h;
                if (sy >= DOOMGENERIC_RESY) sy = DOOMGENERIC_RESY - 1;
                uint32_t v = DG_ScreenBuffer[sy * DOOMGENERIC_RESX + sx];
                int rr = (v >> 16) & 255, gg = (v >> 8) & 255, bb = v & 255;
                sr += rr; sg += gg; sb += bb;
                int lum = (rr * 299 + gg * 587 + bb * 114) / 1000;
                int lifted = lum_lut[lum] * 255 / (int)(strlen(RAMP) - 1);
                if (lifted > BAYER[py & 3][px & 3] * 16 + 8) bits |= BIT[dx][dy];
            }
            int rr = sr / 8, gg = sg / 8, bb = sb / 8;
            int mx = rr > gg ? (rr > bb ? rr : bb) : (gg > bb ? gg : bb);
            if (mx > 0 && mx < 160) { rr = rr * 160 / mx; gg = gg * 160 / mx; bb = bb * 160 / mx; }
            int col = (rr << 16) | (gg << 8) | bb;
            if (bits && col != prev_fg) {
                p += sprintf(p, "\x1b[38;2;%d;%d;%dm", rr, gg, bb);
                prev_fg = col;
            }
            unsigned cp = 0x2800 + bits;
            *p++ = (char)(0xE0 | (cp >> 12));
            *p++ = (char)(0x80 | ((cp >> 6) & 0x3F));
            *p++ = (char)(0x80 | (cp & 0x3F));
        }
        memcpy(p, "\x1b[0m\n", 5); p += 5;
    }
    out_write(frame_buf, (size_t)(p - frame_buf));
}

static void emit_stats(void) {
    player_t *pl = &players[consoleplayer];
    int ammo = 0;
    if (pl->readyweapon >= 0 && pl->readyweapon < NUMWEAPONS) {
        ammotype_t at = weaponinfo[pl->readyweapon].ammo;
        if (at >= 0 && at < NUMAMMO) ammo = pl->ammo[at];
    }
    static const char *WEAPON[NUMWEAPONS] = { "fist", "pistol", "shotgun", "chaingun",
        "rocket-launcher", "plasma-rifle", "bfg9000", "chainsaw", "super-shotgun" };
    const char *wname = (pl->readyweapon >= 0 && pl->readyweapon < NUMWEAPONS) ? WEAPON[pl->readyweapon] : "none";
    int px = 0, py = 0, pang = 0, sec = -1;
    if (pl->mo) {
        px = pl->mo->x >> FRACBITS; py = pl->mo->y >> FRACBITS;
        pang = (int)(((uint64_t)pl->mo->angle * 360) >> 32);
        if (pl->mo->subsector && pl->mo->subsector->sector) sec = (int)(pl->mo->subsector->sector - sectors);
    }
    char buf[512];
    snprintf(buf, sizeof buf,
             "S health=%d armor=%d ammo=%d kills=%d items=%d secrets=%d map=E%dM%d tics=%d "
             "weapon=%s x=%d y=%d angle=%d sector=%d",
             pl->health, pl->armorpoints, ammo, pl->killcount, pl->itemcount,
             pl->secretcount, gameepisode, gamemap, gametic, wname, px, py, pang, sec);
    out_line(buf);
    /* E events: transitions the UI/narrator care about */
    if (last_state != -1) {
        if (pl->playerstate == PST_DEAD && last_state != PST_DEAD) out_line("E dead");
        if (pl->playerstate == PST_LIVE && last_state == PST_DEAD) out_line("E respawn");
        if (gamestate == GS_INTERMISSION && last_gs != GS_INTERMISSION) out_line("E level-done");
        if (gamestate == GS_LEVEL && last_gs == GS_INTERMISSION) out_line("E level-start");
        if (pl->killcount > last_kills) { snprintf(buf, sizeof buf, "E kill %d", pl->killcount); out_line(buf); }
        if (pl->health < last_health - 15) { snprintf(buf, sizeof buf, "E hurt %d", last_health - pl->health); out_line(buf); }
    }
    last_state = pl->playerstate; last_gs = gamestate; last_kills = pl->killcount; last_health = pl->health;
    if (want_snapshot) {
        want_snapshot = 0;
        /* 80x24 mono snapshot for narration; reuse ascii encoder into a side buffer */
        static char save[sizeof frame_buf];
        (void)save;
        int c = 80, r = 24;
        /* emit_frame_ascii writes "F <r>" header; patch it to "A" */
        char *start = frame_buf;
        emit_frame_ascii_to(start, c, r, 0, 1);
    }
    if (pl->message && strcmp(pl->message, last_msg) != 0) {
        snprintf(last_msg, sizeof last_msg, "%s", pl->message);
        snprintf(buf, sizeof buf, "L %s", last_msg);
        out_line(buf);
    }
}

void DG_DrawFrame(void) {
    uint32_t t = now_ms();
    if ((int32_t)(t - last_frame_ms) < min_frame_ms) return;
    last_frame_ms = t;
    pthread_mutex_lock(&lock);
    int c = cols, r = rows;
    pthread_mutex_unlock(&lock);
    if (c <= 0 || r <= 0) return;
    int m = mode;
    if (m == MODE_BLOCKS) emit_frame(c, r);
    else if (m == MODE_BRAILLE) emit_frame_braille(c, r);
    else emit_frame_ascii(c, r, m == MODE_ASCII);
    emit_stats();
}

void DG_SleepMs(uint32_t ms) { usleep(ms * 1000); }
uint32_t DG_GetTicksMs(void) { return now_ms(); }

int DG_GetKey(int *pressed, unsigned char *key) {
    pthread_mutex_lock(&lock);
    release_expired();
    int have = kq_r != kq_w;
    if (have) {
        unsigned short d = key_queue[kq_r];
        kq_r = (kq_r + 1) % KEYQUEUE_SIZE;
        *pressed = d >> 8;
        *key = d & 0xff;
    }
    pthread_mutex_unlock(&lock);
    return have;
}

void DG_SetWindowTitle(const char *title) {
    char buf[300]; snprintf(buf, sizeof buf, "L %s", title); out_line(buf);
}

int main(int argc, char **argv) {
    doomgeneric_Create(argc, argv);
    for (;;) doomgeneric_Tick();
    return 0;
}
