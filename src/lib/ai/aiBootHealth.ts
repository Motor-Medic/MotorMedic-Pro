/**
 * VS-3 — truthful AI provider boot health.
 *
 * The old boot log printed "[OK]" from key PRESENCE alone, which reported
 * DeepSeek as healthy even though its probe returned HTTP 401. This module
 * issues one minimal, free, real ping per provider (model-list/credits GET,
 * never a billable completion), in parallel, each capped at 10 seconds, and
 * classifies the result honestly:
 *
 *   VALID / INVALID(key) / UNUSED(not in chain) / CAPACITY(429) / CREDITS(402)
 *
 * Missing keys are reported as MISSING; transport failures as UNREACHABLE.
 */

import {
  CONSENSUS_TEXT_CHAIN,
  CONSENSUS_VISION_CHAIN,
  CONSENSUS_WITHHELD_PROVIDERS
} from "../diagnostics/consensusCascade";

export type AiBootHealthStatus =
  | "VALID"
  | "INVALID(key)"
  | "UNUSED(not in chain)"
  | "CAPACITY(429)"
  | "CREDITS(402)"
  | "MISSING"
  | "UNREACHABLE";

export interface AiBootHealthReport {
  id: string;
  label: string;
  envKey: string;
  status: AiBootHealthStatus;
  detail: string;
  httpStatus: number | null;
  inChain: boolean;
  withheld: boolean;
}

export interface AiBootHealthOptions {
  env?: Record<string, string | undefined>;
  /** Test seam — production uses global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface AiPingSpec {
  url: string;
  auth: "bearer" | "gemini";
  kind: "models" | "credits";
}

interface AiProviderSpec {
  id: string;
  label: string;
  envKey: string;
  ping: AiPingSpec | null;
}

const BOOT_PING_TIMEOUT_MS = 10_000;

const PROVIDERS: readonly AiProviderSpec[] = [
  {
    id: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    ping: {
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      auth: "gemini",
      kind: "models"
    }
  },
  {
    id: "groq",
    label: "Groq",
    envKey: "GROQ_API_KEY",
    ping: {
      url: "https://api.groq.com/openai/v1/models",
      auth: "bearer",
      kind: "models"
    }
  },
  {
    id: "mistral",
    label: "Mistral",
    envKey: "MISTRAL_API_KEY",
    ping: {
      url: "https://api.mistral.ai/v1/models",
      auth: "bearer",
      kind: "models"
    }
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    ping: {
      url: "https://api.openai.com/v1/models",
      auth: "bearer",
      kind: "models"
    }
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    ping: {
      url: "https://openrouter.ai/api/v1/credits",
      auth: "bearer",
      kind: "credits"
    }
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    ping: {
      url: "https://api.deepseek.com/v1/models",
      auth: "bearer",
      kind: "models"
    }
  },
  {
    id: "dashscope",
    label: "DashScope",
    envKey: "DASHSCOPE_API_KEY",
    ping: {
      url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
      auth: "bearer",
      kind: "models"
    }
  },
  {
    id: "anthropic",
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    // Present-but-unused: no chain references Anthropic, so a boot ping would
    // not prove anything about routing. Report UNUSED instead of a fake [OK].
    ping: null
  }
];

const CHAIN_IDS = new Set<string>([
  ...CONSENSUS_VISION_CHAIN.map((spec) => spec.id),
  ...CONSENSUS_TEXT_CHAIN.map((spec) => spec.id)
]);

const WITHHELD_BY_ID = new Map(
  CONSENSUS_WITHHELD_PROVIDERS.map((provider) => [provider.id, provider])
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildHeaders(spec: AiProviderSpec, apiKey: string): Record<string, string> {
  if (!spec.ping || spec.ping.auth === "gemini") {
    return { "x-goog-api-key": apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

function creditSnapshot(bodyText: string): {
  totalCredits: number | null;
  totalUsage: number | null;
} {
  const parsed = parseJson(bodyText);
  const data = isRecord(parsed.data) ? parsed.data : parsed;
  const totalCredits = Number(data.total_credits ?? data.totalCredits);
  const totalUsage = Number(data.total_usage ?? data.totalUsage);
  return {
    totalCredits: Number.isFinite(totalCredits) ? totalCredits : null,
    totalUsage: Number.isFinite(totalUsage) ? totalUsage : null
  };
}

async function probeProvider(
  spec: AiProviderSpec,
  options: AiBootHealthOptions
): Promise<AiBootHealthReport> {
  const env = options.env ?? process.env;
  const apiKey = env[spec.envKey]?.trim() || "";
  const inChain = CHAIN_IDS.has(spec.id);
  const withheld = WITHHELD_BY_ID.get(spec.id);
  const base = {
    id: spec.id,
    label: spec.label,
    envKey: spec.envKey,
    inChain,
    withheld: withheld != null,
    httpStatus: null as number | null
  };

  if (!apiKey) {
    return {
      ...base,
      status: "MISSING",
      detail: `${spec.envKey} not set`
    };
  }

  if (!spec.ping) {
    return {
      ...base,
      status: "UNUSED(not in chain)",
      detail: withheld
        ? `key present but withheld (probe ${withheld.probeStatus}); no chain references it`
        : "key present; no chain references this provider"
    };
  }

  if (!inChain && !withheld) {
    return {
      ...base,
      status: "UNUSED(not in chain)",
      detail: "key present; no chain references this provider"
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(
    1_000,
    Math.min(options.timeoutMs ?? BOOT_PING_TIMEOUT_MS, BOOT_PING_TIMEOUT_MS)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(spec.ping.url, {
      method: "GET",
      headers: buildHeaders(spec, apiKey),
      signal: controller.signal
    });
    const bodyText = await response.text().catch(() => "");
    const httpStatus = response.status;
    const withheldNote = withheld
      ? ` (withheld from chains; probe ${withheld.probeStatus})`
      : "";

    if (httpStatus === 429) {
      return {
        ...base,
        httpStatus,
        status: "CAPACITY(429)",
        detail: `rate limited${withheldNote}`
      };
    }
    if (httpStatus === 402) {
      return {
        ...base,
        httpStatus,
        status: "CREDITS(402)",
        detail: `credits exhausted${withheldNote}`
      };
    }
    if (httpStatus === 401 || httpStatus === 403) {
      return {
        ...base,
        httpStatus,
        status: "INVALID(key)",
        detail: `HTTP ${httpStatus} unauthorized${withheldNote}`
      };
    }
    if (!response.ok) {
      return {
        ...base,
        httpStatus,
        status: "UNREACHABLE",
        detail: `HTTP ${httpStatus}${withheldNote}`
      };
    }

    if (spec.ping.kind === "credits") {
      const { totalCredits, totalUsage } = creditSnapshot(bodyText);
      if (
        totalCredits != null &&
        totalUsage != null &&
        totalUsage >= totalCredits
      ) {
        return {
          ...base,
          httpStatus,
          status: "CREDITS(402)",
          detail: `credits exhausted (used ${totalUsage} of ${totalCredits})${withheldNote}`
        };
      }
      return {
        ...base,
        httpStatus,
        status: "VALID",
        detail:
          totalCredits != null && totalUsage != null
            ? `credits available (used ${totalUsage} of ${totalCredits})${withheldNote}`
            : `HTTP ${httpStatus}${withheldNote}`
      };
    }

    return {
      ...base,
      httpStatus,
      status: "VALID",
      detail: `HTTP ${httpStatus}${withheldNote}`
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut =
      err instanceof Error &&
      (err.name === "AbortError" || /abort/i.test(err.message));
    return {
      ...base,
      status: "UNREACHABLE",
      detail: timedOut ? `timed out after ${timeoutMs}ms` : message
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeAiBootHealth(
  options: AiBootHealthOptions = {}
): Promise<AiBootHealthReport[]> {
  return Promise.all(PROVIDERS.map((spec) => probeProvider(spec, options)));
}

export function formatAiBootHealth(
  reports: readonly AiBootHealthReport[]
): string {
  return reports.map((report) => `${report.label} [${report.status}]`).join(", ");
}

export function formatAiBootHealthDetails(
  reports: readonly AiBootHealthReport[]
): string {
  return reports
    .map((report) => `${report.label} [${report.status}] — ${report.detail}`)
    .join("\n");
}
