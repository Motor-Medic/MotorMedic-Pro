import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stripComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");

const derivedColumn = /\b(?:nas_class|sae_class|wpc|wsi|plp|dl_ds_ratio|varnish_risk_index)\b/i;

const migrationsDir = fileURLToPath(new URL("../../migrations/", import.meta.url));
const ownSource = readFileSync(
  fileURLToPath(new URL("./oilAnalysisPersistence.ts", import.meta.url)),
  "utf8",
);
const serverSource = stripComments(
  readFileSync(fileURLToPath(new URL("../../server.ts", import.meta.url)), "utf8"),
);

describe("derived oil metrics are computed on read, never stored", () => {
  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  it("the migration scan sees the real schema files", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
    expect(migrationFiles).toContain("012_diagnosis_sign_off.sql");
  });

  it("no migration defines a derived-class or derived-index column", () => {
    for (const file of migrationFiles) {
      const sql = stripComments(readFileSync(join(migrationsDir, file), "utf8"));
      expect(
        derivedColumn.test(sql),
        `${file} defines a derived column`,
      ).toBe(false);
    }
  });

  it("server boot SQL defines no derived column either", () => {
    expect(serverSource).toContain("oil_samples");
    expect(derivedColumn.test(serverSource)).toBe(false);
  });

  it("the oil_samples INSERT persists stored measurements only", () => {
    expect(ownSource).toContain("INSERT INTO oil_samples");
    expect(derivedColumn.test(ownSource)).toBe(false);
  });

  it("stored sample columns include the real particle counts (anti-vacuity)", () => {
    expect(ownSource).toContain("particles_4um");
    expect(ownSource).toContain("dr_large");
    expect(ownSource).toContain("iso_4um");
  });
});
