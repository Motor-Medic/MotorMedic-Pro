/**
 * AR-25 consensus provider cascade — sequential, key-gated, free-tier-first
 * dispatch for the consensus/diagnostic engine (replaces OpenRouter-only
 * call sites in consensusEngine.ts).
 *
 * Chain order (strict-200 probe-verified 2026-10-16, AR-25 Phase 1):
 *   VISION (Stage 1)  Gemini gemini-3.5-flash -> Mistral pixtral-12b-2409
 *                     -> OpenAI gpt-4o-mini -> OpenRouter (LAST, never promoted)
 *   TEXT (2a/2b/3)    Gemini gemini-3.5-flash -> Groq openai/gpt-oss-120b
 *                     -> Mistral open-mistral-nemo -> OpenAI gpt-4o-mini
 *                     -> OpenRouter (LAST, never promoted)
 *
 * Probe outcomes that EXCLUDED entries:
 *  - Groq llama-3.3-70b-versatile / llama-3.1-8b-instant / llama-4-* /
 *    gemma-3-27b: 404 model_not_found
 *  - DashScope qwen-plus + qwen-turbo (intl AND CN hosts): 401
 *    invalid_api_key -> provider WITHHELD; an honest skip-log carries the
 *    probe code so the omission is never silent
 *  - Gemini gemini-flash-latest: persistent 503 UNAVAILABLE; Mistral
 *    mistral-small-latest: persistent 429 rate_limited -> strict-200 rule
 *    keeps the 200-probed ids above
 *  - OpenRouter real production payloads: 402 prompt-token/credit limit
 *    (the ~52-token minimal probe 200 is a false positive) -> OpenRouter
 *    stays LAST in BOTH chains regardless of minimal-probe status
 */

import {
  OPENROUTER_API_BASE,
  OPENROUTER_CONSENSUS_MODEL,
  OPENROUTER_VISION_MODELS,
  openRouterRefererHeaders
} from "../openRouterModels";

export type ConsensusCascadeTransport = "gemini" | "openai-compatible";

export interface ConsensusProviderSpec {
  id: string;
  label: string;
  envKey: string;
  transport: ConsensusCascadeTransport;
  url: string;
  models: readonly string[];
}

export interface ConsensusWithheldProvider {
  id: string;
  label: string;
  envKey: string;
  probeStatus: number;
  reason: string;
}

export interface ConsensusAttemptRecord {
  providerId: string;
  providerLabel: string;
  model: string;
  httpStatus: number | null;
  ok: boolean;
  reason: string;
}

export type ConsensusSkipReason = "missing-key" | "withheld" | "budget";

export interface ConsensusSkipRecord {
  providerId: string;
  providerLabel: string;
  envKey: string;
  reason: ConsensusSkipReason;
  detail: string;
}

export type ConsensusCascadeMode = "multi-model" | "single-model-degraded";

export const CONSENSUS_CASCADE_TIMEOUT_MS = 55_000;
const MIN_ATTEMPT_REMAINING_MS = 8_000;
const PLAIN_RETRY_STATUSES: ReadonlySet<number> = new Set([400, 422, 500]);

export const CONSENSUS_VISION_CHAIN: readonly ConsensusProviderSpec[] = [
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    transport: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    models: ["gemini-3.5-flash"]
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    transport: "openai-compatible",
    url: "https://api.mistral.ai/v1/chat/completions",
    models: ["pixtral-12b-2409"]
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    transport: "openai-compatible",
    url: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o-mini"]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    transport: "openai-compatible",
    url: `${OPENROUTER_API_BASE}/chat/completions`,
    models: OPENROUTER_VISION_MODELS
  }
];

export const CONSENSUS_TEXT_CHAIN: readonly ConsensusProviderSpec[] = [
  CONSENSUS_VISION_CHAIN[0],
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    transport: "openai-compatible",
    url: "https://api.groq.com/openai/v1/chat/completions",
    models: ["openai/gpt-oss-120b"]
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    transport: "openai-compatible",
    url: "https://api.mistral.ai/v1/chat/completions",
    models: ["open-mistral-nemo"]
  },
  CONSENSUS_VISION_CHAIN[2],
  CONSENSUS_VISION_CHAIN[3]
];

export const CONSENSUS_WITHHELD_PROVIDERS: readonly ConsensusWithheldProvider[] = [
  {
    id: "dashscope",
    label: "DashScope",
    envKey: "DASHSCOPE_API_KEY",
    probeStatus: 401,
    reason: "invalid_api_key on intl + CN host variants during AR-25 Phase 1 probe"
  }
];

interface CascadeCandidate {
  spec: ConsensusProviderSpec;
  model: string;
}

interface ProviderCall {
  ok: boolean;
  httpStatus: number | null;
  reason: string;
  content: string | null;
}

export interface ConsensusCascadeImage {
  dataUrl: string;
  mimeType: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyPresent(envKey: string): boolean {
  const value = process.env[envKey];
  return typeof value === "string" && value.trim().length > 0;
}

function missingKeySkip(spec: ConsensusProviderSpec): ConsensusSkipRecord {
  return {
    providerId: spec.id,
    providerLabel: spec.label,
    envKey: spec.envKey,
    reason: "missing-key",
    detail: `${spec.envKey} missing`
  };
}

function withheldSkip(provider: ConsensusWithheldProvider): ConsensusSkipRecord {
  return {
    providerId: provider.id,
    providerLabel: provider.label,
    envKey: provider.envKey,
    reason: "withheld",
    detail: `probe ${provider.probeStatus}: ${provider.reason}`
  };
}

export function listConsensusSkips(
  chain: readonly ConsensusProviderSpec[]
): ConsensusSkipRecord[] {
  const skips: ConsensusSkipRecord[] = [];
  for (const spec of chain) {
    if (!keyPresent(spec.envKey)) skips.push(missingKeySkip(spec));
  }
  for (const withheld of CONSENSUS_WITHHELD_PROVIDERS) {
    skips.push(withheldSkip(withheld));
  }
  return skips;
}

export function consensusCascadeReadiness(): {
  ready: boolean;
  skips: ConsensusSkipRecord[];
} {
  const seen = new Set<string>();
  const skips: ConsensusSkipRecord[] = [];
  let ready = false;
  for (const chain of [CONSENSUS_VISION_CHAIN, CONSENSUS_TEXT_CHAIN]) {
    for (const spec of chain) {
      if (seen.has(spec.id)) continue;
      seen.add(spec.id);
      if (keyPresent(spec.envKey)) ready = true;
      else skips.push(missingKeySkip(spec));
    }
  }
  for (const withheld of CONSENSUS_WITHHELD_PROVIDERS) {
    skips.push(withheldSkip(withheld));
  }
  return { ready, skips };
}

export function describeConsensusSkips(skips: readonly ConsensusSkipRecord[]): string {
  return skips
    .map((s) => `${s.providerLabel} skipped (${s.detail})`)
    .join(" | ");
}

export function describeCascadeFailure(
  attempts: readonly ConsensusAttemptRecord[],
  skips: readonly ConsensusSkipRecord[]
): string {
  const attemptParts = attempts.map((a) =>
    a.httpStatus == null
      ? `${a.providerLabel} no response (${a.reason}) [${a.model}]`
      : `${a.providerLabel} ${a.httpStatus} (${a.reason}) [${a.model}]`
  );
  const skipParts = skips.map(
    (s) => `${s.providerLabel} skipped (${s.detail})`
  );
  const parts = [...attemptParts, ...skipParts];
  return parts.length > 0 ? parts.join(" | ") : "no consensus providers attempted";
}

export class ConsensusCascadeExhaustedError extends Error {
  readonly attempts: readonly ConsensusAttemptRecord[];
  readonly skips: readonly ConsensusSkipRecord[];

  constructor(
    attempts: readonly ConsensusAttemptRecord[],
    skips: readonly ConsensusSkipRecord[]
  ) {
    super(
      `All consensus providers failed: ${describeCascadeFailure(attempts, skips)}`
    );
    this.name = "ConsensusCascadeExhaustedError";
    this.attempts = attempts;
    this.skips = skips;
  }
}

export function deriveConsensusMode(
  synthesisModels: readonly string[],
  agentAAnswered: boolean,
  agentBAnswered: boolean
): ConsensusCascadeMode {
  const distinct = new Set(synthesisModels);
  if (distinct.size >= 2 && agentAAnswered && agentBAnswered) {
    return "multi-model";
  }
  return "single-model-degraded";
}

export type ConsensusStageName = "stage1" | "stage2a" | "stage2b" | "stage3";

interface ConsensusAnswerEntry {
  stage: ConsensusStageName;
  providerLabel: string;
  model: string;
}

export class ConsensusProvenanceRecorder {
  private readonly answers: ConsensusAnswerEntry[] = [];

  record(stage: ConsensusStageName, providerLabel: string, model: string): void {
    this.answers.push({ stage, providerLabel, model });
  }

  answeringModels(): string[] {
    return [
      ...new Set(this.answers.map((a) => `${a.providerLabel}/${a.model}`))
    ];
  }

  synthesisModels(): string[] {
    return [
      ...new Set(
        this.answers
          .filter((a) => a.stage !== "stage1")
          .map((a) => `${a.providerLabel}/${a.model}`)
      )
    ];
  }
}

function firstApiReason(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) return "empty error body";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isRecord(parsed)) {
      const err = parsed.error;
      if (isRecord(err)) {
        const message = err.message;
        if (typeof message === "string" && message.trim()) {
          const code = typeof err.code === "string" ? err.code : "";
          const status = typeof err.status === "string" ? err.status : "";
          const tag = [code, status].filter(Boolean).join("/");
          return tag ? `${message} (${tag})` : message;
        }
      }
      const message = parsed.message;
      if (typeof message === "string" && message.trim()) return message;
    }
  } catch {
    /* not JSON — fall through to raw preview */
  }
  return trimmed.slice(0, 200);
}

function stripDataUrlData(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<ProviderCall> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const bodyText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        reason: firstApiReason(bodyText),
        content: null
      };
    }
    return { ok: true, httpStatus: response.status, reason: "", content: bodyText };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      err instanceof Error &&
      (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ok: false,
      httpStatus: null,
      reason: timedOut ? `timed out after ${timeoutMs}ms` : message,
      content: null
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractGeminiText(bodyText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) return null;
    const candidates = parsed.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const first = candidates[0];
    if (!isRecord(first)) return null;
    const content = first.content;
    if (!isRecord(content)) return null;
    const parts = content.parts;
    if (!Array.isArray(parts)) return null;
    const texts = parts
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .filter((text) => text.length > 0);
    return texts.length > 0 ? texts.join("\n") : null;
  } catch {
    return null;
  }
}

function extractOpenAiText(bodyText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) return null;
    const choices = parsed.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;
    const first = choices[0];
    if (!isRecord(first)) return null;
    const message = first.message;
    if (!isRecord(message)) return null;
    const content = message.content;
    return typeof content === "string" && content.trim() ? content : null;
  } catch {
    return null;
  }
}

async function callGemini(
  spec: ConsensusProviderSpec,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  image: ConsensusCascadeImage | undefined,
  jsonMode: boolean,
  timeoutMs: number
): Promise<ProviderCall> {
  const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: stripDataUrlData(image.dataUrl)
      }
    });
  }
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.15,
      ...(jsonMode ? { responseMimeType: "application/json" } : {})
    }
  };
  const call = await postJson(
    `${spec.url}/${model}:generateContent`,
    { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body,
    timeoutMs
  );
  if (!call.ok || call.content == null) return call;
  const text = extractGeminiText(call.content);
  if (text == null) {
    return { ok: false, httpStatus: call.httpStatus, reason: "empty content", content: null };
  }
  return { ok: true, httpStatus: call.httpStatus, reason: "", content: text };
}

async function callOpenAiCompatible(
  spec: ConsensusProviderSpec,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  image: ConsensusCascadeImage | undefined,
  jsonMode: boolean,
  timeoutMs: number
): Promise<ProviderCall> {
  const userContent: unknown = image
    ? [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } }
      ]
    : userPrompt;
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    temperature: 0.15,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {})
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(spec.id === "openrouter" ? openRouterRefererHeaders() : {})
  };
  const call = await postJson(spec.url, headers, body, timeoutMs);
  if (!call.ok || call.content == null) return call;
  const text = extractOpenAiText(call.content);
  if (text == null) {
    return { ok: false, httpStatus: call.httpStatus, reason: "empty content", content: null };
  }
  return { ok: true, httpStatus: call.httpStatus, reason: "", content: text };
}

interface CandidateResult<T> {
  attempt: ConsensusAttemptRecord;
  value: T | null;
  parseFailed: boolean;
}

async function attemptCandidate<T>(
  candidate: CascadeCandidate,
  systemPrompt: string,
  userPrompt: string,
  image: ConsensusCascadeImage | undefined,
  validate: (content: string) => T,
  deadline: number
): Promise<CandidateResult<T>> {
  const { spec, model } = candidate;
  const apiKey = process.env[spec.envKey]?.trim() || "";
  const baseAttempt = {
    providerId: spec.id,
    providerLabel: spec.label,
    model
  };

  const runCall = (jsonMode: boolean): Promise<ProviderCall> => {
    const remaining = Math.max(1_000, deadline - Date.now());
    const timeoutMs = Math.min(CONSENSUS_CASCADE_TIMEOUT_MS, remaining);
    if (spec.transport === "gemini") {
      return callGemini(spec, model, apiKey, systemPrompt, userPrompt, image, jsonMode, timeoutMs);
    }
    return callOpenAiCompatible(
      spec,
      model,
      apiKey,
      systemPrompt,
      userPrompt,
      image,
      jsonMode,
      timeoutMs
    );
  };

  console.log(`[Consensus] Trying ${spec.label} ${model}...`);
  let lastCall = await runCall(true);
  let parseError: string | null = null;
  let validated: { value: T } | null = null;

  if (lastCall.ok && lastCall.content != null) {
    try {
      validated = { value: validate(lastCall.content) };
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Consensus] ${spec.label} ${model} returned parse-invalid payload — ${parseError}; trying plain retry, then next provider`
      );
    }
  }

  const needsPlainRetry =
    validated == null &&
    ((lastCall.httpStatus != null && PLAIN_RETRY_STATUSES.has(lastCall.httpStatus)) ||
      parseError != null);

  if (needsPlainRetry && Date.now() < deadline - MIN_ATTEMPT_REMAINING_MS) {
    lastCall = await runCall(false);
    if (lastCall.ok && lastCall.content != null) {
      try {
        validated = { value: validate(lastCall.content) };
        parseError = null;
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[Consensus] ${spec.label} ${model} plain retry also parse-invalid — ${parseError}; falling back to next provider`
        );
      }
    }
  }

  if (validated != null) {
    console.log(
      `[Consensus] ${spec.label} ${model} ... OK (${lastCall.httpStatus ?? 200})`
    );
    return {
      attempt: {
        ...baseAttempt,
        httpStatus: lastCall.httpStatus ?? 200,
        ok: true,
        reason: ""
      },
      value: validated.value,
      parseFailed: false
    };
  }

  const reason =
    lastCall.ok && lastCall.content != null
      ? `invalid JSON/schema (${parseError ?? "validator rejected content"})`
      : lastCall.reason;
  const label =
    lastCall.httpStatus == null
      ? `no response (${reason})`
      : `${lastCall.httpStatus} (${reason})`;
  console.warn(`[Consensus] ${spec.label} ${model} ... FAIL ${label}`);
  return {
    attempt: {
      ...baseAttempt,
      httpStatus: lastCall.httpStatus,
      ok: false,
      reason
    },
    value: null,
    parseFailed: lastCall.ok
  };
}

export interface ConsensusCascadeRequest<T> {
  chain: readonly ConsensusProviderSpec[];
  stage: string;
  systemPrompt: string;
  userPrompt: string;
  image?: ConsensusCascadeImage;
  validate: (content: string) => T;
}

export type ConsensusCascadeOutcome<T> =
  | {
      ok: true;
      value: T;
      providerId: string;
      providerLabel: string;
      model: string;
      httpStatus: number;
    }
  | {
      ok: false;
      attempts: readonly ConsensusAttemptRecord[];
      skips: readonly ConsensusSkipRecord[];
    };

export async function runConsensusCascade<T>(
  request: ConsensusCascadeRequest<T>
): Promise<ConsensusCascadeOutcome<T>> {
  const attempts: ConsensusAttemptRecord[] = [];
  const skips = listConsensusSkips(request.chain);
  const candidates: CascadeCandidate[] = [];
  for (const spec of request.chain) {
    if (!keyPresent(spec.envKey)) {
      console.log(
        `[Consensus] Skipping ${spec.label} — ${spec.envKey} not present`
      );
      continue;
    }
    for (const model of spec.models) candidates.push({ spec, model });
  }
  for (const withheld of CONSENSUS_WITHHELD_PROVIDERS) {
    console.log(
      `[Consensus] Skipping ${withheld.label} — withheld (probe ${withheld.probeStatus}: ${withheld.reason})`
    );
  }

  const deadline = Date.now() + CONSENSUS_CASCADE_TIMEOUT_MS;

  for (const candidate of candidates) {
    if (Date.now() > deadline - MIN_ATTEMPT_REMAINING_MS) {
      const budgetSkip: ConsensusSkipRecord = {
        providerId: candidate.spec.id,
        providerLabel: candidate.spec.label,
        envKey: candidate.spec.envKey,
        reason: "budget",
        detail: "cascade time budget exhausted"
      };
      skips.push(budgetSkip);
      console.warn(
        `[Consensus] Skipping ${candidate.spec.label} ${candidate.model} — cascade time budget exhausted`
      );
      continue;
    }
    const result = await attemptCandidate(
      candidate,
      request.systemPrompt,
      request.userPrompt,
      request.image,
      request.validate,
      deadline
    );
    attempts.push(result.attempt);
    if (result.value != null) {
      return {
        ok: true,
        value: result.value,
        providerId: candidate.spec.id,
        providerLabel: candidate.spec.label,
        model: candidate.model,
        httpStatus: result.attempt.httpStatus ?? 200
      };
    }
  }

  console.error(
    `[Consensus] Cascade exhausted (${request.stage}): ${describeCascadeFailure(attempts, skips)}`
  );
  return { ok: false, attempts, skips };
}
