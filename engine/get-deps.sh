#!/usr/bin/env bash
# Fetch doomgeneric source and the Freedoom IWAD. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"
DG_COMMIT=dcb7a8dbc7a16ce3dda29382ac9aae9d77d21284
if [ ! -f doomgeneric/doomgeneric/doomgeneric.h ]; then
  echo ">> cloning doomgeneric"
  rm -rf doomgeneric
  git clone -q https://github.com/ozkl/doomgeneric doomgeneric
  git -C doomgeneric checkout -q "$DG_COMMIT"
fi
mkdir -p wads
if [ ! -f wads/freedoom1.wad ] && [ ! -f wads/doom1.wad ]; then
  echo ">> downloading Freedoom 0.13.0 (~24MB)"
  curl -sL -o wads/freedoom.zip https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip
  (cd wads && unzip -qo -j freedoom.zip '*/freedoom1.wad' && rm -f freedoom.zip)
fi
echo ">> deps ok"
