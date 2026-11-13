/**
 * SLICE-THERMO-RAD — deterministic radiometric decoder tests.
 *
 * Fixtures are synthetic FLIR FFF structures built from the Google-verified
 * byte layout (ExifTool FLIR.pm ProcessFLIR + CameraInfo/RawData tag tables;
 * Planck formula per Thermimage raw2temp.R / exiftool forum 4898):
 *
 *     T [K] = B / ln( R1 / ( R2 * (raw + O) ) + F )
 *
 * Calibration constants are the documented FLIR SC660 set:
 *   R1=21106.77, R2=0.012545258, B=1501, F=1, O=-7340
 *
 * Asserted expected values are computed INDEPENDENTLY from that formula —
 * the decoder must produce real numbers, never null on a radiometric file.
 */

import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import {
  decodeRadiometric,
  describeRadiometricContainer,
  flirRawToTemperatureC
} from "./radiometricDecoder";
import { extractThermalMetadata } from "./extractThermalMetadata";

const R1 = 21106.77;
const R2 = 0.012545258;
const PB = 1501;
const PF = 1;
const PO = -7340;

/** Raw count whose Planck decode lands on the target Celsius value. */
function rawFor(targetC: number): number {
  const tK = targetC + 273.15;
  return Math.round(R1 / (R2 * (Math.exp(PB / tK) - PF)) - PO);
}

const RAW_MAX = rawFor(22.9); // 17976 → 22.9015 °C
const RAW_MIN = rawFor(20.38); // 17520 → 20.3802 °C
const RAW_MID = rawFor(21.1);

interface FixtureSpec {
  little: boolean;
  /** Some FFF files store humidity as percent instead of fraction. */
  humidityAsPercent?: boolean;
  planckBCorrupt?: boolean;
  /** Wrap the raw thermal samples in a PNG (FLIR cameras commonly do). */
  pngRaw?: boolean;
}

/** Encode a 16-bit grayscale PNG with Sub(1)/Up(2) filters to exercise unfiltering. */
function encodePngGray16(rows: number[][], le: boolean): Uint8Array {
  const width = rows[0].length;
  const height = rows.length;
  const chunks: Uint8Array[] = [];
  const push = (type: string, payload: Uint8Array) => {
    const chunk = new Uint8Array(12 + payload.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, payload.length, false);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(payload, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + payload.length; i++) {
      crc ^= chunk[i];
      for (let b = 0; b < 8; b++) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    dv.setUint32(8 + payload.length, crc, false);
    chunks.push(chunk);
  };

  const ihdr = new Uint8Array(13);
  const ihdrDv = new DataView(ihdr.buffer);
  ihdrDv.setUint32(0, width, false);
  ihdrDv.setUint32(4, height, false);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 0; // color type: grayscale
  push("IHDR", ihdr);

  // Filter rows: row 0 uses Sub (filter 1), rows 1+ use Up (filter 2).
  // The encoder must predict from RECONSTRUCTED bytes (PNG spec), so we
  // build the reconstruction while writing each scanline.
  const stride = width * 2 + 1;
  const raw = new Uint8Array(height * stride);
  const recon = new Uint8Array(width * 2); // current row reconstruction
  const prevRecon = new Uint8Array(width * 2); // previous row reconstruction
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    const filter = y === 0 ? 1 : 2;
    raw[rowStart] = filter;
    recon.fill(0);
    for (let x = 0; x < width; x++) {
      const value = rows[y][x];
      const hi = le ? value & 0xff : (value >> 8) & 0xff;
      const lo = le ? (value >> 8) & 0xff : value & 0xff;
      for (let c = 0; c < 2; c++) {
        const idx = rowStart + 1 + x * 2 + c;
        const reconIdx = x * 2 + c;
        const target = c === 0 ? hi : lo;
        const left = x > 0 ? recon[reconIdx - 2] : 0;
        const up = prevRecon[reconIdx];
        const pred = filter === 1 ? left : filter === 2 ? up : 0;
        const delta = (target - pred) & 0xff;
        raw[idx] = delta;
        recon[reconIdx] = target; // reconstructed byte
      }
    }
    prevRecon.set(recon);
  }
  push("IDAT", new Uint8Array(deflateSync(raw)));
  push("IEND", new Uint8Array(0));

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let total = signature.length;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  out.set(signature);
  let off = signature.length;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function buildFff(spec: FixtureSpec): Uint8Array {
  const le = spec.little;
  const width = 4;
  const height = 3;
  const camLen = 0x348;
  const samples = [
    RAW_MIN, 17900, 17700, 17650,
    RAW_MAX, 17800, 17600, 17520,
    17610, 17570, 17900, RAW_MID
  ];
  const png = spec.pngRaw
    ? encodePngGray16(
        [
          samples.slice(0, 4),
          samples.slice(4, 8),
          samples.slice(8, 12)
        ],
        le
      )
    : null;
  const rawLen = 0x20 + (png ? png.length : width * height * 2);
  const camOff = 0x80;
  const rawOff = camOff + camLen;
  const total = rawOff + rawLen;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);

  const u16 = (off: number, v: number) => dv.setUint16(off, v, le);
  const u32 = (off: number, v: number) => dv.setUint32(off, v, le);
  const i32 = (off: number, v: number) => dv.setInt32(off, v, le);
  const f32 = (off: number, v: number) => dv.setFloat32(off, v, le);

  // --- FFF header (0x40 bytes) ---
  buf; // magic written via bytes below
  const bytes = new Uint8Array(buf);
  bytes[0] = 0x46; // "FFF\0"
  bytes[1] = 0x46;
  bytes[2] = 0x46;
  bytes[3] = 0;
  const creator = "MTX IR";
  for (let i = 0; i < creator.length; i++) bytes[4 + i] = creator.charCodeAt(i);
  u32(0x14, 100); // version
  u32(0x18, 0x40); // record directory offset
  u32(0x1c, 2); // record count

  // --- record directory entries (32 bytes each) ---
  const dir = 0x40;
  // entry 0: RawData (type 0x01); subtype 1=BE 2=LE (ExifTool RawData note)
  u16(dir + 0x00, 0x0001);
  u16(dir + 0x02, le ? 0x0002 : 0x0001);
  u32(dir + 0x04, 0x64);
  u32(dir + 0x08, 1);
  u32(dir + 0x0c, rawOff);
  u32(dir + 0x10, rawLen);
  // entry 1: CameraInfo (type 0x20)
  u16(dir + 0x20 + 0x00, 0x0020);
  u16(dir + 0x20 + 0x02, 0x0001);
  u32(dir + 0x20 + 0x04, 0x64);
  u32(dir + 0x20 + 0x08, 2);
  u32(dir + 0x20 + 0x0c, camOff);
  u32(dir + 0x20 + 0x10, camLen);

  // --- CameraInfo record (ExifTool FLIR::CameraInfo offsets) ---
  const c = camOff;
  // Byte-order flag: 0x0002 when the current order is correct
  u16(c + 0x00, 0x0002);
  u16(c + 0x02, width);
  u16(c + 0x04, height);
  u32(c + 0x0c, width - 1);
  u32(c + 0x10, height - 1);
  f32(c + 0x20, 0.95); // Emissivity
  f32(c + 0x24, 4.2); // ObjectDistance (m)
  f32(c + 0x28, 20.6 + 273.15); // ReflectedApparentTemperature (K)
  f32(c + 0x2c, 22.0 + 273.15); // AtmosphericTemperature (K)
  f32(c + 0x30, 20.6 + 273.15); // IRWindowTemperature (K)
  f32(c + 0x34, 0.96); // IRWindowTransmission
  f32(c + 0x3c, spec.humidityAsPercent ? 61.4 : 0.614); // RelativeHumidity
  f32(c + 0x58, R1); // PlanckR1
  f32(c + 0x5c, spec.planckBCorrupt ? 0 : PB); // PlanckB
  f32(c + 0x60, PF); // PlanckF
  const model = "FLIR E5";
  for (let i = 0; i < model.length; i++) bytes[c + 0xd4 + i] = model.charCodeAt(i);
  i32(c + 0x308, PO); // PlanckO (int32s)
  f32(c + 0x30c, R2); // PlanckR2
  u16(c + 0x310, RAW_MIN); // RawValueRangeMin
  u16(c + 0x312, RAW_MAX); // RawValueRangeMax
  u16(c + 0x338, RAW_MID); // RawValueMedian

  // --- RawData record: 32-byte header + 16-bit LE samples ---
  const r = rawOff;
  u16(r + 0x00, 0x0002); // byte-order flag: current order correct
  u16(r + 0x02, width);
  u16(r + 0x04, height);
  if (png) {
    bytes.set(png, r + 0x20);
  } else {
    for (let i = 0; i < samples.length; i++) {
      u16(r + 0x20 + i * 2, samples[i]);
    }
  }
  return bytes;
}

function wrapJpegApp1Flir(fff: Uint8Array): Uint8Array {
  // Minimal radiometric JPEG: SOI + APP1("FLIR\0" + FFF) + EOI
  const sig = [0xff, 0xd8];
  const app1Payload: number[] = [0x46, 0x4c, 0x49, 0x52, 0]; // "FLIR\0"
  const segLen = 2 + app1Payload.length + fff.length;
  const out: number[] = [...sig, 0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff, ...app1Payload];
  const head = new Uint8Array(out);
  const result = new Uint8Array(head.length + fff.length + 2);
  result.set(head);
  result.set(fff, head.length);
  result.set([0xff, 0xd9], head.length + fff.length);
  return result;
}

function wrapRiffWebp(fff: Uint8Array): Uint8Array {
  const vp8xPayload = new Uint8Array(10); // VP8X dummy
  const flirPayload = new Uint8Array(5 + fff.length); // "FLIR\0" + FFF
  flirPayload[0] = 0x46; // "FLIR\0"
  flirPayload[1] = 0x4c;
  flirPayload[2] = 0x49;
  flirPayload[3] = 0x52;
  flirPayload[4] = 0;
  flirPayload.set(fff, 5);
  const vp8xLen = 8 + vp8xPayload.length;
  const flirLen = 8 + flirPayload.length;
  const total = 12 + vp8xLen + flirLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  dv.setUint32(4, total - 8, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  let pos = 12;
  out.set([0x56, 0x50, 0x38, 0x58], pos); // "VP8X"
  dv.setUint32(pos + 4, vp8xPayload.length, true);
  out.set(vp8xPayload, pos + 8);
  pos += 8 + vp8xPayload.length;
  out.set([0x46, 0x4c, 0x49, 0x52], pos); // "FLIR"
  dv.setUint32(pos + 4, flirPayload.length, true);
  out.set(flirPayload, pos + 8);
  return out;
}

describe("SLICE-THERMO-RAD — radiometric decoder decodes TRUE temps from FLIR metadata", () => {
  it("FLIR R-JPEG APP1: decodes exact T_max / T_min / hotspot / RH from metadata, not pixels", () => {
    const jpeg = wrapJpegApp1Flir(buildFff({ little: true }));
    const r = decodeRadiometric(jpeg);
    expect(r.found).toBe(true);
    expect(r.container).toBe("jpeg-app1-flir");
    expect(r.tMaxC).not.toBeNull();
    expect(r.tMinC).not.toBeNull();
    // Exact Planck round-trip of the fixture's raw counts (22.9 / 20.38 °C,
    // quantized to the 16-bit sample grid — half a centikelvin).
    expect(r.tMaxC).toBeCloseTo(22.9, 1);
    expect(r.tMinC).toBeCloseTo(20.38, 1);
    expect(Math.abs(r.tMaxC - flirRawToTemperatureC(RAW_MAX, { r1: R1, r2: R2, b: PB, f: PF, o: PO }))).toBeLessThan(0.01);
    expect(r.hotspot).toEqual({ x: 0, y: 1, tempC: r.tMaxC, raw: RAW_MAX });
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(r.reflectedTempC).toBeCloseTo(20.6, 1);
    expect(r.emissivity).toBeCloseTo(0.95, 2);
    expect(r.objectDistanceM).toBeCloseTo(4.2, 1);
    expect(r.cameraModel).toBe("FLIR E5");
    expect(r.planck).not.toBeNull();
    // float32 storage quantization (file format stores IEEE-754 singles)
    expect(Math.abs((r.planck?.r1 ?? 0) - R1)).toBeLessThan(0.01);
    expect(Math.abs((r.planck?.r2 ?? 0) - R2)).toBeLessThan(1e-7);
    expect(Math.abs((r.planck?.b ?? 0) - PB)).toBeLessThan(0.01);
    expect(Math.abs((r.planck?.f ?? 0) - PF)).toBeLessThan(0.01);
    expect(r.planck?.o).toBe(PO);
    expect(r.sourceTags).toContain("FLIR CameraInfo");
    expect(r.sourceTags).toContain("FLIR RawData → Planck T_max/T_min");
  });

  it("big-endian FLIR APP1 (camera-written order): same exact values", () => {
    const be = wrapJpegApp1Flir(buildFff({ little: false }));
    const r = decodeRadiometric(be);
    expect(r.found).toBe(true);
    expect(r.tMaxC).toBeCloseTo(22.9, 1);
    expect(r.tMinC).toBeCloseTo(20.38, 1);
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(r.hotspot?.raw).toBe(RAW_MAX);
  });

  it("bare FFF blob (.rjf): decodes with container 'fff'", () => {
    const r = decodeRadiometric(buildFff({ little: true }));
    expect(r.found).toBe(true);
    expect(r.container).toBe("fff");
    expect(r.tMaxC).toBeCloseTo(22.9, 1);
    expect(r.tMinC).toBeCloseTo(20.38, 1);
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
  });

  it("radiometric .ir.webp (RIFF FLIR chunk): decodes with container 'webp-riff'", () => {
    const webp = wrapRiffWebp(buildFff({ little: true }));
    expect(webp[0]).toBe(0x52); // "RIFF"
    expect(webp[8]).toBe(0x57); // "WEBP"
    const r = decodeRadiometric(webp);
    expect(r.found).toBe(true);
    expect(r.container).toBe("webp-riff");
    expect(r.tMaxC).toBeCloseTo(22.9, 1);
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
  });

  it("FFF that stores humidity as percent (61.4) normalizes to 61.4%", () => {
    const r = decodeRadiometric(wrapJpegApp1Flir(buildFff({ little: true, humidityAsPercent: true })));
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
  });

  it("PNG-wrapped raw thermal data (Sub/Up filtered) decodes through inflate + unfilter", () => {
    const jpeg = wrapJpegApp1Flir(buildFff({ little: true, pngRaw: true }));
    const r = decodeRadiometric(jpeg);
    expect(r.found).toBe(true);
    expect(r.tMaxC).toBeCloseTo(22.9, 1);
    expect(r.tMinC).toBeCloseTo(20.38, 1);
    expect(r.hotspot).toEqual({ x: 0, y: 1, tempC: r.tMaxC, raw: RAW_MAX });
    expect(r.sourceTags).toContain("FLIR RawData → Planck T_max/T_min");
  });

  it("corrupt Planck B: temperatures withheld (null), metadata still decoded — no fabricated temps", () => {
    const r = decodeRadiometric(
      wrapJpegApp1Flir(buildFff({ little: true, planckBCorrupt: true }))
    );
    expect(r.found).toBe(true);
    expect(r.emissivity).toBeCloseTo(0.95, 2);
    expect(r.relativeHumidityPct).toBeCloseTo(61.4, 1);
    expect(r.reflectedTempC).toBeCloseTo(20.6, 1);
    expect(r.tMaxC).toBeNull(); // no Planck → no temperature, honesty doctrine
    expect(r.tMinC).toBeNull();
    expect(r.hotspot).toBeNull();
    expect(r.sourceTags).toContain("FLIR RawData (no Planck constants — temperatures withheld)");
  });
});

describe("SLICE-THERMO-RAD — honesty gate: files without radiometric data stay honest", () => {
  it("plain JPEG screenshot (no FLIR APP1, no FFF): found=false, every field null", () => {
    // Minimal valid JPEG skeleton: SOI + APP0 JFIF + EOI
    const app0 = [
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00
    ];
    const jpeg = new Uint8Array([
      0xff, 0xd8, ...app0, 0xff, 0xd9,
      // trailing junk that must NOT be misread as radiometric data
      1, 2, 3, 4, 5, 6, 7, 8
    ]);
    const r = decodeRadiometric(jpeg);
    expect(r.found).toBe(false);
    expect(r.container).toBeNull();
    expect(r.tMaxC).toBeNull();
    expect(r.tMinC).toBeNull();
    expect(r.tMaxC).not.toBe(22.9); // never a guessed temp
    expect(r.relativeHumidityPct).toBeNull();
    expect(r.hotspot).toBeNull();
  });

  it("random noise buffer: found=false, no fabrication", () => {
    const noise = new Uint8Array(2048);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 37 + 11) & 0xff;
    const r = decodeRadiometric(noise);
    expect(r.found).toBe(false);
    expect(r.tMaxC).toBeNull();
    expect(r.relativeHumidityPct).toBeNull();
  });

  it("describeRadiometricContainer maps containers to human labels", () => {
    expect(describeRadiometricContainer("jpeg-app1-flir")).toContain("R-JPEG");
    expect(describeRadiometricContainer("webp-riff")).toContain("WebP");
    expect(describeRadiometricContainer("fff")).toContain("FFF");
    expect(describeRadiometricContainer(null)).toContain("none");
  });
});

describe("SLICE-THERMO-RAD — endpoint composition (exifr + decoder merge)", () => {
  /**
   * Mirrors the server-side merge in POST /api/extract-thermal-metadata:
   * exifr runs first; the deterministic decoder backfills what EXIF/XMP
   * aliases missed, and the decoded block is attached as metadata.radiometric.
   */
  it("FLIR R-JPEG with no EXIF aliases: exifr misses, decoder fills, found flips true", async () => {
    const jpeg = wrapJpegApp1Flir(buildFff({ little: true }));
    const metadata = await extractThermalMetadata(jpeg as unknown as Buffer);
    // The synthetic fixture carries no EXIF/XMP → exifr path stays empty
    expect(metadata.found).toBe(false);

    // Server merge (server.ts /api/extract-thermal-metadata):
    const radiometric = decodeRadiometric(jpeg);
    expect(radiometric.found).toBe(true);
    if (radiometric.found) {
      if (metadata.emissivity == null && radiometric.emissivity != null) {
        metadata.emissivity = radiometric.emissivity;
        metadata.sourceTags.push("FLIR CameraInfo:Emissivity");
      }
      if (metadata.humidity == null && radiometric.relativeHumidityPct != null) {
        metadata.humidity = radiometric.relativeHumidityPct;
        metadata.sourceTags.push("FLIR CameraInfo:RelativeHumidity");
      }
      if (metadata.reflectedTemp == null && radiometric.reflectedTempC != null) {
        metadata.reflectedTemp = radiometric.reflectedTempC;
        metadata.sourceTags.push("FLIR CameraInfo:ReflectedApparentTemperature");
      }
      if (radiometric.emissivity != null || radiometric.relativeHumidityPct != null || radiometric.reflectedTempC != null) {
        metadata.found = true;
      }
      if (metadata.tempUnit == null) metadata.tempUnit = "°C";
    }

    expect(metadata.found).toBe(true);
    expect(metadata.humidity).toBeCloseTo(61.4, 1);
    expect(metadata.reflectedTemp).toBeCloseTo(20.6, 1);
    expect(metadata.emissivity).toBeCloseTo(0.95, 2);
    expect(metadata.tempUnit).toBe("°C");
    expect(metadata.sourceTags).toContain("FLIR CameraInfo:RelativeHumidity");
    expect(radiometric.tMaxC).toBeCloseTo(22.9, 1);
  });
});
