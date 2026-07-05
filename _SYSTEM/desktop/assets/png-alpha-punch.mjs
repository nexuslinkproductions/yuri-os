#!/usr/bin/env node
// @capability: png-alpha-punch
// @serves: strip qlmanage white matte | make svg thumbnail transparent | chroma key white to alpha | png transparency fix
// @does: Zero-dependency PNG decoder/encoder (Node's built-in zlib only, no packages). Reads an
//        8-bit RGBA (or RGB) PNG, chroma-keys near-white pixels to transparent (qlmanage bakes an
//        opaque white background onto SVG thumbnails even though the source SVG has none — verified
//        empirically: rasterizing element dark/light nexus.svg produces alpha=255 everywhere, not
//        the expected transparent corners), and writes back a valid PNG with a real alpha channel.
//        Handles only the color types this pipeline actually produces (truecolor / truecolor+alpha,
//        8-bit depth, no interlace) — anything else throws with a clear message rather than silently
//        mis-decoding.
// @use: node png-alpha-punch.mjs <in.png> <out.png> [--threshold 245] [--soften 12]
//       Or import { punchWhiteToAlpha } and call it directly from another script (make-icon.sh does).
// @exports: readPng, writePng, punchWhiteToAlpha
'use strict';

import { readFileSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---- CRC32 (needed to rebuild PNG chunks after re-deflating IDAT) ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunkTypeAndData(buf, offset) {
  const len = buf.readUInt32BE(offset);
  const type = buf.toString('ascii', offset + 4, offset + 8);
  const data = buf.subarray(offset + 8, offset + 8 + len);
  const next = offset + 8 + len + 4; // + CRC
  return { len, type, data, next };
}

function buildChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Decode an 8-bit, non-interlaced PNG (color type 2 RGB or 6 RGBA) into
 * { width, height, channels, pixels } where pixels is a flat Uint8Array of
 * width*height*4 RGBA bytes (RGB is expanded to RGBA with alpha=255).
 */
function readPng(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error(`${path}: not a PNG (bad signature)`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  while (offset < buf.length) {
    const { len, type, data, next } = chunkTypeAndData(buf, offset);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = next;
    if (len < 0 || offset > buf.length) break;
  }

  if (bitDepth !== 8) {
    throw new Error(`unsupported bit depth ${bitDepth} (only 8-bit PNGs supported)`);
  }
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`unsupported color type ${colorType} (only RGB=2 or RGBA=6 supported)`);
  }
  if (interlace !== 0) {
    throw new Error('interlaced PNGs are not supported');
  }

  const srcChannels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));

  const stride = width * srcChannels;
  const pixels = new Uint8Array(width * height * 4);
  let prevRow = new Uint8Array(stride);

  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;

    const outRow = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= srcChannels ? outRow[x - srcChannels] : 0;
      const b = prevRow[x];
      const c = x >= srcChannels ? prevRow[x - srcChannels] : 0;
      let value = row[x];
      switch (filterType) {
        case 0: // None
          break;
        case 1: // Sub
          value = (value + a) & 0xff;
          break;
        case 2: // Up
          value = (value + b) & 0xff;
          break;
        case 3: // Average
          value = (value + Math.floor((a + b) / 2)) & 0xff;
          break;
        case 4: { // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (value + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`unsupported PNG filter type ${filterType}`);
      }
      outRow[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const srcIdx = x * srcChannels;
      const dstIdx = (y * width + x) * 4;
      pixels[dstIdx] = outRow[srcIdx];
      pixels[dstIdx + 1] = outRow[srcIdx + 1];
      pixels[dstIdx + 2] = outRow[srcIdx + 2];
      pixels[dstIdx + 3] = srcChannels === 4 ? outRow[srcIdx + 3] : 255;
    }

    prevRow = outRow;
  }

  return { width, height, pixels };
}

/** Encode { width, height, pixels(RGBA Uint8Array) } as a PNG (color type 6, filter type 0, 8-bit). */
function writePng(path, { width, height, pixels }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    const srcStart = y * stride;
    Buffer.from(pixels.buffer, pixels.byteOffset + srcStart, stride).copy(raw, rowStart + 1);
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const out = Buffer.concat([
    PNG_SIG,
    buildChunk('IHDR', ihdr),
    buildChunk('IDAT', idatData),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);

  writeFileSync(path, out);
}

/**
 * Chroma-key near-white pixels to transparent. threshold: RGB channels must all be >= threshold
 * to be considered "background white". soften: pixels within `soften` of the threshold get partial
 * alpha (anti-aliased edges around the knot strokes stay smooth instead of a hard cutout).
 */
function punchWhiteToAlpha(png, { threshold = 245, soften = 12 } = {}) {
  const { pixels } = png;
  const lower = Math.max(0, threshold - soften);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const minChannel = Math.min(r, g, b);
    if (minChannel >= threshold) {
      pixels[i + 3] = 0;
    } else if (minChannel > lower) {
      // linear ramp between lower (opaque) and threshold (fully transparent)
      const t = (minChannel - lower) / (threshold - lower);
      const newAlpha = Math.round(pixels[i + 3] * (1 - t));
      pixels[i + 3] = newAlpha;
    }
  }
  return png;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('-h') || args.includes('--help')) {
    console.log('Usage: node png-alpha-punch.mjs <in.png> <out.png> [--threshold 245] [--soften 12]');
    process.exit(args.length < 2 ? 2 : 0);
  }
  const [inPath, outPath] = args;
  let threshold = 245;
  let soften = 12;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--threshold') threshold = Number(args[++i]);
    if (args[i] === '--soften') soften = Number(args[++i]);
  }

  const png = readPng(inPath);
  punchWhiteToAlpha(png, { threshold, soften });
  writePng(outPath, png);

  let transparentCount = 0;
  for (let i = 3; i < png.pixels.length; i += 4) {
    if (png.pixels[i] < 255) transparentCount++;
  }
  console.log(`-> wrote ${outPath} (${png.width}x${png.height}, ${transparentCount} pixels with alpha<255)`);
}

const isMain = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
if (isMain) {
  main();
}

export { readPng, writePng, punchWhiteToAlpha };
