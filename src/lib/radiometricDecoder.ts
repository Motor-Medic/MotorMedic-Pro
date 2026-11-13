/**
 * Deterministic FLIR radiometric decoder — SLICE-THERMO-RAD.
 *
 * Extracts TRUE temperatures from the radiometric data the FILE carries
 * (never from rendered pixels / colors / OCR):
 *
 *   - FLIR R-JPEG: JPEG APP1 segment with signature "FLIR\0" wrapping an FFF
 *     record structure (ExifTool FLIR.pm ProcessFLIR, lines 1468-1593).
 *   - Bare FFF blobs (.rjf / .fff) and any container (incl. radiometric
 *     .ir.webp RIFF) that carries the FFF structure verbatim — found by
 *     magic-scan with strict header validation.
 *
 * Google-verified format truth (2026-11):
 *   - FFF header 0x40 bytes: magic[4]="FFF\0", creator[16] @0x04, u32 version
 *     (100/101) @0x14, u32 record-dir offset @0x18, u32 record count @0x1c.
 *     Records are 32-byte directory entries: u16 type @0x00, u32 offset
 *     @0x0c, u32 length @0x10 (ExifTool FLIR.pm ref PH / ThermoVision spec).
 *   - CameraInfo record (0x20) payload floats: Emissivity @0x20,
 *     ObjectDistance @0x24, ReflectedApparentTemperature (Kelvin) @0x28,
 *     AtmosphericTemperature @0x2c, IRWindowTemperature @0x30,
 *     IRWindowTransmission @0x34, RelativeHumidity @0x3c (fraction, or
 *     percent when >2 per ExifTool), PlanckR1 @0x58, PlanckB @0x5c,
 *     PlanckF @0x60, PlanckO (int32s) @0x308, PlanckR2 @0x30c,
 *     RawValueRangeMin/Max (u16) @0x310/0x312, RawValueMedian @0x338.
 *   - RawData record (0x01) payload: 32-byte header (u16 byte-order flag
 *     @0x00 — 0x0002 means little-endian is correct; u16 width @0x02,
 *     u16 height @0x04), then 16-bit thermal samples or a PNG-wrapped
 *     16-bit grayscale image (ExifTool FLIR RawData tags).
 *   - Temperature from raw counts (FLIR-convention Planck model, cited by
 *     ExifTool forum 4898 / Thermimage raw2temp.R / OpenDroneKit guide):
 *
 *         T [K] = B / ln( R1 / ( R2 * (raw + O) ) + F )
 *         raw   = R1 / ( R2 * ( exp(B/T) - F ) ) - O     (inverse)
 *
 * DOCTRINE: no temperature is ever synthesized here. T_max / T_min come
 * only from decoding the raw thermal samples through the camera's own
 * Planck calibration; T_ref comes only from the camera's
 * ReflectedApparentTemperature metadata. If a channel is absent from the
 * file, its output stays null and the caller keeps "Not measured".
 *
 * Server-side only (uses node:zlib for PNG-wrapped raw thermal data).
 */

import { inflateSync } from "node:zlib";

export type RadiometricContainer =
  | "jpeg-app1-flir"
  | "fff"
  | "rjf"
  | "webp-riff";

export interface FlirPlanckConstants {
  r1: number;
  r2: number;
  b: number;
  f: number;
  o: number;
}

export interface RadiometricHotspot {
  /** Pixel coordinates of the hottest decoded sample (0-based). */
  x: number;
  y: number;
  tempC: number;
  raw: number;
}

export interface RadiometricDecodeResult {
  found: boolean;
  container: RadiometricContainer | null;
  /** Hottest decoded pixel temperature (°C) — from raw counts via Planck. */
  tMaxC: number | null;
  /** Coolest decoded pixel temperature (°C) — from raw counts via Planck. */
  tMinC: number | null;
  /** Camera ReflectedApparentTemperature (°C) — the T_ref metadata. */
  reflectedTempC: number | null;
  /** Camera AtmosphericTemperature (°C). */
  atmosphericTempC: number | null;
  /** Camera RelativeHumidity in percent (fraction normalized). */
  relativeHumidityPct: number | null;
  emissivity: number | null;
  objectDistanceM: number | null;
  irWindowTransmission: number | null;
  cameraModel: string | null;
  hotspot: RadiometricHotspot | null;
  planck: FlirPlanckConstants | null;
  rawRange: { min: number; max: number; median: number } | null;
  sourceTags: string[];
}

/** Sanity bounds shared with extractThermalMetadata (extractThermalMetadata.ts:226). */
const TEMP_SANITY_MIN_C = -80;
const TEMP_SANITY_MAX_C = 500;

function temperatureFromRaw(raw: number, p: FlirPlanckConstants): number {
  return p.b / Math.log(p.r1 / (p.r2 * (raw + p.o)) + p.f) - 273.15;
}

function rawFromTemperature(tC: number, p: FlirPlanckConstants): number {
  const tK = tC + 273.15;
  return p.r1 / (p.r2 * (Math.exp(p.b / tK) - p.f)) - p.o;
}

export { temperatureFromRaw as flirRawToTemperatureC, rawFromTemperature as flirTemperatureCToRaw };

function saneCelsius(kelvinValue: number | null): number | null {
  if (kelvinValue == null || !Number.isFinite(kelvinValue)) return null;
  const c = kelvinValue - 273.15;
  if (c < TEMP_SANITY_MIN_C || c > TEMP_SANITY_MAX_C) return null;
  return c;
}

/* ------------------------------------------------------------------ */
/* FFF structure parser                                                */
/* ------------------------------------------------------------------ */

interface FffRecord {
  type: number;
  offset: number;
  length: number;
}

interface FffParse {
  byteOrder: "little" | "big";
  records: FffRecord[];
  data: Uint8Array; // FFF block bytes
  base: number; // absolute offset of FFF block start inside the file
}

/** Validate + parse the FFF header and record directory at `base`. */
function parseFffAt(bytes: Uint8Array, base: number, order: "little" | "big"): FffParse | null {
  if (base < 0 || base + 0x40 > bytes.length) return null;
  const magic = bytes[base] === 0x46 && bytes[base + 1] === 0x46 && bytes[base + 2] === 0x46;
  if (!magic) return null; // "FFF\0"
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(base + 0x14, order === "little");
  if (!(version >= 100 && version < 200)) return null;
  const dirOffset = dv.getUint32(base + 0x18, order === "little");
  const numRecords = dv.getUint32(base + 0x1c, order === "little");
  if (numRecords < 1 || numRecords > 64) return null;
  if (dirOffset < 0x40 || dirOffset + numRecords * 0x20 > bytes.length - base) return null;

  const records: FffRecord[] = [];
  for (let i = 0; i < numRecords; i++) {
    const e = base + dirOffset + i * 0x20;
    const type = dv.getUint16(e, order === "little");
    if (type === 0) continue; // empty record slot
    const offset = dv.getUint32(e + 0x0c, order === "little");
    const length = dv.getUint32(e + 0x10, order === "little");
    // Record offset is relative to the FFF block start (ExifTool: base+$recPos).
    if (offset > bytes.length - base || length > bytes.length - base - offset) return null;
    records.push({ type, offset, length });
  }
  if (records.length === 0) return null;
  return { byteOrder: order, records, data: bytes, base };
}

/**
 * Find every plausible FFF block: strict magic "FFF\0" + validated
 * version at 0x14 in either byte order. Deterministic scan, no heuristics.
 */
function scanForFffBlocks(bytes: Uint8Array): FffParse[] {
  const found: FffParse[] = [];
  const limit = bytes.length - 0x40;
  for (let i = 0; i <= limit; i++) {
    if (bytes[i] === 0x46 && bytes[i + 1] === 0x46 && bytes[i + 2] === 0x46 && bytes[i + 3] === 0) {
      const le = parseFffAt(bytes, i, "little");
      if (le) {
        found.push(le);
        i += 0x40; // skip past the validated header
        continue;
      }
      const be = parseFffAt(bytes, i, "big");
      if (be) {
        found.push(be);
        i += 0x40;
      }
    }
  }
  return found;
}

/** JPEG APP1 "FLIR\0" walk: return the FFF block offset if present. */
function findFlirApp1FffOffset(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return null; // desynchronized JPEG — stop
    const marker = bytes[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      pos += 2;
      continue;
    }
    if (marker === 0xd9) return null; // EOI before any FLIR APP1
    if (pos + 4 > bytes.length) return null;
    const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (segLen < 2) return null;
    const payload = pos + 4;
    if (payload + segLen - 2 > bytes.length) return null;
    if (marker === 0xe1) {
      // APP1: "FLIR\0" signature → FFF block follows the 4-byte signature
      if (
        bytes[payload] === 0x46 && bytes[payload + 1] === 0x4c &&
        bytes[payload + 2] === 0x49 && bytes[payload + 3] === 0x52 &&
        bytes[payload + 4] === 0
      ) {
        return payload + 5;
      }
    }
    pos = payload + segLen - 2;
  }
  return null;
}

/** RIFF/WebP chunk walk (for radiometric .ir.webp containers). */
function findWebpFlirChunkOffset(bytes: Uint8Array): number | null {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50
  ) {
    return null;
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size = dv.getUint32(pos + 4, true);
    const payload = pos + 8;
    if (id === "FLIR" || id === "FFF ") {
      // Payload may start with "FLIR\0" signature or the FFF magic directly
      if (bytes[payload] === 0x46 && bytes[payload + 1] === 0x4c && bytes[payload + 2] === 0x49) {
        return payload + 5; // "FLIR\0" signature (5 bytes) → FFF block follows
      }
      return payload;
    }
    const advance = size + (size % 2); // RIFF chunks are word-aligned
    if (advance <= 0) return null;
    pos = payload + advance;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Record decoders                                                     */
/* ------------------------------------------------------------------ */

const RECORD_CAMERA_INFO = 0x20;
const RECORD_RAW_DATA = 0x01;

interface CameraInfo {
  emissivity: number | null;
  objectDistanceM: number | null;
  reflectedTempC: number | null;
  atmosphericTempC: number | null;
  irWindowTransmission: number | null;
  relativeHumidityPct: number | null;
  cameraModel: string | null;
  planck: FlirPlanckConstants | null;
  rawRange: { min: number; max: number; median: number } | null;
}

function readCameraInfo(fff: FffParse, rec: FffRecord): CameraInfo | null {
  const start = fff.base + rec.offset;
  const end = start + rec.length;
  if (end > fff.data.length || rec.length < 0x40) return null;
  const dv = new DataView(fff.data.buffer, fff.data.byteOffset, fff.data.byteLength);

  // CameraInfo[0] carries a byte-order flag: 0x0002 when the current
  // order is correct; >= 0x0100 means flip (ExifTool FLIR.pm CameraInfo).
  let order = fff.byteOrder;
  const flag = dv.getUint16(start, order === "little");
  if (flag >= 0x0100) order = order === "little" ? "big" : "little";

  const f32 = (off: number): number | null => {
    if (start + off + 4 > end) return null;
    const v = dv.getFloat32(start + off, order === "little");
    return Number.isFinite(v) ? v : null;
  };

  const humidityRaw = f32(0x3c);
  // ExifTool: have seen value expressed as percent in FFF files (>2 → /100).
  let humidityPct: number | null = null;
  if (humidityRaw != null && humidityRaw > 0 && humidityRaw <= 100) {
    humidityPct = humidityRaw > 2 ? Number(humidityRaw.toFixed(1)) : Number((humidityRaw * 100).toFixed(1));
  }

  const r1 = f32(0x58);
  const b = f32(0x5c);
  const f = f32(0x60);
  const r2 = f32(0x30c);
  let planck: FlirPlanckConstants | null = null;
  if (r1 != null && r2 != null && b != null && f != null) {
    const oOff = start + 0x308;
    if (oOff + 4 <= end) {
      const o = dv.getInt32(oOff, order === "little");
      // Planck constants must be physically plausible; else refuse (no fabrication)
      if (Number.isFinite(o) && b > 100 && b < 5000 && r1 > 0 && r2 > 0 && r2 < 1) {
        planck = { r1, r2, b, f, o };
      }
    }
  }

  const rawRange = (() => {
    const minOff = start + 0x310;
    if (minOff + 4 > end) return null;
    const min = dv.getUint16(minOff, order === "little");
    const max = dv.getUint16(minOff + 2, order === "little");
    let median: number | null = null;
    const medOff = start + 0x338;
    if (medOff + 2 <= end) median = dv.getUint16(medOff, order === "little");
    return { min, max, median };
  })();

  const readString = (off: number, len: number): string | null => {
    if (start + off + len > end) return null;
    let s = "";
    for (let i = 0; i < len; i++) {
      const ch = fff.data[start + off + i];
      if (ch === 0) break;
      if (ch < 0x20 || ch > 0x7e) return null;
      s += String.fromCharCode(ch);
    }
    return s.trim() ? s.trim() : null;
  };

  return {
    emissivity: (() => {
      const e = f32(0x20);
      if (e == null || e < 0.01 || e > 1) return null;
      return Number(e.toFixed(3));
    })(),
    objectDistanceM: (() => {
      const d = f32(0x24);
      if (d == null || d < 0 || d > 10000) return null;
      return Number(d.toFixed(2));
    })(),
    reflectedTempC: saneCelsius(f32(0x28)),
    atmosphericTempC: saneCelsius(f32(0x2c)),
    irWindowTransmission: (() => {
      const t = f32(0x34);
      if (t == null || t <= 0 || t > 1) return null;
      return Number(t.toFixed(3));
    })(),
    relativeHumidityPct: humidityPct,
    cameraModel: readString(0xd4, 32),
    planck,
    rawRange
  };
}

/** Decode 16-bit grayscale PNG (FLIR-wrapped raw thermal image). */
function decodePng16GraySamples(png: Uint8Array, width: number, height: number, bigEndianPixels: boolean): Uint16Array | null {
  if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return null;
  // Walk chunks; concatenate IDAT payloads.
  const idat: Uint8Array[] = [];
  let pos = 8;
  let ihdr: { width: number; height: number; bitDepth: number; colorType: number } | null = null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (pos + 8 <= png.length) {
    const len = dv.getUint32(pos, false);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const payload = pos + 8;
    if (payload + len > png.length) return null;
    if (type === "IHDR") {
      if (len < 13) return null;
      ihdr = {
        width: dv.getUint32(payload, false),
        height: dv.getUint32(payload + 4, false),
        bitDepth: png[payload + 8],
        colorType: png[payload + 9]
      };
    } else if (type === "IDAT") {
      idat.push(png.subarray(payload, payload + len));
    } else if (type === "IEND") {
      break;
    }
    pos = payload + len + 4; // skip CRC
  }
  if (!ihdr || ihdr.bitDepth !== 16 || ihdr.colorType !== 0) return null;
  if (ihdr.width !== width || ihdr.height !== height) return null;
  if (idat.length === 0) return null;
  let total = 0;
  for (const chunk of idat) total += chunk.length;
  const compressed = new Uint8Array(total);
  let off = 0;
  for (const chunk of idat) {
    compressed.set(chunk, off);
    off += chunk.length;
  }
  let raw: Uint8Array;
  try {
    raw = inflateSync(compressed);
  } catch {
    return null;
  }
  const stride = width * 2 + 1; // 16-bit gray + 1 filter byte per row
  if (raw.length < height * stride) return null;
  const samples = new Uint16Array(width * height);
  const prevRow = new Uint8Array(width * 2);
  const curRow = new Uint8Array(width * 2);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const filter = raw[rowStart];
    const rowBytes = raw.subarray(rowStart + 1, rowStart + 1 + width * 2);
    curRow.set(rowBytes);
    // Un-filter in bytes (per PNG spec), then read 16-bit samples.
    const bpp = 2;
    for (let x = 0; x < width * 2; x++) {
      const a = x >= bpp ? curRow[x - bpp] : 0;
      const bByte = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      switch (filter) {
        case 0: // None
          break;
        case 1: // Sub
          curRow[x] = (curRow[x] + a) & 0xff;
          break;
        case 2: // Up
          curRow[x] = (curRow[x] + bByte) & 0xff;
          break;
        case 3: // Average
          curRow[x] = (curRow[x] + ((a + bByte) >> 1)) & 0xff;
          break;
        case 4: { // Paeth
          const p = a + bByte - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - bByte);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? bByte : c;
          curRow[x] = (curRow[x] + pred) & 0xff;
          break;
        }
        default:
          return null;
      }
    }
    for (let x = 0; x < width; x++) {
      const hi = bigEndianPixels ? curRow[x * 2] : curRow[x * 2 + 1];
      const lo = bigEndianPixels ? curRow[x * 2 + 1] : curRow[x * 2];
      samples[y * width + x] = (hi << 8) | lo;
    }
    prevRow.set(curRow);
  }
  return samples;
}

interface RawDecoded {
  samples: Uint16Array;
  width: number;
  height: number;
  pixelByteOrder: "little" | "big";
}

function readRawDataRecord(fff: FffParse, rec: FffRecord): RawDecoded | null {
  const start = fff.base + rec.offset;
  const end = start + rec.length;
  if (end > fff.data.length || rec.length < 0x24) return null;
  const dv = new DataView(fff.data.buffer, fff.data.byteOffset, fff.data.byteLength);

  // RawData[0] byte-order flag: 0x0002 when current order is correct
  // (ExifTool FLIR.pm RawData 0x00 / ToggleByteOrder rule).
  let order = fff.byteOrder;
  const flag = dv.getUint16(start, order === "little");
  if (flag >= 0x0100) order = order === "little" ? "big" : "little";

  const width = dv.getUint16(start + 0x02, order === "little");
  const height = dv.getUint16(start + 0x04, order === "little");
  if (width < 1 || height < 1 || width > 10000 || height > 10000) return null;

  const imageData = fff.data.subarray(start + 0x20, end);
  if (imageData[0] === 0x89 && imageData[1] === 0x50) {
    const samples = decodePng16GraySamples(imageData, width, height, order === "big");
    if (!samples) return null;
    return { samples, width, height, pixelByteOrder: order };
  }
  // Bare 16-bit samples (ExifTool wraps these in a TIFF header; length check
  // mirrors GetImageType's `length $val != $w * $h * 2` validation).
  if (imageData.length !== width * height * 2) return null;
  const samples = new Uint16Array(width * height);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = dv.getUint16(start + 0x20 + i * 2, order === "little");
  }
  return { samples, width, height, pixelByteOrder: order };
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

function emptyResult(): RadiometricDecodeResult {
  return {
    found: false,
    container: null,
    tMaxC: null,
    tMinC: null,
    reflectedTempC: null,
    atmosphericTempC: null,
    relativeHumidityPct: null,
    emissivity: null,
    objectDistanceM: null,
    irWindowTransmission: null,
    cameraModel: null,
    hotspot: null,
    planck: null,
    rawRange: null,
    sourceTags: []
  };
}

function finalize(
  fff: FffParse,
  container: RadiometricContainer,
  cam: CameraInfo | null,
  raw: RawDecoded | null
): RadiometricDecodeResult {
  const result = emptyResult();
  result.found = true;
  result.container = container;
  const tags = result.sourceTags;
  if (cam) {
    tags.push("FLIR CameraInfo");
    result.emissivity = cam.emissivity;
    result.objectDistanceM = cam.objectDistanceM;
    result.reflectedTempC = cam.reflectedTempC;
    result.atmosphericTempC = cam.atmosphericTempC;
    result.irWindowTransmission = cam.irWindowTransmission;
    result.relativeHumidityPct = cam.relativeHumidityPct;
    result.cameraModel = cam.cameraModel;
    result.planck = cam.planck;
    result.rawRange = cam.rawRange;
  }

  if (raw && cam?.planck) {
    const p = cam.planck;
    let minIdx = -1;
    let maxIdx = -1;
    for (let i = 0; i < raw.samples.length; i++) {
      const s = raw.samples[i];
      if (minIdx < 0 || s < raw.samples[minIdx]) minIdx = i;
      if (maxIdx < 0 || s > raw.samples[maxIdx]) maxIdx = i;
    }
    if (maxIdx >= 0) {
      const tMaxC = temperatureFromRaw(raw.samples[maxIdx], p);
      const tMinC = temperatureFromRaw(raw.samples[minIdx], p);
      // Temperature monotonicity sanity: decoded hotspot must not be colder
      // than the decoded coldest sample. Refuse the channel otherwise.
      if (
        tMaxC >= TEMP_SANITY_MIN_C && tMaxC <= TEMP_SANITY_MAX_C &&
        tMinC >= TEMP_SANITY_MIN_C && tMinC <= TEMP_SANITY_MAX_C &&
        tMaxC >= tMinC
      ) {
        result.tMaxC = Number(tMaxC.toFixed(2));
        result.tMinC = Number(tMinC.toFixed(2));
        result.hotspot = {
          x: maxIdx % raw.width,
          y: Math.floor(maxIdx / raw.width),
          tempC: result.tMaxC,
          raw: raw.samples[maxIdx]
        };
        tags.push("FLIR RawData → Planck T_max/T_min");
      }
    }
  } else if (raw && !cam?.planck && raw.samples.length > 0 && cam?.rawRange) {
    // Raw counts without Planck constants: temperatures are mathematically
    // undefined — the honesty doctrine forbids guessing (OpenDroneKit guide:
    // "a missing [Planck constant] is refused rather than guessed").
    tags.push("FLIR RawData (no Planck constants — temperatures withheld)");
  }

  return result;
}

/**
 * Decode radiometric FLIR data from any supported container:
 * FLIR R-JPEG (APP1 "FLIR\0"), bare FFF/.rjf, and RIFF/WebP containers
 * carrying the FFF structure (radiometric .ir.webp).
 */
export function decodeRadiometric(bytes: Uint8Array): RadiometricDecodeResult {
  if (!bytes || bytes.length < 0x44) return emptyResult();

  // 1) FLIR R-JPEG: APP1 segment with "FLIR\0" signature.
  const app1Fff = findFlirApp1FffOffset(bytes);
  if (app1Fff != null) {
    for (const order of ["little", "big"] as const) {
      const fff = parseFffAt(bytes, app1Fff, order);
      if (!fff) continue;
      const camRec = fff.records.find((r) => r.type === RECORD_CAMERA_INFO);
      const rawRec = fff.records.find((r) => r.type === RECORD_RAW_DATA);
      const cam = camRec ? readCameraInfo(fff, camRec) : null;
      const raw = rawRec ? readRawDataRecord(fff, rawRec) : null;
      if (cam || raw) return finalize(fff, "jpeg-app1-flir", cam, raw);
    }
  }

  // 2) RIFF/WebP container carrying a FLIR/FFF chunk (radiometric .ir.webp).
  const webpFff = findWebpFlirChunkOffset(bytes);
  if (webpFff != null) {
    const decoded = tryFffBlocks(bytes, webpFff, "webp-riff");
    if (decoded) return decoded;
  }

  // 3) Bare FFF blob (.rjf / .fff) or any container with the FFF
  //    structure embedded verbatim (generic magic scan with validation).
  const scanned = tryFffBlocks(bytes, 0, "fff");
  if (scanned) return scanned;

  return emptyResult();
}

function tryFffBlocks(
  bytes: Uint8Array,
  preferredBase: number,
  container: RadiometricContainer
): RadiometricDecodeResult | null {
  const candidates: Array<{ base: number; order: "little" | "big" }> = [];
  for (const order of ["little", "big"] as const) {
    const p = parseFffAt(bytes, preferredBase, order);
    if (p) candidates.push({ base: preferredBase, order });
  }
  if (candidates.length === 0) {
    const blocks = scanForFffBlocks(bytes);
    for (const b of blocks) candidates.push({ base: b.base, order: b.byteOrder });
  }
  for (const cand of candidates) {
    const fff = parseFffAt(bytes, cand.base, cand.order)!;
    const camRec = fff.records.find((r) => r.type === RECORD_CAMERA_INFO);
    const rawRec = fff.records.find((r) => r.type === RECORD_RAW_DATA);
    const cam = camRec ? readCameraInfo(fff, camRec) : null;
    const raw = rawRec ? readRawDataRecord(fff, rawRec) : null;
    if (cam || raw) {
      return finalize(fff, container, cam, raw);
    }
  }
  return null;
}

/** Format description used in logs / test name checks. */
export function describeRadiometricContainer(c: RadiometricContainer | null): string {
  switch (c) {
    case "jpeg-app1-flir":
      return "FLIR R-JPEG APP1 (FLIR\\0 → FFF)";
    case "webp-riff":
      return "FLIR radiometric WebP (RIFF FLIR/FFF chunk)";
    case "rjf":
      return "FLIR .rjf (FFF)";
    case "fff":
      return "FLIR FFF";
    default:
      return "none";
  }
}
