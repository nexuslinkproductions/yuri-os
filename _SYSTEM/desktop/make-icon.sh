#!/usr/bin/env bash
# @capability: yuri-desktop-icon-builder
# @serves: build yuri app icon | generate icns and ico | rasterize yuri-icon.svg | icon pipeline for desktop app
# @does: Zero-dependency icon pipeline. Renders assets/yuri-icon.svg to PNGs via qlmanage, punches the
#        opaque-white matte qlmanage bakes onto SVG thumbnails back to real transparency (verified
#        empirically: qlmanage produces alpha=255 everywhere even for a background-less SVG — see
#        assets/png-alpha-punch.mjs), resamples with sips into a full Yuri.iconset, builds
#        assets/generated/Yuri.icns via iconutil, then writes assets/generated/yuri.ico via the
#        zero-dep assets/png-to-ico.mjs (16/32/48/256 PNG-in-ICO entries). All generated rasters land
#        under assets/generated/ (gitignored); only the SVG sources stay tracked.
# @use: bash _SYSTEM/desktop/make-icon.sh [--svg PATH] [--out-dir DIR]
#        Re-run any time yuri-icon.svg changes; idempotent (regenerates assets/generated/ in place).
#        If qlmanage's rasterization is ever unusable on a given host, this script prints a clear
#        skip/degrade message and exits non-zero rather than emitting a corrupt icon.
# @exports: (builder script; no importable functions — pure bash CLI)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/assets"
SVG_PATH="$ASSETS_DIR/yuri-icon.svg"
OUT_DIR="$ASSETS_DIR/generated"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--svg PATH] [--out-dir DIR]

  --svg PATH      Source SVG to rasterize (default: assets/yuri-icon.svg)
  --out-dir DIR   Where generated rasters/iconset/icns/ico land (default: assets/generated)
  -h, --help      Show this help

Requires (all macOS built-ins, zero installs): qlmanage, sips, iconutil, node.
Produces: <out-dir>/Yuri.iconset/*.png, <out-dir>/Yuri.icns, <out-dir>/yuri.ico
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --svg)
      [ $# -ge 2 ] || { echo "error: --svg requires a value" >&2; exit 2; }
      SVG_PATH="$2"; shift 2 ;;
    --out-dir)
      [ $# -ge 2 ] || { echo "error: --out-dir requires a value" >&2; exit 2; }
      OUT_DIR="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "error: unrecognized argument: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

if [ ! -f "$SVG_PATH" ]; then
  echo "error: source SVG not found: $SVG_PATH" >&2
  exit 1
fi

for tool in qlmanage sips iconutil node; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "DEGRADE: required tool '$tool' not found on PATH — cannot rasterize icons on this host." >&2
    echo "         This is a documented graceful-degrade path (see README.md icon pipeline section)." >&2
    echo "         macOS ships all of qlmanage/sips/iconutil; node is required separately." >&2
    exit 1
  fi
done

ALPHA_PUNCH="$ASSETS_DIR/png-alpha-punch.mjs"
PNG_TO_ICO="$ASSETS_DIR/png-to-ico.mjs"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

RAW_DIR="$OUT_DIR/.raw"
mkdir -p "$RAW_DIR"

echo "-> rasterizing $SVG_PATH via qlmanage (1024px master)"
if ! qlmanage -t -s 1024 -o "$RAW_DIR" "$SVG_PATH" >/tmp/yuri-qlmanage.$$.log 2>&1; then
  echo "DEGRADE: qlmanage failed to produce a thumbnail for $SVG_PATH." >&2
  cat /tmp/yuri-qlmanage.$$.log >&2
  rm -f /tmp/yuri-qlmanage.$$.log
  exit 1
fi
rm -f /tmp/yuri-qlmanage.$$.log

SVG_BASENAME="$(basename "$SVG_PATH")"
MASTER_RAW="$RAW_DIR/${SVG_BASENAME}.png"
if [ ! -f "$MASTER_RAW" ]; then
  echo "DEGRADE: qlmanage did not produce the expected thumbnail at $MASTER_RAW" >&2
  echo "         (qlmanage's SVG rendering can be finicky across macOS versions — this is the" >&2
  echo "         documented degrade path; see README.md for the manual fallback.)" >&2
  exit 1
fi

# ---- verify the rasterization is actually usable before trusting the rest of the pipeline ----
RASTER_CHECK="$(file "$MASTER_RAW" 2>/dev/null || true)"
case "$RASTER_CHECK" in
  *"PNG image data"*) : ;;
  *)
    echo "DEGRADE: qlmanage output is not recognizable PNG data: $RASTER_CHECK" >&2
    exit 1
    ;;
esac

MASTER_PUNCHED="$OUT_DIR/.raw/master-punched.png"
echo "-> punching opaque-white matte to transparency (qlmanage bakes white on SVG thumbnails)"
node "$ALPHA_PUNCH" "$MASTER_RAW" "$MASTER_PUNCHED"

# ---- build the iconset (macOS 16..512 + @2x variants) ----
ICONSET_DIR="$OUT_DIR/Yuri.iconset"
mkdir -p "$ICONSET_DIR"

declare -a ICONSET_SIZES=(
  "16:icon_16x16.png"
  "32:icon_16x16@2x.png"
  "32:icon_32x32.png"
  "64:icon_32x32@2x.png"
  "128:icon_128x128.png"
  "256:icon_128x128@2x.png"
  "256:icon_256x256.png"
  "512:icon_256x256@2x.png"
  "512:icon_512x512.png"
  "1024:icon_512x512@2x.png"
)

echo "-> resampling iconset sizes via sips"
for entry in "${ICONSET_SIZES[@]}"; do
  size="${entry%%:*}"
  name="${entry##*:}"
  sips -z "$size" "$size" "$MASTER_PUNCHED" --out "$ICONSET_DIR/$name" >/dev/null
done

# ---- icns via iconutil ----
ICNS_PATH="$OUT_DIR/Yuri.icns"
echo "-> building $ICNS_PATH via iconutil"
if ! iconutil -c icns -o "$ICNS_PATH" "$ICONSET_DIR" 2>/tmp/yuri-iconutil.$$.log; then
  echo "DEGRADE: iconutil failed to build the .icns from $ICONSET_DIR" >&2
  cat /tmp/yuri-iconutil.$$.log >&2
  rm -f /tmp/yuri-iconutil.$$.log
  exit 1
fi
rm -f /tmp/yuri-iconutil.$$.log

# ---- windows .ico via the zero-dep node writer (16/32/48/256) ----
ICO_DIR="$OUT_DIR/.ico-src"
mkdir -p "$ICO_DIR"
sips -z 16 16 "$MASTER_PUNCHED" --out "$ICO_DIR/16.png" >/dev/null
sips -z 32 32 "$MASTER_PUNCHED" --out "$ICO_DIR/32.png" >/dev/null
sips -z 48 48 "$MASTER_PUNCHED" --out "$ICO_DIR/48.png" >/dev/null
sips -z 256 256 "$MASTER_PUNCHED" --out "$ICO_DIR/256.png" >/dev/null

ICO_PATH="$OUT_DIR/yuri.ico"
echo "-> building $ICO_PATH via png-to-ico.mjs"
node "$PNG_TO_ICO" "$ICO_PATH" "$ICO_DIR/16.png" "$ICO_DIR/32.png" "$ICO_DIR/48.png" "$ICO_DIR/256.png"

rm -rf "$RAW_DIR" "$ICO_DIR"

echo "-> done."
echo "   icns: $ICNS_PATH"
echo "   ico:  $ICO_PATH"
echo "   iconset (source pngs, kept for inspection): $ICONSET_DIR"
