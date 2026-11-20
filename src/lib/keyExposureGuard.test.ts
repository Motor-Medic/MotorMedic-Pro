/**
 * SLICE-SEC-BASELINE-1 — key exposure guard tests.
 *
 * 1. No server-only key NAME appears as a value in client-imported modules
 *    (production code under src/components/). Key names may appear in server
 *    side config (oilVisionExtractor.ts) but must never be emitted as values
 *    to the client bundle.
 *
 * 2. Logging / redaction paths emit key NAMES / STATUS only, never VALUES.
 *    Vision provider logging specifically: pipelineTrace.ts and
 *    oilVisionExtractor.ts must not log API key values.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const componentsDir = fileURLToPath(
  new URL("../components/", import.meta.url)
);

const SERVER_ONLY_KEY_NAMES = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "LM_STUDIO_ENDPOINT",
  "LM_STUDIO_MODEL",
  "SESSION_SECRET",
  "DATABASE_URL"
] as const;

function listClientSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        // Skip test files — they are not part of the client bundle.
        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx"))
          continue;
        files.push(full);
      }
    }
  };
  walk(componentsDir);
  return files;
}

describe("key exposure — client bundle must not contain server key values", () => {
  it("no production client source file references a server-only key name", () => {
    const files = listClientSourceFiles();
    let offending: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const key of SERVER_ONLY_KEY_NAMES) {
        // Match the key name used as an identifier or string literal (not
        // inside a comment). We flag any reference that could surface the
        // key name to client code.
        if (src.includes(key)) {
          offending.push(`${file}: references ${key}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it("client source files do not embed secret-looking strings", () => {
    const files = listClientSourceFiles();
    const secretPattern = /["'](?:sk-[A-Za-z0-9]{20,}|[A-Za-z0-9]{32,}|\b[A-Fa-f0-9]{64}\b)["']/;
    let offending: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (secretPattern.test(src)) {
        offending.push(file);
      }
    }
    expect(offending).toEqual([]);
  });
});

describe("key exposure — logging emits names/status, never values", () => {
  const serverDir = fileURLToPath(new URL("./", import.meta.url));
  const pipelineTrace = readFileSync(join(serverDir, "pipelineTrace.ts"), "utf8");
  const oilVisionExtractor = readFileSync(
    join(serverDir, "oilVisionExtractor.ts"),
    "utf8"
  );

  it("pipelineTrace logs error fields by name, never interpolating raw key values", () => {
    // logPipelineFail logs structured fields (name, message, stack, cause,
    // code) — it must not concatenate raw env values into log messages.
    expect(pipelineTrace).not.toMatch(/process\.env\[/);
    expect(pipelineTrace).not.toMatch(/API_KEY/);
    expect(pipelineTrace).not.toMatch(/SESSION_SECRET/);
    expect(pipelineTrace).not.toMatch(/DATABASE_URL/);
  });

  it("oilVisionExtractor logs key presence/absence only, never key values", () => {
    // describeSkip logs the envKey NAME (e.g. "GEMINI_API_KEY missing") —
    // never the value. buildVisionFailureMessage joins attempt/skip
    // descriptions which carry names and statuses only.
    expect(oilVisionExtractor).toContain("describeSkip");
    expect(oilVisionExtractor).toContain("skipped - ");
    expect(oilVisionExtractor).toMatch(/envKey.*missing/);
    // No console.log/console.error/console.info call should interpolate
    // process.env[...] directly as a value.
    const directEnvLeak = /console\.(log|info|warn|error)\([^)]*process\.env\[/;
    expect(directEnvLeak.test(oilVisionExtractor)).toBe(false);
  });

  it("vision provider chain entries carry envKey names but no key values", () => {
    // VISION_PROVIDER_CHAIN defines envKey names for gating; values are
    // read from process.env at call time and sent only in HTTP headers
    // (server-to-provider), never logged.
    expect(oilVisionExtractor).toContain("VISION_PROVIDER_CHAIN");
    expect(oilVisionExtractor).toContain('envKey: "GEMINI_API_KEY"');
    expect(oilVisionExtractor).toContain('envKey: "OPENROUTER_API_KEY"');
    // The key VALUE is never concatenated into a log string.
    expect(oilVisionExtractor).not.toMatch(/console\.[a-z]+\([^)]*process\.env\[spec\.envKey\]/);
  });
});
