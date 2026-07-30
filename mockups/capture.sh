#!/usr/bin/env bash
# Regenerate every mockup PNG from the HTML sources in this directory.
#
# The sources are self-contained and render straight off file://, so this needs
# no dev server. PNGs are not committed (they are large and regenerable); this
# script is the record of how to get them back.
#
#   ./mockups/capture.sh              -> writes into mockups/out/
#   ./mockups/capture.sh /some/dir    -> writes there instead
#
# One batch only:  ./mockups/capture.sh out chess
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$HERE/out}"
ONLY="${2:-}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }
mkdir -p "$OUT"

# batch:count — the number of ?d= variants each file carries
BATCHES="profile:10 wheel:5 select:4 chess:10 t9:6 slots:6 dummyparse:20 decrypt:5"

for entry in $BATCHES; do
  name="${entry%%:*}"; count="${entry##*:}"
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && continue
  for d in $(seq 1 "$count"); do
    printf -v n "%02d" "$d" 2>/dev/null || n=$(printf "%02d" "$d")
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
      --force-device-scale-factor=1 --virtual-time-budget=3000 \
      --window-size=1500,900 \
      --screenshot="$OUT/${name}-${n}.png" \
      "file://$HERE/${name}.html?d=${d}" >/dev/null 2>&1
  done
  echo "captured $name ($count)"
done

echo "PNGs in $OUT"
