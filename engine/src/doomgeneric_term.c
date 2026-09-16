// Terminal backend for doomgeneric. See ../../CONTRACT.md for the protocol.
// stdin:  "s <cols> <rows>", "k <name>", "q"
// stdout: "F <rows>" + rows ANSI lines, "S key=val ...", "L <text>"
#include "doomkeys.h"
#include "doomgeneric.h"
#include "doomstat.h"
#include "d_player.h"
#include "d_items.h"

#include <ctype.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#define KEYQUEUE_SIZE 64
#define RELEASE_MS 180
#define MIN_FRAME_MS 50   /* ~20 fps */
#define MAX_COLS 400
#define MAX_ROWS 200

static int out_fd = -1;             /* real stdout; fd 1 is redirected to stderr */
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static unsigned short key_queue[KEYQUEUE_SIZE];
static unsigned int kq_w = 0, kq_r = 0;

/* held keys: doom key -> last press time (0 = not held) */
static uint32_t held_until[256];

static volatile int cols = 0, rows = 0;
static uint32_t last_frame_ms = 0;
static char last_msg[256] = "";

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
                held_until[k] = now_ms() + RELEASE_MS;
            }
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
    out_line("L engine ready");
}

/* Encode frame as half-block cells: fg = top pixel, bg = bottom pixel. */
static char frame_buf[MAX_ROWS * (MAX_COLS * 48 + 16) + 64];

static void emit_frame(int c, int r) {
    int px_h = r * 2;
    char *p = frame_buf;
    p += sprintf(p, "F %d\n", r);
    int prev_fg = -1, prev_bg = -1;
    for (int y = 0; y < r; y++) {
        int sy0 = (y * 2) * DOOMGENERIC_RESY / px_h;
        int sy1 = (y * 2 + 1) * DOOMGENERIC_RESY / px_h;
        prev_fg = prev_bg = -1;
        for (int x = 0; x < c; x++) {
            int sx = x * DOOMGENERIC_RESX / c;
            uint32_t top = DG_ScreenBuffer[sy0 * DOOMGENERIC_RESX + sx] & 0xffffff;
            uint32_t bot = DG_ScreenBuffer[sy1 * DOOMGENERIC_RESX + sx] & 0xffffff;
            if ((int)top != prev_fg) {
                p += sprintf(p, "\x1b[38;2;%u;%u;%um", (top >> 16) & 255, (top >> 8) & 255, top & 255);
                prev_fg = (int)top;
            }
            if ((int)bot != prev_bg) {
                p += sprintf(p, "\x1b[48;2;%u;%u;%um", (bot >> 16) & 255, (bot >> 8) & 255, bot & 255);
                prev_bg = (int)bot;
            }
            memcpy(p, "\xe2\x96\x80", 3); p += 3;   /* ▀ */
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
    char buf[512];
    snprintf(buf, sizeof buf,
             "S health=%d armor=%d ammo=%d kills=%d items=%d secrets=%d map=E%dM%d tics=%d",
             pl->health, pl->armorpoints, ammo, pl->killcount, pl->itemcount,
             pl->secretcount, gameepisode, gamemap, gametic);
    out_line(buf);
    if (pl->message && strcmp(pl->message, last_msg) != 0) {
        snprintf(last_msg, sizeof last_msg, "%s", pl->message);
        snprintf(buf, sizeof buf, "L %s", last_msg);
        out_line(buf);
    }
}

void DG_DrawFrame(void) {
    uint32_t t = now_ms();
    if ((int32_t)(t - last_frame_ms) < MIN_FRAME_MS) return;
    last_frame_ms = t;
    pthread_mutex_lock(&lock);
    int c = cols, r = rows;
    pthread_mutex_unlock(&lock);
    if (c <= 0 || r <= 0) return;
    emit_frame(c, r);
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
