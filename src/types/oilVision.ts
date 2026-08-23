/**
 * Oil analysis vision extraction — structured lab report fields from screenshots/PDFs.
 */

/** Lab / sample identification block */
export interface OilReportHeader {
  labName: string | null;
  reportNumber: string | null;
  sampleDate: string | null; // ISO date preferred (YYYY-MM-DD)
  receivedDate: string | null;
  assetId: string | null;
  assetDescription: string | null;
  component: string | null;
  lubricantBrand: string | null;
  lubricantGrade: string | null;
  samplePoint: string | null;
}

/** Wear metals & contaminants in PPM */
export interface OilReportMetals {
  iron: number | null;
  copper: number | null;
  chromium: number | null;
  lead: number | null;
  aluminum: number | null;
  silicon: number | null;
  tin: number | null;
  nickel: number | null;
  molybdenum: number | null;
  magnesium: number | null;
  calcium: number | null;
  zinc: number | null;
  sodium: number | null;
  potassium: number | null;
  boron: number | null;
  silver: number | null;
  titanium: number | null;
  vanadium: number | null;
}

/** Fluid chemistry / physical properties */
export interface OilReportFluidProperties {
  viscosity40C: number | null; // cSt @ 40°C
  viscosity100C: number | null; // cSt @ 100°C
  viscosityIndex: number | null;
  waterPpm: number | null;
  waterPercent: number | null;
  acidNumber: number | null; // TAN mg KOH/g
  baseNumber: number | null; // TBN mg KOH/g
  oxidation: number | null;
  nitration: number | null;
  sulfation: number | null;
  sootPercent: number | null;
  flashPointC: number | null;
  particleCountIso4406: string | null; // e.g. "18/16/13"
  pqIndex: number | null; // Particle Quantifier
}

/** Machine / oil operating context */
export interface OilReportOperatingParams {
  operatingHours: number | null;
  oilHours: number | null;
  milesOrKm: number | null;
  makeUpOilLiters: number | null;
  filterChanged: boolean | null;
  oilChanged: boolean | null;
}

/**
 * Unified vision extraction payload — one pass returns header + metals + fluid + ops.
 */
export interface OilReportData {
  header: OilReportHeader;
  metals: OilReportMetals;
  fluidProperties: OilReportFluidProperties;
  operatingParams: OilReportOperatingParams;
  formatDetected:
    | "POLARIS"
    | "TESTOIL"
    | "ALS"
    | "BUREAU_VERITAS"
    | "GENERIC_LAB"
    | "VISION_SCREENSHOT"
    | "UNKNOWN";
  confidenceScore: number; // 0–100
  rawNotes: string | null;
  sourceFileName: string | null;
}
