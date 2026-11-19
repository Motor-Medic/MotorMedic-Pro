/**
 * SLICE-VISION-LIVE-2 probe (NOT part of the test suite).
 *
 * For each provider rung in the real vision chain, send the saved oil-report
 * PNG / MCA grouped-bar PNG through the real dispatcher (runMasterVisionModelLoop)
 * with only that provider's key present. Records provider, model, HTTP status,
 * and whether the body parsed into the target schema.
 *
 * Usage: npx tsx --env-file=.env scripts/vision-live-probe.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
import {
  runMasterVisionModelLoop,
  finalizeOilFromParses,
  VISION_PROVIDER_CHAIN,
  VisionProviderError
} from "../src/lib/oilVisionExtractor";
import { finalizeMcaFromParses } from "../src/lib/mcaVisionExtractor";
import { MASTER_VISION_PROMPT } from "../src/lib/vision/masterVisionPrompt";
import { MCA_GROUPED_BAR_PROMPT } from "../src/lib/vision/mcaGroupedBarPrompt";

type Purpose = "oil" | "mca";

const FIXTURES: Record<Purpose, string> = {
  oil: path.join(HERE, "fixtures", "oil-report.png"),
  mca: path.join(HERE, "fixtures", "mca-grouped-bar.png")
};

interface Row {
  purpose: Purpose;
  provider: string;
  model: string;
  http: string;
  parsed: string;
  detail: string;
}

function dataUrl(file: string): string {
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
}

function targetSchemaOk(purpose: Purpose, parsed: Record<string, unknown>): boolean {
  if (purpose === "oil") {
    const tech = String(parsed.detected_technology ?? "").toUpperCase();
    const rows = parsed.raw_table;
    return tech === "OIL" && Array.isArray(rows) && rows.length > 0;
  }
  const bars = parsed.mca_bar_chart as { series?: unknown } | undefined;
  return Boolean(bars && Array.isArray(bars.series) && bars.series.length > 0);
}

async function probeOne(
  purpose: Purpose,
  spec: (typeof VISION_PROVIDER_CHAIN)[number],
  image: string
): Promise<Row> {
  const snapshot = new Map<string, string | undefined>();
  for (const s of VISION_PROVIDER_CHAIN) {
    snapshot.set(s.envKey, process.env[s.envKey]);
    process.env[s.envKey] = "";
  }
  const original = snapshot.get(spec.envKey);
  process.env[spec.envKey] = original ?? "";

  let lastStatus: number | null = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const res = await realFetch(...args);
    lastStatus = res.status;
    return res;
  }) as typeof fetch;

  try {
    const { parses } = await runMasterVisionModelLoop({
      imageBase64: image,
      fileName: purpose === "mca" ? "mca-grouped-bar.png" : "oil-report.png",
      maxTokens: 6000,
      ...(purpose === "mca" ? { prompt: MCA_GROUPED_BAR_PROMPT } : { prompt: MASTER_VISION_PROMPT })
    });
    const primary = parses[0];
    const parsed = primary?.parsed ?? {};
    const ok = targetSchemaOk(purpose, parsed);
    let detail = "";
    if (purpose === "oil") {
      const out = finalizeOilFromParses(parses, null, { imageBase64: image, fileName: "oil-report.png" });
      detail = out.success ? "oil-finalize ok" : `${(out as { error?: string }).error ?? "failed"}`;
    } else {
      const out = finalizeMcaFromParses(parses, null, { imageBase64: image, fileName: "mca-grouped-bar.png" });
      detail = out.success ? "mca-finalize ok" : `${out.error}: ${out.message}`;
    }
    return {
      purpose,
      provider: spec.id,
      model: primary?.model ?? "(none)",
      http: lastStatus == null ? "?" : String(lastStatus),
      parsed: ok ? "YES" : "NO",
      detail
    };
  } catch (err) {
    if (err instanceof VisionProviderError) {
      const first = err.attempts[0];
      return {
        purpose,
        provider: spec.id,
        model: first?.model ?? spec.models[0] ?? "?",
        http: first?.httpStatus == null ? "no-response" : String(first.httpStatus),
        parsed: "NO",
        detail: `${err.kind}: ${first?.reason ?? err.message}`
      };
    }
    return {
      purpose,
      provider: spec.id,
      model: spec.models[0] ?? "?",
      http: lastStatus == null ? "no-response" : String(lastStatus),
      parsed: "NO",
      detail: err instanceof Error ? err.message : String(err)
    };
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function main() {
  const rows: Row[] = [];
  for (const purpose of ["oil", "mca"] as const) {
    const image = dataUrl(FIXTURES[purpose]);
    for (const spec of VISION_PROVIDER_CHAIN) {
      const row = await probeOne(purpose, spec, image);
      rows.push(row);
      console.log(
        `PROBE ${purpose} ${row.provider} ${row.model} http=${row.http} parsed=${row.parsed} :: ${row.detail}`
      );
    }
  }

  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s.padEnd(n));
  console.log("\n| purpose | provider | model | HTTP | schema | detail |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(
      `| ${r.purpose} | ${r.provider} | ${pad(r.model, 28)} | ${r.http} | ${r.parsed} | ${r.detail.replace(/\|/g, "/")} |`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
