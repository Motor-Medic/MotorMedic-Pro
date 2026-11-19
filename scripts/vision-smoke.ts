/**
 * npm run vision:smoke — exactly ONE live vision call through the real
 * production wire path (probeVisionProvider -> callVisionProvider).
 *
 * Prints provider, model, HTTP status and the first 200 characters of the
 * upstream body. No retries, no cascade walk.
 *
 * Optional: VISION_SMOKE_IMAGE=/path/to/report.png (defaults to the saved
 * oil-report fixture, else a 1x1 PNG so transport can still be checked).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeVisionProvider } from "../src/lib/oilVisionExtractor";
import { MASTER_VISION_PROMPT } from "../src/lib/vision/masterVisionPrompt";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function loadImage(): string {
  const explicit = process.env.VISION_SMOKE_IMAGE;
  const candidate = explicit
    ? path.resolve(explicit)
    : path.join(HERE, "fixtures", "oil-report.png");
  if (explicit || fs.existsSync(candidate)) {
    const bytes = fs.readFileSync(candidate);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }
  return `data:image/png;base64,${ONE_PIXEL_PNG}`;
}

async function main() {
  const result = await probeVisionProvider({
    imageBase64: loadImage(),
    maxTokens: 6000,
    prompt: MASTER_VISION_PROMPT
  });
  console.log(
    `vision:smoke provider=${result.providerId} model=${result.model} status=${result.status}`
  );
  console.log(`body[0..200]=${result.body.slice(0, 200).replace(/\s+/g, " ")}`);
}

main().catch((err) => {
  console.error("vision:smoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
