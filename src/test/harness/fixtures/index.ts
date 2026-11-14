/**
 * SLICE-HARNESS fixture matrix — three controlled states per technology:
 * known-good (data present -> gates activate, real values render),
 * known-empty (no data -> honest empty, NO fabricated default),
 * known-edge (partial data, unit boundary, dimensionless ratio,
 * burned-badge-only vs radiometric, online-vs-offline mode,
 * airborne-vs-contact probe, invalid measurement suppression).
 */
import type { TechFixtures } from "../contract";
import { vibrationFixtures } from "./vibrationFixtures";
import {
  thermographyFixtures,
  thermographySmallDeltaFixture
} from "./thermographyFixtures";
import { ultrasoundFixtures } from "./ultrasoundFixtures";
import { mcaFixtures } from "./mcaFixtures";
import { oilFixtures } from "./oilFixtures";

export const FIXTURE_MATRIX: Record<string, TechFixtures> = {
  vibration: vibrationFixtures,
  thermography: thermographyFixtures,
  ultrasound: ultrasoundFixtures,
  mca: mcaFixtures,
  oil_analysis: oilFixtures
};

export { vibrationFixtures, thermographyFixtures, thermographySmallDeltaFixture, ultrasoundFixtures, mcaFixtures, oilFixtures };
