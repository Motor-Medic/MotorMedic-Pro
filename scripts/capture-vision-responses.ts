/**
 * Capture one real provider response per fixture into a replayable TS fixture.
 * Uses the same wire call as the production chain (probeVisionProvider).
 *
 * Usage: npx tsx --env-file=.env scripts/capture-vision-responses.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  probeVisionProvider,
  VISION_PROVIDER_CHAIN,
  mapOilTranscription,
  mapVisionJsonToOilReportData,
  type OilTranscriptionResult
} from "../src/lib/oilVisionExtractor";
import { mapMcaTranscription } from "../src/lib/mcaVisionExtractor";
import { parseMcaBarChart } from "../src/lib/mca/mcaBarChart";
import { MASTER_VISION_PROMPT } from "../src/lib/vision/masterVisionPrompt";
import { MCA_GROUPED_BAR_PROMPT } from "../src/lib/vision/mcaGroupedBarPrompt";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER = process.env.CAPTURE_PROVIDER || "mistral";

function image(name: string): string {
  return `data:image/png;base64,${fs
    .readFileSync(path.join(HERE, "fixtures", name))
    .toString("base64")}`;
}

async function capture(purpose: "oil" | "mca", imageBase64: string) {
  const snapshot = new Map<string, string | undefined>();
  for (const s of VISION_PROVIDER_CHAIN) {
    snapshot.set(s.envKey, process.env[s.envKey]);
    process.env[s.envKey] = "";
  }
  const spec = VISION_PROVIDER_CHAIN.find((s) => s.id === PROVIDER);
  if (!spec) throw new Error(`unknown provider ${PROVIDER}`);
  process.env[spec.envKey] = snapshot.get(spec.envKey) ?? "";

  try {
    const result = await probeVisionProvider({
      imageBase64,
      maxTokens: 6000,
      prompt: purpose === "mca" ? MCA_GROUPED_BAR_PROMPT : MASTER_VISION_PROMPT
    });
    const body = JSON.parse(result.body) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("provider returned no content");
    return {
      purpose,
      providerId: result.providerId,
      provider: result.provider,
      model: result.model,
      httpStatus: result.status,
      content
    };
  } finally {
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function main() {
  const oil = await capture("oil", image("oil-report.png"));
  const mca = await capture("mca", image("mca-grouped-bar.png"));

  const out = `/**
 * SLICE-VISION-LIVE-2 — RECORDED real provider responses (captured once, no network).
 *
 * Captured ${new Date().toISOString()} from the live ${oil.provider}/${oil.model}
 * rung with the exact production payload (image data URL + the prompt named below).
 * Replay-only: tests must never call a provider.
 */
export interface RecordedVisionResponse {
  purpose: "oil" | "mca";
  providerId: string;
  provider: string;
  model: string;
  httpStatus: number;
  /** Verbatim assistant message content returned by the provider. */
  content: string;
}

export const RECORDED_OIL_RESPONSE: RecordedVisionResponse = ${JSON.stringify(oil, null, 2)};

export const RECORDED_MCA_RESPONSE: RecordedVisionResponse = ${JSON.stringify(mca, null, 2)};
`;
  fs.writeFileSync(
    path.join(HERE, "..", "src", "test", "harness", "fixtures", "recordedVisionResponses.ts"),
    out
  );

  const oilParsed = JSON.parse(oil.content) as Record<string, unknown>;
  const oilTx: OilTranscriptionResult = mapOilTranscription(oilParsed.raw_table);
  console.log("OIL parsed fields:", {
    detected: oilParsed.detected_technology,
    metals: oilTx.metals,
    fluid: oilTx.fluid,
    mapped: mapVisionJsonToOilReportData(oilParsed).metals
  });

  const mcaParsed = JSON.parse(mca.content) as Record<string, unknown>;
  const mcaTx = mapMcaTranscription(mcaParsed.raw_table);
  const bars = parseMcaBarChart(mcaParsed.mca_bar_chart);
  console.log("MCA parsed fields:", {
    detected: mcaParsed.detected_technology,
    tx: mcaTx,
    barSamples: bars?.samples.length ?? null,
    barFirst: bars?.samples[0]
  });
  console.log("captured:", oil.model, oil.httpStatus, mca.model, mca.httpStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
