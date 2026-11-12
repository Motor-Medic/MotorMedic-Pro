import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, ROOT)), "utf8");
}

const diagnose = read("src/components/Diagnose.tsx");
const vibrationAccordions = read("src/components/VibrationInputAccordions.tsx");
const visionIntake = read("src/components/diagnostics/VisionIntakePanel.tsx");
const visionConfig = read("src/lib/vibration/visionModelConfig.ts");
const vibrationExtractor = read("src/lib/vibrationVisionExtractor.ts");
const spectrumRegions = read("src/lib/spectrumChartRegions.ts");
const server = read("server.ts");

describe("SLICE-VS2 — extraction deadline, cancel, honest status", () => {
  it("wires a 60s client deadline into extraction and consensus calls", () => {
    expect(diagnose).toContain("VISION_EXTRACTION_TIMEOUT_MS");
    expect(diagnose).toContain("CONSENSUS_TIMEOUT_MS");
    expect(diagnose).toContain("withDeadline(");
    expect(vibrationExtractor).toContain("withDeadline(");
    expect(spectrumRegions).toContain("withDeadline(");
  });

  it("renders a Cancel control during extraction and consensus", () => {
    expect(diagnose).toContain("handleCancelExtraction");
    expect(diagnose).toMatch(/>\s*Cancel\s*</);
    expect(diagnose).toContain("extractionRun.cancel()");
    expect(diagnose).toContain("analysisRun.cancel()");
    expect(vibrationAccordions).toContain("onCancelExtraction");
    expect(vibrationAccordions).toMatch(/>\s*Cancel\s*</);
    expect(visionIntake).toContain("onRetryExtraction");
    expect(visionIntake).toMatch(/>\s*Retry\s*</);
  });

  it("shows stage + elapsed seconds after 10s instead of a bare spinner", () => {
    expect(diagnose).toContain("formatRunStatus(");
    expect(diagnose).toMatch(/formatRunStatus\(\s*"consensus"/);
    expect(diagnose).toContain('extractionRun.isRunning ? "vision" : null');
    expect(vibrationAccordions).toContain("extractionStatusLabel");
  });

  it("removed the guessed image-complexity cause from every timeout message", () => {
    for (const [name, src] of [
      ["Diagnose.tsx", diagnose],
      ["VibrationInputAccordions.tsx", vibrationAccordions],
      ["VisionIntakePanel.tsx", visionIntake],
      ["visionModelConfig.ts", visionConfig],
      ["vibrationVisionExtractor.ts", vibrationExtractor],
      ["spectrumChartRegions.ts", spectrumRegions],
      ["server.ts", server]
    ] as const) {
      expect(src, `${name} still guesses at image complexity`).not.toMatch(
        /too complex|clearer image|spectrum image may/i
      );
    }
    expect(visionConfig).toMatch(/did not respond within the client deadline/i);
    expect(server).toMatch(/did not respond within the server timeout/i);
  });

  it("releases the in-flight lock on every extraction exit path", () => {
    expect(diagnose).toContain("extractionRun.begin(\"vision\")");
    expect(diagnose).toContain("extractionRun.finish()");
    expect(diagnose).toContain("analysisRun.begin(\"consensus\")");
    expect(diagnose).toContain("analysisRun.finish()");
  });
});
