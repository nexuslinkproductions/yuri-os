#!/usr/bin/env node
// @capability: png-to-ico
// @serves: build windows .ico from png | zero-dep ico writer | app icon for windows exe/shortcut
// @does: Zero-dependency Windows .ico writer (Buffer + fs only, no packages). Builds the modern
//        PNG-in-ICO container: a 6-byte ICONDIR header, one 16-byte ICONDIRENTRY per source PNG,
//        followed by the raw PNG bytes themselves (Windows Vista+ accepts PNG-compressed entries —
//        no BMP/DIB re-encoding needed). Entries must be square, <=256px per side (a 256 dimension
//        is encoded as byte value 0 per the ICO spec's documented wraparound).
// @use: node png-to-ico.mjs <out.ico> <16.png> <32.png> <48.png> <256.png>
//       Or import { buildIco } and pass an array of PNG buffers/paths from another script.
// @exports: buildIco
'use strict';

import { readFileSync, writeFileSync } from 'node:fs';

/** Read PNG dimensions from its IHDR chunk (bytes 16-23 hold width/height, big-endian). */
function pngDimensions(buf) {
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) {
    throw new Error('not a PNG (bad signature)');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/**
 * Build an ICO buffer from an array of PNG buffers. Each PNG becomes one ICONDIRENTRY;
 * width/height bytes are 0 when the source is exactly 256px (ICO spec: 0 means 256).
 */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  if (count === 0) throw new Error('buildIco: at least one PNG buffer required');
  if (count > 0xffff) throw new Error('buildIco: too many images for a single ICO');

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved, must be 0
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageBlobs = [];
  let dataOffset = 6 + count * 16;

  for (const png of pngBuffers) {
    const { width, height } = pngDimensions(png);
    if (width !== height) {
      throw new Error(`buildIco: non-square PNG (${width}x${height}) — ICO entries must be square`);
    }
    if (width > 256) {
      throw new Error(`buildIco: PNG too large (${width}px) — ICO entries must be <=256px per side`);
    }

    const entry = Buffer.alloc(16);
    entry.writeUInt8(width === 256 ? 0 : width, 0);
    entry.writeUInt8(height === 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2); // color palette: 0 = no palette (PNG/truecolor)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes (should be 1 for PNG entries)
    entry.writeUInt16LE(32, 6); // bits per pixel (32 = RGBA)
    entry.writeUInt32LE(png.length, 8); // size of the PNG blob
    entry.writeUInt32LE(dataOffset, 12); // offset from start of file

    dirEntries.push(entry);
    imageBlobs.push(png);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBlobs]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('-h') || args.includes('--help')) {
    console.log('Usage: node png-to-ico.mjs <out.ico> <in1.png> [in2.png ...]');
    process.exit(args.length < 2 ? 2 : 0);
  }
  const [outPath, ...pngPaths] = args;
  const buffers = pngPaths.map((p) => readFileSync(p));
  const ico = buildIco(buffers);
  writeFileSync(outPath, ico);
  console.log(`-> wrote ${outPath} (${ico.length} bytes, ${pngPaths.length} image entries)`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main();
}

export { buildIco, pngDimensions };
