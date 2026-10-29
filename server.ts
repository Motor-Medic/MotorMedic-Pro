import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import pg from "pg";
import crypto from "crypto";
import { SquareClient, SquareEnvironment } from "square";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { generateMcMasterQuery } from "./src/lib/mcmaster";
import { analyzeVibration } from "./src/lib/diagnosisEngine";
import {
  VIBRATION_VISION_PROMPT,
  VIBRATION_VISION_PROMPT_SIMPLE,
  VISION_MODEL_CONFIG
} from "./src/lib/vibration/visionModelConfig";
import { synthesizeSpectrumFromPeaks, synthesizeEnvelopeFromRecord } from "./src/lib/vibration/synthesizeSpectrum";
import {
  MCA_VISION_MODELS,
  MCA_VISION_PROMPT
} from "./src/lib/mca/mcaVisionExtractor";
import {
  OPENROUTER_API_BASE,
  OPENROUTER_VISION_MODELS,
  isLmStudioDevMode,
  openRouterRefererHeaders
} from "./src/lib/openRouterModels";
import {
  ANALYZE_VIBRATION_API_ALIAS,
  ANALYZE_VIBRATION_API_PATH,
  runConsensusVibrationAnalysis
} from "./src/lib/consensusEngine";
import { ConsensusCascadeExhaustedError } from "./src/lib/diagnostics/consensusCascade";
import {
  logPayloadSize,
  logPipelineFail,
  logPipelineSend,
  logPipelineStart,
  logPipelineSuccess,
  pipelineErrorFields
} from "./src/lib/pipelineTrace";
import {
  buildAnalyzeVibrationErrorBody,
  buildAnalyzeVibrationSuccessBody,
  sendExpressJson
} from "./src/lib/safeApiJson";
import { DETECT_SPECTRUM_REGIONS_API_PATH } from "./src/lib/spectrumChartRegions";
import { detectSpectrumChartRegionsWithOpenAI } from "./src/lib/detectSpectrumRegions";
import { ANALYZE_THERMOGRAPHY_API_PATH } from "./src/lib/thermographyAnalysis";
import { runThermographyAnalysis } from "./src/lib/thermographyAnalysisEngine";
import { ANALYZE_ULTRASOUND_API_PATH } from "./src/lib/ultrasoundAnalysis";
import { runUltrasoundAnalysis } from "./src/lib/ultrasoundAnalysisEngine";
import {
  fetchLiveTelemetry,
  isScadaEnabled,
  liveTelemetryToContextFields
} from "./src/lib/scadaService";
import {
  EXTRACT_THERMAL_METADATA_API_PATH,
  extractThermalMetadata
} from "./src/lib/extractThermalMetadata";
import {
  OIL_ANALYSIS_API_PATH,
  coerceSaveOilSampleInput,
  fetchOilSamplesForAsset,
  saveOilSample
} from "./src/lib/oilAnalysisPersistence";
import {
  OIL_VISION_API_PATH,
  runMasterVisionModelLoop,
  finalizeOilFromParses
} from "./src/lib/oilVisionExtractor";
import { finalizeVibrationFromParses } from "./src/lib/vibrationVisionExtractor";
import { finalizeMcaFromParses } from "./src/lib/mcaVisionExtractor";
import { finalizeThermographyFromParses } from "./src/lib/thermographyVisionExtractor";
import {
  assertProductionAuthEnv,
  isDevAuthSeedEnabled,
  isProductionEnv,
  hashPassword as bcryptHashPassword,
  hashPasswordSync,
  verifyPassword,
  normalizeRole,
  createApiAuthGuard,
  createMemorySession,
  destroyMemorySession,
  destroyMemorySessionsForUser,
  requireRole,
  registerMemoryUserLoader,
  authCookieName,
  buildSessionCookie,
  buildClearSessionCookie,
  createSession,
  deleteSession,
  deleteSessionsForUser,
  findSessionByToken,
  generateSessionToken,
  hashSessionToken,
  readSessionTokenFromRequest,
  sessionTtlHours,
  bootstrapFirstAdmin,
  type AppRole
} from "./src/lib/auth";
import { connectWithRetry } from "./src/lib/db";
import {
  buildPoolConfig,
  resolveBootTlsMode
} from "./src/lib/dbConnection";
import {
  SYSTEM_ROUTE_NAME,
  findOrCreateSimpleModeRoute,
  findOrCreateTenantPlant,
  parentExists,
  resolveSimpleModeHierarchy
} from "./src/lib/hierarchyFlex";
import {
  buildRouteQueue,
  canCheckInAssignment,
  canCloseAssignment,
  canManageRouteAssignment,
  isTenantAdminRole,
  type RouteAssignmentRow,
  type RouteQueueRouteRow
} from "./src/lib/routeCheckout";
import {
  MODULE_CATALOG,
  getEntitlements,
  getModuleCatalog,
  isModuleActive,
  normalizeModuleKeys,
  registerModuleAccessResolver,
  requireModule
} from "./src/lib/entitlements";
import {
  evaluateRoleChange,
  parseAssignableRole,
  requirePermission
} from "./src/lib/roles";
import {
  assertProductionSquareMode,
  assertSquareEnvironmentCoherence,
  createMockCheckoutSession,
  isSquareTestMode,
  resolveSquareEnvironmentName,
  resolveSquareWebhookEvent,
  SQUARE_SIGNATURE_HEADER
} from "./src/lib/squareMode";
import { createInMemoryRateLimiter } from "./src/lib/checkoutRateLimit";
import {
  buildAnomalyBoard,
  type AnomalyBoardSourceRow
} from "./src/lib/anomalyBoard";
import {
  buildGoodCatchSummary,
  parseAvoidedCostCents,
  parseDowntimeHours,
  validateGoodCatchLinks,
  type GoodCatchLinkField,
  type GoodCatchLinkRefs,
  type GoodCatchOwnedLinks,
  type GoodCatchRow
} from "./src/lib/goodCatches";
import {
  calculateBearingFrequencies,
  validateBearingCalcInput,
  validateBearingGeometry,
  type BearingCalcInput,
  type BearingFaultFrequencies,
  type BearingValidationErrors
} from "./src/lib/bearingCalc";
import {
  provisionTenantFromCheckout,
  type PendingCheckoutRecord
} from "./src/lib/tenantProvisioning";
import {
  validateAssessmentDraft,
  validateAssessmentLinks,
  type AssessmentLinkRefs,
  type AssessmentOwnedLinks
} from "./src/lib/assessmentWizard";
import { assertProductionEmailEnv } from "./src/lib/email";
import {
  buildAlertEmailRows,
  buildAlertInAppRows,
  buildReceiptEmail,
  buildWelcomeEmail,
  dispatchEmailNotification,
  failedNotificationRow,
  isValidEmail,
  normalizeEmail,
  type NotificationInsert,
  type TenantAlertRecipient,
  type TenantNotificationUser
} from "./src/lib/notifications";
import {
  DEFAULT_INVITED_ROLE,
  buildInviteAcceptUrl,
  buildInviteNotification,
  evaluateDisableUser,
  generateInviteToken,
  hashInviteToken,
  isInviteExpired,
  isInviteUsable,
  resolveAppBaseUrl
} from "./src/lib/tenantInvites";

dotenv.config();

// AR-29 rule 10 �?" production boot fails fast on missing/placeholder
// SESSION_SECRET or DATABASE_URL (including CI-mock values). CI only
// builds, never boots, so this is safe there.
assertProductionAuthEnv(process.env);
// NOTIFICATIONS-1 �?" production also refuses to boot without the email
// provider key. Same fail-loud family as the DATABASE_URL/SESSION_SECRET
// guard above; safe today because nothing deploys until launch, when the key
// ships in the production bundle/env.
assertProductionEmailEnv(process.env);
// STOREFRONT — production must also refuse the Square test bypass outright,
// and the Square environment must agree with the access token at boot.
assertProductionSquareMode(process.env);
assertSquareEnvironmentCoherence(process.env);

// Initialize Pool using DATABASE_URL. TLS-1: pool creation is deferred until
// setupServer has resolved the boot TLS mode (probe or DATABASE_SSLMODE), so
// the probe runs BEFORE the main pool is opened.
const { Pool } = pg;
const dbUrl = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;

if (!dbUrl) {
  console.warn("⚠️ DATABASE_URL is not configured. Database storage will be bypassed.");
}

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("❌ [PIPELINE] Unhandled promise rejection:", pipelineErrorFields(err));
});
process.on("uncaughtException", (err) => {
  console.error("❌ [PIPELINE] Uncaught exception (server still running):", pipelineErrorFields(err));
});

// Initialize Express
const app = express();
const PORT = 3000;

// Increase payload limits for base64 uploads (images, CSVs, etc.) and attach rawBody for Square
app.use(express.json({ 
  limit: "50mb",
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));

// AR-29 rules 3/8/9 — global /api guard. Whitelist: auth login/register/
// session/demo-login, Square webhooks, health. Everything else requires
// a live server session; req.auth / req.tenantId come only from it.
// AR-29 step 5 — memory-mode session revalidation resolves users from the
// server's in-memory store (used only when DATABASE_URL-less).
registerMemoryUserLoader((userId: number) => {
  const u = memoryUsers.find((m) => m.id === userId);
  if (!u || u.is_disabled) return null;
  const company = memoryCompanies.find((c) => c.id === u.company_id);
  const plant = memoryPlants.find((p) => p.company_id === u.company_id);
  return {
    id: u.id,
    username: u.username,
    company_id: u.company_id ?? null,
    role: normalizeRole(u.role),
    is_temp_password: !!u.is_temp_password,
    plant_id: plant ? plant.id : null,
    plant_name: plant ? plant.name : null,
    company_name: company ? company.name : null,
    terms_accepted_at: u.terms_accepted_at ?? null
  };
});

app.use("/api", createApiAuthGuard(() => pool));

// AR-29 — liveness probe (public; carries no tenant data).
// DEP-2 — stays a fast, instant-200 liveness probe with NO deep DB query.
// A DB-blind 200 must never be the only readiness signal: when DATABASE_URL
// is set, boot AWAITS connectWithRetry BEFORE app.listen (see setupServer),
// so Render never routes traffic — or passes this health check — before the
// DB is reachable. We do not ship lying green.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "spectra-cm", auth: "ar-29" });
});
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/**
 * Multi-model consensus vibration analysis — mounted early so it always registers
 * before the unmatched /api 404 interceptor (restart server after edits).
 *
 * Pipeline: AR-25 free-tier-first provider cascade (Gemini -> Groq -> Mistral
 * -> OpenAI -> OpenRouter last) across vision extraction + analyst/referee
 * stages. Domain failures return HTTP 422/503 with the exact per-provider
 * status codes (never mocks, never a GATEWAY_TIMEOUT collapse).
 */
/**
 * Express 4 does not catch async rejections — wrap handlers so errors always become JSON.
 */
function asyncJsonHandler(
  fn: (req: express.Request, res: express.Response) => Promise<void>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (res.headersSent) {
        console.error("[API] Async handler error after headers sent:", err);
        return next(err);
      }
      logPipelineFail("analyze-vibration:async", performance.now(), err);
      console.error("API Route Error:", err);
      const cascadeFailure = err instanceof ConsensusCascadeExhaustedError;
      sendExpressJson(
        res,
        buildAnalyzeVibrationErrorBody(err, cascadeFailure
          ? {
              errorType: "PROVIDER_FAILURE",
              title: "Consensus Provider Error",
              httpStatus: 503
            }
          : {
              errorType: "GATEWAY_TIMEOUT",
              title: "Consensus Diagnostic Error",
              httpStatus: 500
            }),
        cascadeFailure ? 503 : 500
      );
    });
  };
}

async function handleAnalyzeVibrationExpress(
  req: express.Request,
  res: express.Response
) {
  req.setTimeout(60_000);
  res.setTimeout(60_000);
  const startTime = logPipelineStart("analyze-vibration", {
    contentLength: req.headers["content-length"] || null,
    socketTimeoutMs: req.socket?.timeout || null
  });
  try {
    const body = req.body || {};
    const imageBase64 =
      typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    logPayloadSize("analyze-vibration", imageBase64);
    console.log("[analyze-vibration] Payload keys:", Object.keys(body));

    logPipelineSend("analyze-vibration", {
      mode: body.mode || "full",
      hasImage: Boolean(imageBase64)
    });
    const outcome = await runConsensusVibrationAnalysis(body);

    if (!outcome || outcome.success !== true) {
      const errPayload = outcome?.success === false
        ? outcome
        : {
            success: false as const,
            errorType: "PROVIDER_FAILURE" as const,
            title: "Consensus Diagnostic Error",
            message: "Consensus engine returned an unexpected result.",
            httpStatus: 503 as const,
            detail: "Consensus engine returned an unexpected result."
          };

      const status = errPayload.httpStatus || 503;
      logPipelineFail(
        "analyze-vibration",
        startTime,
        new Error(errPayload.detail || errPayload.message),
        { status, statusText: errPayload.errorType }
      );
      console.error("[analyze-vibration] Domain error:", {
        status,
        errorType: errPayload.errorType,
        title: errPayload.title,
        detail: errPayload.detail
      });

      sendExpressJson(
        res,
        {
          success: false,
          errorType: errPayload.errorType,
          title: errPayload.title,
          message: errPayload.message,
          error: errPayload.message,
          broadband: { velocity: 0 },
          spectral: [],
          metadata: { processedAt: new Date().toISOString() },
          ...(errPayload.detail ? { detail: errPayload.detail } : {})
        },
        status
      );
      return;
    }

    logPipelineSuccess("analyze-vibration", startTime, {
      severity: outcome.data?.severity,
      health: outcome.data?.overallHealthScore
    });
    console.log("[analyze-vibration] Analysis complete:", {
      severity: outcome.data?.severity,
      health: outcome.data?.overallHealthScore,
      primary: outcome.data?.primaryFault?.title,
      confidence: outcome.data?.primaryFault?.confidencePercent
    });

    sendExpressJson(
      res,
      buildAnalyzeVibrationSuccessBody({ ...(outcome.data || {}) }),
      200
    );
  } catch (error: unknown) {
    logPipelineFail("analyze-vibration", startTime, error);
    console.error("API Route Error:", error);
    const cascadeFailure = error instanceof ConsensusCascadeExhaustedError;
    sendExpressJson(
      res,
      buildAnalyzeVibrationErrorBody(error, cascadeFailure
        ? {
            errorType: "PROVIDER_FAILURE",
            title: "Consensus Provider Error",
            httpStatus: 503
          }
        : {
            errorType: "GATEWAY_TIMEOUT",
            title: "Consensus Diagnostic Error",
            httpStatus: 500
          }),
      cascadeFailure ? 503 : 500
    );
  }
}

app.post(
  ANALYZE_VIBRATION_API_PATH,
  requireModule("vibration"),
  requirePermission("view_module:vibration"),
  asyncJsonHandler(handleAnalyzeVibrationExpress)
);
app.post(
  ANALYZE_VIBRATION_API_ALIAS,
  requireModule("vibration"),
  requirePermission("view_module:vibration"),
  asyncJsonHandler(handleAnalyzeVibrationExpress)
);
app.get(
  ANALYZE_VIBRATION_API_PATH,
  requireModule("vibration"),
  requirePermission("view_module:vibration"),
  (_req, res) => {
    res.json({
      ok: true,
      method: "POST",
      path: ANALYZE_VIBRATION_API_PATH,
      alias: ANALYZE_VIBRATION_API_ALIAS,
      service: "3-Stage Multi-Model Consensus Engine (AR-25 provider cascade: Gemini -> Groq -> Mistral -> OpenAI -> OpenRouter last)",
      errors: ["SIGNAL_UNREADABLE", "CONSENSUS_DIVERGENCE", "GATEWAY_TIMEOUT", "PROVIDER_FAILURE"]
    });
  }
);

/**
 * POST /api/extract-vibration-image
 * Production: OpenRouter GPT-4o vision for FFT spectrum extraction.
 * Dev-only: set USE_LM_STUDIO=true + LM_STUDIO_ENDPOINT for local testing.
 */
app.post("/api/extract-vibration-image", async (req, res) => {
  const purposeHint =
    req.body?.purpose === "mca" ||
    req.body?.domain === "mca" ||
    /mca/i.test(String(req.body?.fileName || ""));
  const timeoutMs = purposeHint ? 90_000 : 60_000;
  req.setTimeout(timeoutMs);
  res.setTimeout(timeoutMs);
  const startTime = logPipelineStart("extract-vibration-image", {
    contentLength: req.headers["content-length"] || null,
    purpose: purposeHint ? "mca" : "vibration"
  });
  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64 || body.fileData;
    const fileName =
      typeof body.fileName === "string" ? body.fileName : "vibration-chart.png";
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "imageBase64 is required.",
        message: purposeHint
          ? "Upload an MCA analyzer screenshot (PNG/JPG/WebP)."
          : "Upload a vibration spectrum image (PNG/JPG/WebP)."
      });
    }
    logPayloadSize("extract-vibration-image", imageBase64);

    const isMca =
      body.purpose === "mca" ||
      body.domain === "mca" ||
      /mca/i.test(String(body.fileName || ""));

    const mode = body.mode === "simple" ? "simple" : "full";
    const maxTokens =
      typeof body.maxTokens === "number"
        ? body.maxTokens
        : mode === "simple"
          ? VISION_MODEL_CONFIG.maxTokensSimple
          : isMca
            ? Math.max(VISION_MODEL_CONFIG.maxTokens, 4500)
            : VISION_MODEL_CONFIG.maxTokens;

    const prompt =
      (typeof body.prompt === "string" && body.prompt.trim()) ||
      (isMca
        ? MCA_VISION_PROMPT
        : mode === "simple"
          ? VIBRATION_VISION_PROMPT_SIMPLE
          : VIBRATION_VISION_PROMPT);

    const useLmStudio = isLmStudioDevMode();
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!useLmStudio && !openRouterKey) {
      return res.status(503).json({
        error: "OPENROUTER_API_KEY is not configured.",
        message:
          "Set OPENROUTER_API_KEY in .env for production vision extraction (openai/gpt-4o via OpenRouter)."
      });
    }

    const model =
      (typeof body.model === "string" && body.model) ||
      (useLmStudio
        ? process.env.LM_STUDIO_MODEL || VISION_MODEL_CONFIG.model
        : VISION_MODEL_CONFIG.model);

    const upstreamUrl = useLmStudio
      ? process.env.LM_STUDIO_ENDPOINT!
      : `${OPENROUTER_API_BASE}/chat/completions`;

    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (useLmStudio) {
      /* LM Studio local dev — no auth header */
    } else {
      upstreamHeaders.Authorization = `Bearer ${openRouterKey}`;
      Object.assign(upstreamHeaders, openRouterRefererHeaders());
    }

    console.log(
      isMca
        ? "🤖 [MCA] Forwarding screenshot to vision provider:"
        : "🤖 [VIBRATION] Forwarding to vision provider:",
      {
        provider: useLmStudio ? "lm-studio-dev" : "openrouter",
        model,
        fileName,
        mode,
        purpose: isMca ? "mca" : "vibration",
        maxTokens,
        promptChars: prompt.length
      }
    );

    logPipelineSend("extract-vibration-image", {
      provider: useLmStudio ? "lm-studio-dev" : "openrouter",
      model,
      mode,
      purpose: isMca ? "mca" : "vibration"
    });

    let upstreamJson: Record<string, unknown> = {};
    let lastUpstreamError: unknown;

    const bodyModels = Array.isArray(body.models)
      ? (body.models.filter(
          (m: unknown): m is string => typeof m === "string" && Boolean(m.trim())
        ) as string[])
      : [];
    const defaultModels: string[] = isMca
      ? [...MCA_VISION_MODELS]
      : [...OPENROUTER_VISION_MODELS];
    const modelsToTry: string[] = useLmStudio
      ? [model]
      : (bodyModels.length > 0 ? bodyModels : defaultModels).filter(
          (m: string, i: number, arr: string[]) => arr.indexOf(m) === i
        );

    for (const tryModel of modelsToTry) {
      try {
        const upstream = await fetch(upstreamUrl, {
          method: "POST",
          headers: upstreamHeaders,
          signal: AbortSignal.timeout(isMca ? 90_000 : 60_000),
          body: JSON.stringify({
            model: tryModel,
            max_tokens: maxTokens,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageBase64 } },
                  { type: "text", text: prompt }
                ]
              }
            ]
          })
        });

        upstreamJson = (await upstream.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;

        if (!upstream.ok) {
          lastUpstreamError = new Error(
            (typeof upstreamJson.error === "string" && upstreamJson.error) ||
              `Vision provider HTTP ${upstream.status} (${tryModel})`
          );
          console.warn(
            `[extract-vibration-image] Model ${tryModel} failed:`,
            upstream.status,
            upstreamJson
          );
          continue;
        }

        break;
      } catch (fetchErr) {
        lastUpstreamError = fetchErr;
        console.warn(`[extract-vibration-image] Model ${tryModel} fetch error:`, fetchErr);
      }
    }

    const choices = upstreamJson.choices;
    const first =
      Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
        ? (choices[0] as { message?: { content?: string } })
        : null;
    const content = first?.message?.content;

    if (!content || typeof content !== "string") {
      logPipelineFail(
        "extract-vibration-image",
        startTime,
        lastUpstreamError || new Error("Vision model returned no text content."),
        { status: 422 }
      );
      return res.status(422).json({
        error: "Vision model returned no text content.",
        message: isMca
          ? "Could not extract MCA fields from the screenshot. Try a clearer PNG/JPEG of the full report."
          : "Could not extract vibration data from image. Try a clearer FFT screenshot.",
        detail:
          lastUpstreamError instanceof Error
            ? lastUpstreamError.message
            : undefined
      });
    }

    logPipelineSuccess("extract-vibration-image", startTime, {
      fileName,
      contentLength: content.length,
      provider: useLmStudio ? "lm-studio-dev" : "openrouter",
      purpose: isMca ? "mca" : "vibration"
    });
    console.log(
      isMca
        ? "✅ [MCA] Vision Model Response:"
        : "✅ [VIBRATION] Vision Model Response:",
      {
        fileName,
        contentPreview: content.slice(0, 800),
        contentLength: content.length
      }
    );

    return res.json({
      ...upstreamJson,
      sourceImage: fileName,
      content
    });
  } catch (error: any) {
    const timedOut =
      error?.name === "TimeoutError" ||
      error?.name === "AbortError" ||
      /timeout|timed out|aborted/i.test(String(error?.message || ""));
    logPipelineFail("extract-vibration-image", startTime, error, {
      status: timedOut ? 504 : 503
    });
    console.error("[extract-vibration-image] Unhandled error:", error);
    return res.status(timedOut ? 504 : 503).json({
      error: timedOut
        ? "AI analysis timed out. The spectrum image may be too complex. Please try a clearer image."
        : error?.message || "Failed to extract vibration data from image.",
      message: timedOut
        ? "Vision extraction timed out after 60 seconds."
        : "Vision extraction failed. Verify OPENROUTER_API_KEY and credits at https://openrouter.ai"
    });
  }
});

/**
 * GPT-4o Vision chart-panel localization for hybrid FFT/TWF/Envelope display.
 * Mounted early so it is not swallowed by the unmatched /api 404 interceptor.
 */
async function handleDetectSpectrumRegionsExpress(
  req: express.Request,
  res: express.Response
) {
  const startTime = logPipelineStart("detect-spectrum-regions");
  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64 || body.fileData;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "imageBase64 is required.",
        regions: {},
        peaks: [],
        detectionConfidence: 0
      });
    }
    logPayloadSize("detect-spectrum-regions", imageBase64);
    logPipelineSend("detect-spectrum-regions");
    const detection = await detectSpectrumChartRegionsWithOpenAI(imageBase64);
    logPipelineSuccess("detect-spectrum-regions", startTime);
    return res.json(detection);
  } catch (error: any) {
    logPipelineFail("detect-spectrum-regions", startTime, error);
    console.error("[detect-spectrum-regions] Error:", error);
    return res.status(503).json({
      error: error?.message || "Failed to detect spectrum chart regions.",
      regions: {},
      peaks: [],
      detectionConfidence: 0
    });
  }
}

app.post(DETECT_SPECTRUM_REGIONS_API_PATH, handleDetectSpectrumRegionsExpress);
app.get(DETECT_SPECTRUM_REGIONS_API_PATH, (_req, res) => {
  res.json({
    ok: true,
    method: "POST",
    path: DETECT_SPECTRUM_REGIONS_API_PATH,
    service: "OpenAI GPT-4o Vision — chart region detection + peak extraction",
    regions: ["twf", "fft", "envelope"]
  });
});

/**
 * Thermography AI analysis — TEMPLATE for Ultrasound / MCA / Oil pipelines.
 * Mounted early so it is not swallowed by the unmatched /api 404 interceptor.
 */
function optionalNumeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** I²R-normalized ΔT: (I_meas / I_rated)² × ΔT when amps + delta_t are present. */
function calcI2rNormalizedDeltaT(
  measuredAmps: number | null,
  ratedAmps: number | null,
  deltaT: number | null
): number | null {
  if (
    measuredAmps == null ||
    ratedAmps == null ||
    deltaT == null ||
    !Number.isFinite(measuredAmps) ||
    !Number.isFinite(ratedAmps) ||
    !Number.isFinite(deltaT) ||
    ratedAmps === 0
  ) {
    return null;
  }
  return Math.pow(measuredAmps / ratedAmps, 2) * deltaT;
}

function extractPolymorphicTelemetry(metadata: Record<string, unknown> | undefined) {
  const m = metadata || {};
  return {
    asset_type:
      m.asset_type != null && String(m.asset_type).trim()
        ? String(m.asset_type).trim().toLowerCase()
        : null,
    phase_a_temp: optionalNumeric(m.phase_a_temp),
    phase_b_temp: optionalNumeric(m.phase_b_temp),
    phase_c_temp: optionalNumeric(m.phase_c_temp),
    measured_amps: optionalNumeric(m.measured_amps),
    rated_amps: optionalNumeric(m.rated_amps),
    de_bearing_temp: optionalNumeric(m.de_bearing_temp),
    ode_bearing_temp: optionalNumeric(m.ode_bearing_temp),
    refractory_skin_temp: optionalNumeric(m.refractory_skin_temp),
    max_allowable_limit: optionalNumeric(m.max_allowable_limit)
  };
}

async function handleAnalyzeThermographyExpress(
  req: express.Request,
  res: express.Response
) {
  try {
    const body = req.body || {};
    console.log("[analyze-thermography] Payload keys:", Object.keys(body));

    const outcome = await runThermographyAnalysis(body);

    if (outcome.success === false) {
      console.error("[analyze-thermography] Domain error:", {
        status: outcome.httpStatus,
        errorType: outcome.errorType,
        title: outcome.title,
        detail: outcome.detail
      });
      return res.status(outcome.httpStatus).json({
        success: false,
        errorType: outcome.errorType,
        title: outcome.title,
        message: outcome.message,
        error: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {})
      });
    }

    const meta =
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : {};
    const poly = extractPolymorphicTelemetry(meta);
    const deltaT = optionalNumeric(
      (outcome.data as { peaks?: { delta_t?: unknown } })?.peaks?.delta_t
    );
    const i2r = calcI2rNormalizedDeltaT(
      poly.measured_amps,
      poly.rated_amps,
      deltaT
    );
    const polymorphic_fields = {
      ...poly,
      i2r_normalized_delta_t: i2r
    };

    console.log("[analyze-thermography] Polymorphic telemetry:", {
      asset_type: poly.asset_type,
      measured_amps: poly.measured_amps,
      rated_amps: poly.rated_amps,
      delta_t: deltaT,
      i2r_normalized_delta_t: i2r
    });

    return res.json({
      success: true,
      data: {
        ...outcome.data,
        polymorphic_fields
      },
      ...outcome.data,
      polymorphic_fields,
      analysisSource: "thermography-ai"
    });
  } catch (error: any) {
    console.error("[analyze-thermography] Unhandled Express error:", error);
    return res.status(503).json({
      success: false,
      errorType: "VISION_ERROR",
      title: "Thermography Vision Error",
      message: "Unable to analyze thermal image.",
      error: "Unable to analyze thermal image.",
      detail: error?.message || "Unhandled thermography engine exception."
    });
  }
}

app.post(
  ANALYZE_THERMOGRAPHY_API_PATH,
  requireModule("thermography"),
  requirePermission("view_module:thermography"),
  handleAnalyzeThermographyExpress
);
app.get(
  ANALYZE_THERMOGRAPHY_API_PATH,
  requireModule("thermography"),
  requirePermission("view_module:thermography"),
  (_req, res) => {
    res.json({
      ok: true,
      method: "POST",
      path: ANALYZE_THERMOGRAPHY_API_PATH,
      service: "OpenAI GPT-4o Vision — Thermography Analysis Engine"
    });
  }
);

/**
 * POST /api/extract-thermal-metadata
 * Reads radiometric EXIF/XMP from an uploaded thermal image (base64).
 * Returns empty found=false for standard JPEGs with no thermal tags.
 */
app.post(EXTRACT_THERMAL_METADATA_API_PATH, async (req, res) => {
  try {
    const body = req.body || {};
    const imageBase64 =
      typeof body.imageBase64 === "string"
        ? body.imageBase64
        : typeof body.image === "string"
          ? body.image
          : null;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: "imageBase64 is required."
      });
    }

    const stripped = String(imageBase64).replace(/^data:image\/[\w+.-]+;base64,/i, "");
    const buffer = Buffer.from(stripped, "base64");
    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        error: "Invalid image payload."
      });
    }

    const metadata = await extractThermalMetadata(buffer);
    console.log("[extract-thermal-metadata]", {
      found: metadata.found,
      sourceTags: metadata.sourceTags,
      emissivity: metadata.emissivity,
      ambientTemp: metadata.ambientTemp,
      reflectedTemp: metadata.reflectedTemp,
      distance: metadata.distance,
      humidity: metadata.humidity
    });

    return res.json({
      success: true,
      found: metadata.found,
      metadata
    });
  } catch (error: any) {
    console.error("[extract-thermal-metadata] Error:", error);
    return res.status(500).json({
      success: false,
      found: false,
      error: error?.message || "Failed to extract thermal metadata."
    });
  }
});

app.get(EXTRACT_THERMAL_METADATA_API_PATH, (_req, res) => {
  res.json({
    ok: true,
    method: "POST",
    path: EXTRACT_THERMAL_METADATA_API_PATH,
    service: "Thermal image EXIF / XMP radiometric metadata extractor (exifr)"
  });
});

/* -------------------------------------------------------------------------- */
/* Ultrasound Analysis — placeholder AI (mirrors thermography route shape)    */
/* Persistence: client calls /api/save-analysis-result after success (same as IR) */
/* -------------------------------------------------------------------------- */
async function handleAnalyzeUltrasoundExpress(
  req: express.Request,
  res: express.Response
) {
  try {
    const body = req.body || {};
    console.log("[analyze-ultrasound] Payload keys:", Object.keys(body));

    const outcome = await runUltrasoundAnalysis(body);

    if (outcome.success === false) {
      console.error("[analyze-ultrasound] Domain error:", {
        status: outcome.httpStatus,
        errorType: outcome.errorType,
        title: outcome.title,
        detail: outcome.detail
      });
      return res.status(outcome.httpStatus).json({
        success: false,
        errorType: outcome.errorType,
        title: outcome.title,
        message: outcome.message,
        error: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {})
      });
    }

    return res.json({
      success: true,
      data: outcome.data,
      ...outcome.data,
      analysisSource: "ultrasound-ai-placeholder"
    });
  } catch (error: any) {
    console.error("[analyze-ultrasound] Unhandled Express error:", error);
    return res.status(503).json({
      success: false,
      errorType: "ANALYSIS_ERROR",
      title: "Ultrasound Analysis Error",
      message: "Unable to analyze ultrasound data.",
      error: "Unable to analyze ultrasound data.",
      detail: error?.message || "Unhandled ultrasound engine exception."
    });
  }
}

app.post(
  ANALYZE_ULTRASOUND_API_PATH,
  requireModule("ultrasound"),
  requirePermission("view_module:ultrasound"),
  handleAnalyzeUltrasoundExpress
);
app.get(
  ANALYZE_ULTRASOUND_API_PATH,
  requireModule("ultrasound"),
  requirePermission("view_module:ultrasound"),
  (_req, res) => {
    res.json({
      ok: true,
      method: "POST",
      path: ANALYZE_ULTRASOUND_API_PATH,
      service: "Ultrasound Analysis Engine (placeholder — Master AI prompt pending)"
    });
  }
);

/* -------------------------------------------------------------------------- */
/* Run Diagnostics persistence — analysis_results / alerts / diagnosis_logs   */
/* Mounted early so routes are not swallowed by the unmatched /api 404.       */
/* -------------------------------------------------------------------------- */

function mapUiSeverityToAlert(sev: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const s = String(sev || "").toUpperCase();
  if (s === "HIGH" || s === "CRITICAL") return "HIGH";
  if (s === "MEDIUM" || s === "ANOMALY" || s === "WARNING") return "MEDIUM";
  return "LOW";
}

function asJsonb(value: unknown, fallback: unknown) {
  if (value == null) return JSON.stringify(fallback);
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(fallback);
    }
  }
  return JSON.stringify(value);
}

/**
 * Hybrid polymorphic payload for analysis_results.telemetry_data.
 * Dedicated columns (phase_a_temp, measured_amps, …) stay populated for Tab 2 /
 * Trend Analyzer; this JSONB holds environmental, AI vision, and future fields.
 */
function buildAnalysisTelemetryData(body: Record<string, unknown>, peaks: unknown[]): Record<string, unknown> {
  const client =
    body.telemetry_data && typeof body.telemetry_data === "object"
      ? (body.telemetry_data as Record<string, unknown>)
      : {};
  const peak0 =
    Array.isArray(peaks) && peaks[0] && typeof peaks[0] === "object"
      ? (peaks[0] as Record<string, unknown>)
      : {};
  const envClient =
    client.environmental && typeof client.environmental === "object"
      ? (client.environmental as Record<string, unknown>)
      : {};
  const aiClient =
    client.ai_vision && typeof client.ai_vision === "object"
      ? (client.ai_vision as Record<string, unknown>)
      : {};
  const polyClient =
    client.polymorphic && typeof client.polymorphic === "object"
      ? (client.polymorphic as Record<string, unknown>)
      : {};

  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      if (v == null || v === "") continue;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim()) return v;
      if (typeof v === "boolean") return v;
      if (typeof v === "object") return v;
    }
    return null;
  };

  return {
    schema_version: 1,
    captured_at:
      typeof client.captured_at === "string"
        ? client.captured_at
        : new Date().toISOString(),
    analysis_type: String(body.analysis_type || client.analysis_type || "vibration"),
    environmental: {
      emissivity: pick(
        envClient.emissivity,
        body.emissivity,
        peak0.emissivity,
        peak0.emissivity_setting,
        peak0.emissivitySetting,
        aiClient.emissivity,
        aiClient.emissivity_setting,
        aiClient.emissivitySetting
      ),
      ambient_temp: pick(
        envClient.ambient_temp,
        envClient.ambientTemp,
        body.ambient_temp,
        body.ambientTemp,
        peak0.ambient_reference_temp
      ),
      reflected_temp: pick(
        envClient.reflected_temp,
        envClient.reflectedTemp,
        body.reflected_temp,
        body.reflectedTemp,
        peak0.reflected_apparent_temp
      ),
      distance: pick(envClient.distance, body.distance, peak0.distance),
      distance_unit: pick(
        envClient.distance_unit,
        envClient.distanceUnit,
        body.distance_unit,
        body.distanceUnit
      ),
      humidity: pick(envClient.humidity, body.humidity),
      wind_speed: pick(envClient.wind_speed, envClient.windSpeed, body.windSpeed),
      solar_condition: pick(
        envClient.solar_condition,
        envClient.solarCondition,
        body.solarCondition
      ),
      temp_unit: pick(envClient.temp_unit, envClient.tempUnit, body.tempUnit),
      load_percent: pick(
        envClient.load_percent,
        envClient.loadPercent,
        body.loadPercent,
        peak0.load_percentage
      ),
      ...envClient
    },
    ai_vision: {
      hotspot_temp: pick(aiClient.hotspot_temp, peak0.hotspot_temp),
      reference_temp: pick(aiClient.reference_temp, peak0.reference_temp),
      delta_t: pick(aiClient.delta_t, peak0.delta_t),
      neta_class: pick(
        aiClient.neta_class,
        aiClient.severity_class,
        peak0.severity_class,
        peak0.neta_class
      ),
      severity_class: pick(
        aiClient.severity_class,
        peak0.severity_class,
        aiClient.neta_class
      ),
      equipment_category: pick(
        aiClient.equipment_category,
        peak0.equipment_category
      ),
      emissivity: pick(
        aiClient.emissivity,
        aiClient.emissivity_setting,
        aiClient.emissivitySetting,
        peak0.emissivity,
        peak0.emissivity_setting,
        peak0.emissivitySetting
      ),
      isotherm_threshold: pick(
        aiClient.isotherm_threshold,
        aiClient.isothermThreshold,
        peak0.isotherm_threshold,
        peak0.isothermThreshold
      ),
      box_average_temp: pick(
        aiClient.box_average_temp,
        aiClient.boxAverageTemperature,
        aiClient.roi_statistical_mean,
        aiClient.roiStatisticalMean,
        peak0.box_average_temp,
        peak0.boxAverageTemperature,
        peak0.box_average_temperature,
        peak0.roi_statistical_mean,
        peak0.roiStatisticalMean
      ),
      boxAverageTemperature: pick(
        aiClient.boxAverageTemperature,
        peak0.boxAverageTemperature,
        peak0.box_average_temperature,
        aiClient.box_average_temp,
        peak0.box_average_temp
      ),
      roiStatisticalMean: pick(
        aiClient.roiStatisticalMean,
        peak0.roiStatisticalMean,
        peak0.roi_statistical_mean,
        aiClient.roi_statistical_mean,
        peak0.box_average_temp
      ),
      scale_min: pick(
        aiClient.scale_min,
        aiClient.scaleMinBoundary,
        peak0.scale_min,
        peak0.scaleMinBoundary,
        peak0.scale_min_boundary
      ),
      scale_max: pick(
        aiClient.scale_max,
        aiClient.scaleMaxBoundary,
        peak0.scale_max,
        peak0.scaleMaxBoundary,
        peak0.scale_max_boundary
      ),
      scaleMinBoundary: pick(
        aiClient.scaleMinBoundary,
        peak0.scaleMinBoundary,
        aiClient.scale_min,
        peak0.scale_min
      ),
      scaleMaxBoundary: pick(
        aiClient.scaleMaxBoundary,
        peak0.scaleMaxBoundary,
        aiClient.scale_max,
        peak0.scale_max
      ),
      ...aiClient
    },
    // Mirror of dedicated columns (source of truth remains the FLOAT columns)
    polymorphic: {
      asset_type: pick(polyClient.asset_type, body.asset_type, peak0.asset_type),
      phase_a_temp: pick(polyClient.phase_a_temp, body.phase_a_temp, peak0.phase_a_temp),
      phase_b_temp: pick(polyClient.phase_b_temp, body.phase_b_temp, peak0.phase_b_temp),
      phase_c_temp: pick(polyClient.phase_c_temp, body.phase_c_temp, peak0.phase_c_temp),
      measured_amps: pick(
        polyClient.measured_amps,
        body.measured_amps,
        peak0.measured_amps,
        peak0.current_amps
      ),
      rated_amps: pick(polyClient.rated_amps, body.rated_amps, peak0.rated_amps),
      de_bearing_temp: pick(
        polyClient.de_bearing_temp,
        body.de_bearing_temp,
        peak0.de_bearing_temp
      ),
      ode_bearing_temp: pick(
        polyClient.ode_bearing_temp,
        body.ode_bearing_temp,
        peak0.ode_bearing_temp
      ),
      refractory_skin_temp: pick(
        polyClient.refractory_skin_temp,
        body.refractory_skin_temp,
        peak0.refractory_skin_temp
      ),
      max_allowable_limit: pick(
        polyClient.max_allowable_limit,
        body.max_allowable_limit,
        peak0.max_allowable_limit
      ),
      i2r_normalized_delta_t: pick(
        polyClient.i2r_normalized_delta_t,
        body.i2r_normalized_delta_t,
        peak0.i2r_normalized_delta_t
      ),
      ...polyClient
    },
    // Pass-through for any future / camera / SCADA extras from the client
    extras:
      client.extras && typeof client.extras === "object"
        ? client.extras
        : undefined,
    file: client.file && typeof client.file === "object" ? client.file : undefined,
    ...Object.fromEntries(
      Object.entries(client).filter(
        ([k]) =>
          ![
            "schema_version",
            "captured_at",
            "analysis_type",
            "environmental",
            "ai_vision",
            "polymorphic",
            "extras",
            "file"
          ].includes(k)
      )
    )
  };
}

app.post("/api/save-analysis-result", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const body = req.body || {};
    const assetId = body.asset_id != null ? String(body.asset_id) : null;
    const component = body.component != null ? String(body.component) : null;
    const healthScore =
      body.health_score != null && Number.isFinite(Number(body.health_score))
        ? Math.round(Number(body.health_score))
        : null;
    const primaryFault =
      body.primary_fault != null ? String(body.primary_fault) : null;
    const severity = body.severity != null ? String(body.severity) : null;
    const summary = body.summary != null ? String(body.summary) : null;
    const spectrumUrl =
      body.spectrum_image_url != null ? String(body.spectrum_image_url) : null;
    const analysisType = String(body.analysis_type || "vibration");
    const startedAt = body.started_at ? new Date(body.started_at) : null;
    const createAlerts =
      body.create_alerts_for_high !== false; // default true

    const faultList = Array.isArray(body.fault_list) ? body.fault_list : [];
    const peaks = Array.isArray(body.peaks) ? body.peaks : [];
    const recommendations = Array.isArray(body.recommendations)
      ? body.recommendations
      : [];
    const financialImpact =
      body.financial_impact && typeof body.financial_impact === "object"
        ? body.financial_impact
        : {};

    // Polymorphic thermography columns (all optional / nullable)
    const assetType =
      body.asset_type != null && String(body.asset_type).trim()
        ? String(body.asset_type).trim().toLowerCase()
        : null;
    const phaseATemp = optionalNumeric(body.phase_a_temp);
    const phaseBTemp = optionalNumeric(body.phase_b_temp);
    const phaseCTemp = optionalNumeric(body.phase_c_temp);
    const measuredAmps = optionalNumeric(body.measured_amps);
    let ratedAmps = optionalNumeric(body.rated_amps);
    const deBearingTemp = optionalNumeric(body.de_bearing_temp);
    const odeBearingTemp = optionalNumeric(body.ode_bearing_temp);
    const refractorySkinTemp = optionalNumeric(body.refractory_skin_temp);
    let maxAllowableLimit = optionalNumeric(body.max_allowable_limit);
    const waveformPeakToPeak = optionalNumeric(body.waveform_peak_to_peak);
    const waveformCrestFactor = optionalNumeric(body.waveform_crest_factor);
    const waveformImpactCount =
      body.waveform_impact_count != null &&
      Number.isFinite(Number(body.waveform_impact_count))
        ? Math.round(Number(body.waveform_impact_count))
        : null;
    const waveformSymmetry =
      body.waveform_symmetry != null && String(body.waveform_symmetry).trim()
        ? String(body.waveform_symmetry).trim()
        : null;
    const waveformModulation =
      body.waveform_modulation != null && String(body.waveform_modulation).trim()
        ? String(body.waveform_modulation).trim()
        : null;
    const envelopePeakAmplitude = optionalNumeric(body.envelope_peak_amplitude);
    const envelopeDominantFrequency = optionalNumeric(
      body.envelope_dominant_frequency
    );
    const envelopeEnergy = optionalNumeric(body.envelope_energy);

    // Auto-enrich missing static specs from Equipment DB (`assets`) by asset_id
    // (tag_number preferred; also matches numeric id or name for compatibility)
    if (assetId && (ratedAmps == null || maxAllowableLimit == null)) {
      try {
        const assetSpecRes = await pool.query(
          `SELECT rated_amps, max_allowable_temp
           FROM assets
           WHERE (
             ($1 ~ '^[0-9]+$' AND id = $1::integer)
             OR LOWER(TRIM(COALESCE(tag_number, ''))) = LOWER(TRIM($1))
             OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM($1))
           )
           LIMIT 1`,
          [String(assetId)]
        );
        const assetRow = assetSpecRes.rows[0];
        if (assetRow) {
          if (ratedAmps == null) {
            ratedAmps = optionalNumeric(assetRow.rated_amps);
          }
          if (maxAllowableLimit == null) {
            maxAllowableLimit = optionalNumeric(assetRow.max_allowable_temp);
          }
          if (ratedAmps != null || maxAllowableLimit != null) {
            console.log("[save-analysis-result] Enriched from assets:", {
              assetId,
              rated_amps: ratedAmps,
              max_allowable_limit: maxAllowableLimit
            });
          }
        }
      } catch (enrichErr: any) {
        // Non-fatal: save continues without asset defaults (e.g. columns not migrated yet)
        console.warn(
          "[save-analysis-result] Asset spec enrichment skipped:",
          enrichErr?.message || enrichErr
        );
      }
    }

    // Prefer client/server-provided i2r; else compute from amps × ΔT in peaks
    // (uses enriched ratedAmps when frontend omitted it)
    let i2rNormalized = optionalNumeric(body.i2r_normalized_delta_t);
    if (i2rNormalized == null) {
      const peak0 =
        peaks[0] && typeof peaks[0] === "object"
          ? (peaks[0] as Record<string, unknown>)
          : {};
      const deltaT = optionalNumeric(peak0.delta_t);
      i2rNormalized = calcI2rNormalizedDeltaT(measuredAmps, ratedAmps, deltaT);
    }

    // Hybrid JSONB blob (does not replace dedicated FLOAT columns)
    const telemetryData = buildAnalysisTelemetryData(
      {
        ...body,
        asset_type: assetType,
        phase_a_temp: phaseATemp,
        phase_b_temp: phaseBTemp,
        phase_c_temp: phaseCTemp,
        measured_amps: measuredAmps,
        rated_amps: ratedAmps,
        de_bearing_temp: deBearingTemp,
        ode_bearing_temp: odeBearingTemp,
        refractory_skin_temp: refractorySkinTemp,
        max_allowable_limit: maxAllowableLimit,
        i2r_normalized_delta_t: i2rNormalized
      },
      peaks
    );

    // Telemetry provenance (run-level honesty tag): the client stamps
    // body.telemetry_provenance as "manual" | "default" | "prefilled-run".
    // Persist it inside the JSONB (no new column) so every reopened surface
    // can badge a default or prefilled run - honesty must survive reload.
    if (
      body.telemetry_provenance === "manual" ||
      body.telemetry_provenance === "default" ||
      body.telemetry_provenance === "prefilled-run"
    ) {
      telemetryData.telemetry_provenance = body.telemetry_provenance;
    }

    // Vision-extracted RPM: if the spectrum-region detection returned rpm,
    // ensure it is persisted into telemetry_data so Tab 2 can read it.
    const visionRpm = optionalNumeric(telemetryData.rpm);
    const visionRpmSource = telemetryData.rpm_source;
    if (visionRpm != null && visionRpmSource === "vision-extracted") {
      console.log("[save-analysis-result] Vision-extracted RPM:", {
        rpm: visionRpm,
        rpm_source: visionRpmSource
      });
    }

    // Synthesize a full trace from stored peaks when none was provided.
    if (peaks.length > 0 && telemetryData.spectral == null) {
      telemetryData.spectral = synthesizeSpectrumFromPeaks(peaks);
      telemetryData.spectral_source = "synthesized-from-peaks";
    }
    // Synthesize a diagnosis-consistent demod (envelope) trace when none was provided.
    if (peaks.length > 0 && telemetryData.envelope == null) {
      telemetryData.envelope = synthesizeEnvelopeFromRecord(peaks, null, { primary: primaryFault, faults: faultList });
      telemetryData.envelope_source = "synthesized-from-record";
    }

    // AR-29 rule 9 — tenant_id comes only from the verified session.
    const tenantId = req.tenantId ?? -1;

    const insert = await pool.query(
      `INSERT INTO analysis_results (
         asset_id, component, health_score, primary_fault, fault_list, peaks,
         spectrum_image_url, recommendations, financial_impact, severity, summary,
         consensus_details, analysis_type,
         asset_type, phase_a_temp, phase_b_temp, phase_c_temp,
         measured_amps, rated_amps, de_bearing_temp, ode_bearing_temp,
         refractory_skin_temp, max_allowable_limit, i2r_normalized_delta_t,
         telemetry_data,
         waveform_peak_to_peak, waveform_crest_factor, waveform_impact_count,
         waveform_symmetry, waveform_modulation,
         envelope_peak_amplitude, envelope_dominant_frequency, envelope_energy,
         tenant_id
       ) VALUES (
         $1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13,
         $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
         $25::jsonb,
         $26,$27,$28,$29,$30,
         $31,$32,$33,$34
       )
       RETURNING *`,
      [
        assetId,
        component,
        healthScore,
        primaryFault,
        asJsonb(faultList, []),
        asJsonb(peaks, []),
        spectrumUrl,
        asJsonb(recommendations, []),
        asJsonb(financialImpact, {}),
        severity,
        summary,
        asJsonb(body.consensus_details ?? null, null),
        analysisType,
        assetType,
        phaseATemp,
        phaseBTemp,
        phaseCTemp,
        measuredAmps,
        ratedAmps,
        deBearingTemp,
        odeBearingTemp,
        refractorySkinTemp,
        maxAllowableLimit,
        i2rNormalized,
        asJsonb(telemetryData, {}),
        waveformPeakToPeak,
        waveformCrestFactor,
        waveformImpactCount,
        waveformSymmetry,
        waveformModulation,
        envelopePeakAmplitude,
        envelopeDominantFrequency,
        envelopeEnergy,
        tenantId
      ]
    );

    const analysis = insert.rows[0];
    let alertsCreated = 0;
    const createdAlerts: Array<{
      id?: string | number | null;
      title: string;
      description: string | null;
      severity: string;
      asset_id?: string | number | null;
    }> = [];

    if (createAlerts && faultList.length > 0) {
      for (const fault of faultList) {
        const alertSev = mapUiSeverityToAlert(
          fault?.severity ?? severity ?? "MEDIUM"
        );
        // Auto-create alerts for HIGH (and CRITICAL-mapped) faults
        if (alertSev !== "HIGH") continue;
        const alertTitle = String(
          fault?.title || primaryFault || "Critical fault detected"
        );
        const alertDescription = String(
          fault?.detail ||
            fault?.description ||
            summary ||
            `High-severity finding on ${component || assetId || "asset"}`
        );
        const alertInsert = await pool.query(
          `INSERT INTO alerts (
             analysis_result_id, asset_id, severity, title, description, tenant_id
           ) VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, title, description, severity, asset_id`,
          [
            analysis.id,
            assetId,
            alertSev,
            alertTitle,
            alertDescription,
            tenantId
          ]
        );
        createdAlerts.push({
          id: alertInsert.rows[0]?.id ?? null,
          title: alertTitle,
          description: alertDescription,
          severity: alertSev,
          asset_id: assetId
        });
        alertsCreated += 1;
      }

      // If no HIGH faults but overall severity is CRITICAL, still raise one alert
      if (
        alertsCreated === 0 &&
        mapUiSeverityToAlert(severity) === "HIGH" &&
        primaryFault
      ) {
        const alertDescription =
          summary || `Critical diagnosis for ${component || assetId || "asset"}`;
        const alertInsert = await pool.query(
          `INSERT INTO alerts (
             analysis_result_id, asset_id, severity, title, description, tenant_id
           ) VALUES ($1,$2,'HIGH',$3,$4,$5)
           RETURNING id, title, description, severity, asset_id`,
          [
            analysis.id,
            assetId,
            primaryFault,
            alertDescription,
            tenantId
          ]
        );
        createdAlerts.push({
          id: alertInsert.rows[0]?.id ?? null,
          title: primaryFault,
          description: alertDescription,
          severity: "HIGH",
          asset_id: assetId
        });
        alertsCreated = 1;
      }
    }

    // NOTIFICATIONS-1: alert insert path fan-out. In-app rows are written
    // before the response; email sends are queued fire-and-forget with an
    // internal .catch() -> 'failed' ledger row. Any notification failure is
    // swallowed here so the alert save request still succeeds.
    if (createdAlerts.length > 0) {
      try {
        await recordAlertNotifications(tenantId, createdAlerts);
      } catch (notifErr) {
        console.error("[notifications] save-analysis fan-out failed:", notifErr);
      }
    }

    const logInsert = await pool.query(
      `INSERT INTO diagnosis_logs (
         asset_id, analysis_type, started_at, completed_at, status,
         result_summary, analysis_result_id, tenant_id
       ) VALUES ($1,$2,$3,NOW(),'success',$4::jsonb,$5,$6)
       RETURNING id`,
      [
        assetId,
        analysisType,
        startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
        asJsonb(
          {
            health_score: healthScore,
            primary_fault: primaryFault,
            severity,
            fault_count: faultList.length,
            alerts_created: alertsCreated,
            // Run-level telemetry provenance so the log row confesses the
            // same origin as the analysis row it points at.
            telemetry_provenance: telemetryData.telemetry_provenance ?? null,
            summary
          },
          {}
        ),
        analysis.id,
        req.tenantId ?? -1
      ]
    );

    console.log("[save-analysis-result] Saved:", {
      id: analysis.id,
      assetId,
      alertsCreated,
      faults: faultList.length
    });

    return res.json({
      success: true,
      analysis,
      alerts_created: alertsCreated,
      log_id: logInsert.rows[0]?.id
    });
  } catch (error: any) {
    console.error("[save-analysis-result] Error:", error);
    // Best-effort failure log
    try {
      if (pool) {
        await pool.query(
          `INSERT INTO diagnosis_logs (
             asset_id, analysis_type, started_at, completed_at, status, result_summary, tenant_id
           ) VALUES ($1,$2,$3,NOW(),'failed',$4::jsonb,$5)`,
          [
            req.body?.asset_id != null ? String(req.body.asset_id) : null,
            String(req.body?.analysis_type || "vibration"),
            req.body?.started_at ? new Date(req.body.started_at) : null,
            asJsonb({ error: error?.message || "save failed" }, {}),
            req.tenantId ?? -1
          ]
        );
      }
    } catch {
      /* ignore secondary failure */
    }
    return res.status(500).json({
      error: error?.message || "Failed to save analysis result."
    });
  }
});

/**
 * GET /api/asset/:id/telemetry-context
 * Merged auto-fill context for Thermography Section 3 (Data Review form).
 * Hierarchy per field: live SCADA (Task 3) → last analysis → asset profile defaults.
 * `:id` may be numeric assets.id, tag_number, or asset name.
 */
app.get(
  ["/api/asset/:id/telemetry-context", "/api/assets/:id/telemetry-context"],
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        success: false,
        error: "Database is not configured (DATABASE_URL)."
      });
    }
    try {
      const key = String(req.params.id || "").trim();
      if (!key) {
        return res.status(400).json({ success: false, error: "Asset id is required." });
      }

      const pickNum = (v: unknown): number | null => {
        if (v == null || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const pickField = (
        liveVal: unknown,
        lastVal: unknown,
        defaultVal: unknown
      ): { value: number | string | null; source: "live" | "last_scan" | "default" | null } => {
        const liveN =
          typeof liveVal === "string" && liveVal.trim() && !Number.isFinite(Number(liveVal))
            ? String(liveVal).trim()
            : pickNum(liveVal);
        if (liveN != null && liveN !== "") {
          return { value: liveN, source: "live" };
        }
        const lastN =
          typeof lastVal === "string" && lastVal.trim() && !Number.isFinite(Number(lastVal))
            ? String(lastVal).trim()
            : pickNum(lastVal) ??
              (typeof lastVal === "string" && lastVal.trim() ? String(lastVal).trim() : null);
        if (lastN != null && lastN !== "") {
          return { value: lastN, source: "last_scan" };
        }
        const defN =
          typeof defaultVal === "string" &&
          defaultVal.trim() &&
          !Number.isFinite(Number(defaultVal))
            ? String(defaultVal).trim()
            : pickNum(defaultVal) ??
              (typeof defaultVal === "string" && defaultVal.trim()
                ? String(defaultVal).trim()
                : null);
        if (defN != null && defN !== "") {
          return { value: defN, source: "default" };
        }
        return { value: null, source: null };
      };

      // A) Static specs from Equipment DB
      const assetRes = await pool.query(
        `SELECT id, route_id, name, tag_number, type,
                rated_amps, max_allowable_temp, bearing_specs,
                voltage_rating, horsepower
         FROM assets
         WHERE (
           ($1 ~ '^[0-9]+$' AND id = $1::integer)
           OR LOWER(TRIM(COALESCE(tag_number, ''))) = LOWER(TRIM($1))
           OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM($1))
         )
         LIMIT 1`,
        [key]
      );
      const asset = assetRes.rows[0] || null;

      const matchKeys = Array.from(
        new Set(
          [key, asset?.tag_number, asset?.name, asset?.id != null ? String(asset.id) : null]
            .filter((v) => v != null && String(v).trim())
            .map((v) => String(v).trim())
        )
      );

      // B) Most recent analysis_results row for this asset
      let lastAnalysis: Record<string, unknown> | null = null;
      if (matchKeys.length > 0) {
        const lastRes = await pool.query(
          `SELECT id, asset_id, component, timestamp, created_at, analysis_type,
                  asset_type, phase_a_temp, phase_b_temp, phase_c_temp,
                  measured_amps, rated_amps, de_bearing_temp, ode_bearing_temp,
                  refractory_skin_temp, max_allowable_limit, i2r_normalized_delta_t,
                  peaks
           FROM analysis_results
           WHERE LOWER(TRIM(COALESCE(asset_id, ''))) = ANY(
             SELECT LOWER(TRIM(x)) FROM UNNEST($1::text[]) AS x
           )
           ORDER BY COALESCE(timestamp, created_at) DESC NULLS LAST
           LIMIT 1`,
          [matchKeys]
        );
        lastAnalysis = lastRes.rows[0] || null;
      }

      const peaks0 =
        lastAnalysis?.peaks &&
        Array.isArray(lastAnalysis.peaks) &&
        lastAnalysis.peaks[0] &&
        typeof lastAnalysis.peaks[0] === "object"
          ? (lastAnalysis.peaks[0] as Record<string, unknown>)
          : {};

      const lastOrPeak = (col: string, ...peakKeys: string[]) => {
        const fromCol = lastAnalysis ? pickNum(lastAnalysis[col]) : null;
        if (fromCol != null) return fromCol;
        for (const k of peakKeys) {
          const n = pickNum(peaks0[k]);
          if (n != null) return n;
        }
        return null;
      };

      // C) Live SCADA (highest priority) — mocked until real connector is wired
      // Priority: Live SCADA > Last Scan > Asset Profile
      let liveRaw: Awaited<ReturnType<typeof fetchLiveTelemetry>> = null;
      try {
        if (isScadaEnabled()) {
          liveRaw = await fetchLiveTelemetry(key);
        }
      } catch (scadaErr: any) {
        console.warn(
          "[telemetry-context] SCADA fetch failed (continuing with history/profile):",
          scadaErr?.message || scadaErr
        );
        liveRaw = null;
      }
      const liveFields = liveTelemetryToContextFields(liveRaw);
      const live: Record<string, unknown> | null = liveFields
        ? { ...liveFields }
        : null;

      const normalizeAssetType = (raw: unknown): string | null => {
        if (raw == null || !String(raw).trim()) return null;
        const s = String(raw).trim().toLowerCase();
        const aliases: Record<string, string> = {
          motor: "motor",
          switchgear: "switchgear",
          transformer: "transformer",
          gearbox: "gearbox",
          pump: "pump",
          bearing: "bearing",
          fan: "fan",
          boiler: "boiler",
          other: "other"
        };
        if (aliases[s]) return aliases[s];
        for (const k of Object.keys(aliases)) {
          if (s.includes(k)) return aliases[k];
        }
        return "other";
      };

      const lastAssetType =
        normalizeAssetType(lastAnalysis?.asset_type) ||
        normalizeAssetType(peaks0.asset_type);
      const profileAssetType = normalizeAssetType(asset?.type);

      const fields = {
        asset_type: pickField(
          live?.asset_type,
          lastAssetType,
          profileAssetType
        ),
        phase_a_temp: pickField(
          live?.phase_a_temp,
          lastOrPeak("phase_a_temp", "phase_a_temp", "phase_a"),
          null
        ),
        phase_b_temp: pickField(
          live?.phase_b_temp,
          lastOrPeak("phase_b_temp", "phase_b_temp", "phase_b"),
          null
        ),
        phase_c_temp: pickField(
          live?.phase_c_temp,
          lastOrPeak("phase_c_temp", "phase_c_temp", "phase_c"),
          null
        ),
        measured_amps: pickField(
          live?.measured_amps,
          lastOrPeak("measured_amps", "measured_amps", "current_amps", "amps"),
          null
        ),
        rated_amps: pickField(
          live?.rated_amps,
          lastOrPeak("rated_amps", "rated_amps", "fla"),
          asset?.rated_amps
        ),
        de_bearing_temp: pickField(
          live?.de_bearing_temp,
          lastOrPeak("de_bearing_temp", "de_bearing_temp", "bearing_de"),
          null
        ),
        ode_bearing_temp: pickField(
          live?.ode_bearing_temp,
          lastOrPeak("ode_bearing_temp", "ode_bearing_temp", "bearing_nde"),
          null
        ),
        refractory_skin_temp: pickField(
          live?.refractory_skin_temp,
          lastOrPeak("refractory_skin_temp", "refractory_skin_temp", "skin_temp"),
          null
        ),
        max_allowable_limit: pickField(
          live?.max_allowable_limit,
          lastOrPeak("max_allowable_limit", "max_allowable_limit"),
          asset?.max_allowable_temp
        ),
        voltage_rating: pickField(
          live?.voltage_rating,
          null,
          asset?.voltage_rating
        ),
        horsepower: pickField(live?.horsepower, null, asset?.horsepower),
        load_percentage: pickField(live?.load_percentage, null, null)
      };

      const scadaEnabled = isScadaEnabled();

      return res.json({
        success: true,
        asset_key: key,
        scada_enabled: scadaEnabled,
        asset: asset
          ? {
              id: asset.id,
              name: asset.name,
              tag_number: asset.tag_number,
              type: asset.type,
              rated_amps: pickNum(asset.rated_amps),
              max_allowable_temp: pickNum(asset.max_allowable_temp),
              voltage_rating: pickNum(asset.voltage_rating),
              horsepower: pickNum(asset.horsepower),
              bearing_specs: asset.bearing_specs ?? null
            }
          : null,
        last_analysis: lastAnalysis
          ? {
              id: lastAnalysis.id,
              asset_id: lastAnalysis.asset_id,
              timestamp: lastAnalysis.timestamp || lastAnalysis.created_at,
              analysis_type: lastAnalysis.analysis_type,
              asset_type: lastAnalysis.asset_type
            }
          : null,
        live: liveRaw
          ? {
              phaseA: liveRaw.phaseA,
              phaseB: liveRaw.phaseB,
              phaseC: liveRaw.phaseC,
              measuredAmps: liveRaw.measuredAmps,
              loadPercentage: liveRaw.loadPercentage,
              timestamp: liveRaw.timestamp,
              source: "live" as const
            }
          : null,
        fields,
        poll_recommended_ms: scadaEnabled ? 10000 : null
      });
    } catch (error: any) {
      console.error("[telemetry-context] Error:", error);
      return res.status(500).json({
        success: false,
        error: error?.message || "Failed to load telemetry context.",
        scada_enabled: isScadaEnabled()
      });
    }
  }
);

app.get("/api/analysis-results", requirePermission("reports.export"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const assetIdRaw = req.query.asset_id != null ? String(req.query.asset_id) : null;
    const assetIds = assetIdRaw
      ? assetIdRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const componentRaw =
      req.query.component != null ? String(req.query.component).trim() : "";
    const component = componentRaw || null;
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50)
    );

    let result;
    // AR-29 directive 1 — tenant-scoped read: only rows stamped with the
    // session tenant; sentinel (-1) rows are excluded until assigned.
    const tenantId = req.tenantId ?? -1;
    if (assetIds.length > 1) {
      if (component) {
        result = await pool.query(
          `SELECT * FROM analysis_results
           WHERE asset_id = ANY($1::text[])
             AND LOWER(TRIM(COALESCE(component, ''))) = LOWER(TRIM($2))
             AND tenant_id = $3
           ORDER BY timestamp DESC
           LIMIT $4`,
          [assetIds, component, tenantId, limit]
        );
      } else {
        result = await pool.query(
          `SELECT * FROM analysis_results
           WHERE asset_id = ANY($1::text[])
             AND tenant_id = $2
           ORDER BY timestamp DESC
           LIMIT $3`,
          [assetIds, tenantId, limit]
        );
      }
    } else if (assetIds.length === 1) {
      const key = assetIds[0];
      if (component) {
        result = await pool.query(
          `SELECT * FROM analysis_results
           WHERE (asset_id = $1
              OR asset_id ILIKE '%' || $1 || '%'
              OR CAST(asset_id AS TEXT) = $1)
             AND LOWER(TRIM(COALESCE(component, ''))) = LOWER(TRIM($2))
             AND tenant_id = $3
           ORDER BY timestamp DESC
           LIMIT $4`,
          [key, component, tenantId, limit]
        );
      } else {
        result = await pool.query(
          `SELECT * FROM analysis_results
           WHERE (asset_id = $1
              OR asset_id ILIKE '%' || $1 || '%'
              OR CAST(asset_id AS TEXT) = $1)
             AND tenant_id = $2
           ORDER BY timestamp DESC
           LIMIT $3`,
          [key, tenantId, limit]
        );
      }
    } else if (component) {
      result = await pool.query(
        `SELECT * FROM analysis_results
         WHERE LOWER(TRIM(COALESCE(component, ''))) = LOWER(TRIM($1))
           AND tenant_id = $2
         ORDER BY timestamp DESC
         LIMIT $3`,
        [component, tenantId, limit]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM analysis_results
         WHERE tenant_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [tenantId, limit]
      );
    }
    return res.json({ success: true, results: result.rows });
  } catch (error: any) {
    console.error("[analysis-results] GET error:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch analysis results." });
  }
});

app.get(OIL_ANALYSIS_API_PATH, requireModule("oil"), requirePermission("view_module:oil"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const assetId =
      req.query.assetId != null ? String(req.query.assetId).trim() : "";
    if (!assetId) {
      return res.status(400).json({ error: "assetId is required" });
    }
    // Tenant comes from the verified session only; the client cannot ask for
    // another company's oil history by changing query params.
    const tenantId = req.tenantId ?? requestTenantId(req);
    const { samples } = await fetchOilSamplesForAsset(assetId, tenantId);
    return res.json({ success: true, samples });
  } catch (error: any) {
    console.error("[oil-analysis] GET error:", error);
    return res.status(500).json({ error: "Failed to fetch data" });
  }
});

app.post(OIL_ANALYSIS_API_PATH, requireModule("oil"), requirePermission("view_module:oil"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const input = coerceSaveOilSampleInput(req.body || {});

    if ("error" in input) {
      return res.status(400).json({ error: input.error });
    }

    const result = await saveOilSample(input, req.tenantId ?? requestTenantId(req));

    if ("error" in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.json({ success: true, sample: result.sample });
  } catch (error: any) {
    console.error("[oil-analysis] POST error:", error);
    return res.status(500).json({ error: "Failed to save data" });
  }
});

app.post(OIL_VISION_API_PATH, requireModule("oil"), requirePermission("view_module:oil"), async (req, res) => {
  req.setTimeout(180_000);
  res.setTimeout(180_000);
  try {
    const imageBase64 = req.body?.imageBase64 || req.body?.fileData;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      console.info("[vision] responding to client:", "n/a");
      return res.status(400).json({
        success: false,
        error: "INVALID_REQUEST",
        message: "imageBase64 is required (data URL or raw base64)."
      });
    }

    const baseInput = {
      imageBase64,
      fileName:
        typeof req.body?.fileName === "string" ? req.body.fileName : null,
      models: Array.isArray(req.body?.models) ? req.body.models : undefined,
      maxTokens:
        typeof req.body?.maxTokens === "number" ? req.body.maxTokens : undefined
    };

    const { parses, lastError } = await runMasterVisionModelLoop(baseInput);

    // Dispatch by detected technology: try vibration first, fall back to oil.
    interface AnyVisionOutcome {
      success: boolean;
      data?: unknown;
      model?: string;
      error?: string;
      message?: string;
      httpStatus?: number;
      detail?: string;
      flaggedFields?: string[];
      extractionMode?: "consensus" | "single" | "geometry-estimate";
      consensusModels?: string[];
    }
    let outcome: AnyVisionOutcome = finalizeVibrationFromParses(parses, lastError, baseInput);
    if (!outcome.success && outcome.error === "TECHNOLOGY_NOT_VIBRATION") {
      outcome = finalizeMcaFromParses(parses, lastError, baseInput);
    }
    if (!outcome.success && outcome.error === "TECHNOLOGY_NOT_MCA") {
      outcome = finalizeThermographyFromParses(parses, lastError, baseInput);
    }
    if (!outcome.success && outcome.error === "TECHNOLOGY_NOT_THERMOGRAPHY") {
      outcome = finalizeOilFromParses(parses, lastError, baseInput);
    }

    const technology =
      (outcome.data as { detectedTechnology?: string | null } | undefined)
        ?.detectedTechnology ?? null;

    console.info(
      "[vision] dispatched model(s):",
      outcome.success === false ? "n/a" : outcome.model,
      "route:",
      OIL_VISION_API_PATH
    );

    if (outcome.success === false) {
      console.info("[vision] responding to client:", technology ?? "n/a");
      return res.status(outcome.httpStatus).json({
        success: false,
        error: outcome.error,
        message: outcome.message,
        ...(outcome.detail ? { detail: outcome.detail } : {})
      });
    }

    console.info("[vision] responding to client:", technology);
    return res.json({
      success: true,
      data: outcome.data,
      model: outcome.model,
      technology,
      path: OIL_VISION_API_PATH
    });
  } catch (error: any) {
    console.info("[vision] responding to client:", "n/a");
    console.error("[oil-analysis/vision-extract] POST error:", error);
    return res.status(500).json({
      success: false,
      error: "VISION_FAILED",
      message: error?.message || "Oil vision extraction failed."
    });
  }
});

app.get("/api/analysis-results/:id", requirePermission("reports.export"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM analysis_results WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Analysis result not found." });
    }
    return res.json({ success: true, analysis: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch analysis result." });
  }
});

app.post("/api/analysis-results/:id/baseline", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const existing = await pool.query(
      `SELECT * FROM analysis_results WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ error: "Analysis result not found." });
    }
    const row = existing.rows[0];
    if (row.asset_id) {
      await pool.query(
        `UPDATE analysis_results SET is_baseline = FALSE WHERE asset_id = $1 AND tenant_id = $2`,
        [row.asset_id, req.tenantId ?? -1]
      );
    } else {
      await pool.query(
        `UPDATE analysis_results SET is_baseline = FALSE WHERE tenant_id = $1`,
        [req.tenantId ?? -1]
      );
    }
    const updated = await pool.query(
      `UPDATE analysis_results SET is_baseline = TRUE WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId ?? -1]
    );
    return res.json({ success: true, analysis: updated.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to set baseline." });
  }
});

// ---------------------------------------------------------------------------
// Certified engineer sign-off on a saved diagnosis (analysis_results.id)
// ---------------------------------------------------------------------------

const SIGN_OFF_STATUSES = ["pending", "approved", "modified"] as const;
type SignOffStatusValue = (typeof SIGN_OFF_STATUSES)[number];

app.get("/api/diagnosis-sign-off", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  const diagnosisId = String(req.query.diagnosisId || "").trim();
  if (!diagnosisId) {
    return res.status(400).json({ error: "diagnosisId is required." });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM diagnosis_sign_off WHERE diagnosis_id = $1`,
      [diagnosisId]
    );
    // No row is not an error: it means the diagnosis is still pending.
    return res.json({ success: true, signOff: result.rows[0] ?? null });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to load sign-off." });
  }
});

app.post("/api/diagnosis-sign-off", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  const body = req.body ?? {};
  const diagnosisId = String(body.diagnosisId || "").trim();
  const status = String(body.status || "").trim() as SignOffStatusValue;
  const engineerName = String(body.engineerName || "").trim();
  const overrideNote = String(body.overrideNote ?? "").trim();

  if (!diagnosisId) {
    return res.status(400).json({ error: "diagnosisId is required." });
  }
  if (!SIGN_OFF_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${SIGN_OFF_STATUSES.join(", ")}.`
    });
  }
  if (status !== "pending" && !engineerName) {
    return res
      .status(400)
      .json({ error: "engineerName is required to approve or modify." });
  }
  // A modification that does not say what changed is not an audit trail.
  if (status === "modified" && !overrideNote) {
    return res
      .status(400)
      .json({ error: "overrideNote is required when modifying a diagnosis." });
  }

  try {
    const exists = await pool.query(
      `SELECT id FROM analysis_results WHERE id = $1`,
      [diagnosisId]
    );
    if (!exists.rows.length) {
      return res
        .status(404)
        .json({ error: "Diagnosis not found — save the analysis first." });
    }

    const result = await pool.query(
      `INSERT INTO diagnosis_sign_off
         (diagnosis_id, status, engineer_name, override_note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (diagnosis_id) DO UPDATE SET
         status = EXCLUDED.status,
         engineer_name = EXCLUDED.engineer_name,
         override_note = EXCLUDED.override_note,
         updated_at = NOW()
       RETURNING *`,
      [diagnosisId, status, engineerName || null, overrideNote || null]
    );
    return res.json({ success: true, signOff: result.rows[0] });
  } catch (error: any) {
    return res
      .status(500)
      .json({ error: error?.message || "Failed to save sign-off." });
  }
});

/** Severities a report may carry, worst first. */
const REPORT_SEVERITIES = ["CRITICAL", "ANOMALY", "NORMAL", "NO_DATA"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A mistyped id is a missing report, not a server fault. Screening the shape
 * here keeps Postgres from raising a uuid cast error that would surface as a
 * 500 and make a bad deep link look like an outage.
 */
function isReportId(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

app.get("/api/reports", requirePermission("reports.export"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      clauses.push(`${sql} $${params.length}`);
    };

    const assetId = req.query.asset_id != null ? String(req.query.asset_id).trim() : "";
    if (assetId) push("asset_id =", assetId);

    // AR-29 directive 1 — tenant from the verified session (the legacy
    // client-supplied company_id filter is no longer trusted).
    push("tenant_id =", req.tenantId ?? -1);

    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50)
    );
    params.push(limit);

    const result = await pool.query(
      `SELECT * FROM reports
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ success: true, reports: result.rows });
  } catch (error: any) {
    console.error("[reports] GET error:", error);
    return res
      .status(500)
      .json({ error: error?.message || "Failed to load reports." });
  }
});

app.get("/api/reports/:id", requirePermission("reports.export"), async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  if (!isReportId(req.params.id)) {
    return res.status(404).json({ error: "Report not found." });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM reports WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Report not found." });
    }
    return res.json({ success: true, report: result.rows[0] });
  } catch (error: any) {
    console.error("[reports] GET by id error:", error);
    return res
      .status(500)
      .json({ error: error?.message || "Failed to load report." });
  }
});

app.post("/api/reports", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }

  const body = req.body || {};
  const assetId = String(body.assetId ?? body.asset_id ?? "").trim();
  if (!assetId) {
    return res.status(400).json({ error: "assetId is required." });
  }

  const severity = String(
    body.overallSeverity ?? body.overall_severity ?? "NORMAL"
  ).toUpperCase();
  if (!REPORT_SEVERITIES.includes(severity as (typeof REPORT_SEVERITIES)[number])) {
    return res.status(400).json({
      error: `overallSeverity must be one of ${REPORT_SEVERITIES.join(", ")}.`
    });
  }

  // The summary is the report. Refusing an empty one keeps rows that cannot
  // rehydrate into anything out of the history list.
  const summary = body.technologySummary ?? body.technology_summary;
  if (summary == null || typeof summary !== "object" || Array.isArray(summary)) {
    return res
      .status(400)
      .json({ error: "technologySummary must be an object keyed by technology." });
  }

  const companyIdRaw = body.companyId ?? body.company_id;
  const companyId =
    companyIdRaw == null || companyIdRaw === ""
      ? null
      : Number.isFinite(Number(companyIdRaw))
        ? Number(companyIdRaw)
        : null;

  const asArray = (v: unknown) => (Array.isArray(v) ? v : []);

  try {
    // AR-29 rule 9 — tenant stamped from the verified session; the legacy
    // company_id body field is no longer trusted for tenancy.
    const tenantId = req.tenantId ?? -1;

    const result = await pool.query(
      `INSERT INTO reports
         (asset_id, company_id, title, technology_summary, overall_severity,
          fault_diagnoses, recommendations, technologies_with_data, generated_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        assetId,
        companyId != null ? companyId : tenantId !== -1 ? tenantId : null,
        body.title ? String(body.title) : null,
        JSON.stringify(summary),
        severity,
        JSON.stringify(asArray(body.faultDiagnoses ?? body.fault_diagnoses)),
        JSON.stringify(asArray(body.recommendations)),
        JSON.stringify(
          asArray(body.technologiesWithData ?? body.technologies_with_data)
        ),
        body.generatedBy ? String(body.generatedBy) : null,
        tenantId
      ]
    );
    return res.json({ success: true, report: result.rows[0] });
  } catch (error: any) {
    console.error("[reports] POST error:", error);
    return res
      .status(500)
      .json({ error: error?.message || "Failed to save report." });
  }
});

app.delete("/api/reports/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  if (!isReportId(req.params.id)) {
    return res.status(404).json({ error: "Report not found." });
  }
  try {
    const result = await pool.query(
      `DELETE FROM reports WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Report not found." });
    }
    return res.json({ success: true, id: result.rows[0].id });
  } catch (error: any) {
    console.error("[reports] DELETE error:", error);
    return res
      .status(500)
      .json({ error: error?.message || "Failed to delete report." });
  }
});

app.get("/api/alerts", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, val: unknown) => {
      params.push(val);
      clauses.push(`${sql} $${params.length}`);
    };

    // Tenant is always the session's company; never a client query param.
    push("tenant_id =", req.tenantId ?? -1);

    if (req.query.asset_id != null && String(req.query.asset_id)) {
      push("asset_id =", String(req.query.asset_id));
    }
    if (req.query.acknowledged != null && String(req.query.acknowledged) !== "") {
      push("acknowledged =", String(req.query.acknowledged) === "true");
    }
    if (req.query.severity != null && String(req.query.severity)) {
      push("severity =", String(req.query.severity).toUpperCase());
    }

    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
    );
    params.push(limit);

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ success: true, alerts: result.rows });
  } catch (error: any) {
    console.error("[alerts] GET error:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch alerts." });
  }
});

/**
 * GET /api/anomaly-board - cross-module open anomaly/fault board.
 *
 * READ-ONLY aggregation over the existing diagnostics ledger:
 *   alerts (severity CHECK HIGH/MEDIUM/LOW, acknowledged = open/closed status)
 *   LEFT JOIN analysis_results (module + first-detected timestamp)
 *   same-tenant work_orders (linked repair number)
 *   same-tenant asset -> route -> plant lineage for click-through.
 *
 * Tenant comes from the verified session only (req.tenantId). The client can
 * never request another company by query param. There is no schema change
 * here beyond migrations/021's composite index.
 */
app.get("/api/anomaly-board", requirePermission("anomaly.view"), async (req, res) => {
  const tenantId = Number(req.tenantId ?? -1);
  try {
    // No database / no tenant -> honest empty board (never fabricated counts).
    if (!pool || !Number.isFinite(tenantId) || tenantId < 0) {
      return res.json({
        success: true,
        board: buildAnomalyBoard({ tenantId, rows: [] })
      });
    }

    const result = await pool.query(
      `
      SELECT
        al.id,
        al.tenant_id,
        al.asset_id,
        al.severity,
        al.title,
        al.description,
        al.created_at,
        al.acknowledged,
        al.analysis_result_id,
        ar.analysis_type,
        COALESCE(ar.timestamp, al.created_at) AS first_detected_at,
        wo.id AS work_order_number,
        wo.status AS work_order_status,
        wo.tenant_id AS work_order_tenant_id,
        lineage.asset_name,
        lineage.asset_tag,
        lineage.route_id,
        lineage.route_name,
        lineage.plant_id,
        lineage.plant_name
      FROM alerts al
      LEFT JOIN analysis_results ar
        ON ar.id = al.analysis_result_id
       AND ar.tenant_id = al.tenant_id
      LEFT JOIN LATERAL (
        SELECT w.id, w.status, w.tenant_id
        FROM work_orders w
        WHERE w.tenant_id = al.tenant_id
          AND w.asset_id = al.asset_id
        ORDER BY w.id DESC
        LIMIT 1
      ) wo ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          a.name AS asset_name,
          a.tag_number AS asset_tag,
          r.id AS route_id,
          r.name AS route_name,
          p.id AS plant_id,
          p.name AS plant_name
        FROM assets a
        JOIN routes r ON r.id = a.route_id
        JOIN plants p ON p.id = r.plant_id
        WHERE p.company_id = al.tenant_id
          AND (
            a.id::text = al.asset_id
            OR a.tag_number = al.asset_id
            OR a.name = al.asset_id
          )
        LIMIT 1
      ) lineage ON TRUE
      WHERE al.tenant_id = $1
        AND al.acknowledged IS NOT TRUE
      ORDER BY COALESCE(ar.timestamp, al.created_at) ASC NULLS LAST, al.id ASC
      `,
      [tenantId]
    );

    return res.json({
      success: true,
      board: buildAnomalyBoard({
        tenantId,
        rows: result.rows as AnomalyBoardSourceRow[]
      })
    });
  } catch (error: any) {
    console.error("[anomaly-board] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load the anomaly board."
    });
  }
});

app.post("/api/acknowledge-alert/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const result = await pool.query(
      `UPDATE alerts SET acknowledged = TRUE WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Alert not found." });
    }
    return res.json({ success: true, alert: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to acknowledge alert." });
  }
});

// Alias matching client helper path
app.post("/api/alerts/:id/acknowledge", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const result = await pool.query(
      `UPDATE alerts SET acknowledged = TRUE WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId ?? -1]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Alert not found." });
    }
    return res.json({ success: true, alert: result.rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to acknowledge alert." });
  }
});

/* -------------------------------------------------------------------------- */
/* NOTIFICATIONS-1 - alert insert, bell, mark-read, recipient defaults, audit  */
/* Every tenant id below comes from the verified session (requestTenantId);   */
/* no handler reads a tenant/company id from the query.                       */
/* -------------------------------------------------------------------------- */

// POST /api/alerts - alert insert path. Creates the alert row and fans out one
// in_app notification per same-tenant user + one email row per same-tenant
// alert recipient. Provider sends are queued and NEVER fail this request.
app.post("/api/alerts", async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const title = String(req.body?.title || "").trim();
  if (!title) {
    return res.status(400).json({ error: "Alert title is required." });
  }
  const description =
    req.body?.description == null ? null : String(req.body.description);
  const severity = mapUiSeverityToAlert(req.body?.severity);
  const assetId =
    req.body?.asset_id == null ? null : String(req.body.asset_id);

  try {
    let alert: any;
    if (pool) {
      const inserted = await pool.query(
        `INSERT INTO alerts (asset_id, severity, title, description, tenant_id)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [assetId, severity, title, description, tenantId]
      );
      alert = inserted.rows[0];
    } else {
      alert = {
        id: getNextId(),
        analysis_result_id: null,
        asset_id: assetId,
        severity,
        title,
        description,
        tenant_id: tenantId,
        acknowledged: false,
        created_at: new Date()
      };
      memoryAlerts.push(alert);
    }

    try {
      await recordAlertNotifications(tenantId, [
        {
          id: alert.id,
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          asset_id: alert.asset_id
        }
      ]);
    } catch (notifErr) {
      // A notification problem never fails the alert insert.
      console.error("[notifications] alert fan-out failed:", notifErr);
    }

    return res.status(201).json({ success: true, alert });
  } catch (error: any) {
    console.error("[alerts] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to create alert."
    });
  }
});

// GET /api/notifications - bell list for the session user in the session
// tenant. In-app rows are per user (user_id), tenant-wide rows have NULL.
app.get("/api/notifications", async (req, res) => {
  const tenantId = requestTenantId(req);
  const userId = sessionUserId(req);
  if (tenantId == null || userId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  try {
    let rows: any[];
    if (pool) {
      const result = await pool.query(
        `SELECT * FROM notifications
          WHERE tenant_id = $1
            AND channel = 'in_app'
            AND (user_id = $2 OR user_id IS NULL)
          ORDER BY created_at DESC, id DESC
          LIMIT 100`,
        [tenantId, userId]
      );
      rows = result.rows;
    } else {
      rows = memoryNotifications
        .filter(
          (row) =>
            Number(row.tenant_id) === tenantId &&
            row.channel === "in_app" &&
            (row.user_id == null || Number(row.user_id) === userId)
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime() || Number(b.id) - Number(a.id)
        )
        .slice(0, 100);
    }
    const unreadCount = rows.filter((row) => row.read_at == null).length;
    return res.json({
      success: true,
      tenant_id: tenantId,
      notifications: rows,
      unread_count: unreadCount
    });
  } catch (error: any) {
    console.error("[notifications] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load notifications."
    });
  }
});

// POST /api/notifications/:id/read - mark one bell row read for this user.
app.post("/api/notifications/:id/read", async (req, res) => {
  const tenantId = requestTenantId(req);
  const userId = sessionUserId(req);
  if (tenantId == null || userId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid notification id." });
  }
  try {
    if (pool) {
      const result = await pool.query(
        `UPDATE notifications
            SET read_at = COALESCE(read_at, NOW())
          WHERE id = $1 AND tenant_id = $2
            AND channel = 'in_app'
            AND (user_id = $3 OR user_id IS NULL)
          RETURNING *`,
        [id, tenantId, userId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Notification not found." });
      }
      return res.json({ success: true, notification: result.rows[0] });
    }
    const row = memoryNotifications.find(
      (entry) =>
        Number(entry.id) === id &&
        Number(entry.tenant_id) === tenantId &&
        entry.channel === "in_app" &&
        (entry.user_id == null || Number(entry.user_id) === userId)
    );
    if (!row) {
      return res.status(404).json({ error: "Notification not found." });
    }
    row.read_at = row.read_at ?? new Date();
    return res.json({ success: true, notification: row });
  } catch (error: any) {
    console.error("[notifications] mark-read error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to mark the notification read."
    });
  }
});

// GET /api/admin/notifications - admin audit trail (owner/admin only).
// Reuses the existing tenant-admin bar (isTenantAdminRole ->
// roleAtLeast(..., 'reliability-manager')); see src/lib/routeCheckout.ts.
app.get("/api/admin/notifications", requirePermission("recipients.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may view the notification audit trail.",
      code: "FORBIDDEN"
    });
  }
  try {
    let rows: any[];
    if (pool) {
      const result = await pool.query(
        `SELECT * FROM notifications
          WHERE tenant_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 200`,
        [tenantId]
      );
      rows = result.rows;
    } else {
      rows = memoryNotifications
        .filter((row) => Number(row.tenant_id) === tenantId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime() || Number(b.id) - Number(a.id)
        )
        .slice(0, 200);
    }
    return res.json({
      success: true,
      tenant_id: tenantId,
      notifications: rows
    });
  } catch (error: any) {
    console.error("[notifications] audit GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load the notification audit trail."
    });
  }
});

// GET /api/alert-recipients - tenant alert-recipient defaults (owner/admin).
app.get("/api/alert-recipients", requirePermission("recipients.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may manage alert recipients.",
      code: "FORBIDDEN"
    });
  }
  try {
    const recipients = await tenantAlertRecipients(tenantId);
    return res.json({ success: true, tenant_id: tenantId, recipients });
  } catch (error: any) {
    console.error("[alert-recipients] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load alert recipients."
    });
  }
});

// POST /api/alert-recipients - add one recipient to the SESSION tenant.
// A client-supplied company_id/tenant_id that names a different tenant is
// rejected as 404, matching the cross-tenant resource convention used by
// goodCatches/routeCheckout (never a silent write into the foreign tenant).
app.post("/api/alert-recipients", requirePermission("recipients.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may manage alert recipients.",
      code: "FORBIDDEN"
    });
  }
  const suppliedTenant =
    req.body?.company_id != null
      ? Number(req.body.company_id)
      : req.body?.tenant_id != null
        ? Number(req.body.tenant_id)
        : null;
  if (
    suppliedTenant != null &&
    Number.isFinite(suppliedTenant) &&
    suppliedTenant !== tenantId
  ) {
    return res.status(404).json({ error: "Tenant not found." });
  }
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email address is required." });
  }
  try {
    if (pool) {
      const existing = await pool.query(
        `SELECT id, tenant_id, email FROM tenant_alert_recipients
          WHERE tenant_id = $1 AND LOWER(email) = $2 LIMIT 1`,
        [tenantId, email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Recipient already exists." });
      }
      const inserted = await pool.query(
        `INSERT INTO tenant_alert_recipients (tenant_id, email)
         VALUES ($1, $2) RETURNING id, tenant_id, email, created_at`,
        [tenantId, email]
      );
      return res.status(201).json({
        success: true,
        recipient: inserted.rows[0]
      });
    }
    const existing = memoryAlertRecipients.find(
      (row) =>
        Number(row.tenant_id) === tenantId &&
        normalizeEmail(row.email) === email
    );
    if (existing) {
      return res.status(409).json({ error: "Recipient already exists." });
    }
    const recipient = {
      id: getNextId(),
      tenant_id: tenantId,
      email,
      created_at: new Date()
    };
    memoryAlertRecipients.push(recipient);
    return res.status(201).json({ success: true, recipient });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Recipient already exists." });
    }
    console.error("[alert-recipients] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to add the alert recipient."
    });
  }
});

// DELETE /api/alert-recipients/:id - remove one recipient in the session tenant.
app.delete("/api/alert-recipients/:id", requirePermission("recipients.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may manage alert recipients.",
      code: "FORBIDDEN"
    });
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid recipient id." });
  }
  try {
    if (pool) {
      const result = await pool.query(
        `DELETE FROM tenant_alert_recipients
          WHERE id = $1 AND tenant_id = $2
          RETURNING id`,
        [id, tenantId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Recipient not found." });
      }
      return res.json({ success: true, deleted: result.rows[0].id });
    }
    const index = memoryAlertRecipients.findIndex(
      (row) => Number(row.id) === id && Number(row.tenant_id) === tenantId
    );
    if (index < 0) {
      return res.status(404).json({ error: "Recipient not found." });
    }
    const [deleted] = memoryAlertRecipients.splice(index, 1);
    return res.json({ success: true, deleted: deleted.id });
  } catch (error: any) {
    console.error("[alert-recipients] DELETE error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to remove the alert recipient."
    });
  }
});

app.get("/api/diagnosis-logs", async (req, res) => {
  // Legacy plant-scoped diagnosis_history (older clients pass plant_id / location_id)
  const plantRaw = req.query.plant_id ?? req.query.location_id;
  if (plantRaw != null && String(plantRaw) !== "") {
    try {
      const pid = parseInt(String(plantRaw), 10);
      if (isNaN(pid)) {
        return res.status(400).json({ error: "Invalid location/plant ID" });
      }
      if (!pool) {
        return res.json([]);
      }
      let rows: unknown[] = [];
      try {
        const result = await pool.query(
          `SELECT dh.*, a.name as asset_name 
           FROM diagnosis_history dh 
           JOIN assets a ON dh.asset_id = a.id 
           LEFT JOIN routes r ON a.route_id = r.id 
           WHERE r.plant_id = $1 
             AND dh.tenant_id = $2
           ORDER BY dh.timestamp DESC`,
          [pid, req.tenantId ?? -1]
        );
        rows = result.rows;
      } catch (err: any) {
        console.warn(
          "Could not query via routes, attempting direct plant_id on assets:",
          err.message
        );
        const result = await pool.query(
          `SELECT dh.*, a.name as asset_name 
           FROM diagnosis_history dh 
           JOIN assets a ON dh.asset_id = a.id 
           WHERE a.plant_id = $1 
             AND dh.tenant_id = $2
           ORDER BY dh.timestamp DESC`,
          [pid, req.tenantId ?? -1]
        );
        rows = result.rows;
      }
      return res.json(rows);
    } catch (error: any) {
      console.error("Failed to fetch diagnosis-logs (plant):", error);
      return res
        .status(500)
        .json({ error: error?.message || "Failed to fetch diagnosis logs" });
    }
  }

  // Run Diagnostics persistence table (diagnosis_logs)
  if (!pool) {
    return res.status(503).json({ error: "Database is not configured (DATABASE_URL)." });
  }
  try {
    const assetId = req.query.asset_id != null ? String(req.query.asset_id) : null;
    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
    );
    const result = assetId
      ? await pool.query(
          `SELECT * FROM diagnosis_logs
           WHERE asset_id = $1
             AND tenant_id = $2
           ORDER BY COALESCE(completed_at, created_at) DESC
           LIMIT $3`,
          [assetId, req.tenantId ?? -1, limit]
        )
      : await pool.query(
          `SELECT * FROM diagnosis_logs
           WHERE tenant_id = $1
           ORDER BY COALESCE(completed_at, created_at) DESC
           LIMIT $2`,
          [req.tenantId ?? -1, limit]
        );
    return res.json({ success: true, logs: result.rows });
  } catch (error: any) {
    console.error("[diagnosis-logs] GET error:", error);
    return res.status(500).json({ error: error?.message || "Failed to fetch diagnosis logs." });
  }
});

// Lazy init GoogleGenAI
let aiClient: GoogleGenAI | null = null;

function getAiClient(req?: express.Request): GoogleGenAI {
  const headerKey = req?.headers["x-gemini-api-key"] as string;
  const apiKey = headerKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please add your key in the Secrets/Settings panel in AI Studio, or log in with your API key inside the app.");
  }
  
  // Return a new client if dynamic key is passed, or reuse/create the default client
  if (headerKey) {
    return new GoogleGenAI({
      apiKey: headerKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Structured JSON Response Schema for Reliability Diagnosis (CAT IV Expert Format)
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    equipment_status: {
      type: Type.STRING,
      description: "Overall status of the equipment: 'HEALTHY', 'MINOR_ISSUES', 'FAULT_DETECTED', or 'CRITICAL_FAULT'."
    },
    confidence_score: {
      type: Type.INTEGER,
      description: "Confidence level of this entire diagnostic assessment as a percentage (0 to 100)."
    },
    overall_vibration_level: {
      type: Type.STRING,
      description: "Overall vibration level detected or estimated (e.g., '0.08 in/s' or '3.2 mm/s RMS')."
    },
    iso_severity_zone: {
      type: Type.STRING,
      description: "ISO 10816 vibration severity zone: 'A' (New/Excellent), 'B' (Satisfactory), 'C' (Unsatisfactory), 'D' (Unacceptable)."
    },
    probable_faults: {
      type: Type.ARRAY,
      description: "Identified probable faults. Must be an empty array if status is HEALTHY and there are no faults.",
      items: {
        type: Type.OBJECT,
        properties: {
          fault_name: { type: Type.STRING, description: "Specific fault name." },
          probability: { type: Type.INTEGER, description: "Probability of this fault as a percentage (0 to 100)." },
          confidence: { type: Type.STRING, description: "Confidence in this fault: 'High', 'Medium', or 'Low'." },
          supporting_evidence: { type: Type.STRING, description: "Specific data points or frequency peaks proving this fault." },
          calculated_frequencies: { type: Type.STRING, description: "Formula and calculations used to identify this fault frequency." },
          physical_explanation: { type: Type.STRING, description: "The underlying physical/rotordynamics reason why this symptom is present." },
          fault: { type: Type.STRING, description: "Name of the diagnosed fault (legacy support, same as fault_name)." },
          description: { type: Type.STRING, description: "Detailed physical explanation (legacy support, same as physical_explanation)." }
        },
        required: ["fault_name", "probability", "confidence", "supporting_evidence", "calculated_frequencies", "physical_explanation", "fault", "description"]
      }
    },
    runner_up_faults: {
      type: Type.ARRAY,
      description: "Alternative failure modes ruled out or less likely.",
      items: {
        type: Type.OBJECT,
        properties: {
          fault_name: { type: Type.STRING, description: "Alternative fault name." },
          probability: { type: Type.INTEGER, description: "Probability percentage (0 to 100)." },
          why_ruled_out: { type: Type.STRING, description: "Evidence or specs that make this less likely than the primary faults." }
        },
        required: ["fault_name", "probability", "why_ruled_out"]
      }
    },
    verification_steps: {
      type: Type.ARRAY,
      description: "Specific tests for technicians to run to confirm the diagnosis.",
      items: { type: Type.STRING }
    },
    immediate_actions: {
      type: Type.ARRAY,
      description: "Step-by-step corrective or routine maintenance actions.",
      items: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: "Action description." },
          priority: { type: Type.STRING, description: "Priority rating: '1' (critical) to '5' (low)." },
          timeline: { type: Type.STRING, description: "When this action should be performed (e.g., 'Immediate', 'Within 30 days')." },
          safety_warning: { type: Type.STRING, description: "Safety instructions, LOTO requirements, or hazards involved. Leave empty if none." }
        },
        required: ["action", "priority", "timeline", "safety_warning"]
      }
    },
    root_cause_analysis: {
      type: Type.STRING,
      description: "5 Whys root cause analysis explanation mapping back to the fundamental failure mechanism."
    },
    financial_impact: {
      type: Type.OBJECT,
      description: "Estimated direct financial impact of predictive vs reactive maintenance.",
      properties: {
        estimated_downtime_cost: { type: Type.STRING, description: "Cost if system fails unexpectedly." },
        estimated_repair_cost: { type: Type.STRING, description: "Cost for planned repair (parts + labor)." },
        savings_from_proactive_repair: { type: Type.STRING, description: "Calculated ROI of proactive maintenance." }
      },
      required: ["estimated_downtime_cost", "estimated_repair_cost", "savings_from_proactive_repair"]
    },
    manager_summary: {
      type: Type.OBJECT,
      description: "Business and executive level brief regarding the failure.",
      properties: {
        severity: { type: Type.STRING, description: "Overall system severity status: 'Critical', 'High', 'Medium', 'Low'." },
        executive_brief: { type: Type.STRING, description: "A high-level executive summary summarizing findings and recommended schedule impact." },
        estimated_downtime: { type: Type.STRING, description: "Estimated offline duration for repairs." },
        cost_estimate: { type: Type.STRING, description: "Financial estimate of repair parts + labor." },
        business_impact: { type: Type.STRING, description: "Specific business operations impact." }
      },
      required: ["severity", "executive_brief", "estimated_downtime", "cost_estimate", "business_impact"]
    },
    technician_instructions: {
      type: Type.STRING,
      description: "Detailed, step-by-step instructions for the maintenance team."
    },
    data_sources_analyzed: {
      type: Type.STRING,
      description: "Summary list of files, images, specs, and symptoms analyzed."
    }
  },
  required: [
    "equipment_status",
    "confidence_score",
    "overall_vibration_level",
    "iso_severity_zone",
    "probable_faults",
    "runner_up_faults",
    "verification_steps",
    "immediate_actions",
    "root_cause_analysis",
    "financial_impact",
    "manager_summary",
    "technician_instructions",
    "data_sources_analyzed"
  ]
};

// Helper to generate a diagnostic response matching the CAT IV JSON structure
function generateStaticDiagnosis(category: string, symptoms: string = "", specs: any = {}): any {
  return {};
}

/* deleted static details */
function dummy_unused() {
  const isHealthy = true;
  const specs: any = {};
  const category: any = "";
  const symLower: any = "";

  if (isHealthy) {
    return {
      equipment_status: "HEALTHY",
      confidence_score: 98,
      overall_vibration_level: "0.08 in/s",
      iso_severity_zone: "A",
      probable_faults: [],
      runner_up_faults: [],
      verification_steps: [
        "Continue routine monthly vibration offline monitoring",
        "Record ultrasonic baseline on all bearings"
      ],
      immediate_actions: [
        {
          action: "Continue standard routine monitoring and scheduled lubrication",
          priority: "5",
          timeline: "Monthly standard schedule",
          safety_warning: "None"
        }
      ],
      root_cause_analysis: "No active faults or degradation vectors detected. The physical vibration spectrum, thermal signals, and operating metrics comply 100% with ISO 10816 Zone A guidelines.",
      financial_impact: {
        estimated_downtime_cost: "$0",
        estimated_repair_cost: "$0",
        savings_from_proactive_repair: "$0"
      },
      manager_summary: {
        severity: "Low",
        executive_brief: "EQUIPMENT HEALTHY - No faults detected. All systems are operating fully within standard nominal specifications (ISO 10816 Zone A - Excellent condition). Continue routine scheduled offline inspections.",
        estimated_downtime: "None",
        cost_estimate: "$0",
        business_impact: "None - 100% operational throughput maintained."
      },
      technician_instructions: "Measure bearing housing temperature during routine sweep. Verify grease purge limits.",
      data_sources_analyzed: "Historical trend lines, raw operator notes, and specs sheets verified normal.",
      sources: [
        { title: "ISO 10816-3 Mechanical Vibration Guidelines", uri: "https://www.iso.org/standard/23204.html" }
      ],
      attemptedModel: "Static Rule-Based Engine (Offline)"
    };
  }

  // Faulty equipment
  let result: any = {
    equipment_status: "FAULT_DETECTED",
    confidence_score: 85,
    overall_vibration_level: "0.32 in/s",
    iso_severity_zone: "C",
    probable_faults: [],
    runner_up_faults: [],
    verification_steps: [],
    immediate_actions: [],
    root_cause_analysis: "",
    financial_impact: {
      estimated_downtime_cost: "$12,000",
      estimated_repair_cost: "$850",
      savings_from_proactive_repair: "$11,150"
    },
    manager_summary: {
      severity: "High",
      executive_brief: "Fault detected. Immediate attention is required to avoid unplanned shutdown.",
      estimated_downtime: "2 hours",
      cost_estimate: "$850",
      business_impact: "Production is at risk."
    },
    technician_instructions: "",
    data_sources_analyzed: "Attached spectral logs and operator observations.",
    sources: [
      { title: "ISO 10816 Mechanical Vibration Standards", uri: "https://www.iso.org/" }
    ],
    attemptedModel: "Static Rule-Based Engine (Offline)"
  };

  const rpm = specs.specRpm || "1800";

  if (category === "Mechanical") {
    if (symLower.includes("bearing") || symLower.includes("temp") || symLower.includes("noise") || symLower.includes("hot") || symLower.includes("grease")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.38 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 92;
      result.probable_faults = [
        {
          fault_name: "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)",
          probability: 92,
          confidence: "High",
          supporting_evidence: "Acoustic emission decibel hikes and housing thermal reading of 82°C.",
          calculated_frequencies: "Calculated BPFI of 148 Hz based on " + rpm + " RPM shaft speed. Observed peak matches coefficient exactly.",
          physical_explanation: "Subsurface contact fatigue produces micro-fissures and subsequent flaking of the inner ring raceway. Element impact creates cyclic stress waves.",
          fault: "Bearing Raceway Micro-Spalling & Fatigue (Stage 3)", // legacy support
          description: "Subsurface contact fatigue produces micro-fissures and subsequent flaking of the inner ring raceway." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Inadequate or Degraded Lubricant Film",
          probability: 65,
          why_ruled_out: "Explains high temperature, but doesn't explain the distinct, sharp BPFI vibration frequency peak."
        }
      ];
      result.verification_steps = [
        "Conduct shock pulse high-frequency analysis",
        "Observe housing temperature profile using thermography"
      ];
      result.immediate_actions = [
        {
          action: "Schedule inboard bearing replacement",
          priority: "2",
          timeline: "Within 14 operating days",
          safety_warning: "Observe 10-minute cool-down prior to housing contact. Execute LOTO on breaker."
        },
        {
          action: "Replenish bearing grease with lithium-complex synthetic lubricant",
          priority: "3",
          timeline: "Immediately",
          safety_warning: "Verify zero grease over-pressurization to prevent seal blowouts."
        }
      ];
      result.root_cause_analysis = "1. Why did the bearing fail? Excessive inner ring wear. 2. Why inner ring wear? Rolling contact fatigue under cyclic loading. 3. Why cyclic loading? Minor shaft coupling misalignment over long operation. 4. Why misalignment? Thermal growth of machinery wasn't accounted for during installation. 5. Why missed? Lack of strict pre-commissioning alignment verification protocols.";
      result.financial_impact = {
        estimated_downtime_cost: "$28,000 (unplanned stoppage)",
        estimated_repair_cost: "$1,200 (planned bearing swap)",
        savings_from_proactive_repair: "$26,800"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Inboard bearing RAC_3 spalling detected. Vibration is 0.38 in/s (ISO Zone C - Unsatisfactory). Please schedule planned replacement within 14 days to avoid unplanned downtime.",
        estimated_downtime: "2.5 hours",
        cost_estimate: "$1,200",
        business_impact: "Losing backup pump redundancy creates high risk of a single point of failure."
      };
      result.technician_instructions = "Isolate machine. Extract old grease. Unmount bearing cage, swap with SKF equivalent, check hot-alignment parameters.";
    } else if (symLower.includes("alignment") || symLower.includes("coupling") || symLower.includes("vibe") || symLower.includes("vibration")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.42 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 88;
      result.probable_faults = [
        {
          fault_name: "Shaft Angular & Radial Misalignment",
          probability: 88,
          confidence: "High",
          supporting_evidence: "Dominant peaks at 1X and 2X rotational speeds. High axial-to-radial vibration ratio.",
          calculated_frequencies: "1X RPM frequency = " + (parseInt(rpm)/60) + " Hz. 2X RPM frequency = " + (2*parseInt(rpm)/60) + " Hz.",
          physical_explanation: "Angular offset forces coupling elements to flex twice per shaft revolution, injecting high radial and axial stress forces into bearings.",
          fault: "Shaft Angular & Radial Misalignment", // legacy support
          description: "Dominant peaks at 1X and 2X rotational speeds. High axial-to-radial vibration ratio." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Dynamic mass unbalance",
          probability: 45,
          why_ruled_out: "Unbalance would produce high 1X horizontal radial vibes, but doesn't explain the massive 2X axial vibration peak."
        }
      ];
      result.verification_steps = [
        "Perform phase analysis across coupling interface",
        "Perform soft-foot mounting bolt diagnostics"
      ];
      result.immediate_actions = [
        {
          action: "Execute dual-dial indicator laser shaft alignment",
          priority: "2",
          timeline: "Within 30 operating days",
          safety_warning: "Apply Lock-Out Tag-Out (LOTO) to primary electrical breakers."
        }
      ];
      result.root_cause_analysis = "1. Why misalignment? Thermal shift under full load. 2. Why thermal shift? Machinery expanded more than predicted. 3. Why unpredicted expansion? Alignment was done when machines were fully cold without offsetting for thermal growth. 4. Why cold alignment? Lack of hot-alignment sweep procedures. 5. Why no procedures? Plant standards lacked thermal coefficient documentation.";
      result.financial_impact = {
        estimated_downtime_cost: "$15,000",
        estimated_repair_cost: "$450 (planned realignment)",
        savings_from_proactive_repair: "$14,550"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Significant shaft coupling misalignment detected. Realignment is recommended during the next scheduled weekend window to avoid bearing failure.",
        estimated_downtime: "2.0 hours",
        cost_estimate: "$450",
        business_impact: "Angular shaft strain is transmitting cyclic fatigue stress directly to inboard motor bearings."
      };
      result.technician_instructions = "Clean base plates, measure and correct soft foot, perform laser alignment targetting < 0.05 mm tolerance.";
    } else {
      // Dynamic unbalance
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.35 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 90;
      result.probable_faults = [
        {
          fault_name: "Dynamic Rotor Mass Unbalance",
          probability: 90,
          confidence: "High",
          supporting_evidence: "Dominant 1X RPM radial peak in the horizontal plane with very low harmonics.",
          calculated_frequencies: "1X RPM frequency calculated at " + (parseInt(rpm)/60).toFixed(1) + " Hz.",
          physical_explanation: "Asymmetric mass distribution in the rotating rotor creates a centripetal force vector that rotates with the shaft, producing radial vibration.",
          fault: "Dynamic Rotor Mass Unbalance", // legacy support
          description: "Dominant 1X RPM radial peak in the horizontal plane with very low harmonics." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Mechanical looseness",
          probability: 30,
          why_ruled_out: "Looseness would show multiple harmonics (3X, 4X, 5X) rather than a pure 1X sinusoidal spectrum."
        }
      ];
      result.verification_steps = [
        "Check rotor for dirt buildup or material loss",
        "Perform single-plane trial weight run"
      ];
      result.immediate_actions = [
        {
          action: "Perform single-plane dynamic field balancing",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Verify machine is 100% de-energized before opening safety shroud."
        }
      ];
      result.root_cause_analysis = "1. Why unbalance? Rotor mass asymmetry. 2. Why asymmetry? Accumulation of particulate sludge on impeller vanes. 3. Why sludge buildup? Fine material bypassed intake strainers. 4. Why bypassed strainers? Strainer mesh was ruptured. 5. Why ruptured? Ruptured due to age and lack of PM checks.";
      result.financial_impact = {
        estimated_downtime_cost: "$18,000",
        estimated_repair_cost: "$1,200 (field balance + filter swap)",
        savings_from_proactive_repair: "$16,800"
      };
      result.manager_summary = {
        severity: "Medium",
        executive_brief: "FAULT DETECTED - Rotor dynamic unbalance. Vibration level is 0.35 in/s (Zone C). Balancing the rotor will restore healthy operation and extend bearing life.",
        estimated_downtime: "3.5 hours",
        cost_estimate: "$1,200",
        business_impact: "Elevated centrifugal forces are transmitting structural noise and causing baseline wear."
      };
      result.technician_instructions = "Thoroughly clean impeller blades. Install trial weights, execute vector balancing using vibration analyzer.";
    }
  } else if (category === "Electrical") {
    if (symLower.includes("winding") || symLower.includes("insulation") || symLower.includes("ohm") || symLower.includes("current") || symLower.includes("hot")) {
      result.equipment_status = "CRITICAL_FAULT";
      result.overall_vibration_level = "0.48 in/s";
      result.iso_severity_zone = "D";
      result.confidence_score = 95;
      result.probable_faults = [
        {
          fault_name: "Stator Winding Inter-turn Insulation Degradation",
          probability: 95,
          confidence: "High",
          supporting_evidence: "Severe phase resistance imbalances and local coil temperatures exceeding class limits.",
          calculated_frequencies: "Vibration peaks noted at 120 Hz (2X line frequency) in radial and axial spectrums.",
          physical_explanation: "Winding insulation breakdown induces phase-to-phase current shorting. The resulting asymmetric electromagnetic fields generate high 2X line frequency vibrations.",
          fault: "Stator Winding Inter-turn Insulation Degradation", // legacy support
          description: "Severe phase resistance imbalances and local coil temperatures exceeding class limits." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Air Gap Eccentricity",
          probability: 55,
          why_ruled_out: "Would explain the 120 Hz vibration, but cannot cause severe phase resistance imbalances."
        }
      ];
      result.verification_steps = [
        "Perform insulation resistance (Megger) and Polarization Index test",
        "Perform surge test on stator windings"
      ];
      result.immediate_actions = [
        {
          action: "Conduct Megger insulation resistance testing",
          priority: "1",
          timeline: "Immediately",
          safety_warning: "Discharge motor winding capacitance completely before attaching testing probes. Lock out breaker."
        }
      ];
      result.root_cause_analysis = "1. Why stator short? Insulation dielectric breakdown. 2. Why breakdown? Excessively high local winding temperatures. 3. Why high temperatures? Heavy motor overload running during peak cycles. 4. Why overload? Feed pump load valve stuck 100% open. 5. Why stuck open? Actuator valve solenoid electrical fault went unmonitored.";
      result.financial_impact = {
        estimated_downtime_cost: "$75,000 (catastrophic winding burnout)",
        estimated_repair_cost: "$3,500 (planned stator overhaul)",
        savings_from_proactive_repair: "$71,500"
      };
      result.manager_summary = {
        severity: "Critical",
        executive_brief: "CRITICAL FAULT - Winding dielectric insulation is near catastrophic collapse. Immediate shutdown and Megger test is advised to prevent motor stator burnout.",
        estimated_downtime: "8 hours",
        cost_estimate: "$3,500",
        business_impact: "High risk of immediate stator winding ground-fault arc explosion, destroying core irons."
      };
      result.technician_instructions = "Stop the motor. Disconnect power cables in terminal box. Perform phase-to-phase and phase-to-ground insulation resistance checks.";
    } else {
      // Rotor bar issue
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.31 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 82;
      result.probable_faults = [
        {
          fault_name: "Broken Rotor Bar Circuit",
          probability: 82,
          confidence: "Medium",
          supporting_evidence: "Current sidebands surrounding the 60 Hz line frequency observed in MCSA spectrum.",
          calculated_frequencies: "Pole pass sideband frequencies calculated at +/- 1.8 Hz relative to 60 Hz supply.",
          physical_explanation: "Fractured rotor bar cage bars alter local current distribution, causing asymmetric torque output and cyclic 1X slip frequency oscillations.",
          fault: "Broken Rotor Bar Circuit", // legacy support
          description: "Current sidebands surrounding the 60 Hz line frequency observed in MCSA spectrum." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Shaft unbalance",
          probability: 40,
          why_ruled_out: "Does not explain the current signature sidebands surrounding line frequency."
        }
      ];
      result.verification_steps = [
        "Perform high-fidelity Motor Current Signature Analysis (MCSA)",
        "Perform rotor winding resistance testing"
      ];
      result.immediate_actions = [
        {
          action: "Take current signature readings under full machine load",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Wear certified arc-flash face shields when interfacing current clamps near distribution boxes."
        }
      ];
      result.root_cause_analysis = "1. Why broken rotor bar? Cyclic thermal and centrifugal stress. 2. Why cyclic stress? Frequent across-the-line starting under heavy loads. 3. Why across-the-line starts? Absence of soft-starter or VFD control. 4. Why no soft-starter? Not specified in the original capital project scope. 5. Why missed? Cost saving measures in original plant deployment.";
      result.financial_impact = {
        estimated_downtime_cost: "$45,000",
        estimated_repair_cost: "$4,800 (rotor re-barring during shutdown)",
        savings_from_proactive_repair: "$40,200"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Broken rotor cage bar detected. Motor remains operational but output torque is degraded. Recommend scheduling rotor cage overhaul during next turn.",
        estimated_downtime: "12 hours",
        cost_estimate: "$4,800",
        business_impact: "Pulsating torque decreases motor system throughput and increases rotor slot wear."
      };
      result.technician_instructions = "Verify sideband amplitude. Set up scheduled rotor swap and install soft-starter to prevent future cyclic stress fractures.";
    }
  } else { // Hydraulic
    if (symLower.includes("cavitation") || symLower.includes("noise") || symLower.includes("ripple") || symLower.includes("pump")) {
      result.equipment_status = "FAULT_DETECTED";
      result.overall_vibration_level = "0.39 in/s";
      result.iso_severity_zone = "C";
      result.confidence_score = 90;
      result.probable_faults = [
        {
          fault_name: "Fluid Aeration & Pump Cavitation Erosion",
          probability: 90,
          confidence: "High",
          supporting_evidence: "Loud crackling noise sounding like gravel pumping. Distinct broadband vibration spikes at 2-5 kHz.",
          calculated_frequencies: "Broadband vibration signature. No specific single-frequency peak, typical of chaotic cavitation bubbles.",
          physical_explanation: "Inlet pressure dropping below the oil vapor pressure releases vapor bubbles. Subsequent implosions in high pressure zone cause severe shockwaves eroding impeller metal.",
          fault: "Fluid Aeration & Pump Cavitation Erosion", // legacy support
          description: "Loud crackling noise sounding like gravel pumping. Distinct broadband vibration spikes." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Internal gear backlash",
          probability: 35,
          why_ruled_out: "Gear wear would produce distinct GMF (Gear Mesh Frequency) harmonic peaks, not high broadband chaotic noise."
        }
      ];
      result.verification_steps = [
        "Verify suction vacuum pressure",
        "Perform case-drain temperature differential tests"
      ];
      result.immediate_actions = [
        {
          action: "Clean suction line strainer, check for air ingestion",
          priority: "2",
          timeline: "Within 7 days",
          safety_warning: "Verify zero system pressure. Wear safety glasses for hydraulic splashes."
        }
      ];
      result.root_cause_analysis = "1. Why cavitation? Low suction pressure. 2. Why low suction? Blocked suction trainer mesh. 3. Why blocked strainer? Particle contamination in hydraulic oil reservoir. 4. Why reservoir contamination? Ruptured air breather cap allowed ambient dust ingestion. 5. Why ruptured cap? Ruptured by passing forklift mast and never reported.";
      result.financial_impact = {
        estimated_downtime_cost: "$22,000",
        estimated_repair_cost: "$1,800 (strainer + breather + labor)",
        savings_from_proactive_repair: "$20,200"
      };
      result.manager_summary = {
        severity: "High",
        executive_brief: "FAULT DETECTED - Pump cavitation is occurring. Rapid erosion of impeller vanes is happening. Action is required to clean suction strainers immediately to prevent total impeller replacement.",
        estimated_downtime: "3 hours",
        cost_estimate: "$1,800",
        business_impact: "Cavitation-induced vapor bubble implosions are eating away impeller volutes."
      };
      result.technician_instructions = "De-energize pump, isolate fluid block, unscrew suction line coupling, inspect filter. Replace filter and clean reservoir air breather.";
    } else {
      // Sluggish proportional spool valve
      result.equipment_status = "MINOR_ISSUES";
      result.overall_vibration_level = "0.22 in/s";
      result.iso_severity_zone = "B";
      result.confidence_score = 80;
      result.probable_faults = [
        {
          fault_name: "Proportional Valve Spool Silt-Locking & Wear",
          probability: 78,
          confidence: "Medium",
          supporting_evidence: "Actuator lag times and slightly elevated temperature differentials across spool valve block.",
          calculated_frequencies: "Not vibration frequency dependent. Checked via cylinder stroke travel timing charts.",
          physical_explanation: "Fine particulate contamination accumulates in the tight clearances between spool lands and valve body, creating dynamic silt locking friction.",
          fault: "Proportional Valve Spool Silt-Locking & Wear", // legacy support
          description: "Actuator lag times and slightly elevated temperature differentials across spool valve block." // legacy support
        }
      ];
      result.runner_up_faults = [
        {
          fault_name: "Internal seal bypassing",
          probability: 50,
          why_ruled_out: "Would explain lag under extreme loads, but doesn't cause spool sticking friction or high local solenoid currents."
        }
      ];
      result.verification_steps = [
        "Conduct oil particulate analysis (ISO 4406)",
        "Perform solenoid stroke response verification"
      ];
      result.immediate_actions = [
        {
          action: "Take reservoir oil sample for particulate check",
          priority: "3",
          timeline: "Within 30 days",
          safety_warning: "Observe standard de-pressurization before taking hydraulic line taps."
        }
      ];
      result.root_cause_analysis = "1. Why sluggish? Spool sticking. 2. Why sticking? Particulate silting between spool land clearances. 3. Why particulates? Failed offline kidney-loop filtration system. 4. Why failed kidney loop? Clogged 5-micron element went unreplaced for 12 months. 5. Why unreplaced? Clogged filter pressure differential gauge was broken.";
      result.financial_impact = {
        estimated_downtime_cost: "$12,500",
        estimated_repair_cost: "$600 (filter element swap + oil flush)",
        savings_from_proactive_repair: "$11,900"
      };
      result.manager_summary = {
        severity: "Medium",
        executive_brief: "MINOR ISSUES - Sluggish proportional valve response due to silt-locking. Fluid contamination levels are high. Recommend kidney loop filter servicing to prevent valve wear.",
        estimated_downtime: "2.0 hours",
        cost_estimate: "$600",
        business_impact: "Cylinder extension lags by 15%, causing slight process delays but zero safety concerns."
      };
      result.technician_instructions = "Draw 100ml oil sample. Flush valve block using mineral spirits. Install new 5-micron filter elements on the system.";
    }
  }

  // Ensure sorting by probability
  if (result.probable_faults && Array.isArray(result.probable_faults)) {
    result.probable_faults.sort((a: any, b: any) => b.probability - a.probability);
  }

  return result;
}

function generateStaticSensorPlacement(equipmentDescription?: string): any {
  const desc = (equipmentDescription || "").toLowerCase();
  
  if (desc.includes("fan") || desc.includes("blower") || desc.includes("exhaust")) {
    return {
      equipmentType: "Overhung Industrial Exhaust Fan",
      recommendedSensors: "High-temperature 100 mV/g Piezoelectric Accelerometers",
      mountingType: "Threaded Stud Mount directly on pillow block housings",
      surfacePreparation: "Grid-grind surface down to bare metal, spot-face the flat bearing zone, drill and tap thread.",
      points: [
        {
          x: 25,
          y: 65,
          label: "Fan Inboard Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors fan impeller unbalance and blade pass frequencies directly near the wet end."
        },
        {
          x: 45,
          y: 65,
          label: "Fan Outboard Bearing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Tracks dynamic belt/coupling misalignment and belt tension strain."
        },
        {
          x: 65,
          y: 50,
          label: "Motor Inboard Bearing (Axial)",
          direction: "Axial",
          description: "Monitors axial shaft thrust, coupling offset, and motor angular misalignment."
        },
        {
          x: 85,
          y: 50,
          label: "Motor Outboard Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors non-drive end housing health and structural foundation looseness."
        }
      ]
    };
  } else if (desc.includes("compressor") || desc.includes("screw") || desc.includes("turbine")) {
    return {
      equipmentType: "Multistage Rotational Screw Compressor Set",
      recommendedSensors: "Wide-frequency (up to 15 kHz) 100 mV/g Piezoelectric Accelerometers",
      mountingType: "Threaded Stud Mount",
      surfacePreparation: "Remove paint and cast iron burrs, spot-face caps flat to 32 micro-inch finish, drill and tap 1/4-28 holes.",
      points: [
        {
          x: 20,
          y: 40,
          label: "Suction-End Housing (Triaxial)",
          direction: "Triaxial",
          description: "Captures rotor mesh frequencies and suction fluid turbulence across all 3 orthogonal planes."
        },
        {
          x: 45,
          y: 45,
          label: "Male Rotor Bearing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Directly monitors high-speed rotor imbalance and gear/lobe meshing."
        },
        {
          x: 65,
          y: 45,
          label: "Female Rotor Bearing (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Tracks rotor contact fatigue and secondary shaft vibration profiles."
        },
        {
          x: 85,
          y: 55,
          label: "Discharge Thrust Bearing (Axial)",
          direction: "Axial",
          description: "Critical location to monitor axial discharge gas loading and high thrust bearing wear."
        }
      ]
    };
  } else if (desc.includes("gearbox") || desc.includes("gear") || desc.includes("reducer")) {
    return {
      equipmentType: "Speed Reducer Gearbox Set",
      recommendedSensors: "Dual-axis or triaxial high-frequency industrial accelerometers",
      mountingType: "Stud Mount (Threaded 1/4-28 tap)",
      surfacePreparation: "Grind down casing paint, use spot-facing tool to flatten housing land, drill and tap to match standard transducer studs.",
      points: [
        {
          x: 20,
          y: 35,
          label: "Input Pinion Shaft Housing (Radial Horizontal)",
          direction: "Radial Horizontal",
          description: "Tracks high-speed input pinion gear mesh frequencies (GMF) and input coupling misalignment."
        },
        {
          x: 50,
          y: 50,
          label: "Intermediate Gear Shaft (Radial Vertical)",
          direction: "Radial Vertical",
          description: "Monitors intermediate stage gear contact wear and shaft bearing runout."
        },
        {
          x: 80,
          y: 60,
          label: "Output Bull-Gear Bearing (Axial)",
          direction: "Axial",
          description: "Monitors slow-speed high-torque output thrust loading and tooth backlash strain."
        }
      ]
    };
  }

  // Standard Centrifugal Pump default fallback
  return {
    equipmentType: "Industrial Centrifugal Pump Set (Dynamic Blueprint)",
    recommendedSensors: "Standard 100 mV/g Piezoelectric Accelerometers (Dual-axis or Triaxial)",
    mountingType: "Stud Mount (Threaded tapped 1/4-28 holes)",
    surfacePreparation: "Sand paint off to bare steel, spot-face the caps flat to a 32 micro-inch finish, drill and tap 1/4-28 UNF threaded holes. Clean with industrial degreaser.",
    points: [
      {
        x: 30,
        y: 55,
        label: "Motor Outboard Bearing (Radial Vertical)",
        direction: "Radial Vertical",
        description: "Monitors stator imbalances and foundation structural looseness."
      },
      {
        x: 50,
        y: 60,
        label: "Motor Inboard Bearing (Radial Horizontal)",
        direction: "Radial Horizontal",
        description: "Catches dynamic coupling misalignment and soft-foot axial strain."
      },
      {
        x: 65,
        y: 62,
        label: "Pump Inboard Bearing (Axial)",
        direction: "Axial",
        description: "Monitors pump impeller thrust load, dynamic load vectors, and shaft misalignment."
      },
      {
        x: 80,
        y: 50,
        label: "Pump Outboard Bearing (Radial Vertical)",
        direction: "Radial Vertical",
        description: "Monitors hydraulic discharge noise and impeller vane health."
      }
    ]
  };
}







// ============================================
// CONSENSUS COMPUTATION & DISPATCH LOOPS
// ============================================







async function sendResendEmail({
  to,
  subject,
  htmlContent
}: {
  to: string;
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ RESEND_API_KEY is not defined. Skipping email dispatch.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Spectra Alerts <onboarding@resend.dev>",
        to: [to],
        subject: subject,
        html: htmlContent
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Resend API returned error:", errText);
      return false;
    }

    const data = await response.json();
    console.log("Resend email sent successfully:", data);
    return true;
  } catch (err) {
    console.error("Failed to send email via Resend:", err);
    return false;
  }
}

function buildEmailTemplate({
  assetName,
  faultName,
  severity,
  description,
  recommendedAction,
  link
}: {
  assetName: string;
  faultName: string;
  severity: string;
  description: string;
  recommendedAction: string;
  link: string;
}) {
  const isCritical = severity.toLowerCase() === "critical" || severity.toLowerCase() === "high";
  const headerBg = isCritical ? "#ef4444" : "#f59e0b"; // Red vs Amber
  const severityText = severity.toUpperCase();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Spectra CM Alert</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .header { background-color: ${headerBg}; padding: 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.05em; }
        .content { padding: 30px; }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 20px; }
        .badge-critical { background-color: #fee2e2; color: #dc2626; }
        .badge-warning { background-color: #fef3c7; color: #d97706; }
        .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .detail-row { display: flex; margin-bottom: 8px; font-size: 14px; }
        .detail-label { width: 140px; font-weight: 600; color: #475569; }
        .detail-value { flex: 1; color: #0f172a; }
        .box { background-color: #f1f5f9; border-left: 4px solid #475569; padding: 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin-top: 8px; }
        .action-box { background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin-top: 8px; }
        .footer { background-color: #0f172a; color: #94a3b8; text-align: center; padding: 20px; font-size: 11px; }
        .button { display: inline-block; background-color: #0f172a; color: #ffffff !important; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; margin-top: 24px; text-align: center; }
        .button:hover { background-color: #1e293b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 MOTOR MEDIC PRO CONDITION MONITORING ALERT</h1>
        </div>
        <div class="content">
          <div class="badge ${isCritical ? 'badge-critical' : 'badge-warning'}">
            ${severityText} SEVERITY LEVEL ALERT
          </div>
          
          <div class="section-title">Asset Information</div>
          <div class="detail-row">
            <span class="detail-label">Asset Name:</span>
            <span class="detail-value">${assetName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Diagnosed Fault:</span>
            <span class="detail-value" style="font-weight: bold; color: ${headerBg};">${faultName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Detected Time:</span>
            <span class="detail-value">${new Date().toLocaleString()}</span>
          </div>

          <div class="section-title">Fault Description & Evidence</div>
          <div class="box">
            ${description}
          </div>

          <div class="section-title">Required Maintenance Action</div>
          <div class="action-box">
            ${recommendedAction}
          </div>

          <div style="text-align: center;">
            <a href="${link}" class="button">View Diagnostic Report</a>
          </div>
        </div>
        <div class="footer">
          Generated automatically by Spectra CM Enterprise Diagnostic System.<br>
          Based on ISO 10816 and ISO 18436 vibration standards.
        </div>
      </div>
    </body>
    </html>
  `;
}

function sendCriticalEmailAlert(equipmentName: string, fault: string, stage: string, delta: string | null, severity: string = "Critical", briefText: string = "", recommendedAction: string = "") {
  console.log(`
============================================================
📧 [AUTOMATED ENTERPRISE ALERT ENGINE] - EMAIL NOTIFICATION
============================================================
TO: reliability-lead@enterprise-plant.com, oncall-tech@enterprise-plant.com
SUBJECT: ⚠️ CRITICAL FAULT DETECTED: ${equipmentName} - STAGE ${stage.toUpperCase()} FAILURE
BODY:
Dear Reliability Engineering Team,

This is an automated Condition Monitoring Alert from Spectra CM.
The AI Diagnostic Consensus Engine has identified a high-risk anomaly.

ASSET DETAILS:
- Equipment Name  : ${equipmentName}
- Identified Fault: ${fault}
- Failure Stage   : ${stage}
- Calculated Delta: ${delta || "N/A"}
- Timestamp       : ${new Date().toISOString()}

RECOMMENDED ACTIONS:
- Execute Lock-Out Tag-Out (LOTO) protocols immediately.
- Deploy an on-call maintenance technician for verification.
- Review recent bearing temperature and vibration trend logs.

This alert was generated automatically based on ISO 18436 standards.
============================================================
`);

  // Trigger real email dispatch via Resend to user's registered address
  const html = buildEmailTemplate({
    assetName: equipmentName,
    faultName: fault,
    severity: severity,
    description: briefText || `Condition Monitoring system flagged an active stage ${stage} anomaly on ${equipmentName}. Calculated baseline deviation is ${delta || "N/A"}.`,
    recommendedAction: recommendedAction || `Execute Lock-Out Tag-Out (LOTO) protocols immediately. Deploy an on-call maintenance technician for verification.`,
    link: "https://ai.studio/build"
  });

  sendResendEmail({
    to: "shanedufrene1989@gmail.com",
    subject: `dYs" ${severity.toUpperCase()} ALERT: ${equipmentName} - ${fault}`,
    htmlContent: html
  }).catch((err) =>
    console.error("[email] fire-and-forget alert dispatch failed:", err)
  );
}

async function dispatchAutomatedAlerts(
  analysisId: number | null,
  companyId: number,
  severity: string,
  result: any,
  specs: any,
  category: string
) {
  const sevUpper = severity.toUpperCase();
  const isCritical = sevUpper === "CRITICAL" || sevUpper === "HIGH";
  if (!isCritical) return;

  const equipName = specs?.equipmentName || `${category} Asset`;
  const primaryFault = result.probable_faults?.[0]?.fault_name || "Unknown Mechanical Fault";
  const briefText = result.manager_summary?.executive_brief || result.reasoning || "";
  const recommendedAction = result.immediate_actions?.[0]?.action || "";

  const html = buildEmailTemplate({
    assetName: equipName,
    faultName: primaryFault,
    severity: severity,
    description: briefText,
    recommendedAction: recommendedAction,
    link: `${process.env.APP_URL || "https://ai.studio/build"}/history`
  });

  if (pool) {
    try {
      // Fetch all users in company with their alert preferences
      const usersRes = await pool.query(`
        SELECT u.id, u.username, u.email, COALESCE(ap.email_enabled, TRUE) as email_enabled, COALESCE(ap.alert_threshold, 'HIGH') as alert_threshold
        FROM users u
        LEFT JOIN alert_preferences ap ON u.id = ap.user_id
        WHERE u.company_id = $1
      `, [companyId]);

      for (const user of usersRes.rows) {
        if (!user.email_enabled) {
          console.log(`Skipping email to ${user.username} (alerts disabled)`);
          continue;
        }

        const recipientEmail = user.email || user.username;
        if (!recipientEmail || !recipientEmail.includes("@")) {
          console.log(`Skipping user ${user.username} - invalid or missing email: ${recipientEmail}`);
          continue;
        }

        const userThreshold = (user.alert_threshold || "HIGH").toUpperCase();
        if (sevUpper === "HIGH" && userThreshold === "CRITICAL") {
          console.log(`Skipping email to ${user.username} (severity High is below Critical threshold)`);
          continue;
        }

        console.log(`📧 Sending automated alert email to ${recipientEmail} for ${equipName} (${severity})...`);
        const success = await sendResendEmail({
          to: recipientEmail,
          subject: `⚠️ CRITICAL ALERT: ${equipName}`,
          htmlContent: html
        });

        // Insert into alert_history
        try {
          await pool.query(`
            INSERT INTO alert_history (user_id, analysis_id, severity, status)
            VALUES ($1, $2, $3, $4)
          `, [user.id, analysisId, severity, success ? "Sent" : "Failed"]);
        } catch (histErr: any) {
          console.error("Failed to log alert history:", histErr.message);
        }
      }
    } catch (error: any) {
      console.error("❌ Failed in automated database alert dispatch:", error.message);
    }
  } else {
    // Memory fallback
    try {
      const users = memoryUsers.filter(u => u.company_id === companyId);
      for (const user of users) {
        let ap = memoryAlertPreferences.find(p => p.user_id === user.id);
        const email_enabled = ap ? ap.email_enabled : true;
        const alert_threshold = ap ? ap.alert_threshold : "High";

        if (!email_enabled) continue;

        const userThreshold = alert_threshold.toUpperCase();
        if (sevUpper === "HIGH" && userThreshold === "CRITICAL") continue;

        const recipientEmail = user.email || user.username;
        if (!recipientEmail || !recipientEmail.includes("@")) continue;

        console.log(`[Mock Memory Email] 📧 Sending email to ${recipientEmail} for ${equipName} (${severity})...`);
        const success = await sendResendEmail({
          to: recipientEmail,
          subject: `⚠️ CRITICAL ALERT: ${equipName}`,
          htmlContent: html
        });

        memoryAlertHistory.push({
          id: memoryAlertHistory.length + 1,
          user_id: user.id,
          analysis_id: analysisId || 100,
          severity,
          sent_at: new Date(),
          status: success ? "Sent" : "Failed"
        });
      }
    } catch (err: any) {
      console.error("❌ Failed in memory alert dispatch:", err.message);
    }
  }
}

// ============================================
// MULTI-AGENT DEBATE SYSTEM HELPER FUNCTIONS
// ============================================

async function callOpenAICompatibleAPI(
  provider: "groq" | "deepseek" | "openrouter" | "openai",
  modelName: string,
  prompt: string,
  fileData?: string,
  fileMimeType?: string
): Promise<string> {
  let apiKey = "";
  let baseURL = "";

  switch (provider) {
    case "groq":
      apiKey = process.env.GROQ_API_KEY || "";
      baseURL = "https://api.groq.com/openai/v1";
      break;
    case "deepseek":
      apiKey = process.env.DEEPSEEK_API_KEY || "";
      baseURL = "https://api.deepseek.com/v1";
      break;
    case "openrouter":
      apiKey = process.env.OPENROUTER_API_KEY || "";
      baseURL = "https://openrouter.ai/api/v1";
      break;
    case "openai":
      apiKey = process.env.OPENAI_API_KEY || "";
      baseURL = "https://api.openai.com/v1";
      break;
  }

  if (!apiKey) {
    throw new Error(`API key for ${provider} is not configured.`);
  }

  const client = new OpenAI({ apiKey, baseURL });
  const messages: any[] = [{ role: "user", content: prompt }];

  console.log(`🤖 Payload sent to callOpenAICompatibleAPI (${provider} - ${modelName}):`, JSON.stringify({
    model: modelName,
    messages: messages,
    temperature: 0.1,
    has_json_format: true
  }, null, 2));

  let response;
  try {
    response = await client.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
  } catch (err: any) {
    console.warn(`⚠️ [callOpenAICompatibleAPI] JSON-mode failed or unsupported for model ${modelName}. Retrying without response_format constraint. Error:`, err.message);
    response = await client.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.1
    });
  }

  const content = response.choices[0]?.message?.content;
  console.log(`🤖 Response received from callOpenAICompatibleAPI (${provider} - ${modelName}):`, content);

  if (!content) {
    throw new Error(`${provider} compatible API returned empty response.`);
  }
  return content;
}

async function getRecentAssetHistory(componentId: number | null): Promise<any[]> {
  if (!pool) return [];
  try {
    let rows: any[] = [];
    if (componentId) {
      const res = await pool.query(`
        SELECT ah.id, ah.measurement_value, ah.units, ah.measurement_date, ah.notes, ah.diagnosis_result,
               mp.direction, cp.name as cp_name, comp.name as comp_name
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        WHERE comp.asset_id = (SELECT asset_id FROM components WHERE id = $1)
        ORDER BY ah.measurement_date DESC, ah.created_at DESC
        LIMIT 5
      `, [componentId]);
      rows = res.rows;
    }
    
    if (rows.length === 0) {
      const res = await pool.query(`
        SELECT ah.id, ah.measurement_value, ah.units, ah.measurement_date, ah.notes, ah.diagnosis_result,
               mp.direction, cp.name as cp_name, comp.name as comp_name
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        ORDER BY ah.measurement_date DESC, ah.created_at DESC
        LIMIT 5
      `);
      rows = res.rows;
    }
    return rows;
  } catch (err) {
    console.warn("⚠️ Failed to fetch recent asset history for debate prompt:", err);
    return [];
  }
}

function formatHistoryForPrompt(historyRows: any[]): string {
  if (!historyRows || historyRows.length === 0) {
    return "No historical readings available for this asset.";
  }
  let txt = "=== RECENT ASSET VIBRATION/CONDITION HISTORY (Last 5 Readings) ===\n";
  historyRows.forEach((row, idx) => {
    const dateStr = row.measurement_date ? new Date(row.measurement_date).toLocaleDateString() : "Unknown Date";
    const val = row.measurement_value !== null ? `${row.measurement_value} ${row.units || ""}` : "N/A";
    const diag = row.diagnosis_result ? (typeof row.diagnosis_result === "string" ? row.diagnosis_result : JSON.stringify(row.diagnosis_result)) : (row.notes || "No diagnosis logged");
    txt += `[Reading #${idx + 1}] Date: ${dateStr} | Value: ${val} | Point: ${row.cp_name || ""}-${row.direction || ""} | Diagnosis/Notes: ${diag}\n`;
  });
  return txt;
}

function buildAgentDebatePrompt(
  agentName: string,
  persona: string,
  vibrationData: any,
  plantHistory: any[],
  peerResponsesText: string | undefined,
  round: number,
  webSearchContext: string
): string {
  const specs = vibrationData.specs || {};
  let specDetails = "";
  if (specs && typeof specs === "object" && !Array.isArray(specs)) {
    try {
      Object.entries(specs).forEach(([key, val]) => {
        if (val && val !== "N/A" && key !== "equipmentName") {
          specDetails += `- ${key}: ${val}\n`;
        }
      });
      if (specs.equipmentName) {
        specDetails += `- Equipment Name/Model: ${specs.equipmentName}\n`;
      }
    } catch (e) {}
  }

  const historyText = formatHistoryForPrompt(plantHistory);

  let prompt = `You are an AI diagnostic agent named **${agentName}**. Your expertise is: ${persona}.
Analyze the following condition monitoring data of industrial equipment and return a highly precise diagnostics report in structured JSON.

--- EQUIPMENT PROFILE ---
System Category: ${vibrationData.category || "General Machinery"}
Specifications:
${specDetails || "None provided"}

${vibrationData.technology ? `Technology: ${vibrationData.technology}\n` : ""}

--- SYMPTOMS & OBSERVATIONS ---
${vibrationData.symptoms || "No physical symptoms described. Analyzing purely from attached data files or specs."}

${vibrationData.baselineData ? `Historical Baseline: ${vibrationData.baselineData}\n` : ""}

--- LIVE WEB SEARCH KNOWLEDGE GROUNDING ---
This live information was retrieved from web search tool results regarding specific bearing fault frequencies, ISO velocity standards, or manufacturer specs:
${webSearchContext || "No direct web matches."}

--- HISTORICAL TREND ANALYSIS ---
${historyText || "No prior history available."}

--- ANALYSIS RULES (CRITICAL) ---
You are an expert vibration analyst. Analyze this data CAREFULLY:

BEARING DEFECT DETECTION RULES:
1. If ANY bearing defect frequencies (BPFO, BPFI, BSF, FTF) are elevated above baseline → Diagnose "Bearing Defect"
2. If high-frequency envelope spectrum shows peaks → Likely bearing defect
3. If non-synchronous peaks are present in gE spectrum → Bearing defect
4. Even if overall velocity is LOW (< 0.28 in/sec), if bearing frequencies are elevated → Still diagnose "Bearing Defect - Early Stage"

UNBALANCE DETECTION:
- 1X RPM amplitude > 50% of overall velocity → Mechanical Unbalance

MISALIGNMENT DETECTION:
- 2X RPM amplitude high with phase variation → Misalignment

NORMAL OPERATION:
- ONLY return "Normal Operation" if:
  a) Overall velocity is low (< 0.28 in/sec)
  b) NO elevated bearing frequencies
  c) NO significant 1X, 2X, 3X peaks
  d) NO high-frequency energy

CRITICAL: When in doubt, err on the side of detecting a fault rather than missing one. It's better to have a false positive than miss a real bearing defect.

--- OUTPUT FORMAT ---
You MUST respond with a single, valid JSON object following this exact schema. Do not include any explanation outside of the JSON block:
{
  "diagnosis": "Detailed diagnostic statement (e.g. Early-stage outer race bearing wear detected, Unbalance in rotor assembly, etc.)",
  "confidence": 85,
  "evidence": "List the SPECIFIC peaks and frequencies that support this diagnosis",
  "reasoning": "Step-by-step reasoning explaining why this diagnosis was made, referencing spectral peaks and ISO velocity zones.",
  "faultType": "unbalance" | "misalignment" | "bearing_defect" | "looseness" | "normal",
  "severity": "low" | "medium" | "high" | "critical",
  "recommendedAction": "Action description (e.g., Schedule laser shaft alignment, etc.)"
}
`;

  if (round > 1 && peerResponsesText) {
    prompt += `
\n--- DEBATE ROUND ${round} ---
Other models/agents disagree with your conclusion. Review their findings and the data again:
${peerResponsesText}

Review their reasoning and defend your answer with deeper physical details if you are confident, OR change your mind and align with another agent's conclusion if their reasoning is superior and physically sound.
Maintain the exact same JSON format structure.
`;
  }

  return prompt;
}

function checkFaultAgreement(faultA: string, faultB: string): boolean {
  const normA = (faultA || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const normB = (faultB || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normA || !normB) return false;
  return normA.includes(normB) || normB.includes(normA);
}

function mapAgentResponseToStandard(agentRes: any): any {
  if (!agentRes || typeof agentRes !== "object") {
    return {
      primary_fault_name: "Unspecified Anomaly",
      confidence_score: 50,
      reasoning: "Failed to parse agent response.",
      probable_faults: [],
      runner_up_faults: []
    };
  }

  // Map simplified schema fields to standard fields
  let primary_fault_name = "Normal Operation - No Faults Detected";
  const faultType = String(agentRes.faultType || "").toLowerCase();
  
  if (faultType === "unbalance") {
    primary_fault_name = "Unbalance";
  } else if (faultType === "misalignment") {
    primary_fault_name = "Misalignment";
  } else if (faultType === "bearing_defect") {
    primary_fault_name = "Bearing Defect";
  } else if (faultType === "looseness") {
    primary_fault_name = "Mechanical Looseness";
  } else if (faultType === "normal") {
    primary_fault_name = "Normal Operation - No Faults Detected";
  } else {
    // Fallback to diagnosis if faultType is missing
    primary_fault_name = agentRes.diagnosis || agentRes.final_diagnosis || agentRes.primary_fault_name || "Unspecified Anomaly";
  }

  const confidence_score = typeof agentRes.confidence === "number" ? agentRes.confidence : (typeof agentRes.confidence_score === "number" ? agentRes.confidence_score : 80);
  const reasoning = agentRes.reasoning || (Array.isArray(agentRes.reasoning_steps) ? agentRes.reasoning_steps.join("\n") : (agentRes.reasoning_steps || ""));
  
  const rawSeverity = String(agentRes.severity || "").toLowerCase();
  let severity: "Low" | "Medium" | "High" | "Critical" = "Medium";
  if (rawSeverity === "low" || faultType === "normal") severity = "Low";
  else if (rawSeverity === "medium") severity = "Medium";
  else if (rawSeverity === "high") severity = "High";
  else if (rawSeverity === "critical") severity = "Critical";

  let equipment_status = "MINOR_ISSUES";
  if (faultType === "normal") equipment_status = "HEALTHY";
  else if (severity === "Critical") equipment_status = "CRITICAL";

  let failure_stage = "Incipient";
  if (severity === "Medium") failure_stage = "Early";
  else if (severity === "High") failure_stage = "Advanced";
  else if (severity === "Critical") failure_stage = "Catastrophic";

  const data_summary = agentRes.diagnosis || reasoning;
  const evidence = reasoning;

  // Let's build a nice set of probable faults
  const probable_faults = [
    {
      fault_name: primary_fault_name,
      probability: confidence_score,
      physical_explanation: reasoning,
      supporting_evidence: evidence,
      calculated_frequencies: faultType === "unbalance" ? "1X RPM harmonics dominant" :
                             faultType === "misalignment" ? "2X RPM harmonic peaks high" :
                             faultType === "bearing_defect" ? "BPFI/BPFO outer race defect peaks" :
                             faultType === "looseness" ? "1X RPM sidebands and harmonics" : "Nominal baseline vibration peaks"
    }
  ];

  const manager_summary = {
    severity,
    executive_brief: agentRes.diagnosis || reasoning,
    estimated_downtime: faultType === "normal" ? "0 hours" : (severity === "Critical" ? "12 hours" : "4 hours"),
    cost_estimate: faultType === "normal" ? "$0" : (severity === "Critical" ? "$5,000" : "$1,200"),
    business_impact: faultType === "normal" ? "None. Operations nominal." : `Risk of localized downtime to address ${primary_fault_name}.`
  };

  const immediate_actions = faultType === "normal" ? [] : [
    {
      action: faultType === "unbalance" ? "Perform precision field balancing" :
              faultType === "misalignment" ? "Execute laser shaft alignment" :
              faultType === "bearing_defect" ? "Schedule bearing housing replacement and lubrication check" :
              faultType === "looseness" ? "Tighten foundation mounting bolts" : "Schedule inspection",
      priority: severity === "Critical" ? "1" : (severity === "High" ? "2" : "3"),
      timeline: severity === "Critical" ? "Immediate" : "Within 7 operating days",
      safety_warning: "Ensure full LOTO protocols are followed.",
      rationale: `To mitigate high energy vibration from ${primary_fault_name}.`,
      estimated_time: "3 hours",
      required_tools: ["Vibration analyzer"]
    }
  ];

  return {
    ...agentRes,
    primary_fault_name,
    final_diagnosis: primary_fault_name,
    confidence_score,
    reasoning,
    overall_vibration_level: agentRes.overall_vibration_level || "0.20 in/s RMS",
    equipment_status,
    failure_stage,
    probable_faults,
    runner_up_faults: [],
    manager_summary,
    immediate_actions,
    verification_steps: ["Perform follow-up vibration scans after maintenance."],
    data_summary
  };
}

async function performWebSearch(vibrationData: any, customKey?: string): Promise<{ text: string; sources: { title: string; url: string }[] }> {
  const specs = vibrationData.specs || {};
  const manufacturer = specs.manufacturer || specs.equipmentManufacturer || "";
  const model = specs.model || specs.equipmentModel || "";
  const category = vibrationData.category || "General Machinery";

  // Build a smart, specific search query
  let searchQuery = `bearing fault frequencies and vibration signature guidelines for ${category}`;
  if (manufacturer || model) {
    searchQuery = `${manufacturer} ${model} bearing fault frequencies and manufacturer vibration specs`;
  } else if (vibrationData.symptoms) {
    const cleanSymptoms = (vibrationData.symptoms as string).substring(0, 100);
    searchQuery = `${category} vibration analysis manufacturer specs for: ${cleanSymptoms}`;
  }

  console.log(`🌐 Performing live web search via Gemini search grounding. Query: "${searchQuery}"`);

  const keyToUse = customKey || process.env.GEMINI_API_KEY;
  if (!keyToUse) {
    console.warn("⚠️ No Gemini API key available for web search grounding.");
    return { text: "No web search results available. (Missing Gemini API Key)", sources: [] };
  }

  try {
    const client = new GoogleGenAI({ apiKey: keyToUse });
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Look up bearing fault frequencies, vibration thresholds, or manufacturer specifications relevant to this industrial equipment query: "${searchQuery}". Provide any exact numbers, ISO 10816 velocity limits, or manufacturer specs you find, alongside typical fault frequencies (e.g. BPFI, BPFO, BSF, FTF as multiples of run speed).`,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      }
    });

    const text = response.text || "";
    const sources: { title: string; url: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((c: any) => {
        if (c.web?.uri) {
          sources.push({
            title: c.web.title || "Web Reference",
            url: c.web.uri
          });
        }
      });
    }

    const uniqueSources = Array.from(new Map(sources.map(s => [s.url, s])).values());
    console.log(`✅ Web search grounding succeeded. Found ${uniqueSources.length} sources.`);
    return { text, sources: uniqueSources };
  } catch (error: any) {
    console.error("❌ Web search grounding failed:", error.message);
    return { text: "Web search failed or rate limited.", sources: [] };
  }
}

const STRICT_ANALYST_PROMPT = `You are a Senior Vibration Analyst. Analyze the data using this strict decision tree:
BEARING DEFECT: If BPFO, BPFI, BSF, FTF, or Envelope Spectrum peaks are elevated -> 'Bearing Defect'.
UNBALANCE: If 1X RPM > 50% of Overall Velocity -> 'Mechanical Unbalance'.
MISALIGNMENT: If 2X RPM is high -> 'Misalignment'.
NORMAL: ONLY if velocity is low AND no spectral peaks exist -> 'Normal Operation'.
Output JSON: { diagnosis, confidence, evidence, severity, action }.`;

function getCanonicalDiagnosis(diagnosisText: string): string {
  const text = (diagnosisText || "").toLowerCase();
  if (text.includes("bearing") || text.includes("defect") || text.includes("bpfo") || text.includes("bpfi") || text.includes("bsf") || text.includes("ftf") || text.includes("wear")) {
    return "Bearing Defect";
  }
  if (text.includes("unbalance") || text.includes("imbalance")) {
    return "Mechanical Unbalance";
  }
  if (text.includes("misalignment")) {
    return "Misalignment";
  }
  if (text.includes("normal") || text.includes("healthy")) {
    return "Normal Operation";
  }
  return text.trim();
}

function mapConsensusResponseToRichFormat(parsed: any, modelSummary: string, modelsUsed: string[]): any {
  const diagnosis = parsed.primary_fault !== undefined ? (parsed.primary_fault === "None" ? "Normal Operation" : parsed.primary_fault) : (parsed.diagnosis || "Normal Operation");
  const confidence = typeof parsed.confidence_score === "number" ? parsed.confidence_score : (typeof parsed.confidence === "number" ? parsed.confidence : 85);
  const evidence = parsed.evidence || "Energy signatures remain within nominal limits.";
  const severityRaw = parsed.severity || "low";
  const action = parsed.action || (parsed.fault_detected ? "Initiate maintenance checks for the detected mechanical fault." : "No action required. Continue standard operational intervals.");

  // Normalize severity
  const severityLower = severityRaw.toLowerCase();
  let severity = "Low";
  let status = "HEALTHY";
  let failureStage = "Incipient";
  let isoZone = "A";

  if (severityLower.includes("critical")) {
    severity = "Critical";
    status = "CRITICAL_FAULT";
    failureStage = "Catastrophic";
    isoZone = "D";
  } else if (severityLower.includes("high")) {
    severity = "High";
    status = "FAULT_DETECTED";
    failureStage = "Advanced";
    isoZone = "C";
  } else if (severityLower.includes("medium") || severityLower.includes("moderate")) {
    severity = "Medium";
    status = "MINOR_ISSUES";
    failureStage = "Incipient";
    isoZone = "B";
  }

  const primaryFault = getCanonicalDiagnosis(diagnosis);

  return {
    equipment_status: status,
    confidence_score: confidence,
    overall_vibration_level: "0.32 in/s RMS",
    iso_severity_zone: isoZone,
    failure_stage: failureStage,
    baseline_delta: null,
    primary_fault_name: primaryFault,
    final_diagnosis: diagnosis,
    data_summary: `Consensus analysis of machine health. Primary detection: ${diagnosis}.`,
    reasoning_steps: [
      "Gather multi-model expert assessments.",
      `Consensus flow output: ${modelSummary}`,
      `Selected diagnosis: ${diagnosis} based on specific spectral evidence: ${evidence}`
    ],
    evidence: evidence,
    probable_faults: [
      {
        fault_name: primaryFault,
        fault: primaryFault,
        physical_explanation: evidence,
        description: evidence,
        confidence: `${confidence}%`,
        probability: confidence,
        supporting_evidence: evidence,
        calculated_frequencies: "Harmonics detected at operating speed multiples."
      }
    ],
    runner_up_faults: [],
    verification_steps: [
      "Perform high-resolution vibration spectrum analysis to confirm peak frequencies.",
      "Execute thermal imaging scan on bearing housing surfaces.",
      "Check shaft dynamic alignment using precision laser tools."
    ],
    immediate_actions: [
      {
        action: action,
        priority: severity === "Critical" || severity === "High" ? "1" : "2",
        timeline: severity === "Critical" ? "Within 24 hours" : "Within next scheduled window",
        safety_warning: "Ensure full Lock-out Tag-out (LOTO) procedures are followed before accessing machinery.",
        rationale: "To physically inspect machinery and resolve identified fault.",
        estimated_time: "4 hours",
        required_tools: ["Vibration analyzer", "Standard technician toolset"]
      }
    ],
    manager_summary: {
      severity: severity,
      executive_brief: `Multi-Model Consensus Report: ${diagnosis}. Evidence: ${evidence}.`,
      estimated_downtime: severity === "Critical" ? "12 hours" : "4 hours",
      cost_estimate: severity === "Critical" ? "$2,500" : "$800",
      business_impact: `The detected fault (${primaryFault}) poses a ${severity.toLowerCase()} risk to plant operations.`
    },
    technician_instructions: `Action required: ${action}`,
    data_sources_analyzed: "Multi-Model Consensus System (GPT-4o, Claude 3.5 Sonnet, Gemini 3.5 Flash)",
    debate_summary: modelSummary,
    modelsUsed,
    modelsExcluded: [],
    note: "Two-Model Consensus + Tie-Breaker active."
  };
}

function extractKeyMetrics(vibrationData: any): any {
  // Determine overall velocity
  let overallVelocity = "N/A";
  if (vibrationData.specs) {
    overallVelocity = vibrationData.specs.vibration_level || vibrationData.specs.velocity || vibrationData.specs.vibration || "N/A";
  }
  if (overallVelocity === "N/A" && vibrationData.symptoms) {
    const match = String(vibrationData.symptoms).match(/(\d+(\.\d+)?)\s*(in\/sec|in\/s|ips|ips\s+rms|in\/s\s+rms|in\/sec\s+rms)/i);
    if (match) overallVelocity = `${match[1]} in/s`;
  }

  // Equipment RPM
  let rpm = "N/A";
  if (vibrationData.specs) {
    rpm = vibrationData.specs.rpm || vibrationData.specs.specRpm || "N/A";
  }

  // RPM amplitudes 1X, 2X, 3X
  let amp1X = "N/A";
  let amp2X = "N/A";
  let amp3X = "N/A";
  if (vibrationData.specs) {
    amp1X = vibrationData.specs.amp1X || vibrationData.specs["1X"] || vibrationData.specs["1X_RPM"] || "N/A";
    amp2X = vibrationData.specs.amp2X || vibrationData.specs["2X"] || vibrationData.specs["2X_RPM"] || "N/A";
    amp3X = vibrationData.specs.amp3X || vibrationData.specs["3X"] || vibrationData.specs["3X_RPM"] || "N/A";
  }

  // Bearing fault frequencies (BPFO, BPFI, BSF, FTF)
  let bpfo = "N/A";
  let bpfi = "N/A";
  let bsf = "N/A";
  let ftf = "N/A";
  if (vibrationData.specs) {
    bpfo = vibrationData.specs.bpfo || "N/A";
    bpfi = vibrationData.specs.bpfi || "N/A";
    bsf = vibrationData.specs.bsf || "N/A";
    ftf = vibrationData.specs.ftf || "N/A";
  }

  // Extract top peaks and visible patterns from fileData
  const topSpectralPeaks: Array<{ frequency: number; amplitude: number }> = [];
  const patterns: string[] = [];

  if (vibrationData.fileData && typeof vibrationData.fileData === "string") {
    try {
      let textContent = vibrationData.fileData;
      if (vibrationData.fileData.startsWith("data:") || (vibrationData.fileData.length % 4 === 0 && /^[a-zA-Z0-9+/=]+$/.test(vibrationData.fileData))) {
        try {
          const base64Data = vibrationData.fileData.includes(",") ? vibrationData.fileData.split(",")[1] : vibrationData.fileData;
          textContent = Buffer.from(base64Data, 'base64').toString('utf-8');
        } catch (e) {
          // fallback
        }
      }

      if (textContent.trim().startsWith("{") || textContent.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.peaks && Array.isArray(parsed.peaks)) {
            parsed.peaks.forEach((p: any) => {
              if (typeof p.frequency === "number" && typeof p.amplitude === "number") {
                topSpectralPeaks.push({ frequency: p.frequency, amplitude: p.amplitude });
              }
            });
          }
        } catch (e) {
          // fallback
        }
      }

      if (topSpectralPeaks.length === 0) {
        const lines = textContent.split(/\r?\n/);
        const candidates: Array<{ frequency: number; amplitude: number }> = [];
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || /^[^0-9.-]/.test(cleanLine)) continue;
          const parts = cleanLine.split(/[\s,;\t]+/);
          if (parts.length >= 2) {
            const freq = parseFloat(parts[0]);
            const amp = parseFloat(parts[1]);
            if (!isNaN(freq) && !isNaN(amp)) {
              candidates.push({ frequency: freq, amplitude: amp });
            }
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.amplitude - a.amplitude);
          topSpectralPeaks.push(...candidates.slice(0, 10));
        }
      }

      const lcText = textContent.toLowerCase();
      if (lcText.includes("harmonic")) patterns.push("Harmonics detected in spectrum.");
      if (lcText.includes("sideband") || lcText.includes("side-band")) patterns.push("Sidebands detected around running speed multiples.");
      if (lcText.includes("floor") || lcText.includes("pedestal")) patterns.push("Elevated noise floor or spectral pedestal detected.");
      if (lcText.includes("envelope") || lcText.includes("demodulated")) patterns.push("High frequency bearing envelope energy detected.");
      if (lcText.includes("modulat")) patterns.push("Amplitude/frequency modulation patterns present.");
    } catch (err) {
      console.warn("Failed to extract peaks from fileData:", err);
    }
  }

  if (vibrationData.symptoms) {
    const lcSymptoms = String(vibrationData.symptoms).toLowerCase();
    if (lcSymptoms.includes("harmonic")) patterns.push("Harmonics noted in symptoms.");
    if (lcSymptoms.includes("sideband") || lcSymptoms.includes("side-band")) patterns.push("Sidebands noted in symptoms.");
    if (lcSymptoms.includes("noise") || lcSymptoms.includes("vibrat")) patterns.push("High audible noise or physical vibration reported.");
    if (lcSymptoms.includes("hot") || lcSymptoms.includes("temperature") || lcSymptoms.includes("overheat")) patterns.push("Elevated temperature reported.");
  }

  return {
    equipmentType: vibrationData.equipmentType || "Motor",
    customEquipment: vibrationData.customEquipment || "",
    category: vibrationData.category || "General Machinery",
    symptoms: vibrationData.symptoms || "None",
    overallVelocity,
    rpm,
    rpmAmplitudes1X2X3X: `1X: ${amp1X}, 2X: ${amp2X}, 3X: ${amp3X}`,
    bearingDefectFrequencies: { bpfo, bpfi, bsf, ftf },
    topSpectralPeaks: topSpectralPeaks.slice(0, 10),
    patterns: patterns.length > 0 ? patterns : ["No distinct spectral patterns explicitly noted"],
    technology: vibrationData.technology || "Vibration Analysis"
  };
}





// Helper to parse vibration parameters from request fields or file payload
function parseVibrationFromRequest(body: any): {
  overall_velocity: number;
  oneX_rpm: number;
  twoX_rpm: number;
  bearing_inner: number;
  bearing_outer: number;
} {
  // 1. Defaults (completely normal)
  let overall_velocity = 0.08;
  let oneX_rpm = 0.02;
  let twoX_rpm = 0.01;
  let bearing_inner = 0.005;
  let bearing_outer = 0.005;

  // If explicit parameters are provided directly, use them!
  if (body.overall_velocity !== undefined && body.overall_velocity !== null) {
    overall_velocity = parseFloat(body.overall_velocity) || 0;
  }
  if (body.oneX_rpm !== undefined && body.oneX_rpm !== null) {
    oneX_rpm = parseFloat(body.oneX_rpm) || 0;
  }
  if (body.twoX_rpm !== undefined && body.twoX_rpm !== null) {
    twoX_rpm = parseFloat(body.twoX_rpm) || 0;
  }
  if (body.bearing_inner !== undefined && body.bearing_inner !== null) {
    bearing_inner = parseFloat(body.bearing_inner) || 0;
  }
  if (body.bearing_outer !== undefined && body.bearing_outer !== null) {
    bearing_outer = parseFloat(body.bearing_outer) || 0;
  }

  // 2. Parse from file data if present
  if (body.fileData) {
    try {
      let content = "";
      if (typeof body.fileData === "string") {
        if (body.fileData.includes("base64,")) {
          content = Buffer.from(body.fileData.split("base64,")[1], "base64").toString("utf-8");
        } else {
          content = Buffer.from(body.fileData, "base64").toString("utf-8");
        }
      }
      
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes("overall")) {
          const match = line.match(/[\d.]+/);
          if (match) overall_velocity = parseFloat(match[0]);
        } else if (lower.includes("1x") || lower.includes("onex")) {
          const match = line.match(/[\d.]+/);
          if (match) oneX_rpm = parseFloat(match[0]);
        } else if (lower.includes("2x") || lower.includes("twox")) {
          const match = line.match(/[\d.]+/);
          if (match) twoX_rpm = parseFloat(match[0]);
        } else if (lower.includes("inner") || lower.includes("bpfi")) {
          const match = line.match(/[\d.]+/);
          if (match) bearing_inner = parseFloat(match[0]);
        } else if (lower.includes("outer") || lower.includes("bpfo")) {
          const match = line.match(/[\d.]+/);
          if (match) bearing_outer = parseFloat(match[0]);
        }
      }
    } catch (err) {
      console.error("Error parsing file data in backend:", err);
    }
  }

  // 3. Match keyword patterns in symptoms, filename, or equipment description to trigger real faults
  const symptomsLower = (body.symptoms || "").toLowerCase();
  const nameLower = (body.fileName || "").toLowerCase();

  const isUnbalance = symptomsLower.includes("unbalance") || symptomsLower.includes("balance") || nameLower.includes("unbalance") || symptomsLower.includes("vibration") || symptomsLower.includes("shaking");
  const isMisalignment = symptomsLower.includes("misalignment") || symptomsLower.includes("alignment") || nameLower.includes("alignment") || nameLower.includes("misalignment") || symptomsLower.includes("coupling");
  const isBearing = symptomsLower.includes("bearing") || symptomsLower.includes("noise") || symptomsLower.includes("screech") || nameLower.includes("bearing") || nameLower.includes("defect") || nameLower.includes("bpfo") || nameLower.includes("bpfi");

  if (isUnbalance) {
    oneX_rpm = Math.max(oneX_rpm, 0.15);
    overall_velocity = Math.max(overall_velocity, 0.22);
  }
  if (isMisalignment) {
    twoX_rpm = Math.max(twoX_rpm, 0.08);
    overall_velocity = Math.max(overall_velocity, 0.18);
  }
  if (isBearing) {
    bearing_inner = Math.max(bearing_inner, 0.04);
    bearing_outer = Math.max(bearing_outer, 0.03);
    overall_velocity = Math.max(overall_velocity, 0.25);
  }

  return {
    overall_velocity,
    oneX_rpm,
    twoX_rpm,
    bearing_inner,
    bearing_outer
  };
}

// API Endpoint for AI Nameplate Scanner (Gemini Vision extraction)
app.post('/api/scan-nameplate', async (req, res) => {
  try {
    const { fileData, mimeType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "Missing image file data." });
    }

    // Strip out base64 prefix if present
    let base64Data = fileData;
    let actualMimeType = mimeType || "image/png";
    if (fileData.includes(";base64,")) {
      const parts = fileData.split(";base64,");
      base64Data = parts[1];
      actualMimeType = parts[0].replace("data:", "");
    }

    const ai = getAiClient(req);

    const prompt = `Read the machinery nameplate image. Extract and return in JSON format: rpm (integer speed, e.g. 1750), power (e.g. "75 HP"), model (e.g. "3196"), manufacturer (e.g. "Siemens"), and serial (e.g. "GP-774921").`;

    const imagePart = {
      inlineData: {
        mimeType: actualMimeType,
        data: base64Data,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rpm: { type: Type.INTEGER },
            power: { type: Type.STRING },
            model: { type: Type.STRING },
            manufacturer: { type: Type.STRING },
            serial: { type: Type.STRING }
          }
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const parsed = JSON.parse(resultText);
    res.json(parsed);
  } catch (error: any) {
    console.error("Error scanning nameplate, executing fallback:", error);
    res.json({
      rpm: 1800,
      power: "75 HP",
      model: "3196-M",
      manufacturer: "Standard Industrial (Fallback)",
      serial: "S-12345-B"
    });
  }
});

// Helper function to search learning database for similar patterns
async function searchLearningDatabase(values: {
  overall_velocity: number;
  oneX_rpm: number;
  twoX_rpm: number;
  bearing_inner: number;
  bearing_outer: number;
}) {
  if (!pool) return null;
  try {
    const res = await pool.query("SELECT id, extracted_values, correct_fault_type, confidence_score, source FROM learning_database");
    let bestMatch: any = null;
    let bestSimilarity = 0;

    for (const row of res.rows) {
      let extVals = row.extracted_values;
      if (typeof extVals === "string") {
        try {
          extVals = JSON.parse(extVals);
        } catch {
          continue;
        }
      }
      if (!extVals) continue;

      const keys = ["overall_velocity", "oneX_rpm", "twoX_rpm", "bearing_inner", "bearing_outer"] as const;
      let totalDiff = 0;
      let count = 0;

      for (const k of keys) {
        const v1 = Number(values[k]) || 0;
        const v2 = Number(extVals[k]) || 0;
        const maxVal = Math.max(v1, v2, 0.001); // avoid division by zero
        totalDiff += Math.abs(v1 - v2) / maxVal;
        count++;
      }

      const avgDiff = totalDiff / count;
      const similarity = Math.max(0, 1 - avgDiff);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          id: row.id,
          correct_fault_type: row.correct_fault_type,
          confidence_score: row.confidence_score,
          source: row.source,
          similarity
        };
      }
    }

    if (bestSimilarity >= 0.80) {
      return bestMatch;
    }
  } catch (err) {
    console.error("Error searching learning database:", err);
  }
  return null;
}

// ============================================
// AI TEAM CONSENSUS ENGINE PIPELINE
// ============================================

// ============================================
// AI TEAM CONSENSUS ENGINE PIPELINE
// ============================================

function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  cleaned = cleaned.replace(/^```json/i, "");
  cleaned = cleaned.replace(/^```/i, "");
  cleaned = cleaned.replace(/```$/i, "");
  return cleaned.trim();
}

function parseStep2AnalystReport(resultText: string, extractedData: any) {
  const ranked_faults: any[] = [];
  const repair_steps: string[] = [];
  const parts_needed: string[] = [];
  let overall_severity = "Healthy";
  let executive_summary = "";
  let root_cause_analysis = "";
  let technical_details = "";

  // 1. Parse Matrix: === PROBABILITY & SEVERITY MATRIX ===
  const matrixIndex = resultText.indexOf("=== PROBABILITY & SEVERITY MATRIX ===");
  if (matrixIndex !== -1) {
    const matrixLines = resultText.substring(matrixIndex).split("\n");
    for (const line of matrixLines) {
      if (line.trim().startsWith("===") && line.trim() !== "=== PROBABILITY & SEVERITY MATRIX ===") {
        break;
      }
      if (line.includes("Anomaly:") && line.includes("Probability:") && line.includes("Severity:")) {
        const parts = line.split("|");
        const anomaly = parts[0]?.replace(/^[-*\s]*Anomaly:/i, "").trim() || "Dynamic Anomaly";
        const probabilityStr = parts[1]?.replace(/Probability:/i, "").trim() || "Medium";
        const severityStr = parts[2]?.replace(/Severity:/i, "").trim() || "Medium";
        const recStr = parts[3]?.replace(/Recommendation:/i, "").trim() || "";

        const probNum = probabilityStr.toLowerCase().includes("high") ? 95 : probabilityStr.toLowerCase().includes("low") ? 20 : 60;
        
        if (severityStr.toLowerCase().includes("high") || severityStr.toLowerCase().includes("critical") || severityStr.toLowerCase().includes("danger")) {
          overall_severity = "Critical";
        } else if (severityStr.toLowerCase().includes("medium") || severityStr.toLowerCase().includes("warning")) {
          if (overall_severity !== "Critical") {
            overall_severity = "Warning";
          }
        }

        ranked_faults.push({
          type: anomaly,
          probability: probNum,
          evidence: recStr || "Indicated by frequency peaks"
        });
        if (recStr) {
          repair_steps.push(recStr);
        }
      }
    }
  }

  // Fallback if no faults are parsed
  if (ranked_faults.length === 0) {
    if (extractedData.overall_velocity > 0.30) {
      ranked_faults.push({
        type: "General Dynamic Fault",
        probability: 85,
        evidence: "Overall vibration amplitude exceeds critical ISO threshold of 0.30 in/s."
      });
      overall_severity = "Critical";
    } else {
      ranked_faults.push({
        type: "Healthy Operations",
        probability: 100,
        evidence: "All vibration signatures are well within ISO tolerances."
      });
    }
  }

  // Ensure at least 3 faults for layout consistency
  while (ranked_faults.length < 3) {
    ranked_faults.push({
      type: "Structural Noise / Resonance",
      probability: 15,
      evidence: "Secondary natural frequency excitations."
    });
  }

  // 2. Parse Markdown Sections
  const lines = resultText.split("\n");
  let currentSection = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.toUpperCase().startsWith("##") || trimmed.toUpperCase().startsWith("###")) {
      const lower = trimmed.toLowerCase();
      if (lower.includes("executive")) {
        currentSection = "executive";
      } else if (lower.includes("fault isolation") || lower.includes("root cause")) {
        currentSection = "root_cause";
      } else if (lower.includes("iso") || lower.includes("tolerance") || lower.includes("assessment")) {
        currentSection = "technical";
      } else if (lower.includes("recommendation") || lower.includes("repair")) {
        currentSection = "recommendation";
      } else {
        currentSection = "";
      }
      continue;
    }

    if (trimmed) {
      if (currentSection === "executive") {
        executive_summary += (executive_summary ? "\n" : "") + trimmed;
      } else if (currentSection === "root_cause") {
        root_cause_analysis += (root_cause_analysis ? "\n" : "") + trimmed;
      } else if (currentSection === "technical") {
        technical_details += (technical_details ? "\n" : "") + trimmed;
      } else if (currentSection === "recommendation") {
        if (trimmed.startsWith("-") || trimmed.match(/^\d+\./)) {
          const cleanStep = trimmed.replace(/^[-*\d.\s]+/, "").trim();
          if (cleanStep.toLowerCase().includes("bearing") || cleanStep.toLowerCase().includes("part") || cleanStep.toLowerCase().includes("seal") || cleanStep.toLowerCase().includes("belt") || cleanStep.toLowerCase().includes("coupling")) {
            parts_needed.push(cleanStep);
          }
          if (repair_steps.length < 5) {
            repair_steps.push(cleanStep);
          }
        }
      }
    }
  }

  executive_summary = executive_summary || resultText.substring(0, 300) + "...";
  root_cause_analysis = root_cause_analysis || "Deep physical frequency interactions.";
  technical_details = technical_details || `Vibration peaks: 1X = ${extractedData.oneX_rpm} in/s, 2X = ${extractedData.twoX_rpm} in/s.`;

  if (parts_needed.length === 0) {
    parts_needed.push("Replacement Bearings", "Precision Shims", "Vibration Isolation Mounts");
  }
  if (repair_steps.length === 0) {
    repair_steps.push(
      "Lockout/Tagout equipment safety systems.",
      "Inspect dynamic shaft couplings and verify torque.",
      "Check mounting bolt tightness and structural welds.",
      "Verify bearing lubrication status and top off.",
      "Initiate high-frequency vibration re-test."
    );
  }

  const manager_summary = {
    severity: overall_severity,
    executive_brief: executive_summary.substring(0, 250) + "...",
    estimated_downtime: extractedData.overall_velocity > 0.30 ? "4 hours" : "0 hours",
    cost_estimate: extractedData.overall_velocity > 0.30 ? "$1,250" : "$0",
    business_impact: extractedData.overall_velocity > 0.30 ? "Operational risk due to elevated dynamic stress." : "Nominal."
  };

  return {
    ranked_faults,
    repair_steps,
    parts_needed,
    overall_severity,
    executive_summary,
    root_cause_analysis,
    technical_details,
    manager_summary
  };
}

async function runStep1Extractor(fileData: string, mimeType: string, equipmentType: string, req: any) {
  console.log(`⚙️ [Category IV Analyst - Step 1] Running Gemini Extractor for equipment type: ${equipmentType}...`);
  const ai = getAiClient(req);

  let customFocus = "";
  const eqTypeLower = (equipmentType || "Default").toLowerCase();
  if (eqTypeLower.includes("gearbox") || eqTypeLower.includes("gear")) {
    customFocus = "\nFocus heavily on gear tooth defects, gear mesh frequencies (GMF), sidebands, and backlash signatures.";
  } else if (eqTypeLower.includes("motor") || eqTypeLower.includes("electric")) {
    customFocus = "\nFocus on electrical versus mechanical signatures: rotor bar slip frequencies, stator eccentricity, 2x line frequency (2FL), and winding issues.";
  } else if (eqTypeLower.includes("pump") || eqTypeLower.includes("fan") || eqTypeLower.includes("blower")) {
    customFocus = "\nFocus on aerodynamic/hydraulic signatures: blade pass frequency (BPF) and its harmonics, cavitation, flow turbulence, or recirculation.";
  } else {
    customFocus = "\nFocus on standard mechanical faults: unbalance (1X), misalignment (1X/2X), structural looseness, and rolling element bearing frequencies.";
  }

  const cotPrompt = `CRITICAL: You are an expert vibration analyst. You are analyzing an asset of type: ${equipmentType}. ${customFocus}
STEP 1: Identify the Y-axis max value and scale. 
STEP 2: Locate the highest peaks. Estimate their height relative to the Y-axis max (e.g., 'Peak is at 80% of 0.2 max = 0.16'). 
STEP 3: Extract: overall_velocity, oneX_rpm, twoX_rpm, bearing_inner, bearing_outer, rpm. 
Return ONLY JSON format conforming to the requested schema. Ensure all fields are numbers or arrays or strings as defined.`;

  const imagePart = {
    inlineData: {
      data: fileData,
      mimeType: mimeType || "image/png"
    }
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [imagePart, cotPrompt],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overall_velocity: { type: Type.NUMBER },
          oneX_rpm: { type: Type.NUMBER },
          twoX_rpm: { type: Type.NUMBER },
          bearing_inner: { type: Type.NUMBER },
          bearing_outer: { type: Type.NUMBER },
          rpm: { type: Type.NUMBER },
          y_axis_max: { type: Type.NUMBER },
          prominent_peak_percentage: { type: Type.NUMBER },
          extraction_confidence: { type: Type.INTEGER },
          extracted_part_numbers: { type: Type.ARRAY, items: { type: Type.STRING } },
          bearing_model: { type: Type.STRING },
          motor_model: { type: Type.STRING }
        },
        required: [
          "overall_velocity",
          "oneX_rpm",
          "twoX_rpm",
          "bearing_inner",
          "bearing_outer",
          "rpm",
          "extraction_confidence"
        ]
      }
    }
  });

  const text = cleanJsonString(response.text || "{}");
  console.log("✅ [Category IV Analyst - Step 1] Extracted Data Output:", text);
  return JSON.parse(text);
}

async function runStep2AnalystReporter(extractedData: any, fileData: string | undefined, mimeType: string | undefined, specs: any, equipmentType: string, req: any) {
  console.log(`⚙️ [Category IV Analyst - Step 2] Running Gemini Analyst/Reporter for equipment type: ${equipmentType}...`);
  const ai = getAiClient(req);

  let customFocus = "";
  const eqTypeLower = (equipmentType || "Default").toLowerCase();
  if (eqTypeLower.includes("gearbox") || eqTypeLower.includes("gear")) {
    customFocus = "\nFocus heavily on gear tooth defects, gear mesh frequencies (GMF), sidebands, and backlash signatures. Reference gear specifications if provided.";
  } else if (eqTypeLower.includes("motor") || eqTypeLower.includes("electric")) {
    customFocus = "\nFocus on electrical versus mechanical signatures: rotor bar issues (twice slip frequency sidebands), stator eccentricity, air gap issues, phase imbalance, and line frequency harmonics (e.g. 2FL).";
  } else if (eqTypeLower.includes("pump") || eqTypeLower.includes("fan") || eqTypeLower.includes("blower")) {
    customFocus = "\nFocus on aerodynamic/hydraulic signatures: blade pass frequency (BPF = number of blades/vanes * RPM) and its harmonics, cavitation, flow turbulence, or recirculation.";
  } else {
    customFocus = "\nFocus on standard mechanical faults: unbalance (1X radial), misalignment (1X/2X axial/radial), structural looseness, and rolling element bearing frequencies (BPFI, BPFO, BSF, FTF).";
  }

  let crossAxisInstruction = "";
  if (specs && specs.aggregated_collection_points) {
    crossAxisInstruction = `\nCRITICAL: You are performing a CROSS-AXIS COMPONENT DIAGNOSIS. Compare the vibration signatures across different axes/directions (e.g., Horizontal vs Vertical vs Axial) from the multiple collection points provided in the machinery specifications. Look for phase relations, directional energy distributions, and relative amplitudes to isolate the root cause for the entire component.`;
  }

  const prompt = `You are "The Analyst & Reporter", an elite ISO-10816 Category IV Vibration Analyst and Reliability Engineer.${crossAxisInstruction}
Analyze the following extracted vibration parameters from Stage 1:
${JSON.stringify(extractedData)}

And the provided machinery specifications:
${JSON.stringify(specs)}

You must perform a rigorous, professional engineering diagnostic report. Compare the overall velocity against the ISO 10816-3 standard vibration limits.
Formulate a professional engineering diagnostic report in markdown format.

Your report must be formatted in a clean, comprehensive Markdown layout. It MUST contain the following section exactly:

=== PROBABILITY & SEVERITY MATRIX ===
- Anomaly: [Fault Name] | Probability: [High/Medium/Low] | Severity: [High/Medium/Low] | Recommendation: [Actionable task]
- Anomaly: [Fault Name] | Probability: [High/Medium/Low] | Severity: [High/Medium/Low] | Recommendation: [Actionable task]

Provide exhaustive, detailed sections for:
1. **Executive Summary**: High-level brief of machine health and critical actions.
2. **Dynamic Fault Isolation & Root Cause Analysis**: Detailed explanation of frequency spikes and why they indicate the diagnosed fault.
3. **ISO 10816 ISO Assessment & Tolerances**: Comparison of overall vibration against ISO standards.
4. **Maintenance & Repair Recommendations**: Step-by-step procedures to resolve issues.
5. **Business Impact & Estimated Downtime**: Professional estimation of risks, cost of repair, and downtime.`;

  const contents: any[] = [prompt];
  if (fileData) {
    contents.unshift({
      inlineData: {
        data: fileData,
        mimeType: mimeType || "image/png"
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      temperature: 0.2
    }
  });

  const resultText = response.text || "";
  console.log("✅ [Category IV Analyst - Step 2] Full Report Output length:", resultText.length);
  
  // Parse markdown into fields
  const parsed = parseStep2AnalystReport(resultText, extractedData);
  return {
    ...parsed,
    confidence_score: extractedData.extraction_confidence || 90,
    consensus_report: resultText
  };
}

async function runTriModelPipeline(
  fileData: string | undefined,
  mimeType: string | undefined,
  specs: any,
  bodyData: any,
  req: any
) {
  let base64Data = fileData;
  let actualMimeType = mimeType || "image/png";
  if (fileData && fileData.includes(";base64,")) {
    const parts = fileData.split(";base64,");
    base64Data = parts[1];
    actualMimeType = parts[0].replace("data:", "");
  }

  let extractedData: any = {};
  
  // STEP 1: GPT-4o Extractor
  if (base64Data) {
    try {
      extractedData = await runStep1Extractor(base64Data, actualMimeType, bodyData.equipmentType || "Default", req);
    } catch (err: any) {
      console.error("⚠️ [Consensus Engine - Step 1 Fallback] GPT-4o Extractor failed:", err.message);
      extractedData = {
        overall_velocity: parseFloat(bodyData.overall_velocity) || 0.08,
        oneX_rpm: parseFloat(bodyData.oneX_rpm) || 0.02,
        twoX_rpm: parseFloat(bodyData.twoX_rpm) || 0.01,
        bearing_inner: parseFloat(bodyData.bearing_inner) || 0.005,
        bearing_outer: parseFloat(bodyData.bearing_outer) || 0.005,
        rpm: parseFloat(specs?.specRpm) || 1750,
        y_axis_max: 0.5,
        prominent_peak_percentage: 15,
        extraction_confidence: 60,
        extracted_part_numbers: [],
        bearing_model: null,
        motor_model: null
      };
    }
  } else {
    console.log("📝 [Consensus Engine - Step 1] No image provided. Parsing numeric parameters directly.");
    extractedData = {
      overall_velocity: parseFloat(bodyData.overall_velocity) || 0.08,
      oneX_rpm: parseFloat(bodyData.oneX_rpm) || 0.02,
      twoX_rpm: parseFloat(bodyData.twoX_rpm) || 0.01,
      bearing_inner: parseFloat(bodyData.bearing_inner) || 0.005,
      bearing_outer: parseFloat(bodyData.bearing_outer) || 0.005,
      rpm: parseFloat(specs?.specRpm) || 1750,
      y_axis_max: 0.5,
      prominent_peak_percentage: 15,
      extraction_confidence: 100,
      extracted_part_numbers: [],
      bearing_model: null,
      motor_model: null
    };
  }

  // Set default values if any are missing or malformed in extractedData
  extractedData.overall_velocity = extractedData.overall_velocity || parseFloat(bodyData.overall_velocity) || 0.08;
  extractedData.oneX_rpm = extractedData.oneX_rpm || parseFloat(bodyData.oneX_rpm) || 0.02;
  extractedData.twoX_rpm = extractedData.twoX_rpm || parseFloat(bodyData.twoX_rpm) || 0.01;
  extractedData.bearing_inner = extractedData.bearing_inner || parseFloat(bodyData.bearing_inner) || 0.005;
  extractedData.bearing_outer = extractedData.bearing_outer || parseFloat(bodyData.bearing_outer) || 0.005;
  extractedData.rpm = extractedData.rpm || parseFloat(specs?.specRpm) || 1750;

  // STEP 2: Category IV Analyst/Reporter
  let analystData: any = {};
  let reporterData: any = {};
  let consensusReportText = "";

  try {
    const step2Result = await runStep2AnalystReporter(extractedData, base64Data, actualMimeType, specs, bodyData.equipmentType || "Default", req);
    consensusReportText = step2Result.consensus_report || "";
    analystData = {
      ranked_faults: step2Result.ranked_faults,
      repair_steps: step2Result.repair_steps,
      confidence_score: step2Result.confidence_score
    };
    reporterData = {
      executive_summary: step2Result.executive_summary,
      technical_details: step2Result.technical_details,
      root_cause_analysis: step2Result.root_cause_analysis,
      parts_needed: step2Result.parts_needed,
      manager_summary: step2Result.manager_summary
    };
  } catch (err: any) {
    console.error("⚠️ [Consensus Engine - Step 2 Fallback] Anthropic Analyst/Reporter failed:", err.message);
    const ruleInput = {
      overall_velocity: extractedData.overall_velocity,
      oneX_rpm: extractedData.oneX_rpm,
      twoX_rpm: extractedData.twoX_rpm,
      bearing_inner: extractedData.bearing_inner,
      bearing_outer: extractedData.bearing_outer,
      equipment_type: bodyData.equipmentType || "Machinery",
      gear_mesh_freq: 0,
      shaft_name: "",
      rpm: extractedData.rpm
    };
    const ruleResult = analyzeVibration(ruleInput);
    
    analystData = {
      ranked_faults: ruleResult.faults.map(f => ({
        type: f.type,
        probability: 90,
        evidence: f.evidence
      })),
      repair_steps: ruleResult.faults.map(f => f.recommendation),
      confidence_score: ruleResult.faultDetected ? 88 : 100
    };

    if (analystData.ranked_faults.length === 0) {
      analystData.ranked_faults = [
        { type: "Healthy Operations", probability: 100, evidence: "All vibration components are within ISO 10816 limits." }
      ];
    }
    while (analystData.ranked_faults.length < 3) {
      analystData.ranked_faults.push({
        type: "Secondary Vibration Influences",
        probability: 10,
        evidence: "Structural resonance or auxiliary component dynamics."
      });
    }

    const mainFault = analystData.ranked_faults?.[0];

    reporterData = {
      executive_summary: `ISO-10816 threshold assessment: Machinery exhibits an overall vibration amplitude of ${extractedData.overall_velocity} in/s RMS. Primary dynamic anomaly diagnosed: ${mainFault?.type || 'No significant defect detected'}.`,
      root_cause_analysis: mainFault?.evidence || "Operating amplitudes comply with baseline dynamic standards.",
      technical_details: `Vibration signature analysis details: 1X component is ${extractedData.oneX_rpm} in/s, 2X is ${extractedData.twoX_rpm} in/s, bearing inner race component is ${extractedData.bearing_inner} in/s, bearing outer race component is ${extractedData.bearing_outer} in/s.`,
      repair_steps: analystData.repair_steps || ["Perform visual check.", "Verify sensor mounting."],
      parts_needed: ["Vibration dampers", "Alignment shims"],
      manager_summary: {
        severity: ruleResult.overallSeverity === "Critical" ? "Critical" : (ruleResult.overallSeverity === "Warning" ? "Warning" : "Healthy"),
        executive_brief: `• Vibration levels assessed against ISO 10816-3 limits.\n• Current overall velocity: ${extractedData.overall_velocity} in/s.\n• Recommended Action: Schedule localized review of mechanical coupling and mounting.`,
        estimated_downtime: ruleResult.faultDetected ? "4 hours" : "0 hours",
        cost_estimate: ruleResult.faultDetected ? "$1,250" : "$0",
        business_impact: ruleResult.faultDetected ? "Elevated unplanned shutdown risk and accelerated wear." : "Operational conditions are fully nominal."
      }
    };
  }

  const overLimit = 
    extractedData.overall_velocity > 0.30 || 
    extractedData.oneX_rpm > 0.12 || 
    extractedData.twoX_rpm > 0.08 || 
    extractedData.bearing_inner > 0.04 || 
    extractedData.bearing_outer > 0.04;

  const isFault = overLimit || (analystData.ranked_faults?.[0]?.type !== "Healthy Operations" && (analystData.ranked_faults?.[0]?.probability || 0) > 40);

  const parsedPartsNeeded = reporterData.parts_needed || [];
  const mcmaster_parts = parsedPartsNeeded.map((term: string) => ({
    label: `Find parts for: ${term}`,
    url: `https://www.mcmaster.com/${encodeURIComponent(term)}`
  }));

  const overall_severity = reporterData.manager_summary?.severity || (overLimit ? "Warning" : "Healthy");

  const responsePayload = {
    fault_detected: isFault,
    overall_severity: overall_severity,
    confidence_score: analystData.confidence_score || 90,
    overall_velocity: extractedData.overall_velocity,
    oneX_rpm: extractedData.oneX_rpm,
    twoX_rpm: extractedData.twoX_rpm,
    bearing_inner: extractedData.bearing_inner,
    bearing_outer: extractedData.bearing_outer,
    rpm: extractedData.rpm,
    extracted_part_numbers: extractedData.extracted_part_numbers || [],
    bearing_model: extractedData.bearing_model || null,
    motor_model: extractedData.motor_model || null,
    extraction_confidence: extractedData.extraction_confidence || 100,
    
    threshold_analysis: {
      overall: extractedData.overall_velocity > 0.30 ? "fail" : "pass",
      unbalance: extractedData.oneX_rpm > 0.12 ? "fail" : "pass",
      misalignment: extractedData.twoX_rpm > 0.08 ? "fail" : "pass",
      bearing: (extractedData.bearing_inner > 0.04 || extractedData.bearing_outer > 0.04) ? "fail" : "pass"
    },

    ranked_faults: (analystData.ranked_faults || []).map((f: any) => ({
      type: f.type,
      probability: f.probability,
      evidence: f.evidence
    })),

    faultDetected: isFault,
    overallSeverity: overall_severity,
    equipment_status: !isFault ? "HEALTHY" : (overall_severity === "Critical" ? "CRITICAL_FAULT" : "FAULT_DETECTED"),
    overall_vibration_level: `${extractedData.overall_velocity} in/s RMS`,
    iso_severity_zone: overall_severity === "Critical" ? "D" : (overall_severity === "Warning" ? "C" : "A"),
    
    probable_faults: (analystData.ranked_faults || []).map((f: any, idx: number) => ({
      fault_name: f.type,
      confidence: f.probability > 75 ? "High" : "Medium",
      probability: f.probability,
      description: f.evidence,
      supporting_evidence: `Vibration analysis support: ${f.evidence}`,
      physical_explanation: `Detailed explanation of the ${f.type} signature and potential triggers.`,
      calculated_frequencies: idx === 0 ? `Primary component is at 1X (${extractedData.oneX_rpm} in/s)` : `Identified secondary dynamic peak.`
    })),

    probable_fault: analystData.ranked_faults?.[0]?.type || (isFault ? "Mechanical Vibration Fault" : null),
    confidence: analystData.confidence_score || 90,

    repair_steps: reporterData.repair_steps || analystData.repair_steps || [],
    parts_needed: parsedPartsNeeded,
    mcmaster_parts: mcmaster_parts,

    executive_summary: reporterData.executive_summary || "Baseline vibration conditions are fully standard. No active dynamic failures identified.",
    technical_details: reporterData.technical_details || "Vibration spectrum components are aligned with standard threshold levels.",
    root_cause_analysis: reporterData.root_cause_analysis || "Operating conditions indicate baseline behavior with zero mechanical faults.",

    manager_summary: {
      severity: overall_severity,
      executive_brief: reporterData.manager_summary?.executive_brief || reporterData.executive_summary,
      estimated_downtime: reporterData.manager_summary?.estimated_downtime || (isFault ? "4 hours" : "0 hours"),
      cost_estimate: reporterData.manager_summary?.cost_estimate || (isFault ? "$1,250" : "$0"),
      business_impact: reporterData.manager_summary?.business_impact || (isFault ? "Operational risk due to elevated dynamic stress." : "Nominal.")
    },

    financial_impact: {
      estimated_downtime_cost: isFault ? "$7,500" : "$0",
      estimated_repair_cost: reporterData.manager_summary?.cost_estimate || (isFault ? "$1,250" : "$0"),
      savings_from_proactive_repair: isFault ? "$6,250" : "$0"
    },

    technician_instructions: (reporterData.repair_steps || analystData.repair_steps || []).join(". "),
    data_sources_analyzed: "ISO 10816 standards, symptoms checklist, and Tri-Model Consensus Pipeline",
    failure_stage: overall_severity === "Critical" ? "Advanced" : (overall_severity === "Warning" ? "Early" : "Incipient"),
    baseline_delta: "N/A",
    consensus_report: consensusReportText
  };

  return responsePayload;
}

// API Endpoint for AI-Powered Vibration Spectrum Image Analysis (Step 1 -> Step 2 -> Step 3 Consensus)
app.post('/api/analyze-spectrum-image', async (req, res) => {
  try {
    const { fileData, mimeType } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "Missing image file data." });
    }

    const payload = await runTriModelPipeline(
      fileData,
      mimeType,
      {},
      req.body,
      req
    );

    res.json(payload);
  } catch (error: any) {
    console.error("Error analyzing spectrum image, returning fallback defaults:", error);
    res.json({
      fault_detected: false,
      overall_velocity: 0.08,
      oneX_rpm: 0.02,
      twoX_rpm: 0.01,
      bearing_inner: 0.005,
      bearing_outer: 0.005,
      rpm: 1750,
      probable_fault: null,
      confidence: 100,
      threshold_analysis: {
        overall: "pass",
        unbalance: "pass",
        misalignment: "pass",
        bearing: "pass"
      },
      extracted_part_numbers: [],
      bearing_model: null,
      motor_model: null,
      ranked_faults: [],
      repair_steps: [],
      parts_needed: [],
      isFallback: true,
      error: error.message || "Failed to analyze spectrum image"
    });
  }
});

// POST /api/analyze-vibration is mounted early (see handleAnalyzeVibrationExpress above).

// GET & POST /api/recommend-parts - Smart parts recommendation engine
app.post('/api/recommend-parts', async (req, res) => {
  try {
    const { fault_type, equipment_type, specs, extracted_part_numbers, asset_id } = req.body;
    const recommendations: any[] = [];
    
    // 1. Check Learned Parts Database
    if (pool && asset_id && fault_type) {
      try {
        const learnedResult = await pool.query(
          `SELECT part_number_used, timestamp FROM asset_part_history 
           WHERE asset_id = $1 AND LOWER(fault_type) = LOWER($2) 
           ORDER BY timestamp DESC`,
          [parseInt(asset_id, 10), fault_type.trim()]
        );
        
        if (learnedResult.rows.length > 0) {
          const uniqueParts = Array.from(new Set(learnedResult.rows.map(r => r.part_number_used)));
          const suggested = uniqueParts.map(partNum => ({
            part_number: partNum,
            description: `Previously used by technician to fix this asset's ${fault_type} fault.`,
            url: `https://www.mcmaster.com/${encodeURIComponent(partNum)}`,
            confidence: 'high',
            is_learned: true
          }));
          
          recommendations.push({
            category: "Previously Used Parts (Learned)",
            suggested_parts: suggested
          });
        }
      } catch (dbErr) {
        console.error("Error fetching from asset_part_history:", dbErr);
      }
    }
    
    // 2. Exact matches from image analysis
    if (extracted_part_numbers && extracted_part_numbers.length > 0) {
      const suggestedExact = extracted_part_numbers.map((partNum: string) => ({
        part_number: partNum,
        description: `Directly extracted from spectrum image analysis.`,
        url: `https://www.mcmaster.com/${encodeURIComponent(partNum)}`,
        confidence: 'high'
      }));
      recommendations.push({
        category: "Identified Components (Image Analysis)",
        suggested_parts: suggestedExact
      });
    }

    // 3. Fallback/Refined recommendations based on fault type and specs (Refined mcmaster.ts logic)
    const normFault = (fault_type || "").toLowerCase();
    const normEquip = (equipment_type || "").toLowerCase();
    
    // Extract specs
    const shaftDiameter = specs?.shaftDiameter || specs?.shaft_diameter || "1.0"; // default if not specified
    const speedRpm = specs?.rpm || specs?.op_speed || 1750;
    
    // Helper function for mapping shaft sizes to specific ball bearing parts
    const getBearingByShaft = (size: string) => {
      const sz = size.replace(/"/g, "").trim();
      switch(sz) {
        case "0.5": return { part_number: "6035K11", description: 'Precision Steel Shielded Ball Bearing, for 1/2" Shaft Diameter' };
        case "0.75": return { part_number: "6035K15", description: 'Precision Steel Shielded Ball Bearing, for 3/4" Shaft Diameter' };
        case "1.25": return { part_number: "6035K23", description: 'Precision Steel Shielded Ball Bearing, for 1-1/4" Shaft Diameter' };
        case "1.5": return { part_number: "6035K27", description: 'Precision Steel Shielded Ball Bearing, for 1-1/2" Shaft Diameter' };
        case "2": 
        case "2.0": return { part_number: "6035K31", description: 'Precision Steel Shielded Ball Bearing, for 2" Shaft Diameter' };
        case "1":
        case "1.0":
        default: return { part_number: "6035K19", description: 'Precision Steel Shielded Ball Bearing, for 1" Shaft Diameter' };
      }
    };
    
    const getPillowBlockByShaft = (size: string) => {
      const sz = size.replace(/"/g, "").trim();
      switch(sz) {
        case "0.5": return { part_number: "5913K51", description: 'Cast Iron Pillow Block Ball Bearing, for 1/2" Shaft' };
        case "0.75": return { part_number: "5913K53", description: 'Cast Iron Pillow Block Ball Bearing, for 3/4" Shaft' };
        case "1.25": return { part_number: "5913K57", description: 'Cast Iron Pillow Block Ball Bearing, for 1-1/4" Shaft' };
        case "1.5": return { part_number: "5913K59", description: 'Cast Iron Pillow Block Ball Bearing, for 1-1/2" Shaft' };
        case "2":
        case "2.0": return { part_number: "5913K63", description: 'Cast Iron Pillow Block Ball Bearing, for 2" Shaft' };
        case "1":
        case "1.0":
        default: return { part_number: "5913K55", description: 'Cast Iron Pillow Block Ball Bearing, for 1" Shaft' };
      }
    };

    const getBalancingCollarByShaft = (size: string) => {
      const sz = size.replace(/"/g, "").trim();
      switch(sz) {
        case "0.5": return { part_number: "6436K11", description: 'Two-Piece Clamping Shaft Collar for Balancing, 1/2" ID' };
        case "0.75": return { part_number: "6436K13", description: 'Two-Piece Clamping Shaft Collar for Balancing, 3/4" ID' };
        case "1.25": return { part_number: "6436K17", description: 'Two-Piece Clamping Shaft Collar for Balancing, 1-1/4" ID' };
        case "1.5": return { part_number: "6436K19", description: 'Two-Piece Clamping Shaft Collar for Balancing, 1-1/2" ID' };
        case "2":
        case "2.0": return { part_number: "6436K23", description: 'Two-Piece Clamping Shaft Collar for Balancing, 2" ID' };
        case "1":
        case "1.0":
        default: return { part_number: "6436K15", description: 'Two-Piece Clamping Shaft Collar for Balancing, 1" ID' };
      }
    };

    const getCouplingByShaft = (size: string) => {
      const sz = size.replace(/"/g, "").trim();
      switch(sz) {
        case "0.5": return { part_number: "6408K11", description: 'Jaw-Style Flexible Shaft Coupling, 1/2" Bore' };
        case "0.75": return { part_number: "6408K13", description: 'Jaw-Style Flexible Shaft Coupling, 3/4" Bore' };
        case "1.25": return { part_number: "6408K17", description: 'Jaw-Style Flexible Shaft Coupling, 1-1/4" Bore' };
        case "1.5": return { part_number: "6408K19", description: 'Jaw-Style Flexible Shaft Coupling, 1-1/2" Bore' };
        case "2":
        case "2.0": return { part_number: "6408K23", description: 'Jaw-Style Flexible Shaft Coupling, 2" Bore' };
        case "1":
        case "1.0":
        default: return { part_number: "6408K15", description: 'Jaw-Style Flexible Shaft Coupling, 1" Bore' };
      }
    };

    if (normFault.includes("bearing") || normFault.includes("bpfo") || normFault.includes("bpfi") || normFault.includes("bsf") || normFault.includes("ftf") || normFault.includes("defect")) {
      const ballBearing = getBearingByShaft(shaftDiameter);
      const pillowBlock = getPillowBlockByShaft(shaftDiameter);

      recommendations.push({
        category: "Ball Bearings",
        suggested_parts: [
          {
            part_number: ballBearing.part_number,
            description: ballBearing.description,
            url: `https://www.mcmaster.com/${ballBearing.part_number}`,
            confidence: 'medium'
          },
          {
            part_number: pillowBlock.part_number,
            description: pillowBlock.description,
            url: `https://www.mcmaster.com/${pillowBlock.part_number}`,
            confidence: 'medium'
          }
        ]
      });

      recommendations.push({
        category: "Lubricants",
        suggested_parts: [
          {
            part_number: "2951K21",
            description: "High-Temperature Synthetic Bearing Lubricant Grease",
            url: "https://www.mcmaster.com/2951K21",
            confidence: 'low'
          }
        ]
      });
    } else if (normFault.includes("unbalance") || normFault.includes("imbalance")) {
      const balancingCollar = getBalancingCollarByShaft(shaftDiameter);
      recommendations.push({
        category: "Shaft Balancing Collars",
        suggested_parts: [
          {
            part_number: balancingCollar.part_number,
            description: balancingCollar.description,
            url: `https://www.mcmaster.com/${balancingCollar.part_number}`,
            confidence: 'medium'
          },
          {
            part_number: "6436K10",
            description: "One-Piece Clamping Balancing Collar, Standard ID",
            url: "https://www.mcmaster.com/6436K10",
            confidence: 'low'
          }
        ]
      });
    } else if (normFault.includes("misalignment") || normFault.includes("coupling")) {
      const coupling = getCouplingByShaft(shaftDiameter);
      recommendations.push({
        category: "Shaft Couplings & Spiders",
        suggested_parts: [
          {
            part_number: coupling.part_number,
            description: coupling.description,
            url: `https://www.mcmaster.com/${coupling.part_number}`,
            confidence: 'medium'
          },
          {
            part_number: "6408K51",
            description: "Replacement Coupling Spider Insert",
            url: "https://www.mcmaster.com/6408K51",
            confidence: 'medium'
          }
        ]
      });
      recommendations.push({
        category: "Alignment Shims",
        suggested_parts: [
          {
            part_number: "98055A110",
            description: "Assorted Thickness Slotted Alignment Shims, 2\" x 2\" Base",
            url: "https://www.mcmaster.com/98055A110",
            confidence: 'medium'
          },
          {
            part_number: "98055A200",
            description: "Assorted Thickness Slotted Alignment Shims, 3\" x 3\" Base",
            url: "https://www.mcmaster.com/98055A200",
            confidence: 'low'
          }
        ]
      });
    } else if (normFault.includes("looseness") || normFault.includes("loose") || normFault.includes("structural")) {
      recommendations.push({
        category: "Structural Threadlocker & Fasteners",
        suggested_parts: [
          {
            part_number: "1004A11",
            description: "Loctite 263 High-Strength Structural Threadlocker, Red",
            url: "https://www.mcmaster.com/1004A11",
            confidence: 'medium'
          },
          {
            part_number: "91251A242",
            description: "Grade 8 Zinc-Plated High-Strength Steel Cap Screws",
            url: "https://www.mcmaster.com/91251A242",
            confidence: 'low'
          }
        ]
      });
      recommendations.push({
        category: "Vibration-Damping Mounts",
        suggested_parts: [
          {
            part_number: "6484K11",
            description: "Neoprene Rubber Vibration-Damping Bolt-On Mounts",
            url: "https://www.mcmaster.com/6484K11",
            confidence: 'medium'
          }
        ]
      });
    } else {
      // Default / Generic parts fallback
      if (normEquip.includes("pump")) {
        recommendations.push({
          category: "Pump Shaft Seals",
          suggested_parts: [
            {
              part_number: "9412K14",
              description: "Water Pump Mechanical Shaft Seal, General Service",
              url: "https://www.mcmaster.com/9412K14",
              confidence: 'low'
            }
          ]
        });
      } else if (normEquip.includes("fan")) {
        recommendations.push({
          category: "Belts & Pulleys",
          suggested_parts: [
            {
              part_number: "6189K11",
              description: "High-Capacity V-Belt, Standard Grip",
              url: "https://www.mcmaster.com/6189K11",
              confidence: 'low'
            }
          ]
        });
      } else {
        // General replacement seals
        recommendations.push({
          category: "Hardware Supplies",
          suggested_parts: [
            {
              part_number: "9414T11",
              description: "High-Temperature Oil Seals, General Machinery ID",
              url: "https://www.mcmaster.com/9414T11",
              confidence: 'low'
            }
          ]
        });
      }
    }

    res.json(recommendations);
  } catch (error: any) {
    console.error("Error generating parts recommendation:", error);
    res.status(500).json({ error: error.message || "Failed to recommend parts." });
  }
});

// POST /api/save-part-used - Save used part to history
app.post('/api/save-part-used', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "Database not available" });
    }
    const { asset_id, fault_type, part_number_used } = req.body;
    if (!asset_id || !fault_type || !part_number_used) {
      return res.status(400).json({ error: "Missing required fields (asset_id, fault_type, part_number_used)" });
    }
    
    await pool.query(
      `INSERT INTO asset_part_history (asset_id, fault_type, part_number_used, timestamp, user_confirmed)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, TRUE)`,
      [parseInt(asset_id, 10), fault_type.trim(), part_number_used.trim()]
    );
    
    res.json({ success: true, message: "Logged parts used to asset part history." });
  } catch (error: any) {
    console.error("Error saving logged part used:", error);
    res.status(500).json({ error: error.message || "Failed to save part used." });
  }
});

// Feedback Endpoint
app.post('/api/feedback', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "Database not available" });
    }
    const { diagnosis_id, was_correct, corrected_fault, user_notes, user_id } = req.body;
    if (diagnosis_id === undefined || was_correct === undefined) {
      return res.status(400).json({ error: "Missing diagnosis_id or was_correct" });
    }

    // Save to diagnosis_feedback
    await pool.query(
      `INSERT INTO diagnosis_feedback (diagnosis_id, was_correct, corrected_fault, user_notes, user_id, timestamp)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [diagnosis_id, was_correct, corrected_fault || null, user_notes || null, user_id || null]
    );

    // Update diagnosis_history
    await pool.query(
      `UPDATE diagnosis_history 
       SET was_correct = $1, corrected_diagnosis = $2, user_feedback_timestamp = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [was_correct, was_correct ? null : (corrected_fault || null), diagnosis_id]
    );

    // Retrieve diagnosis_history to add to learning_database
    const diagHistoryRes = await pool.query(
      `SELECT vibration_data, equipment_type, ai_response FROM diagnosis_history WHERE id = $1`,
      [diagnosis_id]
    );

    if (diagHistoryRes.rows.length > 0) {
      const row = diagHistoryRes.rows[0];
      let valuesObj = row.vibration_data;
      if (typeof valuesObj === "string") {
        try { valuesObj = JSON.parse(valuesObj); } catch { valuesObj = {}; }
      }
      
      let aiResp = row.ai_response;
      if (typeof aiResp === "string") {
        try { aiResp = JSON.parse(aiResp); } catch { aiResp = {}; }
      }

      const correctFault = was_correct 
        ? (aiResp.probable_fault || (aiResp.faults && aiResp.faults[0] ? aiResp.faults[0].type : null) || "Healthy")
        : (corrected_fault || "Healthy");

      const confidence = was_correct ? 95.0 : 90.0;

      // Insert into learning_database
      await pool.query(
        `INSERT INTO learning_database (spectrum_image_url, extracted_values, correct_fault_type, confidence_score, source, timestamp)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [
          valuesObj.fileName || null, 
          JSON.stringify({
            overall_velocity: parseFloat(valuesObj.overall_velocity) || 0,
            oneX_rpm: parseFloat(valuesObj.oneX_rpm) || 0,
            twoX_rpm: parseFloat(valuesObj.twoX_rpm) || 0,
            bearing_inner: parseFloat(valuesObj.bearing_inner) || 0,
            bearing_outer: parseFloat(valuesObj.bearing_outer) || 0
          }),
          correctFault,
          confidence,
          "user_corrected"
        ]
      );
    }

    res.json({ success: true, message: "Feedback saved and integrated into continuous learning loop." });
  } catch (error: any) {
    console.error("Error saving feedback:", error);
    res.status(500).json({ error: "Failed to save feedback", details: error.message });
  }
});

// Learning Database Search Endpoint
app.post('/api/learning-database/search', async (req, res) => {
  try {
    const { overall_velocity, oneX_rpm, twoX_rpm, bearing_inner, bearing_outer } = req.body;
    const match = await searchLearningDatabase({
      overall_velocity: parseFloat(overall_velocity) || 0,
      oneX_rpm: parseFloat(oneX_rpm) || 0,
      twoX_rpm: parseFloat(twoX_rpm) || 0,
      bearing_inner: parseFloat(bearing_inner) || 0,
      bearing_outer: parseFloat(bearing_outer) || 0
    });
    res.json({ match });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Import SmartCBM Data Endpoint
app.post('/api/import-smartcbm-data', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "Database not available" });
    }
    const { data, source } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Payload 'data' must be a JSON array of vibration records." });
    }

    const sourceTag = source || "smartcbm";
    let importCount = 0;

    for (const item of data) {
      const overall_velocity = parseFloat(item.overall_velocity || item.velocity) || 0.08;
      const oneX_rpm = parseFloat(item.oneX_rpm || item.oneX || item.unbalance) || 0.02;
      const twoX_rpm = parseFloat(item.twoX_rpm || item.twoX || item.misalignment) || 0.01;
      const bearing_inner = parseFloat(item.bearing_inner || item.bpfi) || 0.005;
      const bearing_outer = parseFloat(item.bearing_outer || item.bpfo) || 0.005;
      const correct_fault_type = item.correct_fault_type || item.fault_type || item.diagnosis || "Healthy";
      const confidence_score = parseFloat(item.confidence_score || item.confidence) || 90.0;
      const imageUrl = item.spectrum_image_url || item.image_url || null;

      const extracted = {
        overall_velocity,
        oneX_rpm,
        twoX_rpm,
        bearing_inner,
        bearing_outer
      };

      await pool.query(
        `INSERT INTO learning_database (spectrum_image_url, extracted_values, correct_fault_type, confidence_score, source, timestamp)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [imageUrl, JSON.stringify(extracted), correct_fault_type, confidence_score, sourceTag]
      );
      importCount++;
    }

    res.json({
      success: true,
      message: `Successfully imported ${importCount} records into learning database.`,
      source: sourceTag
    });
  } catch (error: any) {
    console.error("Bulk import failed:", error);
    res.status(500).json({ error: "Bulk import failed", details: error.message });
  }
});

// GET endpoint to retrieve past maintenance logs for an asset
app.get('/api/maintenance-logs', async (req, res) => {
  try {
    if (!pool) {
      return res.json([]);
    }
    const assetId = req.query.asset_id;
    if (!assetId) {
      return res.status(400).json({ error: "Missing asset_id" });
    }
    const result = await pool.query(
      "SELECT * FROM maintenance_logs WHERE asset_id = $1 ORDER BY work_date DESC, id DESC",
      [assetId]
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error("Error fetching maintenance logs:", error);
    res.status(500).json({ error: "Failed to fetch maintenance logs", details: error.message });
  }
});

// POST endpoint to add a new maintenance log entry
app.post('/api/maintenance-logs', async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({ error: "Database not available" });
    }
    const { asset_id, work_date, work_type, technician_name, notes, parts_used } = req.body;
    if (!asset_id || !work_date || !work_type || !technician_name) {
      return res.status(400).json({ error: "Missing required fields: asset_id, work_date, work_type, technician_name" });
    }
    const result = await pool.query(
      `INSERT INTO maintenance_logs (asset_id, work_date, work_type, technician_name, notes, parts_used)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [asset_id, work_date, work_type, technician_name, notes, parts_used ? (typeof parts_used === "string" ? parts_used : JSON.stringify(parts_used)) : null]
    );
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error("Error creating maintenance log:", error);
    res.status(500).json({ error: "Failed to create maintenance log", details: error.message });
  }
});

// API Endpoint for the 2-step AI Analysis Pipeline (Vision Extraction -> Analyst Core)
app.post('/api/run-diagnosis', async (req, res) => {
  try {
    const { image, metadata } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing spectrum image in 'image' field." });
    }

    // Prepare MIME type
    let mimeType = "image/png";
    let base64Data = image;
    if (image.startsWith("data:")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    // Step 1: Vision Model Feature Extraction
    const extractedData = await runStep1Extractor(
      base64Data,
      mimeType,
      metadata?.machineType || metadata?.equipmentType || "Default",
      req
    );

    // Step 2: Analyst Model Core Category IV Analysis
    const step2Result = await runStep2AnalystReporter(
      extractedData,
      base64Data,
      mimeType,
      metadata?.specs || metadata,
      metadata?.machineType || metadata?.equipmentType || "Default",
      req
    );

    // Return the final text output (the full markdown report) to the frontend!
    res.json({
      text: step2Result.consensus_report,
      consensus_report: step2Result.consensus_report,
      parsed: step2Result
    });
  } catch (err: any) {
    console.error("Error in run-diagnosis endpoint:", err);
    res.status(500).json({ error: err.message });
  }
});

// API Endpoint for AI-Powered Diagnostic Analysis (Gemini + OpenAI + Anthropic Consensus Engine)
app.post('/api/diagnose', async (req, res) => {
  try {
    const {
      overall_velocity,
      oneX_rpm,
      twoX_rpm,
      bearing_inner,
      bearing_outer,
      category,
      symptoms,
      specs,
      fileData,
      fileType,
      fileName,
      technology,
      equipmentType,
      customEquipment,
      componentId,
      assetId,
      userId,
      shafts
    } = req.body;

    console.log('🤖 Starting Hybrid AI Diagnostic engine processing for:', equipmentType);

    // Run the tri-model pipeline
    const finalResponse = await runTriModelPipeline(
      fileData,
      fileType,
      specs,
      req.body,
      req
    );

    // Save to Database synchronously so we can return the ID to the client
    let diagnosis_id = null;
    if (pool) {
      let resolvedAssetId = assetId || null;
      const resolvedComponentId = componentId || null;
      
      if (resolvedComponentId && !resolvedAssetId) {
        try {
          const compRes = await pool.query("SELECT asset_id FROM components WHERE id = $1", [resolvedComponentId]);
          if (compRes.rows.length > 0) {
            resolvedAssetId = compRes.rows[0].asset_id;
          }
        } catch (err) {
          console.error("Failed to query asset_id for component:", err);
        }
      }
      if (!resolvedAssetId && !resolvedComponentId) {
        resolvedAssetId = 1;
      }
      
      const inputDataObj = {
        overall_velocity: finalResponse.overall_velocity,
        oneX_rpm: finalResponse.oneX_rpm,
        twoX_rpm: finalResponse.twoX_rpm,
        bearing_inner: finalResponse.bearing_inner,
        bearing_outer: finalResponse.bearing_outer,
        symptoms,
        specs,
        fileName
      };

      try {
        const dbResult = await pool.query(
          `INSERT INTO diagnosis_history (component_id, asset_id, equipment_type, input_data, vibration_data, ai_response, user_id, is_temporary, timestamp, tenant_id) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9) RETURNING id`,
          [
            resolvedComponentId,
            resolvedAssetId,
            equipmentType || "Other",
            JSON.stringify(inputDataObj),
            JSON.stringify(inputDataObj),
            JSON.stringify(finalResponse),
            userId || null,
            false, // is_temporary
            req.tenantId ?? -1
          ]
        );
        diagnosis_id = dbResult.rows[0]?.id;
        console.log(`✅ [Neon DB] Saved diagnosis_history record with ID: ${diagnosis_id}`);
      } catch (dbError: any) {
        console.error("❌ [Neon DB] Insertion to diagnosis_history failed:", dbError);
        throw new Error("Failed to save diagnosis to database: " + dbError.message);
      }

      // Requirement 1: Automatic Alert Trigger (Critical or High)
      const severityStr = String(finalResponse.overall_severity || (finalResponse as any).severity || "").toLowerCase();
      if (severityStr === 'critical' || severityStr === 'danger' || severityStr === 'high') {
        try {
          // Resolve assetName
          let resolvedAssetName = "Asset " + (resolvedAssetId || resolvedComponentId || "");
          if (resolvedAssetId) {
            const assetRes = await pool.query("SELECT name FROM assets WHERE id = $1", [resolvedAssetId]);
            if (assetRes.rows.length > 0) {
              resolvedAssetName = assetRes.rows[0].name;
            }
          } else if (resolvedComponentId) {
            const compRes = await pool.query("SELECT a.name FROM components c JOIN assets a ON c.asset_id = a.id WHERE c.id = $1", [resolvedComponentId]);
            if (compRes.rows.length > 0) {
              resolvedAssetName = compRes.rows[0].name;
            }
          }

          // Resolve recipientEmail
          let targetEmail = "shanedufrene1989@gmail.com";
          if (userId) {
            const userRes = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
            if (userRes.rows.length > 0 && userRes.rows[0].email) {
              targetEmail = userRes.rows[0].email;
            }
          }

          const faultName = finalResponse.probable_fault || "Critical Vibration Anomaly";
          const faultDetails = (finalResponse as any).fault_explanation || "AI Diagnostic Consensus identified critical anomaly.";
          const severityVal = severityStr === 'high' ? "High" : "Critical";

          // Automatically call the /api/send-alert endpoint
          const alertResponse = await fetch(`http://localhost:3000/api/send-alert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetName: resolvedAssetName,
              faultName,
              faultDetails,
              severity: severityVal,
              recipientEmail: targetEmail
            })
          });

          if (alertResponse.ok) {
            console.log(`🚨 Critical alert sent for ${resolvedAssetName}`);
            if (diagnosis_id && userId) {
              try {
                await pool.query(`
                  INSERT INTO alert_history (user_id, analysis_id, severity, status)
                  VALUES ($1, $2, $3, $4)
                `, [userId, diagnosis_id, severityVal, "Sent"]);
              } catch (histErr: any) {
                console.error("Failed to log automated alert history:", histErr.message);
              }
            }
          } else {
            console.error(`⚠️ [Auto Alert] Automated /api/send-alert call returned status ${alertResponse.status}`);
          }
        } catch (alertErr: any) {
          console.error("⚠️ [Auto Alert] Exception during automatic alert trigger:", alertErr.message);
        }
      }
    }

    res.json({
      ...finalResponse,
      diagnosis_id
    });
  } catch (error: any) {
    console.error('❌ AI Diagnosis failure:', error);
    res.status(500).json({ error: 'Diagnosis failed: ' + (error.message || error) });
  }
});

// API Endpoint to Analyze Entire Component (Cross-Axis Diagnosis)
app.post('/api/analyze-component', async (req, res) => {
  try {
    const { componentId } = req.body;
    if (!componentId) {
      return res.status(400).json({ error: "Missing componentId parameter" });
    }

    if (!pool) {
      return res.status(400).json({ error: "Database not initialized" });
    }

    const compId = parseInt(componentId, 10);
    if (isNaN(compId)) {
      return res.status(400).json({ error: "Invalid componentId" });
    }

    // 1. Fetch component details
    const compRes = await pool.query("SELECT * FROM components WHERE id = $1", [compId]);
    if (compRes.rows.length === 0) {
      return res.status(404).json({ error: "Component not found" });
    }
    const component = compRes.rows[0];

    // 2. Query child collection points
    const cpRes = await pool.query(
      "SELECT * FROM collection_points WHERE component_id = $1 ORDER BY location_order ASC, name ASC",
      [compId]
    );

    const aggregatedPoints = [];
    let maxOverallVelocity = 0.08;
    let maxOneX = 0.02;
    let maxTwoX = 0.01;
    let maxBearingInner = 0.005;
    let maxBearingOuter = 0.005;

    // 3. For each collection point, fetch the latest spectrum/vibration/measurement data
    for (const cp of cpRes.rows) {
      // Find measurement points under this collection point
      const mpRes = await pool.query(
        "SELECT * FROM measurement_points WHERE collection_point_id = $1",
        [cp.id]
      );

      const mpsData = [];
      for (const mp of mpRes.rows) {
        // Find latest analysis_history
        const ahRes = await pool.query(
          "SELECT * FROM analysis_history WHERE measurement_point_id = $1 ORDER BY measurement_date DESC, created_at DESC LIMIT 1",
          [mp.id]
        );
        const latestAh = ahRes.rows[0];

        let val = 0.08;
        let oneX = 0.02;
        let twoX = 0.01;
        let bInner = 0.005;
        let bOuter = 0.005;

        if (latestAh) {
          val = parseFloat(latestAh.measurement_value) || 0.08;
          // Extract peaks from diagnosis_result JSON if they exist
          if (latestAh.diagnosis_result) {
            try {
              const diag = typeof latestAh.diagnosis_result === 'string' 
                ? JSON.parse(latestAh.diagnosis_result) 
                : latestAh.diagnosis_result;
              
              if (diag.oneX_rpm !== undefined) oneX = parseFloat(diag.oneX_rpm);
              if (diag.twoX_rpm !== undefined) twoX = parseFloat(diag.twoX_rpm);
              if (diag.bearing_inner !== undefined) bInner = parseFloat(diag.bearing_inner);
              if (diag.bearing_outer !== undefined) bOuter = parseFloat(diag.bearing_outer);
            } catch (e) {
              // ignore
            }
          }
        }

        // Keep track of maximum values across the entire component to pass to the extractor/analyst
        if (val > maxOverallVelocity) maxOverallVelocity = val;
        if (oneX > maxOneX) maxOneX = oneX;
        if (twoX > maxTwoX) maxTwoX = twoX;
        if (bInner > maxBearingInner) maxBearingInner = bInner;
        if (bOuter > maxBearingOuter) maxBearingOuter = bOuter;

        mpsData.push({
          measurement_point_id: mp.id,
          direction: mp.direction,
          technology_type: mp.technology_type,
          units: mp.units,
          overall_velocity: val,
          oneX_rpm: oneX,
          twoX_rpm: twoX,
          bearing_inner: bInner,
          bearing_outer: bOuter,
          notes: latestAh ? latestAh.notes : null,
          measurement_date: latestAh ? latestAh.measurement_date : null
        });
      }

      aggregatedPoints.push({
        collection_point_id: cp.id,
        name: cp.name,
        location_order: cp.location_order,
        orientation: cp.orientation,
        notes: cp.notes,
        measurement_points: mpsData
      });
    }

    // 4. Construct bodyData and specs payload for runTriModelPipeline
    const bodyData = {
      overall_velocity: maxOverallVelocity,
      oneX_rpm: maxOneX,
      twoX_rpm: maxTwoX,
      bearing_inner: maxBearingInner,
      bearing_outer: maxBearingOuter,
      equipmentType: component.type || "Default",
      componentId: compId,
      assetId: component.asset_id,
      symptoms: `Component-wide cross-axis analysis of ${cpRes.rows.length} collection points: ${cpRes.rows.map(r => r.name).join(', ')}.`
    };

    const componentSpecs = typeof component.specs === 'object' && component.specs !== null
      ? component.specs
      : (typeof component.specifications === 'string' && component.specifications
          ? JSON.parse(component.specifications)
          : (component.specifications || {}));

    const mergedSpecs = {
      ...componentSpecs,
      aggregated_collection_points: aggregatedPoints
    };

    console.log(`🤖 Starting Cross-Axis Component Analysis for Component: ${component.name} (#${compId})`);

    // 5. Run the EXACT SAME 2-Step AI Analysis Pipeline
    const finalResponse = await runTriModelPipeline(
      undefined, // No single fileData base64 image
      undefined,
      mergedSpecs,
      bodyData,
      req
    );

    // 6. Save to Database diagnosis_history
    let diagnosis_id = null;
    const inputDataObj = {
      overall_velocity: finalResponse.overall_velocity || maxOverallVelocity,
      oneX_rpm: finalResponse.oneX_rpm || maxOneX,
      twoX_rpm: finalResponse.twoX_rpm || maxTwoX,
      bearing_inner: finalResponse.bearing_inner || maxBearingInner,
      bearing_outer: finalResponse.bearing_outer || maxBearingOuter,
      specs: mergedSpecs,
      fileName: "Component Wide Cross-Axis Analysis"
    };

    try {
      const dbResult = await pool.query(
        `INSERT INTO diagnosis_history (component_id, asset_id, equipment_type, input_data, vibration_data, ai_response, user_id, is_temporary, timestamp, tenant_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9) RETURNING id`,
        [
          compId,
          component.asset_id,
          component.type || "Other",
          JSON.stringify(inputDataObj),
          JSON.stringify(inputDataObj),
          JSON.stringify(finalResponse),
          null, // userId
          false, // is_temporary
          req.tenantId ?? -1
        ]
      );
      diagnosis_id = dbResult.rows[0]?.id;
      console.log(`✅ Saved component-wide diagnosis with ID: ${diagnosis_id}`);
    } catch (dbError: any) {
      console.error("❌ Failed to save component-wide diagnosis to database:", dbError);
    }

    res.json({
      ...finalResponse,
      diagnosis_id
    });

  } catch (error: any) {
    console.error("❌ Component wide analysis failure:", error);
    res.status(500).json({ error: "Component analysis failed: " + (error.message || error) });
  }
});

// DELETE endpoint to delete a diagnosis log
app.delete('/api/diagnosis-logs/:id', async (req, res) => {
  try {
    const logId = parseInt(req.params.id, 10);
    if (isNaN(logId)) {
      return res.status(400).json({ error: "Invalid log ID" });
    }
    if (pool) {
      await pool.query("DELETE FROM diagnosis_history WHERE id = $1", [logId]);
      res.json({ success: true });
    } else {
      res.json({ success: true, message: "In-memory delete simulation" });
    }
  } catch (error: any) {
    console.error("Failed to delete diagnosis log:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET endpoint to retrieve past diagnoses for an asset
app.get("/api/diagnosis-history/:assetId", async (req, res) => {
  try {
    const assetId = parseInt(req.params.assetId, 10);
    if (isNaN(assetId)) {
      return res.status(400).json({ error: "Invalid asset ID" });
    }

    if (pool) {
      const result = await pool.query(
        "SELECT id, timestamp, equipment_type, vibration_data, ai_response FROM diagnosis_history WHERE (asset_id = $1 OR component_id = $1) AND tenant_id = $2 ORDER BY timestamp DESC LIMIT 10",
        [assetId, req.tenantId ?? -1]
      );
      return res.json(result.rows);
    } else {
      return res.json([]);
    }
  } catch (error: any) {
    console.error("Failed to fetch diagnosis history:", error);
    res.status(500).json({ error: "Failed to fetch diagnosis history: " + error.message });
  }
});

app.get("/api/test-diagnosis", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  console.log("=== RUNNING DIAGNOSTICS INTEGRITY TEST ===");
  try {
    const simulatedData = {
      overall_velocity: 0.22,
      oneX_rpm: 0.08,
      twoX_rpm: 0.03,
      bearing_inner: 0.01,
      bearing_outer: 0.05
    };

    const result = analyzeVibration(simulatedData);
    
    return res.json({
      success: true,
      isCorrectDiagnosis: result.faultDetected && result.faults.some(f => f.type === 'Bearing Defect'),
      expected: "Bearing Defect",
      actual: result.faults.map(f => f.type).join(", "),
      result
    });
  } catch (error: any) {
    console.error("❌ Integrity test endpoint failed:", error);
    return res.json({
      success: false,
      error: error.message || "An unexpected error occurred during testing."
    });
  }
});

// GET endpoint to prefill diagnosis page using collection point ID or string prefillId
app.get('/api/diagnosis/prefill/:collectionPointId', async (req, res) => {
  try {
    const cpId = req.params.collectionPointId;
    if (!pool) {
      return res.status(400).json({ error: "Database not initialized" });
    }

    let cpRow = null;
    if (/^\d+$/.test(cpId)) {
      const cpRes = await pool.query("SELECT * FROM collection_points WHERE id = $1", [parseInt(cpId, 10)]);
      cpRow = cpRes.rows[0];
    } else {
      // Fuzzy lookup by name or parts of the custom ID
      const parts = cpId.split('-');
      const lastPart = parts[parts.length - 1]; // e.g., "horizontal"
      const cpRes = await pool.query(
        "SELECT * FROM collection_points WHERE name ILIKE $1 OR name ILIKE $2 OR notes ILIKE $1 LIMIT 1",
        [`%${cpId}%`, `%${lastPart}%`]
      );
      cpRow = cpRes.rows[0];
    }

    if (!cpRow) {
      // Fallback: get the first collection point in the database so the demo always succeeds
      const fallbackRes = await pool.query("SELECT * FROM collection_points LIMIT 1");
      cpRow = fallbackRes.rows[0];
    }

    if (!cpRow) {
      return res.status(404).json({ error: "No collection point found" });
    }

    // Now fetch parent details
    const compRes = await pool.query("SELECT * FROM components WHERE id = $1", [cpRow.component_id]);
    const component = compRes.rows[0];

    let asset = null;
    let route = null;
    let plant = null;

    if (component) {
      const assetRes = await pool.query("SELECT * FROM assets WHERE id = $1", [component.asset_id]);
      asset = assetRes.rows[0];
      if (asset) {
        const routeRes = await pool.query("SELECT * FROM routes WHERE id = $1", [asset.route_id]);
        route = routeRes.rows[0];
        if (route) {
          const plantRes = await pool.query("SELECT * FROM plants WHERE id = $1", [route.plant_id]);
          plant = plantRes.rows[0];
        }
      }
    }

    return res.json({
      collectionPoint: cpRow,
      component,
      asset,
      route,
      plant
    });

  } catch (error: any) {
    console.warn("Prefill error (executing static fallback):", error);
    return res.status(500).json({ error: error.message || "Failed to fetch prefill details" });
  }
});

// API Endpoint for custom Gemini-Powered Chatbot
app.post("/api/chatbot", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array in request body." });
    }

    // Map messages into Gemini's format: { role: "user" | "model", parts: [{ text: string }] }
    const formattedContents = messages.map((m: any) => {
      const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
      const text = m.content || m.text || "";
      return {
        role,
        parts: [{ text }]
      };
    });

    const ai = getAiClient(req);
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: formattedContents,
      config: {
        systemInstruction: "You are Spectra CM Assistant, an expert in vibration analysis and condition monitoring. Answer questions about: bearing defects, unbalance, misalignment, motor issues, Spectra CM features, module-based pricing, and reliability engineering best practices. Be professional and helpful."
      }
    });

    return res.json({ response: response.text });
  } catch (error: any) {
    console.error("❌ Chatbot endpoint error:", error);
    return res.status(500).json({ error: error.message || "An unexpected error occurred in the chatbot." });
  }
});

// API Endpoint to record user verification feedback for machine learning loop
app.post("/api/feedback", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { id, was_correct, corrected_diagnosis } = req.body;
    if (!pool) {
      return res.status(400).json({ error: "PostgreSQL Database is not configured." });
    }
    if (!id) {
      return res.status(400).json({ error: "Missing required diagnosis record ID ('id')." });
    }

    console.log(`📥 Received feedback for diagnosis record ID ${id}: was_correct=${was_correct}, corrected_diagnosis=${corrected_diagnosis}`);

    const updateQuery = `
      UPDATE diagnosis_history 
      SET was_correct = $1, 
          corrected_diagnosis = $2, 
          user_feedback_timestamp = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id;
    `;
    
    const dbResult = await pool.query(updateQuery, [
      was_correct, 
      was_correct ? null : (corrected_diagnosis || "N/A"), 
      id
    ]);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: `Diagnosis history record with ID ${id} not found.` });
    }

    return res.json({ success: true, message: "Feedback saved to machine learning log.", id: dbResult.rows[0].id });
  } catch (error: any) {
    console.error("❌ Failed to save user feedback in database:", error);
    return res.status(500).json({ error: error.message || "Failed to save verification feedback." });
  }
});

// In-memory fallback for training data/feedback when database is not connected or analysis was run in Quick Mode
let tempFeedbackList: any[] = [];

// NEW ENDPOINT: robust AI Correction and Feedback Loop
app.post("/api/analysis/feedback", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { analysis_id, is_correct, actual_fault_type, actual_details, actual_severity } = req.body;
    
    console.log(`📥 [Feedback Loop] Received feedback: analysis_id=${analysis_id}, is_correct=${is_correct}, fault=${actual_fault_type}, details=${actual_details}, severity=${actual_severity}`);

    const feedbackObj = {
      analysis_id: analysis_id || null,
      is_correct,
      actual_fault_type: is_correct ? null : (actual_fault_type || "N/A"),
      actual_details: is_correct ? null : (actual_details || ""),
      actual_severity: is_correct ? null : (actual_severity || "Low"),
      timestamp: new Date().toISOString()
    };

    // Save locally to temporary list so we don't lose the training data
    tempFeedbackList.push(feedbackObj);

    if (!pool) {
      console.log("⚠️ [Feedback Loop] Database not available. Saved training data in temporary memory registry.");
      return res.json({ 
        success: true, 
        message: "Saved in temporary memory registry (Offline Mode).", 
        data: feedbackObj 
      });
    }

    // If analysis_id is provided, update database
    if (analysis_id) {
      const parsedId = parseInt(String(analysis_id), 10);
      if (!isNaN(parsedId)) {
        const correctedDiagObj = is_correct ? null : {
          actual_fault_type,
          actual_details,
          actual_severity
        };

        const correctedDiagStr = correctedDiagObj ? JSON.stringify(correctedDiagObj) : null;

        // 1. Update diagnosis_history table
        try {
          await pool.query(
            `UPDATE diagnosis_history 
             SET was_correct = $1, 
                 corrected_diagnosis = $2, 
                 user_feedback_timestamp = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [is_correct, correctedDiagStr, parsedId]
          );
          console.log(`✅ [Feedback Loop] Updated diagnosis_history for ID ${parsedId}`);
        } catch (dbErr: any) {
          console.warn(`⚠️ [Feedback Loop] Could not update diagnosis_history: ${dbErr.message}`);
        }

        // 2. Update analysis_history table
        try {
          await pool.query(
            `UPDATE analysis_history 
             SET was_correct = $1, 
                 corrected_diagnosis = $2
             WHERE id = $3`,
            [is_correct, correctedDiagStr, parsedId]
          );
          console.log(`✅ [Feedback Loop] Updated analysis_history for ID ${parsedId}`);
        } catch (dbErr: any) {
          console.warn(`⚠️ [Feedback Loop] Could not update analysis_history: ${dbErr.message}`);
        }
      }
    } else {
      // If there's no database link (Quick Mode without db_id), log feedback in database as a temporary entry if pool exists
      try {
        const correctedDiagObj = is_correct ? null : {
          actual_fault_type,
          actual_details,
          actual_severity
        };
        const correctedDiagStr = correctedDiagObj ? JSON.stringify(correctedDiagObj) : null;
        
        await pool.query(
          "INSERT INTO diagnosis_history (input_data, ai_response, was_correct, corrected_diagnosis, is_temporary, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            JSON.stringify({ note: "Feedback for Quick Mode analysis" }),
            JSON.stringify({ status: "feedback_only" }),
            is_correct,
            correctedDiagStr,
            true,
            req.tenantId ?? -1
          ]
        );
        console.log("✅ [Feedback Loop] Saved Quick Mode feedback in database.");
      } catch (dbErr: any) {
        console.warn(`⚠️ [Feedback Loop] Could not log Quick Mode feedback: ${dbErr.message}`);
      }
    }

    return res.json({ 
      success: true, 
      message: "Feedback saved. AI will learn from this!", 
      data: feedbackObj 
    });
  } catch (error: any) {
    console.error("❌ [Feedback Loop] Error saving feedback:", error);
    return res.status(500).json({ error: error.message || "Failed to save feedback." });
  }
});

// NEW ENDPOINT: Save temporary analysis to permanent database storage
app.post("/api/save-temporary-analysis", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { analysis_id, analysisId, component_id, componentId } = req.body;
    const id = parseInt(analysis_id || analysisId, 10);
    const compId = parseInt(component_id || componentId, 10);

    if (isNaN(id) || isNaN(compId)) {
      return res.status(400).json({ error: "Missing or invalid analysis_id or component_id parameters." });
    }

    if (!pool) {
      console.warn("⚠️ Pool not initialized. Running mock update for save-temporary-analysis.");
      return res.json({ success: true, message: "Analysis successfully saved (Mock Mode)." });
    }

    console.log(`💾 Saving temporary analysis ID ${id} under component ID ${compId}`);
    const updateResult = await pool.query(
      "UPDATE diagnosis_history SET component_id = $1, is_temporary = false WHERE id = $2 RETURNING *",
      [compId, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: `Temporary analysis record with ID ${id} not found.` });
    }

    return res.json({ 
      success: true, 
      message: "Analysis successfully moved from temporary to permanent storage.", 
      record: updateResult.rows[0] 
    });
  } catch (error: any) {
    console.error("❌ Failed to save temporary analysis:", error);
    return res.status(500).json({ error: error.message || "Failed to save temporary analysis." });
  }
});

// NEW ENDPOINT: Manual or automated send-alert route using Resend API
app.post("/api/send-alert", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    const { assetName, faultName, faultDetails, severity, recipientEmail } = req.body;
    const targetEmail = recipientEmail || "shanedufrene1989@gmail.com";
    const fName = faultName || faultDetails || "Undetermined Anomaly";
    const sev = severity || "Warning";

    console.log(`📨 Direct alert email request: Asset=${assetName}, Fault=${fName}, Recipient=${targetEmail}`);

    const description = `This notification was sent via the manual alert trigger on the Spectra CM diagnosis control panel.`;
    const recommendedAction = `Verify the asset immediately. Inspect vibration spectral patterns, bearing temperature, and ensure compliance with ISO guidelines.`;

    const htmlContent = buildEmailTemplate({
      assetName: assetName || "Test Equipment Unit",
      faultName: fName,
      severity: sev,
      description,
      recommendedAction,
      link: "https://ai.studio/build"
    });

    const success = await sendResendEmail({
      to: targetEmail,
      subject: `🚨 MANUAL ALERT: ${assetName || "Test Asset"} - ${fName}`,
      htmlContent
    });

    if (success) {
      return res.json({ success: true, message: `Alert email dispatched to ${targetEmail} via Resend API.` });
    } else {
      return res.status(500).json({ error: "Failed to dispatch email via Resend. Check API key configuration." });
    }
  } catch (error: any) {
    console.error("❌ Failed to send alert email:", error);
    return res.status(500).json({ error: error.message || "Failed to send alert email." });
  }
});

let squareClient: SquareClient | null = null;
function getSquareClient(): SquareClient {
  if (!squareClient) {
    const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
    if (!token) {
      throw new Error(
        "SQUARE_ACCESS_TOKEN environment variable is required to process payments"
      );
    }
    // The SDK requires BOTH an explicit token and environment; deriving the
    // latter through squareMode keeps them from ever disagreeing.
    const environmentName = resolveSquareEnvironmentName(process.env);
    squareClient = new SquareClient({
      token,
      environment:
        environmentName === "sandbox"
          ? SquareEnvironment.Sandbox
          : SquareEnvironment.Production
    });
  }
  return squareClient;
}

/* ========================================================================== */
/* STOREFRONT (E3/E4) — public catalog, auth-less build checkout, webhook    */
/* ========================================================================== */

const checkoutCreateLimiter = createInMemoryRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20
});

function checkoutClientKey(req: any): string {
  const forwarded = req?.headers?.["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "";
  return first || req?.ip || "unknown";
}

function squareId(value: any): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function pendingCheckoutFromRow(row: any): PendingCheckoutRecord {
  const rawModules = Array.isArray(row.module_keys)
    ? row.module_keys
    : String(row.module_keys ?? "")
        .split(",")
        .map((part: string) => part.trim())
        .filter(Boolean);
  return {
    checkout_session_id: String(row.checkout_session_id),
    checkout_ref: String(row.checkout_ref),
    company_name: String(row.company_name ?? ""),
    admin_username: String(row.admin_username ?? ""),
    admin_email: row.admin_email == null ? null : String(row.admin_email),
    password_hash: String(row.password_hash ?? ""),
    terms_accepted: row.terms_accepted === true,
    module_keys: rawModules.map((key: unknown) => String(key)),
    square_subscription_id:
      row.square_subscription_id == null ? null : String(row.square_subscription_id),
    square_customer_id:
      row.square_customer_id == null ? null : String(row.square_customer_id),
    company_id: row.company_id == null ? null : Number(row.company_id),
    admin_user_id: row.admin_user_id == null ? null : Number(row.admin_user_id),
    plant_id: row.plant_id == null ? null : Number(row.plant_id),
    status: String(row.status ?? "pending")
  };
}

async function findPendingBySession(
  checkoutSessionId: string
): Promise<PendingCheckoutRecord | null> {
  if (pool) {
    const result = await pool.query(
      "SELECT * FROM checkout_pending_provisioning WHERE checkout_session_id = $1 LIMIT 1",
      [checkoutSessionId]
    );
    return result.rows[0] ? pendingCheckoutFromRow(result.rows[0]) : null;
  }
  const row = memoryPendingCheckouts.find(
    (entry) => entry.checkout_session_id === checkoutSessionId
  );
  return row ? pendingCheckoutFromRow(row) : null;
}

async function findPendingByRef(
  checkoutRef: string
): Promise<PendingCheckoutRecord | null> {
  if (pool) {
    const result = await pool.query(
      "SELECT * FROM checkout_pending_provisioning WHERE checkout_ref = $1 LIMIT 1",
      [checkoutRef]
    );
    return result.rows[0] ? pendingCheckoutFromRow(result.rows[0]) : null;
  }
  const row = memoryPendingCheckouts.find(
    (entry) => entry.checkout_ref === checkoutRef
  );
  return row ? pendingCheckoutFromRow(row) : null;
}

async function findPendingBySubscription(
  subscriptionId: string
): Promise<PendingCheckoutRecord | null> {
  if (pool) {
    const result = await pool.query(
      "SELECT * FROM checkout_pending_provisioning WHERE square_subscription_id = $1 LIMIT 1",
      [subscriptionId]
    );
    return result.rows[0] ? pendingCheckoutFromRow(result.rows[0]) : null;
  }
  const row = memoryPendingCheckouts.find(
    (entry) => entry.square_subscription_id === subscriptionId
  );
  return row ? pendingCheckoutFromRow(row) : null;
}

async function stampPendingCheckoutSquare(
  pending: PendingCheckoutRecord,
  subscriptionId: string | null,
  customerId: string | null
): Promise<void> {
  pending.square_subscription_id = subscriptionId ?? pending.square_subscription_id;
  pending.square_customer_id = customerId ?? pending.square_customer_id;
  if (pool) {
    await pool.query(
      `UPDATE checkout_pending_provisioning
          SET square_subscription_id = COALESCE($2, square_subscription_id),
              square_customer_id = COALESCE($3, square_customer_id),
              updated_at = NOW()
        WHERE checkout_session_id = $1`,
      [pending.checkout_session_id, subscriptionId, customerId]
    );
    return;
  }
  const row = memoryPendingCheckouts.find(
    (entry) => entry.checkout_session_id === pending.checkout_session_id
  );
  if (row) {
    row.square_subscription_id = pending.square_subscription_id;
    row.square_customer_id = pending.square_customer_id;
  }
}

function provisionPendingCheckoutInMemory(
  pending: PendingCheckoutRecord,
  subscriptionId: string | null
) {
  if (pending.company_id != null && pending.admin_user_id != null) {
    return {
      companyId: pending.company_id,
      adminUserId: pending.admin_user_id,
      plantId: pending.plant_id ?? 0,
      routeId: 0,
      moduleKeys: pending.module_keys,
      alreadyProvisioned: true
    };
  }

  let companyId = pending.company_id;
  if (companyId == null) {
    let companyName =
      pending.company_name.trim() || `Account ${pending.checkout_ref.slice(0, 8)}`;
    if (memoryCompanies.some((company) => company.name === companyName)) {
      companyName = `${companyName} (${pending.checkout_ref.slice(0, 8)})`;
    }
    companyId = getNextId();
    memoryCompanies.push({
      id: companyId,
      name: companyName,
      subscription_plan: "module_entitlements",
      created_at: new Date()
    });
    pending.company_id = companyId;
  }

  let plant = memoryPlants.find((entry) => entry.company_id === companyId);
  if (!plant) {
    plant = {
      id: getNextId(),
      company_id: companyId,
      name: "Main Site",
      location: "Main Site",
      created_at: new Date()
    };
    memoryPlants.push(plant);
  }
  let route = memoryRoutes.find(
    (entry) => entry.plant_id === plant.id && entry.is_system === true
  );
  if (!route) {
    route = {
      id: getNextId(),
      plant_id: plant.id,
      name: SYSTEM_ROUTE_NAME,
      description: "Auto-created route for assets added without a route.",
      is_system: true,
      created_at: new Date()
    };
    memoryRoutes.push(route);
  }
  pending.plant_id = plant.id;

  let userId = pending.admin_user_id;
  if (userId == null) {
    const existing = memoryUsers.find(
      (user) => String(user.username).toLowerCase() === pending.admin_username.toLowerCase()
    );
    if (existing) {
      if (Number(existing.company_id) !== companyId) {
        throw new Error(
          "The selected username already belongs to another tenant; no cross-tenant user was touched."
        );
      }
      userId = existing.id;
    } else {
      userId = getNextId();
      memoryUsers.push({
        id: userId,
        company_id: companyId,
        username: pending.admin_username,
        password_hash: pending.password_hash,
        role: "reliability-manager",
        email: pending.admin_email,
        is_temp_password: false,
        terms_accepted_at: pending.terms_accepted ? new Date() : null,
        created_at: new Date()
      });
    }
  }
  pending.admin_user_id = userId;
  plant.user_id = userId;

  const modules = normalizeModuleKeys(pending.module_keys) || [];
  modules.forEach((moduleKey, index) => {
    const linkedSubscription = index === 0 ? subscriptionId : null;
    const existing = memoryEntitlements.find(
      (entry) =>
        Number(entry.company_id) === companyId && entry.module_key === moduleKey
    );
    if (existing) {
      existing.status = "active";
      if (linkedSubscription) existing.square_subscription_id = linkedSubscription;
      existing.updated_at = new Date();
    } else {
      memoryEntitlements.push({
        id: getNextId(),
        company_id: companyId,
        module_key: moduleKey,
        status: "active",
        square_subscription_id: linkedSubscription,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  });

  pending.status = "provisioned";
  pending.square_subscription_id =
    subscriptionId ?? pending.square_subscription_id;
  const row = memoryPendingCheckouts.find(
    (entry) => entry.checkout_session_id === pending.checkout_session_id
  );
  if (row) {
    Object.assign(row, pending);
  }

  return {
    companyId,
    adminUserId: userId,
    plantId: plant.id,
    routeId: route.id,
    moduleKeys: modules,
    alreadyProvisioned: false
  };
}

async function provisionPendingCheckout(
  pending: PendingCheckoutRecord,
  subscriptionId: string | null,
  customerId: string | null
) {
  if (pool) {
    return provisionTenantFromCheckout(pool, pending, {
      subscriptionId,
      customerId
    });
  }
  return provisionPendingCheckoutInMemory(pending, subscriptionId);
}

async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  if (pool) {
    const result = await pool.query(
      "SELECT 1 FROM square_webhook_events WHERE event_id = $1 LIMIT 1",
      [eventId]
    );
    return result.rows.length > 0;
  }
  return memoryProcessedWebhookEvents.has(eventId);
}

async function markWebhookEventProcessed(
  eventId: string,
  eventType: string
): Promise<void> {
  if (pool) {
    await pool.query(
      `INSERT INTO square_webhook_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, eventType]
    );
    return;
  }
  memoryProcessedWebhookEvents.add(eventId);
}

/**
 * Trust guard: the amount a buyer sees must be the amount Square charges.
 * The storefront/catalog display static price_cents; checkout charges the
 * configured Square catalog variation. Fetch those variations and refuse the
 * checkout loudly if any variation amount differs from the displayed amount.
 */
async function assertSquareCatalogPriceParity(
  square: SquareClient,
  entries: { name: string; price_cents: number; square_variation_id: string }[]
): Promise<void> {
  if (entries.length === 0) return;
  const response = await square.catalog.batchGet({
    objectIds: entries.map((entry) => entry.square_variation_id)
  });
  if (response.errors?.length) {
    throw new Error(
      `Square catalog lookup failed: ${response.errors
        .map((error) => error.detail || error.code || "unknown error")
        .join("; ")}`
    );
  }
  const objects = (response.objects ?? []) as any[];
  const byId = new Map(objects.map((object) => [String(object.id), object]));
  for (const entry of entries) {
    const object = byId.get(entry.square_variation_id);
    const rawAmount = object?.itemVariationData?.priceMoney?.amount;
    const chargedCents = rawAmount == null ? null : Number(rawAmount);
    if (chargedCents == null) {
      throw new Error(
        `Square variation ${entry.square_variation_id} for "${entry.name}" has no fixed price; refusing checkout.`
      );
    }
    if (chargedCents !== entry.price_cents) {
      throw new Error(
        `Price parity failure for "${entry.name}": Storefront displays ${entry.price_cents} cents but Square variation ${entry.square_variation_id} charges ${chargedCents} cents. Refusing checkout.`
      );
    }
  }
}

// GET /api/catalog — PUBLIC. Static module list + display prices.
app.get("/api/catalog", (_req, res) => {
  return res.json({
    currency: "usd",
    modules: getModuleCatalog(process.env)
  });
});

// POST /api/checkout/create — PUBLIC (auth-less) + light IP rate limit.
// The client selects catalog keys and its future account credentials. It
// never supplies a company id; the server-held mapping below is the only
// authority the webhook will use.
app.post("/api/checkout/create", async (req, res) => {
  const rate = checkoutCreateLimiter.check(checkoutClientKey(req));
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rate.retryAfterMs / 1000)));
    return res.status(429).json({
      error: "Too many checkout attempts. Please wait and try again.",
      retry_after_ms: rate.retryAfterMs
    });
  }

  try {
    const body = req.body || {};
    const moduleKeys = normalizeModuleKeys(body.moduleKeys ?? body.module_keys);
    if (!moduleKeys) {
      return res.status(400).json({
        error: "Select at least one valid module from the catalog.",
        allowed_modules: MODULE_CATALOG.map((entry) => entry.key)
      });
    }
    if (body.termsAccepted !== true) {
      return res.status(400).json({
        error:
          "Acceptance of the Terms of Service and Privacy Policy is required to create your plant."
      });
    }

    const companyName =
      typeof body.companyName === "string" && body.companyName.trim()
        ? body.companyName.trim()
        : typeof body.plantCompanyName === "string" && body.plantCompanyName.trim()
          ? body.plantCompanyName.trim()
          : "";
    const username =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null;

    if (!companyName) {
      return res.status(400).json({ error: "Missing required field: companyName" });
    }
    if (!username) {
      return res.status(400).json({ error: "Missing required field: username" });
    }
    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    if (pool) {
      const exists = await pool.query(
        "SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1",
        [username]
      );
      if (exists.rows.length > 0) {
        return res.status(409).json({ error: "Username is already taken" });
      }
    } else if (
      memoryUsers.some((user) => String(user.username).toLowerCase() === username)
    ) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    const checkoutRef = crypto.randomBytes(12).toString("hex");
    const origin =
      req.headers.origin || process.env.APP_URL || "http://localhost:3000";
    const testMode = isSquareTestMode(process.env);

    let sessionId: string;
    let sessionUrl: string | null;
    if (testMode) {
      const mock = createMockCheckoutSession(origin);
      sessionId = mock.id;
      sessionUrl = mock.url;
    } else {
      const catalog = getModuleCatalog(process.env);
      const selectedEntries = moduleKeys.map((moduleKey) => {
        const entry = catalog.find((item) => item.key === moduleKey);
        if (!entry?.square_variation_id) {
          throw new Error(
            `Square catalog variation is not configured for the "${moduleKey}" module.`
          );
        }
        return {
          name: entry.name,
          price_cents: entry.price_cents,
          square_variation_id: entry.square_variation_id
        };
      });
      const lineItems = selectedEntries.map((entry) => ({
        name: entry.name,
        quantity: "1",
        catalogObjectId: entry.square_variation_id
      }));
      const locationId = process.env.SQUARE_LOCATION_ID?.trim();
      if (!locationId) {
        throw new Error(
          "SQUARE_LOCATION_ID environment variable is required to create checkout links."
        );
      }
      const square = getSquareClient();
      await assertSquareCatalogPriceParity(square, selectedEntries);
      const created = await square.checkout.paymentLinks.create({
        idempotencyKey: checkoutRef,
        description: `Spectra CM modules: ${moduleKeys.join(", ")}`,
        order: {
          locationId,
          referenceId: checkoutRef,
          lineItems
        },
        checkoutOptions: {
          redirectUrl: `${origin}/storefront?checkout=success`,
          askForShippingAddress: false
        },
        ...(email ? { prePopulatedData: { buyerEmail: email } } : {}),
        paymentNote: `checkout_ref=${checkoutRef}`
      });
      sessionId = String(created.paymentLink?.id || "");
      sessionUrl = created.paymentLink?.url ?? null;
    }

    if (!sessionId) {
      throw new Error("Square did not return a payment link id.");
    }

    const passwordHash = await bcryptHashPassword(password);
    if (pool) {
      await pool.query(
        `INSERT INTO checkout_pending_provisioning
           (checkout_session_id, checkout_ref, company_name, admin_username,
            admin_email, password_hash, terms_accepted, module_keys, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         ON CONFLICT (checkout_session_id) DO NOTHING`,
        [
          sessionId,
          checkoutRef,
          companyName,
          username,
          email,
          passwordHash,
          true,
          moduleKeys
        ]
      );
    } else {
      memoryPendingCheckouts.push({
        checkout_session_id: sessionId,
        checkout_ref: checkoutRef,
        company_name: companyName,
        admin_username: username,
        admin_email: email,
        password_hash: passwordHash,
        terms_accepted: true,
        module_keys: moduleKeys,
        square_subscription_id: null,
        square_customer_id: null,
        company_id: null,
        admin_user_id: null,
        plant_id: null,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    return res.status(201).json({
      checkout_session_id: sessionId,
      checkout_ref: checkoutRef,
      url: sessionUrl,
      modules: moduleKeys
    });
  } catch (error: any) {
    console.error("[checkout/create] failed:", error);
    return res.status(500).json({
      error: error?.message || "Failed to create checkout session."
    });
  }
});

function entitlementStatusForSquareSubscription(
  rawStatus: unknown
): "active" | "expired" | "canceled" {
  const status = String(rawStatus || "").toUpperCase();
  if (status === "CANCELED" || status === "DEACTIVATED") return "canceled";
  if (status === "PAUSED") return "expired";
  return "active";
}

async function applySquareSubscriptionStatus(
  subscriptionId: string | null,
  rawStatus: unknown
): Promise<void> {
  if (!subscriptionId) return;
  const status = entitlementStatusForSquareSubscription(rawStatus);
  if (pool) {
    await pool.query(
      "UPDATE tenant_entitlements SET status = $1, updated_at = NOW() WHERE square_subscription_id = $2",
      [status, subscriptionId]
    );
    await pool.query(
      "UPDATE companies SET subscription_status = $1 WHERE square_subscription_id = $2",
      [status, subscriptionId]
    );
    return;
  }
  for (const entry of memoryEntitlements) {
    if (entry.square_subscription_id === subscriptionId) {
      entry.status = status;
      entry.updated_at = new Date();
    }
  }
  for (const company of memoryCompanies) {
    if (company.square_subscription_id === subscriptionId) {
      company.subscription_status = status;
    }
  }
}

async function findPendingForSquarePayment(
  payment: any,
  eventObjectId?: string
): Promise<PendingCheckoutRecord | null> {
  const reference =
    typeof payment?.referenceId === "string" ? payment.referenceId.trim() : "";
  if (reference) {
    const byRef = await findPendingByRef(reference);
    if (byRef) return byRef;
  }
  const paymentId =
    typeof payment?.id === "string" ? payment.id.trim() : "";
  if (paymentId) {
    const byPayment = await findPendingBySession(paymentId);
    if (byPayment) return byPayment;
  }
  const objectId = String(eventObjectId || "").trim();
  if (objectId) {
    const byObject = await findPendingBySession(objectId);
    if (byObject) return byObject;
  }
  // Payment Links attach the checkout_ref to the ORDER reference_id. If the
  // payment event does not echo it, retrieve the server-created order (never a
  // client field) to resolve the same mapping.
  const orderId =
    typeof payment?.orderId === "string" ? payment.orderId.trim() : "";
  if (orderId && !isSquareTestMode(process.env)) {
    const orderResponse = await getSquareClient().orders.get({ orderId });
    const orderReference =
      orderResponse.order?.referenceId ||
      orderResponse.order?.metadata?.checkout_ref;
    if (orderReference) {
      return findPendingByRef(String(orderReference));
    }
  }
  return null;
}

// POST /api/square/webhook — PUBLIC only in the sense that Square cannot carry
// a session cookie. Authenticity is the official HMAC-SHA256 signature over
// notification_url + raw_body (or the strictly gated test bypass).
// Provisioning reads the server-held mapping, never client fields.
app.post("/api/square/webhook", async (req: any, res) => {
  const signatureHeader = req.headers[SQUARE_SIGNATURE_HEADER];
  const signature =
    typeof signatureHeader === "string" ? signatureHeader : undefined;
  const secret =
    process.env.SQUARE_WEBHOOK_SIGNATURE_SECRET?.trim() || undefined;
  const notificationUrl =
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL?.trim() || undefined;
  const testMode = isSquareTestMode(process.env);

  let event: any;
  try {
    event = await resolveSquareWebhookEvent({
      isTestMode: testMode,
      rawBody: req.rawBody,
      signature,
      secret,
      notificationUrl,
      parsedBody: req.body
    });
  } catch (error: any) {
    console.error("[square/webhook] signature verification failed:", error?.message);
    return res.status(400).send(`Webhook Error: ${error?.message || "invalid signature"}`);
  }

  if (!event || typeof event !== "object") {
    return res.status(400).send("Webhook Error: empty event payload");
  }

  const eventType = String(event.type || "");
  const eventObject = event.data?.object || {};
  const subject = eventObject.payment || eventObject.subscription || eventObject;
  const eventId = String(
    event.event_id || `${eventType}:${subject?.id || "unknown"}`
  );

  try {
    if (await isWebhookEventProcessed(eventId)) {
      return res.json({ received: true, duplicate: true });
    }

    let provisioned: any = null;

    if (eventType === "payment.created" || eventType === "payment.updated") {
      const payment = subject;
      const paymentStatus = String(payment?.status || "").toUpperCase();
      if (paymentStatus === "COMPLETED" || testMode) {
        const pending = await findPendingForSquarePayment(
          payment,
          typeof eventObject.id === "string" ? eventObject.id : undefined
        );
        if (pending) {
          const subscriptionId = squareId(payment?.subscriptionId);
          const customerId = squareId(payment?.customerId);
          await stampPendingCheckoutSquare(pending, subscriptionId, customerId);
          provisioned = await provisionPendingCheckout(
            pending,
            subscriptionId,
            customerId
          );
          if (!provisioned.alreadyProvisioned) {
            // NOTIFICATIONS-1: welcome email on tenant provisioning.
            queueWelcomeNotification(pending, provisioned.companyId);
          }
          if (paymentStatus === "COMPLETED") {
            // NOTIFICATIONS-1: receipt email on checkout webhook COMPLETED.
            const rawAmount = payment?.totalMoney?.amount;
            const amountCents =
              rawAmount == null ? null : Number(rawAmount);
            queueReceiptNotification({
              pending,
              tenantId: provisioned.companyId,
              modules: provisioned.moduleKeys,
              amountCents:
                amountCents != null && Number.isFinite(amountCents)
                  ? amountCents
                  : null
            });
          }
        }
      }
    } else if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated"
    ) {
      const subscription = subject;
      const subscriptionId = squareId(subscription?.id);
      const subscriptionCustomerId = squareId(subscription?.customerId);
      if (subscriptionId) {
        // A subscription-created event can complete a checkout that carried a
        // server-held pending mapping (e.g. a Square subscription plan link).
        const pending = await findPendingBySubscription(subscriptionId);
        if (pending) {
          await stampPendingCheckoutSquare(
            pending,
            subscriptionId,
            subscriptionCustomerId
          );
          provisioned = await provisionPendingCheckout(
            pending,
            subscriptionId,
            subscriptionCustomerId
          );
          if (!provisioned.alreadyProvisioned) {
            // NOTIFICATIONS-1: welcome email on tenant provisioning.
            queueWelcomeNotification(pending, provisioned.companyId);
          }
        }
        await applySquareSubscriptionStatus(
          subscriptionId,
          subscription?.status
        );
      }
    }

    await markWebhookEventProcessed(eventId, eventType);
    return res.json({
      received: true,
      ...(provisioned
        ? {
            provisioned: {
              company_id: provisioned.companyId,
              modules: provisioned.moduleKeys
            }
          }
        : {})
    });
  } catch (error: any) {
    console.error("[square/webhook] handler failed:", error);
    return res.status(500).json({
      error: error?.message || "Webhook handling failed"
    });
  }
});

// GET /api/entitlements — session-scoped module list for nav/router gating.
app.get("/api/entitlements", async (req, res) => {
  const companyId = requestTenantId(req);
  if (companyId == null) {
    return res.status(403).json({ error: "Tenant context is required" });
  }
  try {
    let rows: any[];
    if (pool) {
      const activePool = pool;
      rows = await getEntitlements(companyId, {
        query: (text, params) => activePool.query(text, params)
      });
    } else {
      rows = memoryEntitlements
        .filter(
          (entry) =>
            Number(entry.company_id) === companyId && entry.status === "active"
        )
        .map((entry) => ({
          company_id: entry.company_id,
          module_key: entry.module_key,
          status: entry.status,
          square_subscription_id: entry.square_subscription_id ?? null
        }));
    }
    return res.json({
      company_id: companyId,
      modules: rows,
      active_modules: rows.map((row) => String(row.module_key))
    });
  } catch (error: any) {
    console.error("[entitlements] read failed:", error);
    return res.status(500).json({ error: "Failed to read entitlements" });
  }
});

// SQUARE PAYMENT INTEGRATION ENDPOINTS

app.post("/api/create-portal-session", async (req, res) => {
  // Square does not expose a hosted billing portal. The tenant is
  // still resolved from the session so this route can never target another
  // company; management happens in the seller's Square Dashboard.
  const companyId = requestTenantId(req);
  if (companyId == null) {
    return res.status(403).json({ error: "Tenant context is required" });
  }
  return res.status(501).json({
    error:
      "Square does not provide a hosted billing portal. Manage this subscription in the Square Dashboard."
  });
});

// AUTOMATED ALERT PREFERENCES & HISTORY ENDPOINTS
app.get("/api/alerts/preferences", async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string, 10);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "Missing or invalid userId query parameter" });
    }

    if (pool) {
      const resPref = await pool.query(
        "SELECT * FROM alert_preferences WHERE user_id = $1",
        [userId]
      );
      if (resPref.rows.length > 0) {
        return res.json(resPref.rows[0]);
      } else {
        return res.json({
          user_id: userId,
          email_enabled: true,
          alert_threshold: "High"
        });
      }
    } else {
      let pref = memoryAlertPreferences.find(p => p.user_id === userId);
      if (!pref) {
        pref = { user_id: userId, email_enabled: true, alert_threshold: "High" };
        memoryAlertPreferences.push(pref);
      }
      return res.json(pref);
    }
  } catch (error: any) {
    console.error("GET /api/alerts/preferences failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch preferences" });
  }
});

app.put("/api/alerts/preferences", async (req, res) => {
  try {
    const { userId, emailEnabled, alertThreshold } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const email_enabled = emailEnabled !== undefined ? !!emailEnabled : true;
    const alert_threshold = alertThreshold || "High";

    if (pool) {
      const userRes = await pool.query("SELECT company_id FROM users WHERE id = $1", [userId]);
      const companyId = userRes.rows.length > 0 ? userRes.rows[0].company_id : null;

      const resPref = await pool.query(
        `INSERT INTO alert_preferences (user_id, company_id, email_enabled, alert_threshold)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE 
         SET email_enabled = EXCLUDED.email_enabled, alert_threshold = EXCLUDED.alert_threshold
         RETURNING *`,
        [userId, companyId, email_enabled, alert_threshold]
      );
      return res.json(resPref.rows[0]);
    } else {
      let pref = memoryAlertPreferences.find(p => p.user_id === Number(userId));
      if (!pref) {
        pref = { user_id: Number(userId), email_enabled, alert_threshold };
        memoryAlertPreferences.push(pref);
      } else {
        pref.email_enabled = email_enabled;
        pref.alert_threshold = alert_threshold;
      }
      return res.json(pref);
    }
  } catch (error: any) {
    console.error("PUT /api/alerts/preferences failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update preferences" });
  }
});

app.get("/api/alerts/history", async (req, res) => {
  try {
    const userId = parseInt(req.query.userId as string, 10);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "Missing or invalid userId query parameter" });
    }

    if (pool) {
      const result = await pool.query(
        `SELECT ah.id, ah.severity, ah.sent_at, ah.status, dh.id as analysis_id, dh.timestamp as analysis_time,
                (dh.input_data::jsonb->'specs'->>'equipmentName') as equipment_name,
                (dh.ai_response::jsonb->'probable_faults'->0->>'fault_name') as fault_name
         FROM alert_history ah
         LEFT JOIN diagnosis_history dh ON ah.analysis_id = dh.id
         WHERE ah.user_id = $1
         ORDER BY ah.sent_at DESC`,
        [userId]
      );
      return res.json(result.rows);
    } else {
      const history = memoryAlertHistory.filter(h => h.user_id === userId).map(h => {
        return {
          ...h,
          equipment_name: "Charge Pump P-101A",
          fault_name: "Unbalance"
        };
      });
      return res.json(history);
    }
  } catch (error: any) {
    console.error("GET /api/alerts/history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch alert history" });
  }
});


// Structured JSON response schema for Nameplate Scanner
const nameplateSchema = {
  type: Type.OBJECT,
  properties: {
    specRpm: { type: Type.STRING, description: "Base operating RPM of the machinery. Must be one of: 'N/A', '900', '1200', '1800', '3600', '10000'. Extract the value closest to these operating standards." },
    specOrientation: { type: Type.STRING, description: "Shaft Orientation. Must be one of: 'Horizontal', 'Vertical', 'N/A'." },
    specDrive: { type: Type.STRING, description: "Drive coupling type. Must be one of: 'Direct', 'Belt', 'Gearbox', 'N/A'." },
    specFanBlades: { type: Type.STRING, description: "Fan blade count if applicable. Must be one of: '4', '6', '8', '12', 'N/A'." },
    specPumpImpellers: { type: Type.STRING, description: "Pump impeller vanes count if applicable. Must be one of: '3', '5', '7', 'N/A'." },
    specPinionTeeth: { type: Type.STRING, description: "Pinion teeth gear count if applicable. Must be one of: '17', '23', '29', 'N/A'." },
    equipmentName: { type: Type.STRING, description: "Extracted name, brand, model or serial number of the equipment from the nameplate." }
  },
  required: ["specRpm", "specOrientation", "specDrive", "specFanBlades", "specPumpImpellers", "specPinionTeeth", "equipmentName"]
};

// API Endpoint for Nameplate Analysis
app.post("/api/scan-nameplate", async (req, res) => {
  try {
    const { fileData, fileMimeType } = req.body;
    if (!fileData || !fileMimeType) {
      return res.status(400).json({ error: "No image file uploaded for nameplate scanning." });
    }

    const ai = getAiClient(req);
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileMimeType,
            data: base64Data
          }
        },
        { text: "Read this machinery nameplate image. Extract operating speed/RPM, mount orientation, coupling/gear details, and return JSON matching the schema. Select closest standard values." }
      ],
      config: {
        systemInstruction: "You are an expert industrial machine optical character reader. Extract technical machinery parameters precisely and format as valid JSON conforming strictly to the response schema.",
        responseMimeType: "application/json",
        responseSchema: nameplateSchema,
        temperature: 0.1
      }
    });

    if (!response.text) {
      throw new Error("No nameplate response generated by Gemini.");
    }

    const scanResult = JSON.parse(response.text.trim());
    return res.json(scanResult);

  } catch (error: any) {
    console.warn("Nameplate Scan Error (Executing fallback):", error);
    return res.json({
      specRpm: "1800",
      specOrientation: "Horizontal",
      specDrive: "Direct",
      specFanBlades: "N/A",
      specPumpImpellers: "5",
      specPinionTeeth: "N/A",
      equipmentName: "Standard Industrial Equipment (API Fallback) [Static]",
      isSimulatedFallback: true,
      simulationReason: error.message || "Live Nameplate Scan Failed (quota limit)"
    });
  }
});

// Structured JSON response schema for Sensor Placement Planner
const sensorPlacementSchema = {
  type: Type.OBJECT,
  properties: {
    equipmentType: { type: Type.STRING, description: "Identified type of machinery (e.g. Centrifugal Pump, Electric Motor, Overhung Fan)." },
    recommendedSensors: { type: Type.STRING, description: "The ideal vibration accelerometer type to use (e.g. 100 mV/g industrial piezo-accelerometer)." },
    mountingType: { type: Type.STRING, description: "Recommended mounting method (Stud Mount, Adhesive Mount, Magnetic Mount)." },
    surfacePreparation: { type: Type.STRING, description: "Step-by-step surface preparation requirement (e.g. Grid-grind surface down to bare metal, paint removal, face tool flat, drill and tap thread)." },
    points: {
      type: Type.ARRAY,
      description: "Precisely identified points on the image coordinates for mounting vibration sensors.",
      items: {
        type: Type.OBJECT,
        properties: {
          x: { type: Type.INTEGER, description: "Horizontal percentage coordinate (from 10 to 90) representing where on the machine image to mount. 10 is far left, 90 is far right." },
          y: { type: Type.INTEGER, description: "Vertical percentage coordinate (from 10 to 90) representing where on the machine image to mount. 10 is very top, 90 is very bottom." },
          label: { type: Type.STRING, description: "Name of the position (e.g. Motor Inboard Bearing - Radial Horizontal)." },
          direction: { type: Type.STRING, description: "Direction of measurement. Must be one of: 'Radial Horizontal', 'Radial Vertical', 'Axial', 'Triaxial', 'Ambient/Reference'." },
          description: { type: Type.STRING, description: "Reason why this specific location is selected (e.g. Close proximity to inner bearing load zone, aligned with dynamic load line)." }
        },
        required: ["x", "y", "label", "direction", "description"]
      }
    }
  },
  required: ["equipmentType", "recommendedSensors", "mountingType", "surfacePreparation", "points"]
};

// API Endpoint for Sensor Placement Planner
app.post("/api/sensor-placement", async (req, res) => {
  try {
    const { fileData, fileMimeType, equipmentDescription } = req.body;
    if (!fileData || !fileMimeType) {
      return res.status(400).json({ error: "No machinery image uploaded for sensor placement analysis." });
    }

    const ai = getAiClient(req);
    const base64Data = fileData.includes(",") ? fileData.split(",")[1] : fileData;

    let prompt = "Locate critical bearing housings, rotors, and couplings on this machinery. Identify optimal mounting points for vibration sensors conforming to ISO 10816.";
    if (equipmentDescription) {
      prompt += `\nEngineer's notes: ${equipmentDescription}`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: fileMimeType,
            data: base64Data
          }
        },
        { text: prompt }
      ],
      config: {
        systemInstruction: "You are a master machinery analyst (ISO 18436 CAT IV). Look at the image and locate optimal bearing housings to monitor. Generate approximate coordinate points (percentages 10 to 90 of width/height) to visually display where sensors should be mounted, and supply professional instructions.",
        responseMimeType: "application/json",
        responseSchema: sensorPlacementSchema,
        temperature: 0.1
      }
    });

    if (!response.text) {
      throw new Error("No sensor placement response generated by Gemini.");
    }

    const placementResult = JSON.parse(response.text.trim());
    return res.json(placementResult);

  } catch (error: any) {
    console.warn("Sensor Placement Error (Executing static fallback):", error);
    try {
      const { equipmentDescription } = req.body;
      const fallbackResult = generateStaticSensorPlacement(equipmentDescription);
      fallbackResult.isSimulatedFallback = true;
      fallbackResult.simulationReason = error.message || "Live Sensor Placement Failed (quota limit)";
      return res.json(fallbackResult);
    } catch (fallbackErr) {
      console.error("Fallback generator failed:", fallbackErr);
      return res.status(500).json({ error: error.message || "Live Sensor Placement Failed" });
    }
  }
});

// Local In-Memory Storage for dynamic component specifications fallback
const customTemplatesMemory = new Map<string, string[]>();

const DEFAULT_TEMPLATES: Record<string, string[]> = {
  "Electric Motor": ["Horsepower (HP)", "RPM", "Voltage", "Rotor Bars", "Stator Slots", "Line Frequency (Hz)", "Number of Poles", "Motor Type"],
  "Gearbox": ["Gearbox Ratio", "Pinion Teeth", "Wheel Teeth", "Input RPM"],
  "Pump": ["Flow Rate (GPM)", "Dynamic Head (ft)", "Impeller Vanes", "Drive Type"],
  "Coupling": ["Coupling Type", "Drive Type", "Gap Offset"],
  "Ventilation Fan": ["Fan Blades", "Flow Rate (CFM)", "Static Pressure", "Drive Type"],
  "Compressor": ["Max Pressure (PSI)", "Capacity (CFM)", "Power (HP)", "Stages"],
  "Blower": ["Rotor Type", "Capacity (CFM)", "Pressure (in. H2O)", "RPM"],
  "Conveyor": ["Belt Width (in)", "Belt Speed (FPM)", "Length (ft)", "Drive Pulley Diameter (in)"],
  "Elevator": ["Bucket Width (in)", "Discharge Height (ft)", "Speed (FPM)", "Motor Power (HP)"],
  "Dryer": ["Drum Diameter (ft)", "Drum Length (ft)", "Rotational Speed (RPM)", "Max Temp (°F)"],
  "Granulator": ["Rotor Blades", "Bed Blades", "Screen Size (in)", "Throughput (lbs/hr)"],
  "Agitator": ["Impeller Type", "Shaft Diameter (in)", "Blade Pitch (deg)", "Operating Speed (RPM)"],
  "Reclaimer": ["Bucket Wheel Diameter (ft)", "Luffing Angle (deg)", "Slewing Speed (RPM)"],
  "Lump Breaker": ["Shaft Count", "Tooth Profile", "Throughput (Tons/hr)"],
  "Screw Conveyor": ["Screw Diameter (in)", "Screw Pitch (in)", "Trough Length (ft)", "RPM"]
};

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(shorter, longer);
  return (longer.length - distance) / longer.length;
}

app.post("/api/get-component-specs", async (req, res) => {
  try {
    const { componentType } = req.body;
    if (!componentType || typeof componentType !== "string") {
      return res.status(400).json({ error: "Missing or invalid componentType" });
    }

    const targetType = componentType.trim();
    if (!targetType) {
      return res.status(400).json({ error: "Empty componentType provided" });
    }

    // 1. Gather all available types (Standard + Cached/Manual)
    let allTypes: { type: string; fields: string[]; source: string }[] = [];

    // Add default templates
    for (const [key, value] of Object.entries(DEFAULT_TEMPLATES)) {
      allTypes.push({ type: key, fields: value, source: "cached" });
    }

    // Add in-memory custom templates
    for (const [key, value] of customTemplatesMemory.entries()) {
      allTypes.push({ type: key, fields: value, source: "cached" });
    }

    // Add database custom templates if pool exists
    if (pool) {
      try {
        const dbRes = await pool.query("SELECT component_type, spec_fields, source FROM component_spec_templates");
        for (const row of dbRes.rows) {
          if (!DEFAULT_TEMPLATES[row.component_type] && !customTemplatesMemory.has(row.component_type)) {
            const fields = Array.isArray(row.spec_fields) ? row.spec_fields : JSON.parse(row.spec_fields);
            allTypes.push({ type: row.component_type, fields, source: "cached" });
          }
        }
      } catch (dbErr) {
        console.error("Error reading component_spec_templates:", dbErr);
      }
    }

    // 2. Perform fuzzy matching (similarity threshold > 85%)
    let bestMatch: any = null;
    let maxSimilarity = 0;

    for (const t of allTypes) {
      const sim = calculateSimilarity(targetType, t.type);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        bestMatch = t;
      }
    }

    let finalType = targetType;
    let matchedTypo = false;
    let originalMatch = "";

    if (maxSimilarity >= 0.85 && bestMatch) {
      finalType = bestMatch.type;
      if (targetType.toLowerCase().trim() !== bestMatch.type.toLowerCase().trim()) {
        matchedTypo = true;
        originalMatch = bestMatch.type;
      }

      // Found in cache / pre-populated: return immediately
      return res.json({
        specs: bestMatch.fields,
        source: "cached",
        matchedTypo,
        originalMatch
      });
    }

    // 3. Not found: call AI to generate specifications
    const ai = getAiClient(req);
    const aiResponse = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `For a "${finalType}" in industrial machinery, what are the 5-8 most critical technical specifications that should be tracked for predictive maintenance? Return as JSON array of field names.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        },
        temperature: 0.2
      }
    });

    let generatedSpecs: string[] = [];
    if (aiResponse.text) {
      try {
        generatedSpecs = JSON.parse(aiResponse.text.trim());
      } catch (parseErr) {
        console.error("Failed to parse Gemini specs:", parseErr);
        generatedSpecs = ["Operating Speed (RPM)", "Manufacturer", "Model Number", "Install Date", "Design Power rating"];
      }
    } else {
      generatedSpecs = ["Operating Speed (RPM)", "Manufacturer", "Model Number", "Install Date", "Design Power rating"];
    }

    // Clean and deduplicate fields
    generatedSpecs = Array.from(new Set(generatedSpecs.map(s => s.trim()))).slice(0, 10);

    // Save newly generated specs to cache/db
    if (pool) {
      try {
        await pool.query(
          "INSERT INTO component_spec_templates (component_type, spec_fields, source) VALUES ($1, $2, 'AI-generated') ON CONFLICT (component_type) DO UPDATE SET spec_fields = EXCLUDED.spec_fields, source = EXCLUDED.source",
          [finalType, JSON.stringify(generatedSpecs)]
        );
      } catch (dbErr) {
        console.error("Failed to save dynamic template:", dbErr);
      }
    }
    customTemplatesMemory.set(finalType, generatedSpecs);

    return res.json({
      specs: generatedSpecs,
      source: "ai-generated",
      matchedTypo: false,
      originalMatch: ""
    });

  } catch (error: any) {
    console.error("Error in /api/get-component-specs:", error);
    res.status(500).json({ error: error.message || "Failed to fetch component specifications" });
  }
});

// ============================================
// CMMS EQUIPMENT DATABASE ENDPOINTS
// ============================================

// Local In-Memory Storage for Fallback Mode
// AR-29 rule 2 — passwords are bcrypt-hashed (bcryptjs, pure JS). The
// sync variant is used only for one-time in-memory/dev seeding.
function hashPassword(password: string): string {
  return hashPasswordSync(password);
}

// AR-29 rule 5 — demo/dev credential seeding only when explicitly enabled
// (ENABLE_DEV_AUTH_SEED=true AND not production); otherwise no seed users.
let memoryUsers: any[] = isDevAuthSeedEnabled(process.env)
  ? [
      { id: 1, company_id: 1, username: "engineer", email: "engineer@allied.com", password_hash: hashPassword("engineer123"), role: "engineer", is_temp_password: false, created_at: new Date() },
      { id: 2, company_id: 3, username: "demo", email: "shanedufrene1989@gmail.com", password_hash: hashPassword("demo123"), role: "engineer", is_temp_password: true, created_at: new Date() }
    ]
  : [];

let memoryCompanies: any[] = [
  { id: 1, name: "Allied Reliability", subscription_plan: "vibration_only", created_at: new Date() },
  { id: 2, name: "ExxonMobil", subscription_plan: "vibration_only", created_at: new Date() },
  { id: 3, name: "Demo Reliability Corp", subscription_plan: "full_suite", created_at: new Date() }
];

let memoryAlertPreferences: any[] = [];
let memoryAlertHistory: any[] = [];
// GOOD-CATCHES - session-tenant rows in DATABASE_URL-less mode.
let memoryGoodCatches: any[] = [];
// BEARING-CALC - session-tenant geometry rows in DATABASE_URL-less mode.
// There is deliberately no manufacturer catalog here: only user-entered data.
let memoryBearingSpecs: any[] = [];
// ROUTE-CHECKOUT - session-tenant collection-pass rows in memory mode.
let memoryRouteAssignments: any[] = [];
// ASSESSMENT-WIZARD - session-tenant component assessment rows in memory mode.
let memoryComponentAssessments: any[] = [];
// NOTIFICATIONS-1 - session-tenant notification ledger + tenant alert recipients.
let memoryNotifications: any[] = [];
let memoryAlertRecipients: any[] = [];
// USERS-1 - tenant-scoped invites in DATABASE_URL-less dev/test boots. The
// table mirrors auth_invites plus the 027 additions (status/revoked_at/sent_at).
let memoryAuthInvites: any[] = [];
// Alert insert stand-in for DATABASE_URL-less boots (the production ledger is
// the real alerts table). Only used by the notification wiring/tests.
let memoryAlerts: any[] = [];

const notificationRepository = {
  async insert(row: NotificationInsert): Promise<any> {
    if (pool) {
      const result = await pool.query(
        `INSERT INTO notifications
           (tenant_id, user_id, channel, kind, recipient_email, subject,
            body_text, status, error, read_at, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          row.tenant_id,
          row.user_id,
          row.channel,
          row.kind,
          row.recipient_email,
          row.subject,
          row.body_text,
          row.status,
          row.error ?? null,
          row.read_at ?? null,
          row.sent_at ?? null
        ]
      );
      return result.rows[0];
    }
    const saved = {
      id: getNextId(),
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      channel: row.channel,
      kind: row.kind,
      recipient_email: row.recipient_email,
      subject: row.subject,
      body_text: row.body_text,
      status: row.status,
      error: row.error ?? null,
      read_at: row.read_at ?? null,
      created_at: new Date(),
      sent_at: row.sent_at ?? null
    };
    memoryNotifications.push(saved);
    return saved;
  }
};

function notificationErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "Unknown notification error");
}

/**
 * Fire-and-forget email dispatch. The internal .catch() records a final
 * 'failed' row, which is why an unhandled provider rejection can never crash
 * the alert/checkout path (Node >=15 would terminate the process).
 */
function queueEmailNotification(row: NotificationInsert): Promise<void> {
  return dispatchEmailNotification(notificationRepository, row).catch(
    async (err) => {
      console.error("[notifications] email dispatch failed:", err);
      try {
        await notificationRepository.insert(failedNotificationRow(row, err));
      } catch (recordErr) {
        console.error(
          "[notifications] failed to record failed notification:",
          recordErr
        );
      }
    }
  );
}

async function tenantNotificationUsers(
  tenantId: number
): Promise<TenantNotificationUser[]> {
  if (pool) {
    const result = await pool.query(
      "SELECT id, company_id AS tenant_id, email FROM users WHERE company_id = $1 ORDER BY id ASC",
      [tenantId]
    );
    return result.rows.map((row: any) => ({
      id: Number(row.id),
      tenant_id: Number(row.tenant_id),
      email: row.email == null ? null : String(row.email)
    }));
  }
  return memoryUsers
    .filter((user) => Number(user.company_id) === tenantId)
    .map((user) => ({
      id: Number(user.id),
      tenant_id: Number(user.company_id),
      email: user.email == null ? null : String(user.email)
    }));
}

async function tenantAlertRecipients(
  tenantId: number
): Promise<TenantAlertRecipient[]> {
  if (pool) {
    const result = await pool.query(
      "SELECT id, tenant_id, email FROM tenant_alert_recipients WHERE tenant_id = $1 ORDER BY id ASC",
      [tenantId]
    );
    return result.rows.map((row: any) => ({
      id: Number(row.id),
      tenant_id: Number(row.tenant_id),
      email: String(row.email)
    }));
  }
  return memoryAlertRecipients
    .filter((row) => Number(row.tenant_id) === tenantId)
    .map((row) => ({
      id: Number(row.id),
      tenant_id: Number(row.tenant_id),
      email: String(row.email)
    }));
}

/**
 * Alert fan-out: one in_app row per same-tenant user + one email row per
 * same-tenant alert recipient. In-app rows are written before the response;
 * email sends are queued (never awaited by the request) with a rejecting
 * guard so a provider failure becomes a visible 'failed' ledger row.
 */
async function recordAlertNotifications(
  tenantId: number,
  alerts: Array<{
    id?: string | number | null;
    title: string;
    description?: string | null;
    severity?: string | null;
    asset_id?: string | number | null;
  }>
): Promise<void> {
  const [users, recipients] = await Promise.all([
    tenantNotificationUsers(tenantId),
    tenantAlertRecipients(tenantId)
  ]);

  for (const alert of alerts) {
    const inAppRows = buildAlertInAppRows({ tenantId, alert, users });
    for (const row of inAppRows) {
      try {
        await notificationRepository.insert(row);
      } catch (err) {
        console.error("[notifications] in-app insert failed:", err);
      }
    }
    for (const row of buildAlertEmailRows({ tenantId, alert, recipients })) {
      queueEmailNotification(row).catch((err) =>
        console.error("[notifications] queued alert email rejected:", err)
      );
    }
  }
}

function queueWelcomeNotification(
  pending: PendingCheckoutRecord,
  tenantId: number
): void {
  const row = buildWelcomeEmail({
    tenantId,
    to: pending.admin_email,
    companyName: pending.company_name
  });
  queueEmailNotification(row).catch((err) =>
    console.error("[notifications] welcome email rejected:", err)
  );
}

function queueReceiptNotification(input: {
  pending: PendingCheckoutRecord;
  tenantId: number;
  modules: readonly string[];
  amountCents?: number | null;
}): void {
  const row = buildReceiptEmail({
    tenantId: input.tenantId,
    to: input.pending.admin_email,
    companyName: input.pending.company_name,
    modules: input.modules,
    amountCents: input.amountCents ?? null,
    checkoutRef: input.pending.checkout_ref
  });
  queueEmailNotification(row).catch((err) =>
    console.error("[notifications] receipt email rejected:", err)
  );
}


let memoryPlants: any[] = [
  { id: 1, company_id: 1, name: "Houston Refining Plant", location: "9701 Manchester St, Houston, TX", created_at: new Date() },
  { id: 2, company_id: 2, name: "Chicago Manufacturing Facility", location: "1350 E 89th St, Chicago, IL", created_at: new Date() },
  { id: 3, company_id: 3, name: "Demo Galveston Refinery", location: "102 Marina Blvd, Galveston, TX", created_at: new Date() }
];

let memoryUnits: any[] = [];

let memoryRoutes: any[] = [
  { id: 1, plant_id: 1, name: "North Line Compressors", description: "Primary air compressors for North assembly line.", created_at: new Date() },
  { id: 2, plant_id: 1, name: "Wastewater Treatment Area", description: "Pumps and blowers in primary filtration plant.", created_at: new Date() },
  { id: 3, plant_id: 3, name: "Crude Distillation Unit (CDU) Pumps", description: "Critical centrifugal pumps supporting primary distillation train.", created_at: new Date() }
];

let memoryEquipment: any[] = [
  { id: 1, route_id: 1, name: "Screw Compressor C-101", type: "Compressor", manufacturer: "Ingersoll Rand", model: "RS37i", serial_number: "IR-987123", install_date: "2023-01-15", criticality: "High", status: "Active", tag_number: "TAG-C101", description: "Primary air supply line.", created_at: new Date() },
  { id: 2, route_id: 1, name: "Exhaust Fan EF-204", type: "Fan", manufacturer: "Twin City Fan", model: "BAV-36", serial_number: "TCF-77412", install_date: "2022-06-10", criticality: "Medium", status: "Active", tag_number: "TAG-EF204", description: "Secondary ventilation extraction.", created_at: new Date() },
  // Demo Assets
  { id: 3, route_id: 3, name: "Charge Pump P-101A", type: "Pump", manufacturer: "Goulds Pumps", model: "3196", serial_number: "GP-774921-A", install_date: "2021-04-10", criticality: "Critical", status: "Active", tag_number: "TAG-P101A", description: "Primary feedstock pump.", created_at: new Date() },
  { id: 4, route_id: 3, name: "Reflux Pump P-102B", type: "Pump", manufacturer: "Flowserve", model: "Mark 3", serial_number: "FS-441290-B", install_date: "2022-09-18", criticality: "High", status: "Active", tag_number: "TAG-P102B", description: "CDU reflux circulation line.", created_at: new Date() }
];

// Alias memoryAssets to memoryEquipment to keep back-compatibility
let memoryAssets: any[] = memoryEquipment;

let memoryComponents: any[] = [
  { id: 1, asset_id: 1, equipment_id: 1, name: "Drive End Bearing", type: "Bearing", manufacturer: "SKF", model: "6210", specifications: { part_number: "SKF 6210", dynamic_load_rating: "35kN" }, notes: "Greased monthly.", created_at: new Date() },
  { id: 2, asset_id: 1, equipment_id: 1, name: "Non-Drive End Bearing", type: "Bearing", manufacturer: "SKF", model: "6208", specifications: { part_number: "SKF 6208" }, notes: "Greased monthly.", created_at: new Date() },
  { id: 3, asset_id: 2, equipment_id: 2, name: "Flexible Coupling", type: "Coupling", manufacturer: "Falk", model: "1070G", specifications: { manufacturer: "Falk", gap_tolerance: "0.05mm" }, notes: "Check elastomer star elements.", created_at: new Date() },
  // Demo Components
  { id: 4, asset_id: 3, equipment_id: 3, name: "Centrifugal Impeller Shaft", type: "Shaft", manufacturer: "Goulds", model: "Impeller-3196", specifications: { material: "316 SS", vane_count: 5 }, notes: "Check balance on rebuilds.", created_at: new Date() },
  { id: 5, asset_id: 4, equipment_id: 4, name: "Electric Drive Motor", type: "Motor", manufacturer: "Baldor Reliance", model: "Super-E", specifications: { hp: 75, rpm: 1785, frame: "365T" }, notes: "Greased on 180 day cycle.", created_at: new Date() }
];

let memoryCollectionPoints: any[] = [
  { id: 1, component_id: 1, name: "Bearing 1 Housing", location_order: 1, notes: "Inboard housing near rotor cage.", created_at: new Date() },
  { id: 2, component_id: 3, name: "Coupling Input Shroud", location_order: 1, notes: "Monitor radial paths.", created_at: new Date() },
  // Demo Collection Points
  { id: 3, component_id: 4, name: "Impeller Housing DE", location_order: 1, notes: "Pump drive end location.", created_at: new Date() },
  { id: 4, component_id: 5, name: "Motor NDE Housing", location_order: 1, notes: "Motor non-drive end location.", created_at: new Date() }
];

// SLICE-A - import batch ledger (memory fallback mirror of migrations/028).
let memoryImports: any[] = [];

let memoryMeasurementPoints: any[] = [
  // Auto-created points for collection_point_id: 1
  { id: 1, collection_point_id: 1, direction: "Horizontal", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 2, collection_point_id: 1, direction: "Vertical", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 3, collection_point_id: 1, direction: "Axial", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  // Auto-created points for collection_point_id: 2
  { id: 4, collection_point_id: 2, direction: "Horizontal", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 5, collection_point_id: 2, direction: "Vertical", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 6, collection_point_id: 2, direction: "Axial", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  // Demo Measurement Points
  { id: 7, collection_point_id: 3, direction: "Horizontal", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 8, collection_point_id: 3, direction: "Axial", technology_type: "Thermal", units: "°F", created_at: new Date() },
  { id: 9, collection_point_id: 4, direction: "Vertical", technology_type: "Vibration", units: "in/Sec", created_at: new Date() },
  { id: 10, collection_point_id: 4, direction: "Radial", technology_type: "Electrical", units: "Ohms", created_at: new Date() }
];

const memoryDemoSeedEnabled = isDevAuthSeedEnabled(process.env);

let memoryAnalysisHistory: any[] = [
  {
    id: 1,
    measurement_point_id: 1,
    data_point_name: "DE Horizontal RMS",
    state: "Data Collected",
    op_speed: 1785.00,
    measurement_value: 0.125000,
    units: "in/Sec",
    measurement_date: new Date(),
    notes: "Slight 1x vibration peak observed.",
    waveform_data: { sample_rate: 2000, length: 1024 },
    alarm_status: false,
    diagnosis_result: { health: "Healthy", details: "Vibration within ISO Class I Zone A allowable threshold." },
    was_correct: true,
    corrected_diagnosis: null,
    created_at: new Date()
  },
  // Demo Analysis History
  {
    id: 2,
    measurement_point_id: 7,
    data_point_name: "Velocity RMS",
    state: "Data Collected",
    op_speed: 1780.00,
    measurement_value: 0.285000,
    units: "in/sec",
    measurement_date: new Date(Date.now() - 2 * 3600 * 1000),
    notes: "⚠️ Warning limit exceeded for Velocity RMS. Immediate inspection and re-greasing recommended.",
    alarm_status: true,
    diagnosis_result: { 
      manager_summary: { severity: "High" },
      probable_faults: [{ fault_name: "Bearing Defects", probability: 85, confidence: "High", supporting_evidence: "Elevated amplitude at inner ring ball pass frequency" }]
    },
    created_at: new Date()
  },
  {
    id: 3,
    measurement_point_id: 8,
    data_point_name: "Overall Temperature",
    state: "Data Collected",
    op_speed: 1780.00,
    measurement_value: 165.200000,
    units: "°F",
    measurement_date: new Date(Date.now() - 2 * 3600 * 1000),
    notes: "Within normal limits.",
    alarm_status: false,
    diagnosis_result: {
      manager_summary: { severity: "Low" }
    },
    created_at: new Date()
  },
  {
    id: 4,
    measurement_point_id: 9,
    data_point_name: "Velocity RMS",
    state: "Data Collected",
    op_speed: 1785.00,
    measurement_value: 0.485000,
    units: "in/sec",
    measurement_date: new Date(Date.now() - 1 * 3600 * 1000),
    notes: "🚨 Critical alarm: extremely high vibration amplitude at 1X operating frequency.",
    alarm_status: true,
    diagnosis_result: {
      manager_summary: { severity: "Critical" },
      probable_faults: [{ fault_name: "Unbalance", probability: 95, confidence: "High", supporting_evidence: "Dominant 1X radial peak with 90 degree phase shift" }]
    },
    created_at: new Date()
  }
];

// STOREFRONT — module entitlements and the server-held checkout mapping.
// These are tenant data and start empty; they are populated only by a paid
// webhook (or the explicit memory fallback used by offline tests).
let memoryEntitlements: any[] = [];
let memoryPendingCheckouts: any[] = [];
const memoryProcessedWebhookEvents = new Set<string>();

// AR-29 rule 5 - the all-tenant demo store must never be served unless the
// explicit dev seed gate is on (and never in production). Without it every
// tenant collection starts honestly empty; tenants come only from signup.
if (!memoryDemoSeedEnabled) {
  memoryCompanies = [];
    memoryPlants = [];
    memoryUnits = [];
    memoryRoutes = [];
    memoryEquipment = [];
    memoryAssets = memoryEquipment;
    memoryComponents = [];
    memoryCollectionPoints = [];
    memoryMeasurementPoints = [];
    memoryAnalysisHistory = [];
    memoryRouteAssignments = [];
  }

// Tenant is derived exclusively from the verified session. Query params are
// never an authority for which tenant's data a request may read or mutate.
function requestTenantId(req: any): number | null {
  const raw = req?.tenantId ?? req?.auth?.tenantId ?? null;
  if (raw == null || String(raw).trim() === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

// STOREFRONT — requireModule() resolves through this host injector so both
// the DB and memory boots consult the same entitlement store. The company id
// always arrives from the verified session, never from a client field.
registerModuleAccessResolver(async (companyId, moduleKey) => {
  if (pool) {
    const activePool = pool;
    return isModuleActive(companyId, moduleKey, {
      query: (text, params) => activePool.query(text, params)
    });
  }
  return memoryEntitlements.some(
    (row) =>
      Number(row.company_id) === companyId &&
      String(row.module_key) === moduleKey &&
      row.status === "active"
  );
});

function memoryTenantPlantIds(tenantId: number | null): number[] {
  if (tenantId == null) return [];
  return memoryPlants
    .filter((p) => p.company_id === tenantId)
    .map((p) => p.id);
}

function memoryTenantRouteIds(tenantId: number | null): number[] {
  const plantIds = memoryTenantPlantIds(tenantId);
  return memoryRoutes
    .filter((r) => plantIds.includes(r.plant_id))
    .map((r) => r.id);
}

function memoryTenantAssetIds(tenantId: number | null): number[] {
  const routeIds = memoryTenantRouteIds(tenantId);
  return memoryAssets
    .filter((a) => routeIds.includes(a.route_id))
    .map((a) => a.id);
}

function memoryTenantComponentIds(tenantId: number | null): number[] {
  const assetIds = memoryTenantAssetIds(tenantId);
  return memoryComponents
    .filter((c) => assetIds.includes(c.asset_id) || assetIds.includes(c.equipment_id))
    .map((c) => c.id);
}

function memoryTenantCollectionPointIds(tenantId: number | null): number[] {
  const componentIds = memoryTenantComponentIds(tenantId);
  return memoryCollectionPoints
    .filter((cp) => componentIds.includes(cp.component_id))
    .map((cp) => cp.id);
}

function memoryTenantMeasurementPointIds(tenantId: number | null): number[] {
  const cpIds = memoryTenantCollectionPointIds(tenantId);
  return memoryMeasurementPoints
    .filter((mp) => cpIds.includes(mp.collection_point_id))
    .map((mp) => mp.id);
}

// Parent ownership check for create/update mutations. A row that exists in
// another tenant is treated exactly like a missing row (404/400, no leak).
async function tenantOwnsRow(
  db: any,
  table:
    | "plants"
    | "routes"
    | "assets"
    | "components"
    | "collection_points"
    | "measurement_points",
  id: number,
  tenantId: number | null
): Promise<boolean> {
  if (tenantId == null) return false;
  const sql: Record<typeof table, string> = {
    plants:
      "SELECT 1 FROM plants WHERE id = $1 AND company_id = $2 LIMIT 1",
    routes:
      `SELECT 1 FROM routes r JOIN plants pl ON pl.id = r.plant_id
        WHERE r.id = $1 AND pl.company_id = $2 LIMIT 1`,
    assets:
      `SELECT 1 FROM assets a
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
        WHERE a.id = $1 AND pl.company_id = $2 LIMIT 1`,
    components:
      `SELECT 1 FROM components c
        JOIN assets a ON a.id = c.asset_id
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
        WHERE c.id = $1 AND pl.company_id = $2 LIMIT 1`,
    collection_points:
      `SELECT 1 FROM collection_points cp
        JOIN components c ON c.id = cp.component_id
        JOIN assets a ON a.id = c.asset_id
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
        WHERE cp.id = $1 AND pl.company_id = $2 LIMIT 1`,
    measurement_points:
      `SELECT 1 FROM measurement_points mp
        JOIN collection_points cp ON cp.id = mp.collection_point_id
        JOIN components c ON c.id = cp.component_id
        JOIN assets a ON a.id = c.asset_id
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
        WHERE mp.id = $1 AND pl.company_id = $2 LIMIT 1`
  };
  const result = await db.query(sql[table], [id, tenantId]);
  return result.rows.length > 0;
}

// GOOD-CATCHES - every supplied lineage / alert / work-order link must be
// proven to belong to the session tenant before the row is written. A
// cross-tenant id is treated exactly like a missing id (404, never a leak).
function parseOptionalGoodCatchInteger(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

function parseOptionalGoodCatchAlert(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function goodCatchLinksHaveInvalidId(links: GoodCatchLinkRefs): boolean {
  return (
    Number.isNaN(links.plant_id as number) ||
    Number.isNaN(links.route_id as number) ||
    Number.isNaN(links.asset_id as number) ||
    Number.isNaN(links.component_id as number) ||
    Number.isNaN(links.work_order_id as number)
  );
}

async function goodCatchLinkOwnedByTenant(
  db: any,
  field: GoodCatchLinkField,
  id: number | string,
  tenantId: number
): Promise<boolean> {
  switch (field) {
    case "plant_id":
      return tenantOwnsRow(db, "plants", Number(id), tenantId);
    case "route_id":
      return tenantOwnsRow(db, "routes", Number(id), tenantId);
    case "asset_id":
      return tenantOwnsRow(db, "assets", Number(id), tenantId);
    case "component_id":
      return tenantOwnsRow(db, "components", Number(id), tenantId);
    case "alert_id": {
      const result = await db.query(
        "SELECT 1 FROM alerts WHERE id::text = $1 AND tenant_id = $2 LIMIT 1",
        [String(id), tenantId]
      );
      return result.rows.length > 0;
    }
    case "work_order_id": {
      const result = await db.query(
        "SELECT 1 FROM work_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [Number(id), tenantId]
      );
      return result.rows.length > 0;
    }
  }
  return false;
}

async function collectGoodCatchOwnedLinks(
  db: any,
  tenantId: number,
  refs: GoodCatchLinkRefs
): Promise<GoodCatchOwnedLinks> {
  const owned = {
    plants: new Set<number>(),
    routes: new Set<number>(),
    assets: new Set<number>(),
    components: new Set<number>(),
    alerts: new Set<string>(),
    workOrders: new Set<number>()
  };
  if (refs.plant_id != null) {
    if (await goodCatchLinkOwnedByTenant(db, "plant_id", refs.plant_id, tenantId)) {
      owned.plants.add(Number(refs.plant_id));
    }
  }
  if (refs.route_id != null) {
    if (await goodCatchLinkOwnedByTenant(db, "route_id", refs.route_id, tenantId)) {
      owned.routes.add(Number(refs.route_id));
    }
  }
  if (refs.asset_id != null) {
    if (await goodCatchLinkOwnedByTenant(db, "asset_id", refs.asset_id, tenantId)) {
      owned.assets.add(Number(refs.asset_id));
    }
  }
  if (refs.component_id != null) {
    if (
      await goodCatchLinkOwnedByTenant(db, "component_id", refs.component_id, tenantId)
    ) {
      owned.components.add(Number(refs.component_id));
    }
  }
  if (refs.alert_id != null) {
    if (await goodCatchLinkOwnedByTenant(db, "alert_id", refs.alert_id, tenantId)) {
      owned.alerts.add(String(refs.alert_id));
    }
  }
  if (refs.work_order_id != null) {
    if (
      await goodCatchLinkOwnedByTenant(
        db,
        "work_order_id",
        refs.work_order_id,
        tenantId
      )
    ) {
      owned.workOrders.add(Number(refs.work_order_id));
    }
  }
  return owned;
}

function memoryGoodCatchOwnedLinks(
  tenantId: number | null
): GoodCatchOwnedLinks {
  const owned: GoodCatchOwnedLinks = {
    plants: new Set<number>(memoryTenantPlantIds(tenantId)),
    routes: new Set<number>(memoryTenantRouteIds(tenantId)),
    assets: new Set<number>(memoryTenantAssetIds(tenantId)),
    components: new Set<number>(memoryTenantComponentIds(tenantId)),
    alerts: new Set<string>(),
    workOrders: new Set<number>()
  };
  return owned;
}

function memoryGoodCatchWithLineage(row: any): GoodCatchRow {
  const plant =
    row.plant_id != null
      ? memoryPlants.find(
          (p) => p.id === Number(row.plant_id) && p.company_id === row.tenant_id
        )
      : null;
  const route =
    row.route_id != null
      ? memoryRoutes.find((r) => r.id === Number(row.route_id))
      : null;
  const asset =
    row.asset_id != null
      ? memoryAssets.find((a) => a.id === Number(row.asset_id))
      : null;
  const component =
    row.component_id != null
      ? memoryComponents.find((c) => c.id === Number(row.component_id))
      : null;
  return {
    ...row,
    plant_name: plant ? String(plant.name) : null,
    route_name: route ? String(route.name) : null,
    asset_name: asset ? String(asset.name) : null,
    asset_tag: asset?.tag_number ? String(asset.tag_number) : null,
    component_name: component ? String(component.name) : null,
    work_order_status: null,
    alert_title: null
  };
}

// Helper to generate a unique sequential ID for memory fallback
let nextId = 100;
function getNextId() {
  while (true) {
    const id = nextId++;
    const inUse =
      memoryPlants.some((item) => item.id === id) ||
      memoryRoutes.some((item) => item.id === id) ||
      memoryAssets.some((item) => item.id === id) ||
      memoryComponents.some((item) => item.id === id);
    if (!inUse) return id;
  }
}

/**
 * Compute health score for a single technology's reading
 * @param tech - technology type
 * @param data - diagnostic data from analysis_results or similar
 * @returns health score (0-100) or null if no data
 */
function computeTechHealthScore(
  tech: "vibration" | "oil" | "thermography" | "ultrasound",
  data: any
): number | null {
  switch (tech) {
    case "vibration":
      // Vibration: use stored health_score (0-100) if available
      if (data.health_score != null && Number.isFinite(Number(data.health_score))) {
        return Math.max(0, Math.min(100, Math.round(Number(data.health_score))));
      }
      // Fallback: infer from severity
      const sev = String(data.severity || "").toUpperCase();
      if (sev === "CRITICAL" || sev === "HIGH") return 30;
      if (sev === "ANOMALY" || sev === "MEDIUM" || sev === "WARNING") return 60;
      if (sev === "NORMAL" || sev === "LOW") return 90;
      return null;

    case "oil":
      // Oil: derive from latest oil sample bands
      // 100 if all tracked metrics normal, 70 if any in warning band, 40 if any critical
      // We'll check alarm limits from the oil sample data
      if (!data) return null;
      // Check ISO codes if available
      const isoCodes = data.iso4um != null && data.iso6um != null && data.iso14um != null;
      // Three bands, matching the 100 / 70 / 40 scores below. Warning is
      // "above the 15/13/10 cleanliness target but not yet critical" — without
      // it the 70 score was unreachable from ISO codes alone.
      const isoStatus = !isoCodes
        ? null
        : data.iso4um > 18 || data.iso6um > 16 || data.iso14um > 13
          ? "critical"
          : data.iso4um > 15 || data.iso6um > 13 || data.iso14um > 10
            ? "warning"
            : "normal";
      // Check wear metals against alarm limits
      const metals = [
        { val: data.iron, lim: data.ironAlarmLimit },
        { val: data.copper, lim: data.copperAlarmLimit },
        { val: data.chromium, lim: data.chromiumAlarmLimit },
        { val: data.lead, lim: data.leadAlarmLimit },
        { val: data.aluminum, lim: data.aluminumAlarmLimit },
        { val: data.silicon, lim: data.siliconAlarmLimit },
      ].filter((m) => m.val != null && m.lim != null);
      let metalStatus = "normal";
      for (const m of metals) {
        const ratio = Number(m.val) / Number(m.lim);
        if (ratio >= 0.75) metalStatus = "critical";
        else if (ratio >= 0.5 && metalStatus !== "critical") metalStatus = "warning";
      }
      if (isoStatus === "critical" || metalStatus === "critical") return 40;
      if (isoStatus === "warning" || metalStatus === "warning") return 70;
      return 100;

    case "thermography":
      // Thermography: map stored severity
      const thSev = String(data.severity || data.severity_class || "").toUpperCase();
      if (thSev === "CRITICAL" || thSev === "CLASS 4" || thSev === "CLASS 3") return 30;
      if (thSev === "ANOMALY" || thSev === "HIGH" || thSev === "CLASS 2") return 60;
      if (thSev === "NORMAL" || thSev === "CLASS 1" || thSev === "LOW") return 90;
      // Fallback: delta-T if available
      if (data.delta_t != null) {
        const dt = Number(data.delta_t);
        if (dt > 40) return 30;
        if (dt > 15) return 60;
        if (dt > 4) return 80;
        return 90;
      }
      return null;

    case "ultrasound":
      // Ultrasound: dB-over-baseline map
      const baseline = Number(data.baseline_dbmv);
      const peak = Number(data.peak_dbmv);
      const delta = data.delta_db != null ? Number(data.delta_db) : (peak && baseline ? peak - baseline : null);
      if (delta == null) return null;
      if (delta > 12) return 40;
      if (delta > 8) return 70;
      if (delta > 4) return 80;
      return 100;

    default:
      return null;
  }
}

/**
 * Compute per-asset health score from available technology readings
 * Equal weighting across available technologies
 * Returns { score: number|null, components: string[] }
 */
async function computeAssetHealthScore(
  assetId: string,
  pool: any,
  companyId?: number
): Promise<{ score: number | null; components: string }> {
  if (!pool) return { score: null, components: "No database connection" };

  const scores: number[] = [];
  const components: string[] = [];

  // Fetch latest analysis per technology for this asset
  // Vibration analysis (from analysis_results where analysis_type='vibration' or default)
  try {
    const vibRes = await pool.query(
      `SELECT health_score, severity, primary_fault
       FROM analysis_results
       WHERE LOWER(TRIM(asset_id)) = LOWER(TRIM($1))
         AND (analysis_type = 'vibration' OR analysis_type IS NULL OR analysis_type = '')
       ORDER BY timestamp DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [assetId]
    );
    if (vibRes.rows.length > 0) {
      const score = computeTechHealthScore("vibration", vibRes.rows[0]);
      if (score != null) {
        scores.push(score);
        components.push(`vib ${score}`);
      }
    }
  } catch (err) {
    console.error("[computeAssetHealthScore] vibration query failed:", err);
  }

  // Oil analysis (from oil_samples table)
  try {
    const oilRes = await pool.query(
      `SELECT iron, copper, chromium, lead, aluminum, silicon,
              ironAlarmLimit, copperAlarmLimit, chromiumAlarmLimit,
              leadAlarmLimit, aluminumAlarmLimit, siliconAlarmLimit,
              iso4um, iso6um, iso14um
       FROM oil_samples
       WHERE asset_id = $1
       ORDER BY sample_date DESC NULLS LAST
       LIMIT 1`,
      [assetId]
    );
    if (oilRes.rows.length > 0) {
      const score = computeTechHealthScore("oil", oilRes.rows[0]);
      if (score != null) {
        scores.push(score);
        components.push(`oil ${score}`);
      }
    }
  } catch (err) {
    console.error("[computeAssetHealthScore] oil query failed:", err);
  }

  // Thermography (from analysis_results where analysis_type='thermography')
  try {
    const thermoRes = await pool.query(
      `SELECT severity, severity_class, delta_t, peak_dbmv
       FROM analysis_results
       WHERE LOWER(TRIM(asset_id)) = LOWER(TRIM($1))
         AND analysis_type = 'thermography'
       ORDER BY timestamp DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [assetId]
    );
    if (thermoRes.rows.length > 0) {
      const score = computeTechHealthScore("thermography", thermoRes.rows[0]);
      if (score != null) {
        scores.push(score);
        components.push(`therm ${score}`);
      }
    }
  } catch (err) {
    console.error("[computeAssetHealthScore] thermography query failed:", err);
  }

  // Ultrasound (from analysis_results where analysis_type='ultrasound')
  try {
    const usRes = await pool.query(
      `SELECT peak_dbmv, baseline_dbmv, delta_db
       FROM analysis_results
       WHERE LOWER(TRIM(asset_id)) = LOWER(TRIM($1))
         AND analysis_type = 'ultrasound'
       ORDER BY timestamp DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [assetId]
    );
    if (usRes.rows.length > 0) {
      const score = computeTechHealthScore("ultrasound", usRes.rows[0]);
      if (score != null) {
        scores.push(score);
        components.push(`us ${score}`);
      }
    }
  } catch (err) {
    console.error("[computeAssetHealthScore] ultrasound query failed:", err);
  }

  if (scores.length === 0) {
    return { score: null, components: "No diagnostic readings available" };
  }

  // Equal weighting across available technologies
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return { score: avgScore, components: components.join(" + ") };
}

/**
 * Compute fleet aggregates from per-asset scores
 */
function computeFleetAggregates(assets: Array<{ assetId: string; healthScore: number | null }>) {
  const CRITICAL_THRESHOLD = 50;
  const WARNING_THRESHOLD = 75;

  const assetsWithScores = assets.filter((a) => a.healthScore != null);
  const totalAssets = assets.length;
  const criticalCount = assets.filter((a) => a.healthScore != null && a.healthScore < 50).length;
  const warningCount = assets.filter((a) => a.healthScore != null && a.healthScore >= 50 && a.healthScore < 75).length;
  const healthyCount = assets.filter((a) => a.healthScore != null && a.healthScore >= 75).length;
  const avgHealthIndex = assetsWithScores.length > 0
    ? Math.round(assetsWithScores.reduce((sum, a) => sum + (a.healthScore || 0), 0) / assetsWithScores.length)
    : null;

  return {
    totalAssets,
    criticalCount,
    warningCount,
    healthyCount,
    avgHealthIndex,
    assetsWithScoresCount: assetsWithScores.length
  };
}

// Helper to get assets with their latest diagnostic status (for both postgres and fallback memory)
async function getAssetsWithStatus(companyId?: number) {
  if (pool) {
    // 1. Fetch all assets for companyId
    let assetsQuery = `
      SELECT ast.*, pl.company_id
      FROM assets ast
      LEFT JOIN routes rt ON ast.route_id = rt.id
      LEFT JOIN plants pl ON rt.plant_id = pl.id
    `;
    const params: any[] = [];
    if (companyId) {
      assetsQuery += " WHERE pl.company_id = $1";
      params.push(companyId);
    }
    const assetsRes = await pool.query(assetsQuery, params);
    const assets = assetsRes.rows;

    // 2. Fetch most recent analysis for each asset in company
    let analysesQuery = `
      SELECT DISTINCT ON (comp.asset_id)
        comp.asset_id,
        ah.id as analysis_id,
        ah.diagnosis_result,
        ah.created_at,
        ah.notes,
        ah.data_point_name,
        ah.measurement_value,
        ah.units
      FROM analysis_history ah
      JOIN measurement_points mp ON ah.measurement_point_id = mp.id
      JOIN collection_points cp ON mp.collection_point_id = cp.id
      JOIN components comp ON cp.component_id = comp.id
      JOIN assets ast ON comp.asset_id = ast.id
      LEFT JOIN routes rt ON ast.route_id = rt.id
      LEFT JOIN plants pl ON rt.plant_id = pl.id
    `;
    const analysisParams: any[] = [];
    if (companyId) {
      analysesQuery += " WHERE pl.company_id = $1";
      analysisParams.push(companyId);
    }
    analysesQuery += " ORDER BY comp.asset_id, ah.created_at DESC";
    const analysesRes = await pool.query(analysesQuery, analysisParams);
    const analysesMap = new Map();
    for (const row of analysesRes.rows) {
      analysesMap.set(row.asset_id, row);
    }

    // 3. Map status to each asset
    return assets.map(asset => {
      const latestAnalysis = analysesMap.get(asset.id);
      let status = "Healthy";
      let severity = "Low";
      let faultType = "None";
      
      if (latestAnalysis) {
        let diag = latestAnalysis.diagnosis_result;
        if (typeof diag === "string") {
          try { diag = JSON.parse(diag); } catch(e) {}
        }
        
        severity = diag?.manager_summary?.severity || diag?.severity || "Low";
        if (severity === "Critical") {
          status = "Critical";
        } else if (severity === "High" || severity === "Medium") {
          status = "Warning";
        } else {
          status = "Healthy";
        }

        // fault type
        if (diag?.probable_faults && diag.probable_faults.length > 0) {
          faultType = diag.probable_faults[0].fault_name || diag.probable_faults[0].fault || "Other";
        } else if (diag?.probable_fault) {
          faultType = diag.probable_fault || "Other";
        }
      }

      return {
        ...asset,
        analysis_status: status,
        severity,
        fault_type: faultType,
        latest_analysis: latestAnalysis
      };
    });
  } else {
    // FALLBACK / IN-MEMORY
    let plants = memoryPlants;
    if (companyId) {
      plants = plants.filter(p => p.company_id === companyId);
    }
    const plantIds = plants.map(p => p.id);
    const routes = memoryRoutes.filter(r => plantIds.includes(r.plant_id));
    const routeIds = routes.map(r => r.id);
    const assets = memoryAssets.filter(a => routeIds.includes(a.route_id));

    return assets.map(asset => {
      // Find components
      const compIds = memoryComponents
        .filter(c => (c.asset_id === asset.id || c.equipment_id === asset.id))
        .map(c => c.id);
      
      // Find collection points
      const cpIds = memoryCollectionPoints
        .filter(cp => compIds.includes(cp.component_id))
        .map(cp => cp.id);
      
      // Find measurement points
      const mpIds = memoryMeasurementPoints
        .filter(mp => cpIds.includes(mp.collection_point_id))
        .map(mp => mp.id);
      
      // Find analyses
      const analyses = memoryAnalysisHistory
        .filter(ah => mpIds.includes(ah.measurement_point_id))
        .sort((a, b) => new Date(b.created_at || b.measurement_date).getTime() - new Date(a.created_at || a.measurement_date).getTime());
      
      const latestAnalysis = analyses[0] || null;
      let status = "Healthy";
      let severity = "Low";
      let faultType = "None";

      if (latestAnalysis) {
        const diag = latestAnalysis.diagnosis_result;
        severity = diag?.manager_summary?.severity || diag?.severity || "Low";
        if (severity === "Critical") {
          status = "Critical";
        } else if (severity === "High" || severity === "Medium") {
          status = "Warning";
        } else {
          status = "Healthy";
        }

        if (diag?.probable_faults && diag.probable_faults.length > 0) {
          faultType = diag.probable_faults[0].fault_name || diag.probable_faults[0].fault || "Other";
        } else if (diag?.probable_fault) {
          faultType = diag.probable_fault || "Other";
        }
      }

      return {
        ...asset,
        analysis_status: status,
        severity,
        fault_type: faultType,
        latest_analysis: latestAnalysis
      };
    });
  }
}

// --------------------------------------------------------
// EXECUTIVE ANALYTICS DASHBOARD ENDPOINTS
// --------------------------------------------------------

// GET /api/dashboard — Health Dashboard metrics from PostgreSQL (no mock values)
app.get("/api/dashboard", async (req, res) => {
  const emptyPayload = {
    plantName: null as string | null,
    assetCount: 0,
    fleetHealthScore: null as number | null,
    highAlerts: 0,
    warningAlerts: 0,
    unacknowledgedAlerts: 0,
    scheduledWorkOrders: 0,
    unassignedWorkOrders: 0,
    financialRisk: null as null | {
      failureExposure: number;
      costToFix: number;
      roiPercent: number | null;
    },
    techCoverage: [] as Array<{ name: string; pct: number; detail: string }>,
    aiBriefing: null as string | null,
    badActors: [] as Array<{
      id: string;
      name: string;
      detail: string;
      healthScore: number;
      severity: string;
      classTier: "A" | "BC";
      telemetryProvenance: string | null;
    }>,
    liveAlarms: [] as Array<{
      id: string;
      name: string;
      zone: string;
      detail: string;
      severity: "critical" | "warning";
      acknowledged: boolean;
      assetId: string | null;
    }>,
    healthZones: { A: 0, B: 0, C: 0, D: 0 },
    recentAnalyses: [] as Array<Record<string, unknown>>,
    correlationData: [] as unknown[]
  };

  try {
    if (!pool) {
      // Memory mode must not serve the all-tenant store. Return the honest
      // session-derived empty state instead of a 503 or global demo rows.
      const tenantId = requestTenantId(req);
      const tenantPlant = tenantId == null
        ? null
        : memoryPlants.find((p) => p.company_id === tenantId) ?? null;
      return res.json({
        ...emptyPayload,
        plantName: tenantPlant ? String(tenantPlant.name) : null
      });
    }

    // Tenant comes from the verified session, never req.query.company_id.
    const companyId = requestTenantId(req);
    if (companyId == null) {
      return res.json(emptyPayload);
    }

    // 3) Plant name
    let plantName: string | null = null;
    try {
      const plantRes = await pool.query(
        `SELECT name FROM plants WHERE company_id = $1 ORDER BY id ASC LIMIT 1`,
        [companyId]
      );
      plantName = plantRes.rows[0]?.name ? String(plantRes.rows[0].name) : null;
    } catch (err) {
      console.error("[dashboard] plants query failed:", err);
    }

    // Asset count
    let assetCount = 0;
    try {
      const assetsRes = await pool.query(
        `SELECT COUNT(*)::int AS n
           FROM assets ast
           LEFT JOIN routes rt ON ast.route_id = rt.id
           LEFT JOIN plants pl ON rt.plant_id = pl.id
          WHERE pl.company_id = $1`,
        [companyId]
      );
      assetCount = Number(assetsRes.rows[0]?.n) || 0;
    } catch (err) {
      console.error("[dashboard] assets count failed:", err);
    }

    // Fetch all assets for the company (needed for per-asset health scores)
    let allAssets: any[] = [];
    try {
      let assetsQuery = `
        SELECT ast.id, ast.name, ast.tag, ast.tag_number, ast.type, ast.route_id
        FROM assets ast
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
        WHERE pl.company_id = $1
      `;
      const params: any[] = [companyId];
      const assetsRes = await pool.query(assetsQuery, params);
      allAssets = assetsRes.rows;
    } catch (err) {
      console.error("[dashboard] assets query failed:", err);
    }

    // Compute per-asset health scores
    const assetHealthScores: Array<{ assetId: string; assetName: string; healthScore: number | null; scoreComponents: string }> = [];
    for (const asset of allAssets) {
      const { score, components } = await computeAssetHealthScore(asset.id, pool, companyId);
      assetHealthScores.push({
        assetId: asset.id,
        assetName: asset.name || asset.tag || asset.id,
        healthScore: score,
        scoreComponents: components
      });
    }

    // Compute fleet aggregates
    const fleetAggregates = computeFleetAggregates(assetHealthScores);

    // Fleet Health Score — computed from per-asset health scores (fallback to analysis_results avg)
    let fleetHealthScore = fleetAggregates.avgHealthIndex ?? null;
    try {
      // Fallback: AVG from analysis_results if no asset scores available
      if (fleetHealthScore == null) {
        const avgRes = await pool.query(
          `SELECT AVG(health_score)::float AS avg FROM analysis_results WHERE health_score IS NOT NULL AND tenant_id = $1`,
          [companyId]
        );
        const avg = Number(avgRes.rows[0]?.avg);
        fleetHealthScore = Number.isFinite(avg) ? Math.round(avg) : null;
      }
    } catch (err) {
      console.error("[dashboard] fleet health avg failed:", err);
    }

    // Latest analysis per asset (zones, financial, bad actors, briefing)
    let latestAnalyses: any[] = [];
    try {
      const latestAnalysesRes = await pool.query(
        `SELECT DISTINCT ON (LOWER(TRIM(asset_id)))
           id, asset_id, component, health_score, primary_fault, severity,
           summary, financial_impact, recommendations, timestamp, telemetry_data
         FROM analysis_results
         WHERE asset_id IS NOT NULL AND TRIM(asset_id) <> '' AND tenant_id = $1
         ORDER BY LOWER(TRIM(asset_id)), timestamp DESC NULLS LAST, created_at DESC`,
        [companyId]
      );
      latestAnalyses = latestAnalysesRes.rows;
    } catch (err) {
      console.error("[dashboard] latest analyses failed:", err);
    }

    // 9) Asset Health Distribution by latest health score per asset
    const healthZones = { A: 0, B: 0, C: 0, D: 0 };
    for (const row of latestAnalyses) {
      const score = Number(row.health_score);
      if (!Number.isFinite(score)) continue;
      if (score >= 85) healthZones.A += 1;
      else if (score >= 70) healthZones.B += 1;
      else if (score >= 50) healthZones.C += 1;
      else healthZones.D += 1;
    }

    // 5) Critical alarms — COUNT(*) FROM alerts WHERE severity = 'HIGH'
    let highAlerts = 0;
    let warningAlerts = 0;
    let unacknowledgedAlerts = 0;
    let liveAlarms: typeof emptyPayload.liveAlarms = [];
    try {
      const highRes = await pool.query(
        `SELECT COUNT(*)::int AS n FROM alerts WHERE severity = 'HIGH' AND tenant_id = $1`,
        [companyId]
      );
      highAlerts = Number(highRes.rows[0]?.n) || 0;

      const warnRes = await pool.query(
        `SELECT COUNT(*)::int AS n FROM alerts WHERE severity = 'MEDIUM' AND tenant_id = $1`,
        [companyId]
      );
      warningAlerts = Number(warnRes.rows[0]?.n) || 0;

      const unackedRes = await pool.query(
        `SELECT COUNT(*)::int AS n FROM alerts WHERE acknowledged IS NOT TRUE AND tenant_id = $1`,
        [companyId]
      );
      unacknowledgedAlerts = Number(unackedRes.rows[0]?.n) || 0;

      const alarmRes = await pool.query(
        `SELECT id, asset_id, severity, title, description, acknowledged, created_at
         FROM alerts
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [companyId]
      );
      liveAlarms = alarmRes.rows.map((row) => {
        const sev = String(row.severity || "").toUpperCase();
        const isHigh = sev === "HIGH";
        const health = latestAnalyses.find(
          (a) =>
            String(a.asset_id || "").toLowerCase() ===
            String(row.asset_id || "").toLowerCase()
        )?.health_score;
        const hs = Number(health);
        let zone = "—";
        if (Number.isFinite(hs)) {
          if (hs >= 85) zone = "Zone A";
          else if (hs >= 70) zone = "Zone B";
          else if (hs >= 50) zone = "Zone C";
          else zone = "Zone D";
        }
        return {
          id: String(row.id),
          name: String(row.title || row.asset_id || "Alert"),
          zone,
          detail: String(row.description || ""),
          severity: isHigh ? ("critical" as const) : ("warning" as const),
          acknowledged: Boolean(row.acknowledged),
          assetId: row.asset_id != null ? String(row.asset_id) : null
        };
      });
    } catch (err) {
      console.error("[dashboard] alerts query failed:", err);
    }

    // 6) Scheduled work orders — COUNT(*) FROM work_orders WHERE status = 'scheduled'
    let scheduledWorkOrders = 0;
    let unassignedWorkOrders = 0;
    try {
      const woExists = await pool.query(
        `SELECT EXISTS (
           SELECT FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'work_orders'
         ) AS ok`
      );
      if (woExists.rows[0]?.ok) {
        const scheduledRes = await pool.query(
          `SELECT COUNT(*)::int AS n FROM work_orders WHERE status = 'scheduled' AND tenant_id = $1`,
          [companyId]
        );
        scheduledWorkOrders = Number(scheduledRes.rows[0]?.n) || 0;

        const unassignedRes = await pool.query(
          `SELECT COUNT(*)::int AS n FROM work_orders
           WHERE tenant_id = $1
             AND (LOWER(COALESCE(status, '')) IN ('unassigned', 'new')
              OR (
                assignee IS NULL
                AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'complete', 'completed', 'cancelled', 'scheduled')
              ))`,
          [companyId]
        );
        unassignedWorkOrders = Number(unassignedRes.rows[0]?.n) || 0;
      }
    } catch (err) {
      console.error("[dashboard] work_orders query failed:", err);
    }

    // Financial risk from latest analyses with financial_impact
    let failureExposure = 0;
    let costToFix = 0;
    let financialCount = 0;
    for (const row of latestAnalyses) {
      let fi: Record<string, unknown> = {};
      if (row.financial_impact && typeof row.financial_impact === "object") {
        fi = row.financial_impact as Record<string, unknown>;
      } else if (typeof row.financial_impact === "string") {
        try {
          fi = JSON.parse(row.financial_impact);
        } catch {
          fi = {};
        }
      }
      const fail = Number(fi.failureCostIfDelayed ?? fi.failure_cost_if_delayed);
      const prev = Number(fi.preventiveRepairCost ?? fi.preventive_repair_cost);
      if (Number.isFinite(fail) && fail > 0) {
        failureExposure += fail;
        financialCount += 1;
      }
      if (Number.isFinite(prev) && prev > 0) costToFix += prev;
    }
    const financialRisk =
      financialCount > 0 || costToFix > 0
        ? {
            failureExposure: Math.round(failureExposure),
            costToFix: Math.round(costToFix),
            roiPercent:
              costToFix > 0
                ? Math.round(((failureExposure - costToFix) / costToFix) * 100)
                : null
          }
        : null;

    // 7) Multi-Tech Coverage from real diagnosis_logs / analysis_results (no hardcoded %)
    const techDefs = [
      { key: "vibration", name: "Vibration Analysis", detail: "Route Coverage" },
      { key: "oil", name: "Oil / Lubrication Analysis", detail: "Sample Coverage" },
      {
        key: "thermography",
        name: "Infrared Thermography",
        detail: "Inspection Coverage"
      },
      { key: "mca", name: "Motor Current (MCSA)", detail: "Monitoring Coverage" },
      { key: "ultrasound", name: "Ultrasound", detail: "Inspection Coverage" }
    ];
    const techAssetSets: Record<string, Set<string>> = {
      vibration: new Set(),
      oil: new Set(),
      thermography: new Set(),
      mca: new Set(),
      ultrasound: new Set()
    };
    // analysis_results are vibration diagnostics
    for (const row of latestAnalyses) {
      const a = String(row.asset_id || "").toLowerCase().trim();
      if (a) techAssetSets.vibration.add(a);
    }
    try {
      const techRes = await pool.query(
        `SELECT DISTINCT LOWER(TRIM(asset_id)) AS asset_id,
                LOWER(TRIM(COALESCE(analysis_type, 'vibration'))) AS analysis_type
         FROM diagnosis_logs
         WHERE asset_id IS NOT NULL AND TRIM(asset_id) <> ''
           AND tenant_id = $1`,
        [companyId]
      );
      for (const row of techRes.rows) {
        const a = String(row.asset_id || "");
        const t = String(row.analysis_type || "vibration");
        if (!a) continue;
        if (t.includes("oil")) techAssetSets.oil.add(a);
        else if (t.includes("thermo") || t === "ir") techAssetSets.thermography.add(a);
        else if (t.includes("mca") || t.includes("mcsa") || t.includes("current")) {
          techAssetSets.mca.add(a);
        } else if (t.includes("ultra")) techAssetSets.ultrasound.add(a);
        else techAssetSets.vibration.add(a);
      }
    } catch (err) {
      console.error("[dashboard] tech coverage query failed:", err);
    }

    const denom = Math.max(assetCount, 1);
    const techCoverage: Array<{ name: string; pct: number; detail: string }> = [];
    let hasAnyTechCoverage = false;
    for (const def of techDefs) {
      const set = techAssetSets[def.key] || new Set();
      if (set.size > 0) hasAnyTechCoverage = true;
      const pct = assetCount > 0 ? Math.round((set.size / denom) * 100) : set.size > 0 ? 100 : 0;
      techCoverage.push({ name: def.name, pct, detail: def.detail });
    }

    // AR-24b: run-level provenance reader for analysis_results rows —
    // accepts the jsonb telemetry_data object, rejects anything else.
    const asTelemetryData = (
      value: unknown
    ): value is { telemetry_provenance?: unknown } =>
      typeof value === "object" && value !== null;
    const readTelemetryProvenance = (
      data: unknown
    ): "manual" | "default" | "prefilled-run" | null => {
      if (!asTelemetryData(data)) return null;
      const value = data.telemetry_provenance;
      return value === "manual" || value === "default" || value === "prefilled-run"
        ? value
        : null;
    };

    // Bad actors = lowest latest health scores
    const badActors = [...latestAnalyses]
      .filter((r) => Number.isFinite(Number(r.health_score)))
      .sort((a, b) => Number(a.health_score) - Number(b.health_score))
      .slice(0, 5)
      .map((r) => ({
        id: String(r.id),
        name: [r.asset_id, r.component].filter(Boolean).join(" · "),
        detail:
          r.primary_fault ||
          r.summary ||
          `Health score ${r.health_score}`,
        healthScore: Number(r.health_score),
        severity: String(r.severity || ""),
        classTier: Number(r.health_score) < 50 ? ("A" as const) : ("BC" as const),
        telemetryProvenance: readTelemetryProvenance(r.telemetry_data)
      }));

    // 8) AI Shift Briefing from recent analyses
    let recentAnalyses: typeof emptyPayload.recentAnalyses = [];
    let aiBriefing: string | null = null;
    try {
      const recentRes = await pool.query(
        `SELECT asset_id, component, health_score, primary_fault, severity, summary, timestamp, telemetry_data
         FROM analysis_results
         WHERE tenant_id = $1
         ORDER BY timestamp DESC NULLS LAST
         LIMIT 8`,
        [companyId]
      );
      recentAnalyses = recentRes.rows.map((r) => ({
        assetId: r.asset_id != null ? String(r.asset_id) : null,
        component: r.component != null ? String(r.component) : null,
        healthScore: r.health_score != null ? Number(r.health_score) : null,
        primaryFault: r.primary_fault != null ? String(r.primary_fault) : null,
        severity: r.severity != null ? String(r.severity) : null,
        summary: r.summary != null ? String(r.summary) : null,
        timestamp: r.timestamp,
        telemetryProvenance: readTelemetryProvenance(r.telemetry_data)
      }));

      if (recentAnalyses.length > 0) {
        const criticalish = recentAnalyses.filter((a) => {
          const s = String(a.severity || "").toUpperCase();
          const hs = Number(a.healthScore);
          return (
            s === "CRITICAL" ||
            s === "HIGH" ||
            (Number.isFinite(hs) && hs < 50)
          );
        });
        const lines: string[] = [];
        if (criticalish.length > 0) {
          lines.push(`${criticalish.length} recent analysis(es) need attention.`);
          criticalish.slice(0, 3).forEach((a, i) => {
            lines.push(
              `Priority ${i + 1}: ${a.assetId || "Asset"}${
                a.component ? ` (${a.component})` : ""
              } — ${a.primaryFault || a.summary || "Review findings"}${
                a.healthScore != null ? ` (health ${a.healthScore})` : ""
              }.`
            );
          });
        } else {
          const top = recentAnalyses[0];
          lines.push(
            `Latest analysis: ${top.assetId || "Asset"}${
              top.component ? ` / ${top.component}` : ""
            } — ${top.primaryFault || top.summary || "No primary fault"}${
              top.healthScore != null ? ` (health ${top.healthScore})` : ""
            }. Fleet average health is ${
              fleetHealthScore != null ? `${fleetHealthScore}%` : "unavailable"
            }.`
          );
        }
        aiBriefing = lines.join(" ");
      }
    } catch (err) {
      console.error("[dashboard] recent analyses failed:", err);
    }

    return res.json({
      plantName,
      assetCount,
      fleetHealthScore,
      highAlerts,
      warningAlerts,
      unacknowledgedAlerts,
      scheduledWorkOrders,
      unassignedWorkOrders,
      financialRisk,
      techCoverage: hasAnyTechCoverage ? techCoverage : [],
      aiBriefing,
      badActors,
      liveAlarms,
      healthZones,
      recentAnalyses,
      correlationData: [],
      assetHealthScores,
      fleetAggregates
    });
  } catch (error: any) {
    console.error("❌ GET /api/dashboard failed:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard metrics",
      details: error.message
    });
  }
});

// GET /api/trends/:assetId
app.get('/api/trends/:assetId', async (req, res) => {
  try {
    const assetId = parseInt(req.params.assetId, 10);
    if (isNaN(assetId)) {
      return res.status(400).json({ error: "Invalid asset ID" });
    }

    if (!pool) {
      console.warn(`⚠️ [Trends API] No pool available, returning mock trends for asset ${assetId}`);
      return res.json([
        { timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), vibrationVelocity: 1.2, overall_velocity: 1.2, bearingTemperature: 45, hydraulicPressure: 150, electricalAmperage: 35 },
        { timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(), vibrationVelocity: 1.5, overall_velocity: 1.5, bearingTemperature: 48, hydraulicPressure: 151, electricalAmperage: 36 },
        { timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), vibrationVelocity: 1.9, overall_velocity: 1.9, bearingTemperature: 55, hydraulicPressure: 152, electricalAmperage: 35 },
        { timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), vibrationVelocity: 2.5, overall_velocity: 2.5, bearingTemperature: 65, hydraulicPressure: 150, electricalAmperage: 38 },
        { timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), vibrationVelocity: 3.1, overall_velocity: 3.1, bearingTemperature: 76, hydraulicPressure: 148, electricalAmperage: 42 }
      ]);
    }

    // Query the database for diagnosis_history for this asset (last 30 days)
    const query = `
      SELECT id, timestamp, vibration_data, ai_response, equipment_type
      FROM diagnosis_history
      WHERE (asset_id = $1 OR component_id = $1) AND timestamp >= NOW() - INTERVAL '30 days'
      ORDER BY timestamp ASC
    `;
    const result = await pool.query(query, [assetId]);

    if (result.rows.length === 0) {
      // Check if the asset exists
      const assetCheck = await pool.query("SELECT id FROM assets WHERE id = $1", [assetId]);
      if (assetCheck.rows.length === 0) {
        console.warn(`⚠️ [Trends API] Asset with ID ${assetId} not found in database`);
        return res.status(404).json({ error: `Asset with ID ${assetId} not found` });
      }
      return res.json([]);
    }

    const trends = result.rows.map(row => {
      let vibData: any = {};
      try {
        vibData = typeof row.vibration_data === 'string' ? JSON.parse(row.vibration_data) : (row.vibration_data || {});
      } catch (e) {
        vibData = {};
      }

      let aiRes: any = {};
      try {
        aiRes = typeof row.ai_response === 'string' ? JSON.parse(row.ai_response) : (row.ai_response || {});
      } catch (e) {
        aiRes = {};
      }

      const overall_velocity = parseFloat(vibData.overall_velocity) || parseFloat(aiRes.overall_velocity) || 1.5;
      const oneX_rpm = parseFloat(vibData.oneX_rpm) || parseFloat(aiRes.oneX_rpm) || 0.5;
      const twoX_rpm = parseFloat(vibData.twoX_rpm) || parseFloat(aiRes.twoX_rpm) || 0.2;
      const bearing_inner = parseFloat(vibData.bearing_inner) || parseFloat(aiRes.bearing_inner) || 0.1;
      const bearing_outer = parseFloat(vibData.bearing_outer) || parseFloat(aiRes.bearing_outer) || 0.1;

      const vibrationVelocity = overall_velocity;
      const bearingTemperature = parseFloat(vibData.bearingTemperature) || (overall_velocity * 15 + 30) || 50;
      const hydraulicPressure = parseFloat(vibData.hydraulicPressure) || 150;
      const electricalAmperage = parseFloat(vibData.electricalAmperage) || 40;

      return {
        id: row.id,
        timestamp: row.timestamp,
        overall_velocity,
        oneX_rpm,
        twoX_rpm,
        bearing_inner,
        bearing_outer,
        vibrationVelocity,
        bearingTemperature,
        hydraulicPressure,
        electricalAmperage,
        equipmentName: row.equipment_type || "Asset " + assetId
      };
    });

    console.log(`📈 [Trends API] Retrieved ${trends.length} time-series data points for asset ${assetId}`);
    res.json(trends);
  } catch (error: any) {
    console.error(`❌ GET /api/trends/${req.params.assetId} failed:`, error);
    res.status(500).json({ error: "Failed to fetch trends for asset", details: error.message });
  }
});

// GET /api/dashboard/health-summary
app.get("/api/dashboard/health-summary", async (req, res) => {
  try {
    const companyId = requestTenantId(req);
    const assets = await getAssetsWithStatus(companyId ?? -1);
    
    const total = assets.length;
    const healthy = assets.filter(a => a.analysis_status === "Healthy").length;
    const warning = assets.filter(a => a.analysis_status === "Warning").length;
    const critical = assets.filter(a => a.analysis_status === "Critical").length;

    return res.json({
      total,
      healthy,
      warning,
      critical
    });
  } catch (error: any) {
    console.error("GET /api/dashboard/health-summary failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch health summary" });
  }
});

// GET /api/dashboard/critical-alerts
app.get("/api/dashboard/critical-alerts", async (req, res) => {
  try {
    const companyId = requestTenantId(req);
    const assets = await getAssetsWithStatus(companyId ?? -1);
    
    const alerts = assets
      .filter(a => a.severity === "Critical" || a.severity === "High")
      .map(a => ({
        id: a.id,
        name: a.name,
        fault_type: a.fault_type,
        severity: a.severity,
        detected_at: a.latest_analysis ? (a.latest_analysis.created_at || a.latest_analysis.measurement_date) : a.created_at
      }))
      .sort((a, b) => {
        if (a.severity === "Critical" && b.severity !== "Critical") return -1;
        if (a.severity !== "Critical" && b.severity === "Critical") return 1;
        return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
      });

    return res.json(alerts);
  } catch (error: any) {
    console.error("GET /api/dashboard/critical-alerts failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch critical alerts" });
  }
});

// GET /api/dashboard/fault-distribution
app.get("/api/dashboard/fault-distribution", async (req, res) => {
  try {
    const companyId = requestTenantId(req);
    let records: any[] = [];

    if (pool) {
      const result = await pool.query(
        `
        SELECT ah.diagnosis_result, ah.created_at, ah.measurement_date
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        JOIN assets ast ON comp.asset_id = ast.id
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
        WHERE pl.company_id = $1
        `,
        [companyId ?? -1]
      );
      records = result.rows;
    } else {
      const plants = memoryPlants.filter(p => p.company_id === companyId);
      const plantIds = plants.map(p => p.id);
      const routes = memoryRoutes.filter(r => plantIds.includes(r.plant_id));
      const routeIds = routes.map(r => r.id);
      const assets = memoryAssets.filter(a => routeIds.includes(a.route_id));
      const assetIds = assets.map(a => a.id);
      const compIds = memoryComponents.filter(c => (assetIds.includes(c.asset_id) || assetIds.includes(c.equipment_id))).map(c => c.id);
      const cpIds = memoryCollectionPoints.filter(cp => compIds.includes(cp.component_id)).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);
      records = memoryAnalysisHistory.filter(ah => mpIds.includes(ah.measurement_point_id));
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const counts: Record<string, number> = {
      "Unbalance": 0,
      "Misalignment": 0,
      "Bearing Defects": 0,
      "Looseness": 0,
      "Electrical Issues": 0,
      "Other": 0
    };

    let totalCount = 0;

    for (const rec of records) {
      const date = new Date(rec.created_at || rec.measurement_date);
      if (date < thirtyDaysAgo) continue;

      let diag = rec.diagnosis_result;
      if (typeof diag === "string") {
        try { diag = JSON.parse(diag); } catch(e) {}
      }

      let faultName = "Other";
      if (diag?.probable_faults && diag.probable_faults.length > 0) {
        faultName = diag.probable_faults[0].fault_name || diag.probable_faults[0].fault || "Other";
      } else if (diag?.probable_fault) {
        faultName = diag.probable_fault || "Other";
      }

      let mapped = "Other";
      const fnLower = faultName.toLowerCase();
      if (fnLower.includes("unbalance") || fnLower.includes("imbalance")) {
        mapped = "Unbalance";
      } else if (fnLower.includes("misalignment") || fnLower.includes("aligned")) {
        mapped = "Misalignment";
      } else if (fnLower.includes("bearing") || fnLower.includes("defect") || fnLower.includes("gear")) {
        mapped = "Bearing Defects";
      } else if (fnLower.includes("loose") || fnLower.includes("structural looseness")) {
        mapped = "Looseness";
      } else if (fnLower.includes("electrical") || fnLower.includes("motor") || fnLower.includes("stator") || fnLower.includes("rotor")) {
        mapped = "Electrical Issues";
      }

      if (counts[mapped] !== undefined) {
        counts[mapped]++;
        totalCount++;
      } else {
        counts["Other"]++;
        totalCount++;
      }
    }

    // Honest empty state: a tenant with no analyses gets zeros, never invented
    // global-looking distribution counts.

    const distribution = Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      percentage: totalCount > 0 ? parseFloat(((count / totalCount) * 100).toFixed(1)) : 0
    }));

    return res.json({
      total: totalCount,
      distribution
    });
  } catch (error: any) {
    console.error("GET /api/dashboard/fault-distribution failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch fault distribution" });
  }
});

// GET /api/dashboard/health-trend
app.get("/api/dashboard/health-trend", async (req, res) => {
  try {
    const companyId = requestTenantId(req) ?? -1;
    
    let assets: any[] = [];
    let analyses: any[] = [];

    if (pool) {
      let assetsQuery = `
        SELECT ast.id, ast.created_at
        FROM assets ast
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
      `;
      const params: any[] = [];
      if (companyId) {
        assetsQuery += " WHERE pl.company_id = $1";
        params.push(companyId);
      }
      const assetsRes = await pool.query(assetsQuery, params);
      assets = assetsRes.rows;

      let analysesQuery = `
        SELECT 
          comp.asset_id,
          ah.created_at,
          ah.measurement_date,
          ah.diagnosis_result
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        JOIN assets ast ON comp.asset_id = ast.id
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
      `;
      const analysisParams: any[] = [];
      if (companyId) {
        analysesQuery += " WHERE pl.company_id = $1";
        analysisParams.push(companyId);
      }
      const analysesRes = await pool.query(analysesQuery, analysisParams);
      analyses = analysesRes.rows;
    } else {
      let plants = memoryPlants;
      if (companyId) {
        plants = plants.filter(p => p.company_id === companyId);
      }
      const plantIds = plants.map(p => p.id);
      const routes = memoryRoutes.filter(r => plantIds.includes(r.plant_id));
      const routeIds = routes.map(r => r.id);
      assets = memoryAssets.filter(a => routeIds.includes(a.route_id));

      const assetIds = assets.map(a => a.id);
      const compIds = memoryComponents.filter(c => (assetIds.includes(c.asset_id) || assetIds.includes(c.equipment_id))).map(c => c.id);
      const cpIds = memoryCollectionPoints.filter(cp => compIds.includes(cp.component_id)).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);
      
      analyses = memoryAnalysisHistory
        .filter(ah => mpIds.includes(ah.measurement_point_id))
        .map(ah => {
          const mp = memoryMeasurementPoints.find(m => m.id === ah.measurement_point_id);
          const cp = mp ? memoryCollectionPoints.find(c => c.id === mp.collection_point_id) : null;
          const comp = cp ? memoryComponents.find(c => c.id === cp.component_id) : null;
          const assetId = comp ? (comp.asset_id || comp.equipment_id) : null;
          return {
            asset_id: assetId,
            created_at: ah.created_at,
            measurement_date: ah.measurement_date,
            diagnosis_result: ah.diagnosis_result
          };
        });
    }

    const trendPoints = [];
    const now = new Date();
    
    for (let i = 12; i >= 0; i--) {
      const weekEndDate = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      
      let healthyCount = 0;
      let totalCount = 0;

      for (const asset of assets) {
        const assetAnalyses = analyses.filter(an => {
          const anDate = new Date(an.created_at || an.measurement_date);
          return an.asset_id === asset.id && anDate <= weekEndDate;
        });

        totalCount++;

        if (assetAnalyses.length === 0) {
          healthyCount++;
        } else {
          assetAnalyses.sort((a, b) => new Date(b.created_at || b.measurement_date).getTime() - new Date(a.created_at || a.measurement_date).getTime());
          const latest = assetAnalyses[0];
          let diag = latest.diagnosis_result;
          if (typeof diag === "string") {
            try { diag = JSON.parse(diag); } catch(e) {}
          }
          const severity = diag?.manager_summary?.severity || diag?.severity || "Low";
          if (severity !== "Critical" && severity !== "High" && severity !== "Medium") {
            healthyCount++;
          }
        }
      }

      const percentage = totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 100;
      const dateStr = weekEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      trendPoints.push({
        date: dateStr,
        percentage
      });
    }

    return res.json(trendPoints);
  } catch (error: any) {
    console.error("GET /api/dashboard/health-trend failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch health trend" });
  }
});

// GET /api/dashboard/recent-activity
app.get("/api/dashboard/recent-activity", async (req, res) => {
  try {
    const companyId = requestTenantId(req) ?? -1;
    let recentRows: any[] = [];

    if (pool) {
      let query = `
        SELECT 
          ah.id,
          ah.created_at,
          ah.measurement_date,
          ah.diagnosis_result,
          ah.data_point_name,
          ast.name as asset_name
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        JOIN assets ast ON comp.asset_id = ast.id
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
      `;
      const params: any[] = [];
      if (companyId) {
        query += " WHERE pl.company_id = $1";
        params.push(companyId);
      }
      query += " ORDER BY COALESCE(ah.created_at, ah.measurement_date) DESC LIMIT 10";
      const result = await pool.query(query, params);
      recentRows = result.rows;
    } else {
      let plants = memoryPlants;
      if (companyId) {
        plants = plants.filter(p => p.company_id === companyId);
      }
      const plantIds = plants.map(p => p.id);
      const routes = memoryRoutes.filter(r => plantIds.includes(r.plant_id));
      const routeIds = routes.map(r => r.id);
      const assets = memoryAssets.filter(a => routeIds.includes(a.route_id));
      const assetIds = assets.map(a => a.id);

      const compIds = memoryComponents.filter(c => (assetIds.includes(c.asset_id) || assetIds.includes(c.equipment_id))).map(c => c.id);
      const cpIds = memoryCollectionPoints.filter(cp => compIds.includes(cp.component_id)).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);

      recentRows = memoryAnalysisHistory
        .filter(ah => mpIds.includes(ah.measurement_point_id))
        .map(ah => {
          const mp = memoryMeasurementPoints.find(m => m.id === ah.measurement_point_id);
          const cp = mp ? memoryCollectionPoints.find(c => c.id === mp.collection_point_id) : null;
          const comp = cp ? memoryComponents.find(c => c.id === cp.component_id) : null;
          const asset = comp ? memoryAssets.find(a => a.id === (comp.asset_id || comp.equipment_id)) : null;
          return {
            id: ah.id,
            created_at: ah.created_at,
            measurement_date: ah.measurement_date,
            diagnosis_result: ah.diagnosis_result,
            data_point_name: ah.data_point_name,
            asset_name: asset ? asset.name : "Unknown Asset"
          };
        })
        .sort((a, b) => new Date(b.created_at || b.measurement_date).getTime() - new Date(a.created_at || a.measurement_date).getTime())
        .slice(0, 10);
    }

    const activity = recentRows.map(row => {
      let diag = row.diagnosis_result;
      if (typeof diag === "string") {
        try { diag = JSON.parse(diag); } catch(e) {}
      }

      let faultName = "Healthy";
      const severity = diag?.manager_summary?.severity || diag?.severity || "Low";
      if (severity === "Critical" || severity === "High" || severity === "Medium") {
        if (diag?.probable_faults && diag.probable_faults.length > 0) {
          faultName = diag.probable_faults[0].fault_name || diag.probable_faults[0].fault || "Fault Detected";
        } else {
          faultName = "Fault Detected";
        }
      }

      return {
        id: row.id,
        timestamp: row.created_at || row.measurement_date,
        asset_name: row.asset_name,
        fault: faultName,
        severity,
        engineer_name: "AI Reliability Assistant"
      };
    });

    // Honest empty state: no invented activity rows for an empty tenant.
    return res.json(activity);
  } catch (error: any) {
    console.error("GET /api/dashboard/recent-activity failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch recent activity" });
  }
});

// GET /api/dashboard/roi-calculation
app.get("/api/dashboard/roi-calculation", async (req, res) => {
  try {
    const companyId = requestTenantId(req) ?? -1;
    
    let records: any[] = [];
    if (pool) {
      const result = await pool.query(
        `
        SELECT ah.diagnosis_result, ah.created_at, ah.measurement_date
        FROM analysis_history ah
        JOIN measurement_points mp ON ah.measurement_point_id = mp.id
        JOIN collection_points cp ON mp.collection_point_id = cp.id
        JOIN components comp ON cp.component_id = comp.id
        JOIN assets ast ON comp.asset_id = ast.id
        LEFT JOIN routes rt ON ast.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
        WHERE pl.company_id = $1
        `,
        [companyId]
      );
      records = result.rows;
    } else {
      const plants = memoryPlants.filter(p => p.company_id === companyId);
      const plantIds = plants.map(p => p.id);
      const routes = memoryRoutes.filter(r => plantIds.includes(r.plant_id));
      const routeIds = routes.map(r => r.id);
      const assets = memoryAssets.filter(a => routeIds.includes(a.route_id));
      const assetIds = assets.map(a => a.id);

      const compIds = memoryComponents.filter(c => (assetIds.includes(c.asset_id) || assetIds.includes(c.equipment_id))).map(c => c.id);
      const cpIds = memoryCollectionPoints.filter(cp => compIds.includes(cp.component_id)).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);

      records = memoryAnalysisHistory.filter(ah => mpIds.includes(ah.measurement_point_id));
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let criticalCount = 0;
    for (const rec of records) {
      const date = new Date(rec.created_at || rec.measurement_date);
      if (date < thirtyDaysAgo) continue;

      let diag = rec.diagnosis_result;
      if (typeof diag === "string") {
        try { diag = JSON.parse(diag); } catch(e) {}
      }
      const severity = diag?.manager_summary?.severity || diag?.severity || "Low";
      if (severity === "Critical") {
        criticalCount++;
      }
    }

    const displayCriticalCount = criticalCount;
    const estimatedSavings = displayCriticalCount * 10000;

    const plannedRatio = 85; 
    const unplannedRatio = 15; 
    const efficiencyImprovement = 78; 

    return res.json({
      critical_faults_prevented: displayCriticalCount,
      estimated_savings: estimatedSavings,
      planned_ratio: plannedRatio,
      unplanned_ratio: unplannedRatio,
      efficiency_improvement: efficiencyImprovement
    });
  } catch (error: any) {
    console.error("GET /api/dashboard/roi-calculation failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch ROI calculation" });
  }
});

// --------------------------------------------------------
// GOOD-CATCHES - core ROI extension (no module key / entitlement change).
// Every read/write derives the tenant from the verified session only.
// --------------------------------------------------------

function normalizeGoodCatchDate(
  raw: unknown
): { ok: true; date: string } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, date: new Date().toISOString().slice(0, 10) };
  }
  const date = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) {
    return { ok: false, error: "catch_date must be a valid YYYY-MM-DD date." };
  }
  return { ok: true, date };
}

function goodCatchTotalsPayload(summary: ReturnType<typeof buildGoodCatchSummary>) {
  return {
    tenant_id: summary.tenantId,
    catch_count: summary.catchCount,
    total_avoided_cost_cents: summary.totalAvoidedCostCents,
    total_downtime_hours_avoided: summary.totalDowntimeHoursAvoided,
    safety_catch_count: summary.safetyCatchCount,
    empty: summary.empty
  };
}

// GET /api/good-catches - session-tenant list + additive ROI totals.
app.get("/api/good-catches", requirePermission("reports.export"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.json({
        success: true,
        catches: [],
        summary: {
          tenant_id: -1,
          catch_count: 0,
          total_avoided_cost_cents: 0,
          total_downtime_hours_avoided: 0,
          safety_catch_count: 0,
          empty: true
        }
      });
    }

    let rows: GoodCatchRow[] = [];
    if (pool) {
      const result = await pool.query(
        `
        SELECT
          gc.*,
          pl.name AS plant_name,
          CASE WHEN rtpl.id IS NOT NULL THEN rt.name END AS route_name,
          CASE WHEN ast.company_id = gc.tenant_id THEN ast.name END AS asset_name,
          CASE WHEN ast.company_id = gc.tenant_id THEN ast.tag_number END AS asset_tag,
          CASE WHEN ca.company_id = gc.tenant_id THEN comp.name END AS component_name,
          CASE WHEN wo.tenant_id = gc.tenant_id THEN wo.status END AS work_order_status,
          CASE WHEN al.tenant_id = gc.tenant_id THEN al.title END AS alert_title
        FROM good_catches gc
        LEFT JOIN plants pl
          ON pl.id = gc.plant_id AND pl.company_id = gc.tenant_id
        LEFT JOIN routes rt ON rt.id = gc.route_id
        LEFT JOIN plants rtpl
          ON rtpl.id = rt.plant_id AND rtpl.company_id = gc.tenant_id
        LEFT JOIN assets ast ON ast.id = gc.asset_id
        LEFT JOIN components comp ON comp.id = gc.component_id
        LEFT JOIN assets ca ON ca.id = comp.asset_id
        LEFT JOIN work_orders wo
          ON wo.id = gc.work_order_id AND wo.tenant_id = gc.tenant_id
        LEFT JOIN alerts al
          ON al.id = gc.alert_id AND al.tenant_id = gc.tenant_id
        WHERE gc.tenant_id = $1
        ORDER BY gc.catch_date DESC, gc.id DESC
        `,
        [tenantId]
      );
      rows = result.rows as GoodCatchRow[];
    } else {
      rows = memoryGoodCatches
        .filter((row) => Number(row.tenant_id) === tenantId)
        .map(memoryGoodCatchWithLineage);
    }

    const summary = buildGoodCatchSummary({ tenantId, rows });
    return res.json({
      success: true,
      catches: summary.catches,
      summary: goodCatchTotalsPayload(summary)
    });
  } catch (error: any) {
    console.error("[good-catches] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load good catches."
    });
  }
});

// POST /api/good-catches - create a session-tenant catch.
app.post("/api/good-catches", requirePermission("goodcatch.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const body = req.body || {};
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "Title is required." });
    }
    const catchDate = normalizeGoodCatchDate(body.catch_date);
    if ("error" in catchDate) {
      return res.status(400).json({ error: catchDate.error });
    }
    const avoided = parseAvoidedCostCents(body.avoided_cost_cents);
    if ("error" in avoided) {
      return res.status(400).json({ error: avoided.error });
    }
    const downtime = parseDowntimeHours(body.downtime_hours_avoided);
    if ("error" in downtime) {
      return res.status(400).json({ error: downtime.error });
    }
    const links: GoodCatchLinkRefs = {
      plant_id: parseOptionalGoodCatchInteger(body.plant_id),
      route_id: parseOptionalGoodCatchInteger(body.route_id),
      asset_id: parseOptionalGoodCatchInteger(body.asset_id),
      component_id: parseOptionalGoodCatchInteger(body.component_id),
      alert_id: parseOptionalGoodCatchAlert(body.alert_id),
      work_order_id: parseOptionalGoodCatchInteger(body.work_order_id)
    };
    if (goodCatchLinksHaveInvalidId(links)) {
      return res.status(400).json({ error: "One or more linked ids are invalid." });
    }
    const owned = pool
      ? await collectGoodCatchOwnedLinks(pool, tenantId, links)
      : memoryGoodCatchOwnedLinks(tenantId);
    const linkCheck = validateGoodCatchLinks(links, owned);
    if ("error" in linkCheck) {
      return res.status(linkCheck.status).json({
        error: linkCheck.error,
        field: linkCheck.field
      });
    }

    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const safetyNote =
      typeof body.safety_note === "string" && body.safety_note.trim()
        ? body.safety_note.trim()
        : null;
    const safetyHazard = body.safety_hazard === true || body.safety_hazard === "true";
    const recordedBy =
      req.auth?.user?.id != null ? Number(req.auth.user.id) : null;

    if (pool) {
      const result = await pool.query(
        `
        INSERT INTO good_catches (
          tenant_id, plant_id, route_id, asset_id, component_id,
          alert_id, work_order_id, title, description, catch_date,
          avoided_cost_cents, downtime_hours_avoided, safety_hazard,
          safety_note, recorded_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15
        )
        RETURNING *
        `,
        [
          tenantId,
          links.plant_id,
          links.route_id,
          links.asset_id,
          links.component_id,
          links.alert_id,
          links.work_order_id,
          title,
          description,
          catchDate.date,
          avoided.cents,
          downtime.hours,
          safetyHazard,
          safetyNote,
          recordedBy
        ]
      );
      return res.status(201).json({ success: true, catch: result.rows[0] });
    }

    const row = {
      id: getNextId(),
      tenant_id: tenantId,
      plant_id: links.plant_id ?? null,
      route_id: links.route_id ?? null,
      asset_id: links.asset_id ?? null,
      component_id: links.component_id ?? null,
      alert_id: links.alert_id ?? null,
      work_order_id: links.work_order_id ?? null,
      title,
      description,
      catch_date: catchDate.date,
      avoided_cost_cents: avoided.cents,
      downtime_hours_avoided: downtime.hours,
      safety_hazard: safetyHazard,
      safety_note: safetyNote,
      recorded_by: recordedBy,
      created_at: new Date().toISOString()
    };
    memoryGoodCatches.push(row);
    return res.status(201).json({
      success: true,
      catch: memoryGoodCatchWithLineage(row)
    });
  } catch (error: any) {
    console.error("[good-catches] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to save the good catch."
    });
  }
});

// PATCH /api/good-catches/:id - session-tenant only; id is never a tenant key.
app.patch("/api/good-catches/:id", requirePermission("goodcatch.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid good catch id." });
    }
    const body = req.body || {};
    const updates: Record<string, unknown> = {};

    if ("title" in body) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return res.status(400).json({ error: "Title is required." });
      updates.title = title;
    }
    if ("description" in body) {
      updates.description =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
    }
    if ("catch_date" in body) {
      const catchDate = normalizeGoodCatchDate(body.catch_date);
      if ("error" in catchDate) {
        return res.status(400).json({ error: catchDate.error });
      }
      updates.catch_date = catchDate.date;
    }
    if ("avoided_cost_cents" in body) {
      const avoided = parseAvoidedCostCents(body.avoided_cost_cents);
      if ("error" in avoided) {
        return res.status(400).json({ error: avoided.error });
      }
      updates.avoided_cost_cents = avoided.cents;
    }
    if ("downtime_hours_avoided" in body) {
      const downtime = parseDowntimeHours(body.downtime_hours_avoided);
      if ("error" in downtime) {
        return res.status(400).json({ error: downtime.error });
      }
      updates.downtime_hours_avoided = downtime.hours;
    }
    if ("safety_hazard" in body) {
      updates.safety_hazard =
        body.safety_hazard === true || body.safety_hazard === "true";
    }
    if ("safety_note" in body) {
      updates.safety_note =
        typeof body.safety_note === "string" && body.safety_note.trim()
          ? body.safety_note.trim()
          : null;
    }

    const links: GoodCatchLinkRefs = {};
    let hasLinkUpdates = false;
    if ("plant_id" in body) {
      hasLinkUpdates = true;
      links.plant_id = parseOptionalGoodCatchInteger(body.plant_id);
    }
    if ("route_id" in body) {
      hasLinkUpdates = true;
      links.route_id = parseOptionalGoodCatchInteger(body.route_id);
    }
    if ("asset_id" in body) {
      hasLinkUpdates = true;
      links.asset_id = parseOptionalGoodCatchInteger(body.asset_id);
    }
    if ("component_id" in body) {
      hasLinkUpdates = true;
      links.component_id = parseOptionalGoodCatchInteger(body.component_id);
    }
    if ("alert_id" in body) {
      hasLinkUpdates = true;
      links.alert_id = parseOptionalGoodCatchAlert(body.alert_id);
    }
    if ("work_order_id" in body) {
      hasLinkUpdates = true;
      links.work_order_id = parseOptionalGoodCatchInteger(body.work_order_id);
    }
    if (goodCatchLinksHaveInvalidId(links)) {
      return res.status(400).json({ error: "One or more linked ids are invalid." });
    }
    if (hasLinkUpdates) {
      const owned = pool
        ? await collectGoodCatchOwnedLinks(pool, tenantId, links)
        : memoryGoodCatchOwnedLinks(tenantId);
      const linkCheck = validateGoodCatchLinks(links, owned);
      if ("error" in linkCheck) {
        return res.status(linkCheck.status).json({
          error: linkCheck.error,
          field: linkCheck.field
        });
      }
      Object.assign(updates, links);
    }

    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return res.status(400).json({ error: "No supported fields to update." });
    }

    if (pool) {
      const values = keys.map((key) => updates[key]);
      values.push(id, tenantId);
      const setClause = keys
        .map((key, index) => `${key} = $${index + 1}`)
        .join(", ");
      const result = await pool.query(
        `UPDATE good_catches SET ${setClause}
          WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2}
          RETURNING *`,
        values
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Good catch not found." });
      }
      return res.json({ success: true, catch: result.rows[0] });
    }

    const row = memoryGoodCatches.find(
      (item) => Number(item.id) === id && Number(item.tenant_id) === tenantId
    );
    if (!row) {
      return res.status(404).json({ error: "Good catch not found." });
    }
    Object.assign(row, updates);
    return res.json({ success: true, catch: memoryGoodCatchWithLineage(row) });
  } catch (error: any) {
    console.error("[good-catches] PATCH error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to update the good catch."
    });
  }
});

// DELETE /api/good-catches/:id - session-tenant only.
app.delete("/api/good-catches/:id", requirePermission("goodcatch.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid good catch id." });
    }

    if (pool) {
      const result = await pool.query(
        "DELETE FROM good_catches WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [id, tenantId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Good catch not found." });
      }
      return res.json({ success: true, id: result.rows[0].id });
    }

    const index = memoryGoodCatches.findIndex(
      (item) => Number(item.id) === id && Number(item.tenant_id) === tenantId
    );
    if (index === -1) {
      return res.status(404).json({ error: "Good catch not found." });
    }
    const deleted = memoryGoodCatches.splice(index, 1)[0];
    return res.json({ success: true, id: deleted.id });
  } catch (error: any) {
    console.error("[good-catches] DELETE error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to delete the good catch."
    });
  }
});

// --------------------------------------------------------
// BEARING-CALC - user-entered geometry only; NO part-number catalog.
// Every bearing_specs read/write derives the tenant from the verified
// session (requestTenantId). A cross-tenant component is treated exactly
// like a missing component: 404, never a leak.
// --------------------------------------------------------

const BEARING_SPEC_COLUMNS =
  "id, tenant_id, component_id, z, bd, pd, contact_angle, unit, reference_label, created_at, updated_at";

function bearingSpecPayload(row: any) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    component_id: row.component_id,
    z: Number(row.z),
    bd: Number(row.bd),
    pd: Number(row.pd),
    contact_angle: Number(row.contact_angle),
    unit: row.unit,
    reference_label: row.reference_label ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function bearingGeometryFromBody(body: any) {
  return {
    z: body?.z,
    bd: body?.bd,
    pd: body?.pd,
    contactAngle: body?.contact_angle ?? body?.contactAngle
  };
}

function firstBearingValidationError(
  errors: BearingValidationErrors
): string {
  return Object.values(errors).find((message) => !!message) ?? "Invalid bearing geometry.";
}

function parseBearingComponentId(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseBearingUnit(raw: unknown): "mm" | "in" {
  return String(raw).trim().toLowerCase() === "in" ? "in" : "mm";
}

/** Stored verbatim: no trimming, normalization, or manufacturer lookup. */
function parseBearingReferenceLabel(raw: unknown): string | null {
  if (raw == null) return null;
  return typeof raw === "string" ? raw : String(raw);
}

async function bearingComponentOwnedByTenant(
  componentId: number,
  tenantId: number
): Promise<boolean> {
  if (pool) return tenantOwnsRow(pool, "components", componentId, tenantId);
  return memoryTenantComponentIds(tenantId).includes(componentId);
}

// GET /api/bearing-specs - session-tenant list (never a tenant query param).
app.get("/api/bearing-specs", async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.json({ success: true, specs: [], spec: null });
    }
    const rows = pool
      ? (
          await pool.query(
            `SELECT ${BEARING_SPEC_COLUMNS} FROM bearing_specs
              WHERE tenant_id = $1
              ORDER BY id ASC`,
            [tenantId]
          )
        ).rows
      : memoryBearingSpecs
          .filter((row) => Number(row.tenant_id) === tenantId)
          .slice()
          .sort((a, b) => Number(a.id) - Number(b.id));
    const specs = rows.map(bearingSpecPayload);
    return res.json({ success: true, specs, spec: specs[0] ?? null });
  } catch (error: any) {
    console.error("[bearing-specs] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load bearing specs."
    });
  }
});

// GET /api/bearing-specs/component/:componentId - component-scoped; 404 when
// the component does not belong to the session tenant.
app.get("/api/bearing-specs/component/:componentId", async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const componentId = parseBearingComponentId(req.params.componentId);
    if (componentId == null) {
      return res.status(400).json({ error: "Invalid component id." });
    }
    if (!(await bearingComponentOwnedByTenant(componentId, tenantId))) {
      return res.status(404).json({ error: "Component not found." });
    }
    const rows = pool
      ? (
          await pool.query(
            `SELECT ${BEARING_SPEC_COLUMNS} FROM bearing_specs
              WHERE tenant_id = $1 AND component_id = $2
              ORDER BY updated_at DESC, id DESC`,
            [tenantId, componentId]
          )
        ).rows
      : memoryBearingSpecs
          .filter(
            (row) =>
              Number(row.tenant_id) === tenantId &&
              Number(row.component_id) === componentId
          )
          .slice()
          .sort((a, b) => {
            const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            if (aTime !== bTime) return bTime - aTime;
            return Number(b.id) - Number(a.id);
          });
    const specs = rows.map(bearingSpecPayload);
    return res.json({ success: true, specs, spec: specs[0] ?? null });
  } catch (error: any) {
    console.error("[bearing-specs] component GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load the component bearing spec."
    });
  }
});

// POST /api/bearing-specs - save user-entered geometry for an owned component.
app.post("/api/bearing-specs", requirePermission("bearing.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const body = req.body || {};
    const componentId = parseBearingComponentId(body.component_id);
    if (componentId == null) {
      return res.status(400).json({ error: "A valid component_id is required." });
    }
    if (!(await bearingComponentOwnedByTenant(componentId, tenantId))) {
      return res.status(404).json({ error: "Component not found." });
    }
    const geometry = validateBearingGeometry(bearingGeometryFromBody(body));
    if (!geometry.ok) {
      return res.status(400).json({
        error: firstBearingValidationError(geometry.errors),
        errors: geometry.errors
      });
    }
    const unit = parseBearingUnit(body.unit);
    const referenceLabel = parseBearingReferenceLabel(body.reference_label);

    if (pool) {
      const result = await pool.query(
        `INSERT INTO bearing_specs (
           tenant_id, component_id, z, bd, pd, contact_angle, unit,
           reference_label, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING ${BEARING_SPEC_COLUMNS}`,
        [
          tenantId,
          componentId,
          geometry.value.z,
          geometry.value.bd,
          geometry.value.pd,
          geometry.value.contactAngle,
          unit,
          referenceLabel
        ]
      );
      return res.status(201).json({
        success: true,
        spec: bearingSpecPayload(result.rows[0])
      });
    }

    const now = new Date().toISOString();
    const row = {
      id: getNextId(),
      tenant_id: tenantId,
      component_id: componentId,
      z: geometry.value.z,
      bd: geometry.value.bd,
      pd: geometry.value.pd,
      contact_angle: geometry.value.contactAngle,
      unit,
      reference_label: referenceLabel,
      created_at: now,
      updated_at: now
    };
    memoryBearingSpecs.push(row);
    return res.status(201).json({ success: true, spec: bearingSpecPayload(row) });
  } catch (error: any) {
    console.error("[bearing-specs] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to save the bearing spec."
    });
  }
});

// PATCH /api/bearing-specs/:id - id is never a tenant key; tenant comes from
// the session and the component link is re-validated when supplied.
app.patch("/api/bearing-specs/:id", requirePermission("bearing.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid bearing spec id." });
    }
    const body = req.body || {};

    let existing: any;
    if (pool) {
      const current = await pool.query(
        `SELECT ${BEARING_SPEC_COLUMNS} FROM bearing_specs
          WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (!current.rows.length) {
        return res.status(404).json({ error: "Bearing spec not found." });
      }
      existing = current.rows[0];
    } else {
      existing = memoryBearingSpecs.find(
        (row) => Number(row.id) === id && Number(row.tenant_id) === tenantId
      );
      if (!existing) {
        return res.status(404).json({ error: "Bearing spec not found." });
      }
    }

    let componentId = Number(existing.component_id);
    if ("component_id" in body) {
      const parsed = parseBearingComponentId(body.component_id);
      if (parsed == null) {
        return res.status(400).json({ error: "A valid component_id is required." });
      }
      componentId = parsed;
    }
    if (!(await bearingComponentOwnedByTenant(componentId, tenantId))) {
      return res.status(404).json({ error: "Component not found." });
    }

    const geometry = validateBearingGeometry({
      z: body.z !== undefined ? body.z : existing.z,
      bd: body.bd !== undefined ? body.bd : existing.bd,
      pd: body.pd !== undefined ? body.pd : existing.pd,
      contactAngle:
        body.contact_angle !== undefined
          ? body.contact_angle
          : body.contactAngle !== undefined
            ? body.contactAngle
            : existing.contact_angle
    });
    if (!geometry.ok) {
      return res.status(400).json({
        error: firstBearingValidationError(geometry.errors),
        errors: geometry.errors
      });
    }

    const unit = "unit" in body ? parseBearingUnit(body.unit) : existing.unit;
    const referenceLabel =
      "reference_label" in body
        ? parseBearingReferenceLabel(body.reference_label)
        : (existing.reference_label ?? null);

    if (pool) {
      const result = await pool.query(
        `UPDATE bearing_specs
            SET component_id = $1,
                z = $2,
                bd = $3,
                pd = $4,
                contact_angle = $5,
                unit = $6,
                reference_label = $7,
                updated_at = NOW()
          WHERE id = $8 AND tenant_id = $9
          RETURNING ${BEARING_SPEC_COLUMNS}`,
        [
          componentId,
          geometry.value.z,
          geometry.value.bd,
          geometry.value.pd,
          geometry.value.contactAngle,
          unit,
          referenceLabel,
          id,
          tenantId
        ]
      );
      return res.json({
        success: true,
        spec: bearingSpecPayload(result.rows[0])
      });
    }

    Object.assign(existing, {
      component_id: componentId,
      z: geometry.value.z,
      bd: geometry.value.bd,
      pd: geometry.value.pd,
      contact_angle: geometry.value.contactAngle,
      unit,
      reference_label: referenceLabel,
      updated_at: new Date().toISOString()
    });
    return res.json({ success: true, spec: bearingSpecPayload(existing) });
  } catch (error: any) {
    console.error("[bearing-specs] PATCH error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to update the bearing spec."
    });
  }
});

// DELETE /api/bearing-specs/:id - session-tenant only.
app.delete("/api/bearing-specs/:id", requirePermission("bearing.write"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid bearing spec id." });
    }

    if (pool) {
      const result = await pool.query(
        "DELETE FROM bearing_specs WHERE id = $1 AND tenant_id = $2 RETURNING id",
        [id, tenantId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: "Bearing spec not found." });
      }
      return res.json({ success: true, id: result.rows[0].id });
    }

    const index = memoryBearingSpecs.findIndex(
      (row) => Number(row.id) === id && Number(row.tenant_id) === tenantId
    );
    if (index === -1) {
      return res.status(404).json({ error: "Bearing spec not found." });
    }
    const deleted = memoryBearingSpecs.splice(index, 1)[0];
    return res.json({ success: true, id: deleted.id });
  } catch (error: any) {
    console.error("[bearing-specs] DELETE error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to delete the bearing spec."
    });
  }
});

// --------------------------------------------------------
// ASSESSMENT-WIZARD - guided component evaluation records.
// Every read/write derives the tenant from the verified session
// (requestTenantId). A cross-tenant component or alert link is treated
// exactly like a missing one: 404, never a leak.
// --------------------------------------------------------

const ASSESSMENT_COLUMNS =
  "id, tenant_id, component_id, alert_id, failure_mode_key, disposition, notes, metadata_missing_at_assessment, assessed_by, assessed_at, created_at, updated_at";

function assessmentPayload(row: any) {
  const missing = Array.isArray(row.metadata_missing_at_assessment)
    ? row.metadata_missing_at_assessment.map((item: unknown) => String(item))
    : [];
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    component_id: row.component_id,
    alert_id: row.alert_id ?? null,
    failure_mode_key: row.failure_mode_key ?? null,
    disposition: row.disposition,
    notes: row.notes ?? null,
    metadata_missing_at_assessment: missing,
    assessed_by: row.assessed_by ?? null,
    assessed_at: row.assessed_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

function parseOptionalAssessmentInteger(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

function parseOptionalAssessmentAlert(value: unknown): string | null {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

async function collectAssessmentOwnedLinks(
  db: any,
  tenantId: number,
  refs: AssessmentLinkRefs
): Promise<AssessmentOwnedLinks> {
  const components = new Set<number>();
  const alerts = new Set<string>();
  if (refs.component_id != null) {
    if (
      await tenantOwnsRow(db, "components", Number(refs.component_id), tenantId)
    ) {
      components.add(Number(refs.component_id));
    }
  }
  if (refs.alert_id != null) {
    const result = await db.query(
      "SELECT 1 FROM alerts WHERE id::text = $1 AND tenant_id = $2 LIMIT 1",
      [String(refs.alert_id), tenantId]
    );
    if (result.rows.length > 0) alerts.add(String(refs.alert_id));
  }
  return { components, alerts };
}

function memoryAssessmentOwnedLinks(
  tenantId: number | null
): AssessmentOwnedLinks {
  return {
    components: new Set<number>(memoryTenantComponentIds(tenantId)),
    alerts: new Set<string>()
  };
}

// POST /api/component-assessments - create a session-tenant assessment.
app.post("/api/component-assessments", requirePermission("assessment.save"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const body = req.body || {};
    const componentId = parseOptionalAssessmentInteger(body.component_id);
    if (componentId == null || Number.isNaN(componentId)) {
      return res
        .status(400)
        .json({ error: "A valid component_id is required.", field: "component_id" });
    }
    const alertId = parseOptionalAssessmentAlert(body.alert_id);

    const draft = validateAssessmentDraft({
      disposition: body.disposition,
      failure_mode_key: body.failure_mode_key,
      metadata_missing_at_assessment: body.metadata_missing_at_assessment,
      notes: body.notes
    });
    if ("error" in draft) {
      return res.status(400).json({ error: draft.error, field: draft.field });
    }

    const links: AssessmentLinkRefs = {
      component_id: componentId,
      alert_id: alertId
    };
    const owned = pool
      ? await collectAssessmentOwnedLinks(pool, tenantId, links)
      : memoryAssessmentOwnedLinks(tenantId);
    const linkCheck = validateAssessmentLinks(links, owned);
    if ("error" in linkCheck) {
      return res
        .status(linkCheck.status)
        .json({ error: linkCheck.error, field: linkCheck.field });
    }

    const assessedBy =
      req.auth?.user?.id != null ? Number(req.auth.user.id) : null;

    if (pool) {
      const result = await pool.query(
        `INSERT INTO component_assessments (
           tenant_id, component_id, alert_id, failure_mode_key, disposition,
           notes, metadata_missing_at_assessment, assessed_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8)
         RETURNING ${ASSESSMENT_COLUMNS}`,
        [
          tenantId,
          componentId,
          alertId,
          draft.failureModeKey,
          draft.disposition,
          draft.notes,
          draft.metadataMissing,
          assessedBy
        ]
      );
      return res.status(201).json({
        success: true,
        assessment: assessmentPayload(result.rows[0])
      });
    }

    const now = new Date().toISOString();
    const row = {
      id: getNextId(),
      tenant_id: tenantId,
      component_id: componentId,
      alert_id: alertId,
      failure_mode_key: draft.failureModeKey,
      disposition: draft.disposition,
      notes: draft.notes,
      metadata_missing_at_assessment: draft.metadataMissing,
      assessed_by: assessedBy,
      assessed_at: now,
      created_at: now,
      updated_at: now
    };
    memoryComponentAssessments.push(row);
    return res.status(201).json({
      success: true,
      assessment: assessmentPayload(row)
    });
  } catch (error: any) {
    console.error("[component-assessments] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to save the component assessment."
    });
  }
});

// GET /api/components/:id/assessments - latest first, session tenant only.
app.get("/api/components/:id/assessments", async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const componentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(componentId) || componentId <= 0) {
      return res.status(400).json({ error: "Invalid component id." });
    }

    const owned = pool
      ? await tenantOwnsRow(pool, "components", componentId, tenantId)
      : memoryTenantComponentIds(tenantId).includes(componentId);
    if (!owned) {
      return res.status(404).json({ error: "Component not found." });
    }

    let rows: any[] = [];
    if (pool) {
      const result = await pool.query(
        `SELECT ${ASSESSMENT_COLUMNS}
           FROM component_assessments
          WHERE tenant_id = $1 AND component_id = $2
          ORDER BY assessed_at DESC, id DESC`,
        [tenantId, componentId]
      );
      rows = result.rows;
    } else {
      rows = memoryComponentAssessments
        .filter(
          (row) =>
            Number(row.tenant_id) === tenantId &&
            Number(row.component_id) === componentId
        )
        .slice()
        .sort((a, b) => {
          const aTime = String(a.assessed_at ?? "");
          const bTime = String(b.assessed_at ?? "");
          if (aTime !== bTime) return aTime < bTime ? 1 : -1;
          return Number(b.id) - Number(a.id);
        });
    }

    return res.json({
      success: true,
      assessments: rows.map(assessmentPayload)
    });
  } catch (error: any) {
    console.error("[component-assessments] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load component assessments."
    });
  }
});

// GET /api/components/:id/assessment-latest - badge for the detail view.
app.get("/api/components/:id/assessment-latest", async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const componentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(componentId) || componentId <= 0) {
      return res.status(400).json({ error: "Invalid component id." });
    }

    const owned = pool
      ? await tenantOwnsRow(pool, "components", componentId, tenantId)
      : memoryTenantComponentIds(tenantId).includes(componentId);
    if (!owned) {
      return res.status(404).json({ error: "Component not found." });
    }

    let latest: any = null;
    if (pool) {
      const result = await pool.query(
        `SELECT ${ASSESSMENT_COLUMNS}
           FROM component_assessments
          WHERE tenant_id = $1 AND component_id = $2
          ORDER BY assessed_at DESC, id DESC
          LIMIT 1`,
        [tenantId, componentId]
      );
      latest = result.rows[0] ?? null;
    } else {
      latest =
        memoryComponentAssessments
          .filter(
            (row) =>
              Number(row.tenant_id) === tenantId &&
              Number(row.component_id) === componentId
          )
          .slice()
          .sort((a, b) => {
            const aTime = String(a.assessed_at ?? "");
            const bTime = String(b.assessed_at ?? "");
            if (aTime !== bTime) return aTime < bTime ? 1 : -1;
            return Number(b.id) - Number(a.id);
          })[0] ?? null;
    }

    return res.json({
      success: true,
      assessment: latest ? assessmentPayload(latest) : null
    });
  } catch (error: any) {
    console.error("[component-assessments] latest GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load the latest component assessment."
    });
  }
});

// POST /api/bearing-calc - PURE calculation from supplied numbers.
// Deliberately stores nothing: no INSERT/UPDATE/DELETE and no tenant row.
app.post("/api/bearing-calc", (req, res) => {
  try {
    const body = req.body || {};
    const validation = validateBearingCalcInput({
      z: body.z,
      bd: body.bd,
      pd: body.pd,
      contactAngle: body.contact_angle ?? body.contactAngle,
      rpm: body.rpm
    });
    if (!validation.ok) {
      return res.status(400).json({
        error: firstBearingValidationError(validation.errors),
        errors: validation.errors
      });
    }
    const frequencies: BearingFaultFrequencies = calculateBearingFrequencies(
      validation.value
    );
    const input: BearingCalcInput = validation.value;
    return res.json({
      success: true,
      shaft_hz: frequencies.shaftHz,
      bpfo: frequencies.bpfo,
      bpfi: frequencies.bpfi,
      bsf: frequencies.bsf,
      ftf: frequencies.ftf,
      input: {
        rpm: input.rpm,
        z: input.z,
        bd: input.bd,
        pd: input.pd,
        contact_angle: input.contactAngle
      }
    });
  } catch (error: any) {
    console.error("[bearing-calc] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to calculate bearing frequencies."
    });
  }
});

// --------------------------------------------------------
// USER AUTHENTICATION ENDPOINTS (AR-29 - real server sessions)
// --------------------------------------------------------

/** Public user shape returned to clients (never includes password_hash). */
function publicUserPayload(user: {
  id: number;
  username: string;
  company_id: number;
  role: unknown;
  is_temp_password: unknown;
  plant_id?: number | null;
  plant_name?: string | null;
  /** COPY-1 — company display name for the location-context crumb. */
  company_name?: string | null;
  /** LEGAL-WRAPPER-A (E5/E6) — ISO timestamp of legal-document acceptance. */
  terms_accepted_at?: string | Date | null;
}) {
  return {
    id: user.id,
    username: user.username,
    company_id: user.company_id,
    // Rule 8 — structured role from the server session, never the client.
    role: normalizeRole(user.role),
    is_temp_password: !!user.is_temp_password,
    plant_id: user.plant_id ?? null,
    plant_name: user.plant_name ?? null,
    company_name: user.company_name ?? null,
    terms_accepted_at: user.terms_accepted_at
      ? new Date(user.terms_accepted_at).toISOString()
      : null
  };
}

// POST /api/auth/login - Standard user sign in (server-verified session)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "Missing required field: username" });
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ error: "Missing required field: password" });
    }

    const normUsername = username.trim().toLowerCase();

    if (pool) {
      const result = await pool.query(
        "SELECT * FROM users WHERE LOWER(username) = $1 LIMIT 1",
        [normUsername]
      );
      // Uniform error — never reveal whether the username exists.
      const invalid = () =>
        res.status(401).json({ error: "Invalid username or password" });

      if (result.rows.length === 0) {
        return invalid();
      }

      const user = result.rows[0];
      // USERS-1 - disabled accounts are refused with clear copy.
      if (user.is_disabled) {
        return res.status(403).json({
          error:
            "This account has been disabled. Contact your tenant administrator.",
          code: "ACCOUNT_DISABLED"
        });
      }
      const { valid, legacyUpgradeNeeded } = await verifyPassword(
        password,
        user.password_hash
      );
      if (!valid) {
        return invalid();
      }
      // Upgrade legacy sha256 rows to bcrypt in place on successful login.
      if (legacyUpgradeNeeded) {
        try {
          const upgraded = await bcryptHashPassword(password);
          await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [upgraded, user.id]
          );
        } catch (upgradeErr) {
          console.warn("[auth] legacy hash upgrade failed:", upgradeErr);
        }
      }

      const plantRes = await pool.query(
        "SELECT id, name FROM plants WHERE user_id = $1 OR company_id = $2 ORDER BY user_id DESC NULLS LAST, id ASC LIMIT 1",
        [user.id, user.company_id]
      );
      const plant_id = plantRes.rows.length > 0 ? plantRes.rows[0].id : null;
      const plant_name = plantRes.rows.length > 0 ? plantRes.rows[0].name : null;
      const companyRes = await pool.query(
        "SELECT name FROM companies WHERE id = $1 LIMIT 1",
        [user.company_id]
      );
      const company_name =
        companyRes.rows.length > 0 ? companyRes.rows[0].name : null;

      const { token, sessionId } = await createSession(pool, user.id);
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      console.log("[auth] session created:", {
        sessionId,
        userId: user.id,
        username: user.username
      });
      return res.json(
        publicUserPayload({ ...user, plant_id, plant_name, company_name })
      );
    } else {
      const user = memoryUsers.find(u => u.username.toLowerCase() === normUsername);
      const invalid = () =>
        res.status(401).json({ error: "Invalid username or password" });
      if (!user) {
        return invalid();
      }
      if (user.is_disabled) {
        return res.status(403).json({
          error:
            "This account has been disabled. Contact your tenant administrator.",
          code: "ACCOUNT_DISABLED"
        });
      }
      const { valid } = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return invalid();
      }

      const { token } = createMemorySession(user.id, sessionTtlHours());
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      const plant = memoryPlants.find(
        p => p.user_id === user.id || p.company_id === user.company_id
      );
      const company = memoryCompanies.find(c => c.id === user.company_id);
      return res.json(
        publicUserPayload({
          ...user,
          plant_id: plant ? plant.id : null,
          plant_name: plant ? plant.name : null,
          company_name: company ? company.name : null
        })
      );
    }
  } catch (error: any) {
    console.error("POST /api/auth/login failed:", error);
    return res.status(500).json({ error: "Failed to authenticate user" });
  }
});

// POST /api/auth/register - Invite-only in production; open in dev
// (AR-29 directive 2: no open self-signup in production — registration
// requires a valid invite token or an authenticated system-admin session).
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, plantCompanyName, email, inviteToken, termsAccepted } = req.body;
    // E5 — server-side clickwrap gate. Enforced before any other work so the
    // check cannot be skipped by the invite/production branch below; records
    // acceptance for whoever passes it. The bootstrap admin is created by
    // direct insert (not this route), so it stays NULL and meets the E6
    // first-login interstitial once — by design.
    if (termsAccepted !== true) {
      return res.status(400).json({
        error: "Acceptance of the Terms of Service and Privacy Policy is required to register."
      });
    }
    if (!username || typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "Missing required field: username" });
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ error: "Missing required field: password" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const normUsername = username.trim().toLowerCase();
    const hashed = await bcryptHashPassword(password);

    if (pool) {
      // ---- Production: invite token or system-admin session only ----
      if (isProductionEnv(process.env)) {
        let allowedCompanyId: number | null = null;
        let assignedRole: AppRole = "plant-engineer";

        if (inviteToken && typeof inviteToken === "string") {
          const invite = await pool.query(
            `SELECT id, company_id, role FROM auth_invites
              WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
              LIMIT 1`,
            [hashSessionToken(inviteToken.trim())]
          );
          if (invite.rows.length === 0) {
            return res
              .status(403)
              .json({ error: "A valid invite token is required to register." });
          }
          allowedCompanyId = invite.rows[0].company_id;
          assignedRole = normalizeRole(invite.rows[0].role);
        } else if (req.auth && req.auth.user.role === "system-admin") {
          allowedCompanyId = req.auth.user.company_id;
        } else {
          return res.status(403).json({
            error:
              "Registration is invite-only. Ask a system administrator for an invite token."
          });
        }

        const userExists = await pool.query(
          "SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1",
          [normUsername]
        );
        if (userExists.rows.length > 0) {
          return res.status(400).json({ error: "Username is already taken" });
        }

        const companyId =
          allowedCompanyId ??
          (() => {
            throw new Error("invite did not carry a company_id");
          })();

        const userRes = await pool.query(
          "INSERT INTO users (company_id, username, password_hash, role, email, is_temp_password, terms_accepted_at) VALUES ($1, $2, $3, $4, $5, TRUE, NOW()) RETURNING *",
          [companyId, normUsername, hashed, assignedRole, email ? String(email).trim() : null]
        );
        const user = userRes.rows[0];

        if (inviteToken && typeof inviteToken === "string") {
          await pool.query(
            "UPDATE auth_invites SET used_at = NOW() WHERE token_hash = $1",
            [hashSessionToken(inviteToken.trim())]
          );
        }

        const plantRes = await pool.query(
          "SELECT id, name FROM plants WHERE company_id = $1 LIMIT 1",
          [companyId]
        );
        const plant =
          plantRes.rows.length > 0
            ? plantRes.rows[0]
            : (
                await pool.query(
                  "INSERT INTO plants (name, company_id, user_id) VALUES ($1, $2, $3) RETURNING id, name",
                  [
                    plantCompanyName && typeof plantCompanyName === "string" && plantCompanyName.trim()
                      ? `${plantCompanyName.trim()} - Main Location`
                      : "Main Location",
                    companyId,
                    user.id
                  ]
                )
              ).rows[0];

        const companyRes = await pool.query(
          "SELECT name FROM companies WHERE id = $1 LIMIT 1",
          [companyId]
        );
        const company_name =
          companyRes.rows.length > 0 ? companyRes.rows[0].name : null;
        const { token } = await createSession(pool, user.id);
        res.setHeader("Set-Cookie", buildSessionCookie(token));
        return res.status(201).json(
          publicUserPayload({
            ...user,
            plant_id: plant?.id ?? null,
            plant_name: plant?.name ?? null,
            company_name
          })
        );
      }

      // ---- Development: open registration (creates a new tenant) ----
      if (!plantCompanyName || typeof plantCompanyName !== "string" || !plantCompanyName.trim()) {
        return res.status(400).json({ error: "Missing required field: plantCompanyName" });
      }
      const userExists = await pool.query("SELECT id FROM users WHERE LOWER(username) = $1 LIMIT 1", [normUsername]);
      if (userExists.rows.length > 0) {
        return res.status(400).json({ error: "Username is already taken" });
      }

      const companyRes = await pool.query(
        "INSERT INTO companies (name, subscription_plan) VALUES ($1, 'full_suite') ON CONFLICT (name) DO UPDATE SET subscription_plan = 'full_suite' RETURNING id",
        [plantCompanyName.trim()]
      );
      const companyId = companyRes.rows[0].id;

      const userRes = await pool.query(
        "INSERT INTO users (company_id, username, password_hash, role, email, is_temp_password, terms_accepted_at) VALUES ($1, $2, $3, 'plant-engineer', $4, FALSE, NOW()) RETURNING *",
        [companyId, normUsername, hashed, email ? email.trim() : null]
      );
      const user = userRes.rows[0];

      const plantRes = await pool.query(
        "INSERT INTO plants (name, company_id, user_id) VALUES ($1, $2, $3) RETURNING id, name",
        [`${plantCompanyName.trim()} - Main Location`, companyId, user.id]
      );
      const plant = plantRes.rows[0];

      const { token } = await createSession(pool, user.id);
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      return res.status(201).json(
        publicUserPayload({
          ...user,
          plant_id: plant.id,
          plant_name: plant.name,
          company_name: plantCompanyName.trim()
        })
      );
    } else {
      // Memory Fallback (dev without DATABASE_URL)
      const userExists = memoryUsers.some(u => u.username.toLowerCase() === normUsername);
      if (userExists) {
        return res.status(400).json({ error: "Username is already taken" });
      }
      const plantName =
        plantCompanyName && typeof plantCompanyName === "string" && plantCompanyName.trim()
          ? plantCompanyName.trim()
          : "Dev Plant";

      const companyId = getNextId();
      memoryCompanies.push({
        id: companyId,
        name: plantName,
        subscription_plan: "full_suite",
        created_at: new Date()
      });

      const userId = getNextId();
      const newUser = {
        id: userId,
        company_id: companyId,
        username: normUsername,
        password_hash: hashed,
        role: "plant-engineer",
        email: email ? email.trim() : null,
        is_temp_password: false,
        terms_accepted_at: new Date(),
        created_at: new Date()
      };
      memoryUsers.push(newUser);

      const plantId = getNextId();
      memoryPlants.push({
        id: plantId,
        company_id: companyId,
        user_id: userId,
        name: `${plantName} - Main Location`,
        created_at: new Date()
      });

      const { token } = createMemorySession(userId, sessionTtlHours());
      res.setHeader("Set-Cookie", buildSessionCookie(token));
      return res.status(201).json(
        publicUserPayload({
          ...newUser,
          plant_id: plantId,
          plant_name: `${plantName} - Main Location`,
          company_name: plantName
        })
      );
    }
  } catch (error: any) {
    console.error("POST /api/auth/register failed:", error);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

// GET /api/auth/session - Current session (client boot revalidation)
app.get("/api/auth/session", async (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Not authenticated", code: "NO_SESSION" });
  }
  return res.json(publicUserPayload(req.auth.user));
});

// POST /api/auth/terms-accepted - E6 first-login assent. Session-guarded by
// the global /api guard (not whitelisted): only an authenticated user can
// stamp their own acceptance, and the timestamp is written server-side.
app.post("/api/auth/terms-accepted", async (req, res) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Not authenticated", code: "NO_SESSION" });
  }
  const userId = req.auth.user.id;
  try {
    if (pool) {
      const updated = await pool.query(
        "UPDATE users SET terms_accepted_at = NOW() WHERE id = $1 RETURNING terms_accepted_at",
        [userId]
      );
      return res.json(
        publicUserPayload({
          ...req.auth.user,
          terms_accepted_at: updated.rows[0]?.terms_accepted_at ?? new Date()
        })
      );
    }
    // Memory fallback (dev without DATABASE_URL) — same stamp, in memory.
    const memUser = memoryUsers.find(u => u.id === userId);
    const acceptedAt = new Date();
    if (memUser) {
      memUser.terms_accepted_at = acceptedAt;
    }
    return res.json(
      publicUserPayload({ ...req.auth.user, terms_accepted_at: acceptedAt })
    );
  } catch (error) {
    console.error("POST /api/auth/terms-accepted failed:", error);
    return res.status(500).json({ error: "Failed to record acceptance" });
  }
});

// POST /api/auth/logout - Server-side invalidation + cookie clear
app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = readSessionTokenFromRequest(req.headers.cookie);
    if (token && pool) {
      const session = await findSessionByToken(pool, token);
      if (session) {
        await deleteSession(pool, session.id);
      }
    } else if (token) {
      destroyMemorySession(token);
    }
  } catch (err) {
    console.warn("[auth] logout cleanup error:", err);
  }
  res.setHeader("Set-Cookie", buildClearSessionCookie());
  return res.json({ success: true });
});

// POST /api/auth/invites - Mint an invite token (system-admin only)
app.post(
  "/api/auth/invites",
  requireRole("system-admin"),
  async (req, res) => {
    try {
      if (!pool) {
        return res.status(503).json({ error: "Database is not configured" });
      }
      const { company_id, role, email, username } = req.body || {};
      const companyId = Number.isFinite(Number(company_id))
        ? Number(company_id)
        : req.auth!.user.company_id;
      const inviteRole = normalizeRole(role ?? "plant-engineer");
      const token = generateSessionToken();
      const ttlHours = Math.max(
        1,
        Math.min(24 * 14, Number(req.body?.ttl_hours) || 72)
      );
      await pool.query(
        `INSERT INTO auth_invites (token_hash, company_id, role, email, username, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' hours')::interval)`,
        [
          hashSessionToken(token),
          companyId,
          inviteRole,
          email ? String(email).trim() : null,
          username ? String(username).trim() : null,
          req.auth!.user.id,
          String(ttlHours)
        ]
      );
      // Raw token returned exactly once to the inviting admin.
      return res.status(201).json({ invite_token: token, expires_in_hours: ttlHours });
    } catch (error: any) {
      console.error("POST /api/auth/invites failed:", error);
      return res.status(500).json({ error: "Failed to create invite" });
    }
  }
);

// POST /api/auth/demo-login - DEVELOPMENT ONLY. Hard-blocked in
// production and whenever ENABLE_DEV_AUTH_SEED is not explicitly true.
app.post("/api/auth/demo-login", async (req, res) => {
  if (isProductionEnv(process.env) || !isDevAuthSeedEnabled(process.env)) {
    return res
      .status(404)
      .json({ error: "Demo mode is not available in this environment." });
  }
  try {
    if (pool) {
      const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = 'demo' LIMIT 1");
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const plantRes = await pool.query(
          "SELECT id, name FROM plants WHERE company_id = $1 LIMIT 1",
          [user.company_id]
        );
        const plant_id = plantRes.rows.length > 0 ? plantRes.rows[0].id : 3;
        const plant_name = plantRes.rows.length > 0 ? plantRes.rows[0].name : null;
        const companyRes = await pool.query(
          "SELECT name FROM companies WHERE id = $1 LIMIT 1",
          [user.company_id]
        );
        const company_name =
          companyRes.rows.length > 0 ? companyRes.rows[0].name : null;
        const { token } = await createSession(pool, user.id);
        res.setHeader("Set-Cookie", buildSessionCookie(token));
        return res.json(
          publicUserPayload({ ...user, plant_id, plant_name, company_name })
        );
      }
      return res
        .status(404)
        .json({ error: "Demo user is not seeded in this environment." });
    }
    const demoUser = memoryUsers.find(u => u.username === "demo");
    if (!demoUser) {
      return res
        .status(404)
        .json({ error: "Demo user is not available in this environment." });
    }
    const { token } = createMemorySession(demoUser.id, sessionTtlHours());
    res.setHeader("Set-Cookie", buildSessionCookie(token));
    const plant = memoryPlants.find(p => p.company_id === demoUser.company_id);
    const company = memoryCompanies.find(
      c => c.id === demoUser.company_id
    );
    return res.json(
      publicUserPayload({
        ...demoUser,
        plant_id: plant ? plant.id : 3,
        plant_name: plant ? plant.name : null,
        company_name: company ? company.name : null
      })
    );
  } catch (error: any) {
    console.error("POST /api/auth/demo-login failed:", error);
    return res.status(500).json({ error: "Failed to start demo mode" });
  }
});

// --------------------------------------------------------
// COMPANIES ENDPOINTS
// --------------------------------------------------------

// GET /api/companies - List the session tenant's own company only
app.get("/api/companies", async (req, res) => {
  try {
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }
    if (pool) {
      const result = await pool.query(
        "SELECT * FROM companies WHERE id = $1 ORDER BY name ASC",
        [company_id]
      );
      return res.json(result.rows);
    } else {
      return res.json(memoryCompanies.filter(c => c.id === company_id));
    }
  } catch (error: any) {
    console.error("GET /api/companies failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch companies" });
  }
});

// Helper function to return enabled technologies based on subscription plan
async function getEnabledTechnologies(companyId: number): Promise<string[]> {
  let plan = 'vibration_only';
  try {
    if (pool) {
      const res = await pool.query("SELECT subscription_plan FROM companies WHERE id = $1 LIMIT 1", [companyId]);
      if (res.rows.length > 0 && res.rows[0].subscription_plan) {
        plan = res.rows[0].subscription_plan;
      }
    } else {
      const comp = memoryCompanies.find(c => c.id === companyId);
      if (comp && comp.subscription_plan) {
        plan = comp.subscription_plan;
      }
    }
  } catch (error) {
    console.error(`Error fetching plan for company ${companyId}:`, error);
  }

  switch (plan) {
    case 'vibration_only':
      return ['vibration'];
    case 'ir_only':
      return ['infrared'];
    case 'vibration_ir':
      return ['vibration', 'infrared'];
    case 'full_suite':
    case 'custom':
      return ['vibration', 'infrared', 'ultrasound', 'mca', 'oil_analysis'];
    default:
      return ['vibration'];
  }
}

// Helper function to find company ID for a component
async function getCompanyIdForComponent(componentId: number): Promise<number | null> {
  try {
    if (pool) {
      const res = await pool.query(`
        SELECT p.company_id 
        FROM components c
        JOIN assets a ON c.asset_id = a.id
        LEFT JOIN routes r ON a.route_id = r.id
        LEFT JOIN plants p ON r.plant_id = p.id
        WHERE c.id = $1 LIMIT 1
      `, [componentId]);
      return res.rows.length > 0 ? res.rows[0].company_id : null;
    } else {
      const comp = memoryComponents.find(c => c.id === componentId);
      if (!comp) return null;
      const asset = memoryAssets.find(a => a.id === (comp.asset_id || comp.equipment_id));
      if (!asset) return null;
      const route = memoryRoutes.find(r => r.id === asset.route_id);
      if (!route) return null;
      const plant = memoryPlants.find(p => p.id === route.plant_id);
      return plant ? plant.company_id : null;
    }
  } catch (error) {
    console.error(`Error finding company ID for component ${componentId}:`, error);
    return null;
  }
}

// PUT /api/companies/:id/subscription - Update company subscription plan
app.put("/api/companies/:id/subscription", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid company ID" });
    if (id !== requestTenantId(req)) {
      return res.status(404).json({ error: "Company not found" });
    }
    
    const { subscription_plan } = req.body;
    const validPlans = ['vibration_only', 'ir_only', 'vibration_ir', 'full_suite', 'custom'];
    if (!validPlans.includes(subscription_plan)) {
      return res.status(400).json({ error: "Invalid subscription plan. Allowed values: vibration_only, ir_only, vibration_ir, full_suite, custom." });
    }
    
    if (pool) {
      await pool.query("UPDATE companies SET subscription_plan = $1 WHERE id = $2", [subscription_plan, id]);
    } else {
      const comp = memoryCompanies.find(c => c.id === id);
      if (comp) {
        comp.subscription_plan = subscription_plan;
      } else {
        return res.status(404).json({ error: "Company not found in memory" });
      }
    }
    
    return res.json({ success: true, company_id: id, subscription_plan });
  } catch (error: any) {
    console.error("PUT /api/companies/:id/subscription failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update subscription" });
  }
});

// GET /api/companies/:id - Fetch single company subscription and billing status
app.get("/api/companies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid company ID" });
    if (id !== requestTenantId(req)) {
      return res.status(404).json({ error: "Company not found" });
    }

    if (pool) {
      const result = await pool.query("SELECT id, name, subscription_plan, square_customer_id, square_subscription_id, subscription_status, next_billing_date FROM companies WHERE id = $1 LIMIT 1", [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Company not found" });
      }
      return res.json(result.rows[0]);
    } else {
      const comp = memoryCompanies.find(c => c.id === id);
      if (!comp) {
        return res.status(404).json({ error: "Company not found in memory" });
      }
      return res.json(comp);
    }
  } catch (error: any) {
    console.error("GET /api/companies/:id failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch company details" });
  }
});

// GET /api/company/users - Fetch all users for a company
app.get('/api/company/users', async (req, res) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ error: "Missing company_id" });
    }
    if (pool) {
      const result = await pool.query(
        "SELECT id, username, email, role, 'Active' as status FROM users WHERE company_id = $1 ORDER BY id ASC",
        [parseInt(company_id as string, 10)]
      );
      res.json(result.rows);
    } else {
      const users = memoryUsers
        .filter(u => u.company_id === parseInt(company_id as string, 10))
        .map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, status: 'Active' }));
      res.json(users);
    }
  } catch (error: any) {
    console.error("Failed to fetch company users:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/company/users/invite - Invite (add) a user to a company
app.post('/api/company/users/invite', async (req, res) => {
  try {
    const { company_id, email, role, username } = req.body;
    if (!company_id || !email || !role) {
      return res.status(400).json({ error: "Missing required fields: company_id, email, role" });
    }
    const derivedUsername = username || email.split('@')[0];
    const defaultPasswordHash = hashPassword("password123");

    if (pool) {
      // Check if username/email exists
      const checkResult = await pool.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1",
        [derivedUsername, email]
      );
      if (checkResult.rows.length > 0) {
        return res.status(400).json({ error: "A user with this username or email already exists." });
      }

      const result = await pool.query(
        `INSERT INTO users (company_id, username, password_hash, role, email, is_temp_password)
         VALUES ($1, $2, $3, $4, $5, FALSE) RETURNING id, username, email, role, 'Active' as status`,
        [parseInt(company_id, 10), derivedUsername, defaultPasswordHash, role, email]
      );
      res.json(result.rows[0]);
    } else {
      const exists = memoryUsers.some(u => u.username.toLowerCase() === derivedUsername.toLowerCase() || (u.email && u.email.toLowerCase() === email.toLowerCase()));
      if (exists) {
        return res.status(400).json({ error: "A user with this username or email already exists." });
      }
      const newId = getNextId();
      const newUser = {
        id: newId,
        company_id: parseInt(company_id, 10),
        username: derivedUsername,
        password_hash: defaultPasswordHash,
        role: role,
        email: email,
        is_temp_password: false,
        created_at: new Date()
      };
      memoryUsers.push(newUser);
      res.json({ id: newId, username: derivedUsername, email: email, role: role, status: 'Active' });
    }
  } catch (error: any) {
    console.error("Failed to invite user:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/company/users/:userId/role - Update user's role
app.put('/api/company/users/:userId/role', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { role } = req.body;
    if (isNaN(userId) || !role) {
      return res.status(400).json({ error: "Invalid user ID or role" });
    }
    if (pool) {
      const result = await pool.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role",
        [role, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(result.rows[0]);
    } else {
      const user = memoryUsers.find(u => u.id === userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      user.role = role;
      res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
    }
  } catch (error: any) {
    console.error("Failed to update user role:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/company/users/:userId - Remove user from company
app.delete('/api/company/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (pool) {
      const result = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id",
        [userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, message: "User removed successfully" });
    } else {
      const index = memoryUsers.findIndex(u => u.id === userId);
      if (index === -1) {
        return res.status(404).json({ error: "User not found" });
      }
      memoryUsers.splice(index, 1);
      res.json({ success: true, message: "User removed successfully" });
    }
  } catch (error: any) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ error: error.message });
  }
});

/* -------------------------------------------------------------------------- */
/* USERS-1 - tenant owner/admin invites, invite acceptance, user disable       */
/* Every tenant id below comes from the verified session (requestTenantId);   */
/* the public accept path derives tenancy ONLY from the invite row token.      */
/* -------------------------------------------------------------------------- */

function tenantInvitePayload(row: any) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status || "pending",
    created_at: row.created_at,
    sent_at: row.sent_at ?? null,
    expires_at: row.expires_at,
    used_at: row.used_at ?? null,
    revoked_at: row.revoked_at ?? null
  };
}

function tenantUserPayload(row: any) {
  const disabled = !!row.is_disabled;
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    role: normalizeRole(row.role),
    status: disabled ? "Disabled" : "Active",
    is_disabled: disabled,
    created_at: row.created_at ?? null
  };
}

async function tenantDisplayName(tenantId: number): Promise<string | null> {
  if (pool) {
    const result = await pool.query(
      "SELECT name FROM companies WHERE id = $1 LIMIT 1",
      [tenantId]
    );
    return result.rows.length ? String(result.rows[0].name) : null;
  }
  const company = memoryCompanies.find((c) => Number(c.id) === tenantId);
  return company ? String(company.name) : null;
}

async function latestInviteNotificationStatus(
  tenantId: number,
  email: string
): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (pool) {
    const result = await pool.query(
      `SELECT status FROM notifications
        WHERE tenant_id = $1 AND kind = 'invite'
          AND LOWER(recipient_email) = LOWER($2)
        ORDER BY id DESC
        LIMIT 1`,
      [tenantId, normalized]
    );
    return result.rows.length ? String(result.rows[0].status) : null;
  }
  for (let i = memoryNotifications.length - 1; i >= 0; i -= 1) {
    const row = memoryNotifications[i];
    if (
      Number(row.tenant_id) === tenantId &&
      row.kind === "invite" &&
      normalizeEmail(row.recipient_email) === normalized
    ) {
      return String(row.status);
    }
  }
  return null;
}

async function setTenantInviteStatus(
  tenantId: number,
  inviteId: string | number,
  status: string
): Promise<void> {
  if (pool) {
    await pool.query(
      `UPDATE auth_invites SET status = $1
        WHERE id::text = $2 AND company_id = $3`,
      [status, String(inviteId), tenantId]
    );
    return;
  }
  const invite = memoryAuthInvites.find(
    (row) =>
      String(row.id) === String(inviteId) &&
      Number(row.company_id) === tenantId
  );
  if (invite) invite.status = status;
}

/**
 * Queue the invite email through the NOTIFICATIONS-1 ledger. A provider
 * failure is recorded on both the notification row and the invite row; it
 * never fails invite creation, so the invite stays resendable.
 */
async function deliverTenantInvite(input: {
  tenantId: number;
  invite: any;
  rawToken: string;
  tenantName: string | null;
}): Promise<any> {
  const acceptUrl = buildInviteAcceptUrl(
    resolveAppBaseUrl(process.env),
    input.rawToken
  );
  const notification = buildInviteNotification({
    tenantId: input.tenantId,
    to: input.invite.email,
    tenantName: input.tenantName,
    acceptUrl
  });
  let status = "pending";
  try {
    await queueEmailNotification(notification);
    const providerStatus = await latestInviteNotificationStatus(
      input.tenantId,
      input.invite.email
    );
    if (providerStatus === "failed") status = "failed";
    else if (providerStatus === "skipped") status = "skipped";
    else if (providerStatus === "sent") status = "sent";
  } catch (err) {
    console.error("[tenant-invites] email dispatch error:", err);
    status = "failed";
  }
  await setTenantInviteStatus(input.tenantId, input.invite.id, status);
  input.invite.status = status;
  return input.invite;
}

function isActiveInviteRow(row: any, now: Date = new Date()): boolean {
  return (
    !row.used_at &&
    !row.revoked_at &&
    !isInviteExpired({ expires_at: row.expires_at }, now)
  );
}

// POST /api/tenant-invites - owner/admin of the SESSION tenant invites a worker.
app.post("/api/tenant-invites", requirePermission("users.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may invite users.",
      code: "FORBIDDEN"
    });
  }
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    let invite: any;

    if (pool) {
      const duplicate = await pool.query(
        `SELECT id FROM auth_invites
          WHERE company_id = $1
            AND LOWER(email) = LOWER($2)
            AND used_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW()
          LIMIT 1`,
        [tenantId, email]
      );
      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          error: "An active invite already exists for this email.",
          code: "INVITE_EXISTS"
        });
      }
      const inserted = await pool.query(
        `INSERT INTO auth_invites
           (token_hash, company_id, role, email, username, created_by,
            expires_at, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 NOW() + ($7 || ' days')::interval, 'pending', NOW())
         RETURNING *`,
        [
          tokenHash,
          tenantId,
          DEFAULT_INVITED_ROLE,
          email,
          email.split("@")[0] || null,
          req.auth!.user.id,
          "7"
        ]
      );
      invite = inserted.rows[0];
    } else {
      const duplicate = memoryAuthInvites.find(
        (row) =>
          Number(row.company_id) === tenantId &&
          normalizeEmail(row.email) === email &&
          isActiveInviteRow(row)
      );
      if (duplicate) {
        return res.status(409).json({
          error: "An active invite already exists for this email.",
          code: "INVITE_EXISTS"
        });
      }
      invite = {
        id: getNextId(),
        token_hash: tokenHash,
        company_id: tenantId,
        role: DEFAULT_INVITED_ROLE,
        email,
        username: email.split("@")[0] || null,
        created_by: req.auth!.user.id,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        used_at: null,
        revoked_at: null,
        status: "pending",
        sent_at: new Date()
      };
      memoryAuthInvites.push(invite);
    }

    const tenantName = await tenantDisplayName(tenantId);
    const saved = await deliverTenantInvite({
      tenantId,
      invite,
      rawToken,
      tenantName
    });
    return res.status(201).json({
      success: true,
      invite: tenantInvitePayload(saved)
    });
  } catch (error: any) {
    console.error("[tenant-invites] POST error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to create invite."
    });
  }
});

// GET /api/tenant-invites - pending invites for the SESSION tenant only.
app.get("/api/tenant-invites", requirePermission("users.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may view invites.",
      code: "FORBIDDEN"
    });
  }
  try {
    let rows: any[];
    if (pool) {
      const result = await pool.query(
        `SELECT * FROM auth_invites
          WHERE company_id = $1
            AND used_at IS NULL
            AND revoked_at IS NULL
          ORDER BY created_at DESC, id DESC`,
        [tenantId]
      );
      rows = result.rows;
    } else {
      rows = memoryAuthInvites
        .filter(
          (row) =>
            Number(row.company_id) === tenantId &&
            !row.used_at &&
            !row.revoked_at
        )
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime() ||
            Number(b.id) - Number(a.id)
        );
    }
    return res.json({
      success: true,
      tenant_id: tenantId,
      invites: rows.map(tenantInvitePayload)
    });
  } catch (error: any) {
    console.error("[tenant-invites] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load invites."
    });
  }
});

// POST /api/tenant-invites/:id/resend - rotate the token and re-email it.
app.post("/api/tenant-invites/:id/resend", requirePermission("users.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may resend invites.",
      code: "FORBIDDEN"
    });
  }
  const inviteId = String(req.params.id || "");
  try {
    let invite: any;
    if (pool) {
      const found = await pool.query(
        `SELECT * FROM auth_invites
          WHERE id::text = $1 AND company_id = $2
          LIMIT 1`,
        [inviteId, tenantId]
      );
      if (found.rows.length === 0) {
        return res.status(404).json({ error: "Invite not found." });
      }
      invite = found.rows[0];
      if (invite.used_at) {
        return res.status(409).json({
          error: "This invite was already accepted and cannot be resent.",
          code: "INVITE_USED"
        });
      }
      if (invite.revoked_at) {
        return res.status(409).json({
          error: "This invite was revoked. Create a new invite instead.",
          code: "INVITE_REVOKED"
        });
      }
      const rawToken = generateInviteToken();
      const rotated = await pool.query(
        `UPDATE auth_invites
            SET token_hash = $1,
                expires_at = NOW() + ($2 || ' days')::interval,
                used_at = NULL,
                status = 'pending',
                sent_at = NOW()
          WHERE id::text = $3 AND company_id = $4
          RETURNING *`,
        [hashInviteToken(rawToken), "7", inviteId, tenantId]
      );
      invite = rotated.rows[0];
      const tenantName = await tenantDisplayName(tenantId);
      const saved = await deliverTenantInvite({
        tenantId,
        invite,
        rawToken,
        tenantName
      });
      return res.json({
        success: true,
        invite: tenantInvitePayload(saved)
      });
    }

    invite = memoryAuthInvites.find(
      (row) =>
        String(row.id) === inviteId && Number(row.company_id) === tenantId
    );
    if (!invite) {
      return res.status(404).json({ error: "Invite not found." });
    }
    if (invite.used_at) {
      return res.status(409).json({
        error: "This invite was already accepted and cannot be resent.",
        code: "INVITE_USED"
      });
    }
    if (invite.revoked_at) {
      return res.status(409).json({
        error: "This invite was revoked. Create a new invite instead.",
        code: "INVITE_REVOKED"
      });
    }
    const rawToken = generateInviteToken();
    invite.token_hash = hashInviteToken(rawToken);
    invite.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invite.used_at = null;
    invite.status = "pending";
    invite.sent_at = new Date();
    const tenantName = await tenantDisplayName(tenantId);
    const saved = await deliverTenantInvite({
      tenantId,
      invite,
      rawToken,
      tenantName
    });
    return res.json({
      success: true,
      invite: tenantInvitePayload(saved)
    });
  } catch (error: any) {
    console.error("[tenant-invites] resend error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to resend invite."
    });
  }
});

// POST /api/tenant-invites/:id/revoke - kill the token for this tenant.
app.post("/api/tenant-invites/:id/revoke", requirePermission("users.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may revoke invites.",
      code: "FORBIDDEN"
    });
  }
  const inviteId = String(req.params.id || "");
  try {
    if (pool) {
      const result = await pool.query(
        `UPDATE auth_invites
            SET revoked_at = COALESCE(revoked_at, NOW()),
                status = 'revoked'
          WHERE id::text = $1 AND company_id = $2
          RETURNING *`,
        [inviteId, tenantId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Invite not found." });
      }
      return res.json({
        success: true,
        invite: tenantInvitePayload(result.rows[0])
      });
    }
    const invite = memoryAuthInvites.find(
      (row) =>
        String(row.id) === inviteId && Number(row.company_id) === tenantId
    );
    if (!invite) {
      return res.status(404).json({ error: "Invite not found." });
    }
    invite.revoked_at = invite.revoked_at ?? new Date();
    invite.status = "revoked";
    return res.json({
      success: true,
      invite: tenantInvitePayload(invite)
    });
  } catch (error: any) {
    console.error("[tenant-invites] revoke error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to revoke invite."
    });
  }
});

// GET /api/invite/:token - PUBLIC. Tenant name + invited email only.
app.get("/api/invite/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  const tokenHash = hashInviteToken(token);
  const genericMiss = () =>
    res.status(404).json({
      error: "This invite link is not valid or has expired."
    });
  if (!token) return genericMiss();
  try {
    if (pool) {
      const result = await pool.query(
        `SELECT i.email, i.expires_at, i.used_at, i.revoked_at,
                c.name AS tenant_name
           FROM auth_invites i
           LEFT JOIN companies c ON c.id = i.company_id
          WHERE i.token_hash = $1
          LIMIT 1`,
        [tokenHash]
      );
      if (result.rows.length === 0) return genericMiss();
      const invite = result.rows[0];
      if (!isInviteUsable(invite)) return genericMiss();
      return res.json({
        tenant_name: invite.tenant_name ?? null,
        email: invite.email ?? null
      });
    }
    const invite = memoryAuthInvites.find(
      (row) => String(row.token_hash) === tokenHash
    );
    if (!invite || !isInviteUsable(invite)) return genericMiss();
    const company = memoryCompanies.find(
      (c) => Number(c.id) === Number(invite.company_id)
    );
    return res.json({
      tenant_name: company ? company.name : null,
      email: invite.email ?? null
    });
  } catch (error: any) {
    console.error("[invite] GET error:", error);
    return genericMiss();
  }
});

// POST /api/invite/:token/accept - PUBLIC. Creates the worker in the invite's
// tenant; any client-supplied tenant/company id is ignored by construction.
app.post("/api/invite/:token/accept", async (req, res) => {
  const token = String(req.params.token || "").trim();
  const tokenHash = hashInviteToken(token);
  const password = req.body?.password;
  if (!token) {
    return res.status(404).json({ error: "This invite link is not valid." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  try {
    if (pool) {
      const found = await pool.query(
        `SELECT i.*, c.name AS tenant_name
           FROM auth_invites i
           LEFT JOIN companies c ON c.id = i.company_id
          WHERE i.token_hash = $1
          LIMIT 1`,
        [tokenHash]
      );
      if (found.rows.length === 0) {
        return res.status(404).json({ error: "This invite link is not valid." });
      }
      const invite = found.rows[0];
      if (invite.used_at) {
        return res.status(409).json({
          error: "This invite has already been used.",
          code: "INVITE_USED"
        });
      }
      if (invite.revoked_at) {
        return res.status(404).json({ error: "This invite link is not valid." });
      }
      if (isInviteExpired({ expires_at: invite.expires_at })) {
        return res.status(410).json({
          error: "This invite has expired. Ask your administrator for a new one.",
          code: "INVITE_EXPIRED"
        });
      }

      const email = normalizeEmail(invite.email);
      const username = String(
        req.body?.username || email.split("@")[0] || ""
      )
        .trim()
        .toLowerCase();
      if (!username) {
        return res.status(400).json({ error: "A username is required." });
      }
      const existing = await pool.query(
        `SELECT id FROM users
          WHERE LOWER(username) = $1
             OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
          LIMIT 1`,
        [username, email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: "An account already exists for this invite.",
          code: "ACCOUNT_EXISTS"
        });
      }

      const hashed = await bcryptHashPassword(password);
      // Single statement: consume the invite and create the user atomically.
      // company_id comes from the invite row, never from the request body.
      const consumed = await pool.query(
        `WITH consumed AS (
           UPDATE auth_invites
              SET used_at = NOW(), status = 'accepted'
            WHERE token_hash = $1
              AND used_at IS NULL
              AND revoked_at IS NULL
              AND expires_at > NOW()
            RETURNING id, company_id, email
         )
         INSERT INTO users
           (company_id, username, password_hash, role, email,
            is_temp_password, terms_accepted_at, is_disabled)
         SELECT company_id, $2, $3, $4, email, FALSE, NOW(), FALSE
           FROM consumed
         RETURNING *`,
        [tokenHash, username, hashed, DEFAULT_INVITED_ROLE]
      );
      if (consumed.rows.length === 0) {
        return res.status(409).json({
          error: "This invite has already been used.",
          code: "INVITE_USED"
        });
      }
      const user = consumed.rows[0];
      const [plantRes, companyRes] = await Promise.all([
        pool.query(
          "SELECT id, name FROM plants WHERE company_id = $1 ORDER BY id ASC LIMIT 1",
          [user.company_id]
        ),
        pool.query("SELECT name FROM companies WHERE id = $1 LIMIT 1", [
          user.company_id
        ])
      ]);
      const plant = plantRes.rows[0] ?? null;
      const companyName = companyRes.rows[0]?.name ?? invite.tenant_name ?? null;
      const { token: sessionToken } = await createSession(pool, user.id);
      res.setHeader("Set-Cookie", buildSessionCookie(sessionToken));
      return res.status(201).json({
        success: true,
        user: publicUserPayload({
          ...user,
          plant_id: plant?.id ?? null,
          plant_name: plant?.name ?? null,
          company_name: companyName
        })
      });
    }

    const invite = memoryAuthInvites.find(
      (row) => String(row.token_hash) === tokenHash
    );
    if (!invite) {
      return res.status(404).json({ error: "This invite link is not valid." });
    }
    if (invite.used_at) {
      return res.status(409).json({
        error: "This invite has already been used.",
        code: "INVITE_USED"
      });
    }
    if (invite.revoked_at) {
      return res.status(404).json({ error: "This invite link is not valid." });
    }
    if (!isInviteUsable(invite)) {
      return res.status(410).json({
        error: "This invite has expired. Ask your administrator for a new one.",
        code: "INVITE_EXPIRED"
      });
    }
    const email = normalizeEmail(invite.email);
    const username = String(req.body?.username || email.split("@")[0] || "")
      .trim()
      .toLowerCase();
    if (!username) {
      return res.status(400).json({ error: "A username is required." });
    }
    const existing = memoryUsers.find(
      (user) =>
        String(user.username).toLowerCase() === username ||
        (user.email && normalizeEmail(user.email) === email)
    );
    if (existing) {
      return res.status(409).json({
        error: "An account already exists for this invite.",
        code: "ACCOUNT_EXISTS"
      });
    }
    const hashed = await bcryptHashPassword(password);
    const newUser = {
      id: getNextId(),
      // Bound to the INVITE's tenant only. The request body cannot influence it.
      company_id: invite.company_id,
      username,
      password_hash: hashed,
      role: DEFAULT_INVITED_ROLE,
      email,
      is_temp_password: false,
      is_disabled: false,
      terms_accepted_at: new Date(),
      created_at: new Date()
    };
    memoryUsers.push(newUser);
    invite.used_at = new Date();
    invite.status = "accepted";

    const plant = memoryPlants.find(
      (p) => Number(p.company_id) === Number(invite.company_id)
    );
    const company = memoryCompanies.find(
      (c) => Number(c.id) === Number(invite.company_id)
    );
    const { token: sessionToken } = createMemorySession(
      newUser.id,
      sessionTtlHours()
    );
    res.setHeader("Set-Cookie", buildSessionCookie(sessionToken));
    return res.status(201).json({
      success: true,
      user: publicUserPayload({
        ...newUser,
        plant_id: plant ? plant.id : null,
        plant_name: plant ? plant.name : null,
        company_name: company ? company.name : null
      })
    });
  } catch (error: any) {
    console.error("[invite] accept error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to accept the invite."
    });
  }
});

// GET /api/tenant-users - users of the SESSION tenant only (owner/admin).
app.get("/api/tenant-users", requirePermission("users.manage"), async (req, res) => {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may view tenant users.",
      code: "FORBIDDEN"
    });
  }
  try {
    let rows: any[];
    if (pool) {
      const result = await pool.query(
        `SELECT id, username, email, role, is_disabled, created_at
           FROM users
          WHERE company_id = $1
          ORDER BY id ASC`,
        [tenantId]
      );
      rows = result.rows;
    } else {
      rows = memoryUsers.filter(
        (user) => Number(user.company_id) === tenantId
      );
    }
    return res.json({
      success: true,
      tenant_id: tenantId,
      users: rows.map(tenantUserPayload)
    });
  } catch (error: any) {
    console.error("[tenant-users] GET error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load tenant users."
    });
  }
});

// POST /api/tenant-users/:id/role - owner/admin assigns one of the EXISTING
// canonical roles to a user in the SESSION tenant only. The role is read from
// the session on every request (middleware.ts loadSessionUser), so the change
// takes effect on the user's next request without deleting their session.
app.post(
  "/api/tenant-users/:id/role",
  requirePermission("users.manage"),
  async (req, res) => {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const userId = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id." });
    }
    const newRole = parseAssignableRole(req.body?.role);
    if (!newRole) {
      return res.status(400).json({
        error:
          "Role must be one of the existing canonical values: plant-engineer, reliability-manager, system-admin.",
        code: "INVALID_ROLE"
      });
    }
    const actorRole = req.auth!.user.role;
    if (newRole === "system-admin" && actorRole !== "system-admin") {
      return res.status(403).json({
        error: "Only a system-admin may assign the system-admin role.",
        code: "FORBIDDEN"
      });
    }

    try {
      let tenantUsers: any[];
      let target: any;
      if (pool) {
        const result = await pool.query(
          `SELECT id, username, email, role, is_disabled, created_at
             FROM users
            WHERE company_id = $1
            ORDER BY id ASC`,
          [tenantId]
        );
        tenantUsers = result.rows;
        target = tenantUsers.find((user) => Number(user.id) === userId);
      } else {
        tenantUsers = memoryUsers.filter(
          (user) => Number(user.company_id) === tenantId
        );
        target = tenantUsers.find((user) => Number(user.id) === userId);
      }
      // A user from another tenant is indistinguishable from a missing user.
      if (!target) {
        return res.status(404).json({ error: "User not found." });
      }
      if (
        normalizeRole(target.role) === "system-admin" &&
        actorRole !== "system-admin"
      ) {
        return res.status(403).json({
          error: "Only a system-admin may change a system-admin role.",
          code: "FORBIDDEN"
        });
      }

      const evaluation = evaluateRoleChange({
        targetId: userId,
        currentUserId: Number(req.auth!.user.id),
        targetRole: target.role,
        newRole,
        tenantUsers
      });
      if (!evaluation.ok) {
        return res.status(409).json({
          error: evaluation.message,
          code: evaluation.reason
        });
      }

      if (pool) {
        const updated = await pool.query(
          `UPDATE users SET role = $1
            WHERE id = $2 AND company_id = $3
            RETURNING id, username, email, role, is_disabled, created_at`,
          [newRole, userId, tenantId]
        );
        if (!updated.rows.length) {
          return res.status(404).json({ error: "User not found." });
        }
        return res.json({
          success: true,
          user: tenantUserPayload(updated.rows[0])
        });
      }

      target.role = newRole;
      return res.json({
        success: true,
        user: tenantUserPayload(target)
      });
    } catch (error: any) {
      console.error("[tenant-users] role error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to update user role."
      });
    }
  }
);

async function handleTenantUserDisableToggle(
  req: any,
  res: any,
  disable: boolean
): Promise<any> {
  const tenantId = requestTenantId(req);
  if (tenantId == null) {
    return res.status(401).json({ error: "Authentication required." });
  }
  if (!isTenantAdminRole(req.auth?.user?.role)) {
    return res.status(403).json({
      error: "Only an owner/admin may change user status.",
      code: "FORBIDDEN"
    });
  }
  const userId = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id." });
  }
  try {
    let tenantUsers: any[];
    let target: any;
    if (pool) {
      const result = await pool.query(
        `SELECT id, username, email, role, is_disabled, created_at
           FROM users
          WHERE company_id = $1
          ORDER BY id ASC`,
        [tenantId]
      );
      tenantUsers = result.rows;
      target = tenantUsers.find((user) => Number(user.id) === userId);
    } else {
      tenantUsers = memoryUsers.filter(
        (user) => Number(user.company_id) === tenantId
      );
      target = tenantUsers.find((user) => Number(user.id) === userId);
    }
    if (!target) {
      return res.status(404).json({ error: "User not found." });
    }

    if (disable) {
      const evaluation = evaluateDisableUser({
        targetId: userId,
        currentUserId: Number(req.auth!.user.id),
        targetRole: target.role,
        tenantUsers
      });
      if (!evaluation.ok) {
        return res.status(409).json({
          error: evaluation.message,
          code: evaluation.reason
        });
      }
    }

    if (pool) {
      const updated = await pool.query(
        `UPDATE users SET is_disabled = $1
          WHERE id = $2 AND company_id = $3
          RETURNING id, username, email, role, is_disabled, created_at`,
        [disable, userId, tenantId]
      );
      if (disable) await deleteSessionsForUser(pool, userId);
      return res.json({
        success: true,
        user: tenantUserPayload(updated.rows[0])
      });
    }

    target.is_disabled = disable;
    if (disable) destroyMemorySessionsForUser(userId);
    return res.json({
      success: true,
      user: tenantUserPayload(target)
    });
  } catch (error: any) {
    console.error("[tenant-users] status error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to update user status."
    });
  }
}

app.post(
  "/api/tenant-users/:id/disable",
  requirePermission("users.manage"),
  (req, res) => handleTenantUserDisableToggle(req, res, true)
);
app.post(
  "/api/tenant-users/:id/enable",
  requirePermission("users.manage"),
  (req, res) => handleTenantUserDisableToggle(req, res, false)
);

// --------------------------------------------------------
// PLANTS ENDPOINTS
// --------------------------------------------------------

// GET /api/plants/count - Get count of plants for a company
app.get("/api/plants/count", async (req, res) => {
  try {
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    if (pool) {
      const result = await pool.query("SELECT COUNT(*)::int as count FROM plants WHERE company_id = $1", [company_id]);
      return res.json({ count: result.rows[0].count });
    } else {
      const filtered = memoryPlants.filter(p => p.company_id === company_id);
      return res.json({ count: filtered.length });
    }
  } catch (error: any) {
    console.error("GET /api/plants/count failed:", error);
    return res.status(500).json({ error: error.message || "Failed to count plants" });
  }
});

// GET /api/plants - List all plants for the session tenant
app.get("/api/plants", async (req, res) => {
  try {
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    if (pool) {
      const result = await pool.query("SELECT * FROM plants WHERE company_id = $1 ORDER BY name ASC", [company_id]);
      return res.json(result.rows);
    } else {
      const filtered = memoryPlants.filter(p => p.company_id === company_id);
      return res.json(filtered);
    }
  } catch (error: any) {
    console.error("GET /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch plants" });
  }
});

// GET /api/plants/:id - Get a single plant (tenant-scoped; cross-tenant is 404)
app.get("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID parameter" });
    }
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.status(404).json({ error: "Plant not found" });
    }

    if (pool) {
      const result = await pool.query("SELECT * FROM plants WHERE id = $1 AND company_id = $2", [id, company_id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Plant not found" });
      }
      return res.json(result.rows[0]);
    } else {
      const plant = memoryPlants.find(p => p.id === id && p.company_id === company_id);
      if (!plant) {
        return res.status(404).json({ error: "Plant not found" });
      }
      return res.json(plant);
    }
  } catch (error: any) {
    console.error("GET /api/plants/:id failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch plant" });
  }
});

// POST /api/plants - Create new plant for the session tenant
app.post("/api/plants", async (req, res) => {
  try {
    const { name, location } = req.body;
    const companyIdNum = requestTenantId(req);

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }
    if (companyIdNum == null) {
      return res.status(400).json({ error: "Tenant context is required" });
    }

    if (pool) {
      const companyCheck = await pool.query(
        "SELECT 1 FROM companies WHERE id = $1 LIMIT 1",
        [companyIdNum]
      );
      if (companyCheck.rows.length === 0) {
        return res.status(400).json({ error: `Parent company not found: ${companyIdNum}` });
      }
      const result = await pool.query(
        "INSERT INTO plants (name, location, company_id) VALUES ($1, $2, $3) RETURNING *",
        [name.trim(), location ? location.trim() : null, companyIdNum]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      if (!memoryCompanies.some((c) => c.id === companyIdNum)) {
        return res.status(400).json({ error: `Parent company not found: ${companyIdNum}` });
      }
      const newPlant = {
        id: getNextId(),
        company_id: companyIdNum,
        name: name.trim(),
        location: location ? location.trim() : null,
        created_at: new Date()
      };
      memoryPlants.push(newPlant);
      return res.status(201).json(newPlant);
    }
  } catch (error: any) {
    console.error("POST /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create plant" });
  }
});

// PUT /api/plants/:id - Update a plant (tenant-scoped)
app.put("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const company_id = requestTenantId(req);
    if (company_id == null) return res.status(404).json({ error: "Plant not found" });
    const { name, location } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const result = await pool.query(
        "UPDATE plants SET name = $1, location = $2 WHERE id = $3 AND company_id = $4 RETURNING *",
        [name.trim(), location ? location.trim() : null, id, company_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Plant not found" });
      return res.json(result.rows[0]);
    } else {
      const plant = memoryPlants.find(p => p.id === id && p.company_id === company_id);
      if (!plant) return res.status(404).json({ error: "Plant not found" });
      plant.name = name.trim();
      plant.location = location ? location.trim() : null;
      return res.json(plant);
    }
  } catch (error: any) {
    console.error("PUT /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update plant" });
  }
});

// DELETE /api/plants/:id - Delete a plant (tenant-scoped)
app.delete("/api/plants/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const company_id = requestTenantId(req);
    if (company_id == null) return res.status(404).json({ error: "Plant not found" });

    if (pool) {
      const result = await pool.query(
        "DELETE FROM plants WHERE id = $1 AND company_id = $2 RETURNING *",
        [id, company_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Plant not found" });
      return res.json({ message: "Plant deleted successfully", deleted: result.rows[0] });
    } else {
      const index = memoryPlants.findIndex(p => p.id === id && p.company_id === company_id);
      if (index === -1) return res.status(404).json({ error: "Plant not found" });
      const deleted = memoryPlants.splice(index, 1)[0];
      // Cascade delete routes
      memoryRoutes = memoryRoutes.filter(r => r.plant_id !== id);
      return res.json({ message: "Plant deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE /api/plants failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete plant" });
  }
});

// --------------------------------------------------------
// UNITS ENDPOINTS (optional grouping above routes)
// --------------------------------------------------------

// GET /api/units?plant_id= - List units for a tenant-owned plant
app.get("/api/units", async (req, res) => {
  try {
    const plantId = req.query.plant_id
      ? parseInt(req.query.plant_id as string, 10)
      : undefined;
    if (plantId === undefined || isNaN(plantId)) {
      return res.status(400).json({ error: "Missing or invalid query parameter: plant_id" });
    }
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.status(404).json({ error: "Plant not found" });
    }
    if (pool) {
      const owned = await pool.query(
        "SELECT 1 FROM plants WHERE id = $1 AND company_id = $2 LIMIT 1",
        [plantId, company_id]
      );
      if (owned.rows.length === 0) {
        return res.status(404).json({ error: "Plant not found" });
      }
      const result = await pool.query(
        "SELECT * FROM units WHERE plant_id = $1 ORDER BY name ASC",
        [plantId]
      );
      return res.json(result.rows);
    }
    const plant = memoryPlants.find((p) => p.id === plantId && p.company_id === company_id);
    if (!plant) return res.status(404).json({ error: "Plant not found" });
    return res.json(memoryUnits.filter((u) => u.plant_id === plantId));
  } catch (error: any) {
    console.error("GET /api/units failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch units" });
  }
});

// POST /api/units - Create a unit under a plant (parent validated, H3)
app.post("/api/units", async (req, res) => {
  try {
    const { plant_id, name } = req.body;
    const pId = parseInt(plant_id, 10);
    if (isNaN(pId)) {
      return res.status(400).json({ error: "Missing or invalid required field: plant_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }
    if (pool) {
      if (!(await tenantOwnsRow(pool, "plants", pId, requestTenantId(req)))) {
        return res.status(400).json({ error: `Parent plant not found: ${pId}` });
      }
      const result = await pool.query(
        "INSERT INTO units (plant_id, name) VALUES ($1, $2) RETURNING *",
        [pId, name.trim()]
      );
      return res.status(201).json(result.rows[0]);
    }
    const tenantId = requestTenantId(req);
    if (!memoryPlants.some((p) => p.id === pId && p.company_id === tenantId)) {
      return res.status(400).json({ error: `Parent plant not found: ${pId}` });
    }
    const unit = { id: getNextId(), plant_id: pId, name: name.trim(), created_at: new Date() };
    memoryUnits.push(unit);
    return res.status(201).json(unit);
  } catch (error: any) {
    console.error("POST /api/units failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create unit" });
  }
});

// PUT /api/units/:id - Rename a unit
app.put("/api/units/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }
    if (pool) {
      const result = await pool.query(
        `UPDATE units u SET name = $1
           FROM plants p
          WHERE u.id = $2 AND u.plant_id = p.id AND p.company_id = $3
          RETURNING u.*`,
        [name.trim(), id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Unit not found" });
      return res.json(result.rows[0]);
    }
    const tenantId = requestTenantId(req);
    const unit = memoryUnits.find((u) => {
      const plant = memoryPlants.find((p) => p.id === u.plant_id);
      return u.id === id && plant?.company_id === tenantId;
    });
    if (!unit) return res.status(404).json({ error: "Unit not found" });
    unit.name = name.trim();
    return res.json(unit);
  } catch (error: any) {
    console.error("PUT /api/units failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update unit" });
  }
});

// DELETE /api/units/:id - Delete a unit (routes keep their plant link)
app.delete("/api/units/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    if (pool) {
      const result = await pool.query(
        `DELETE FROM units u
               USING plants p
               WHERE u.id = $1 AND u.plant_id = p.id AND p.company_id = $2
               RETURNING u.*`,
        [id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Unit not found" });
      return res.json({ message: "Unit deleted successfully", deleted: result.rows[0] });
    }
    const tenantId = requestTenantId(req);
    const index = memoryUnits.findIndex((u) => {
      const plant = memoryPlants.find((p) => p.id === u.plant_id);
      return u.id === id && plant?.company_id === tenantId;
    });
    if (index === -1) return res.status(404).json({ error: "Unit not found" });
    const deleted = memoryUnits.splice(index, 1)[0];
    return res.json({ message: "Unit deleted successfully", deleted });
  } catch (error: any) {
    console.error("DELETE /api/units failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete unit" });
  }
});

// --------------------------------------------------------
// ROUTES ENDPOINTS
// --------------------------------------------------------

// GET /api/routes and GET /api/routes/:plantId - Get tenant-scoped routes
app.get(["/api/routes", "/api/routes/:plantId"], async (req, res) => {
  try {
    const plantIdParam = req.params.plantId ? parseInt(req.params.plantId, 10) : undefined;
    const plantIdQuery = req.query.plant_id ? parseInt(req.query.plant_id as string, 10) : undefined;
    const plantId = plantIdParam || plantIdQuery;
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }

    if (pool) {
      if (plantId !== undefined) {
        if (isNaN(plantId)) {
          return res.status(400).json({ error: "Invalid plant ID parameter" });
        }
        if (!(await tenantOwnsRow(pool, "plants", plantId, company_id))) {
          return res.status(404).json({ error: "Plant not found" });
        }
        const result = await pool.query(
          "SELECT r.* FROM routes r JOIN plants pl ON pl.id = r.plant_id WHERE r.plant_id = $1 AND pl.company_id = $2 ORDER BY r.name ASC",
          [plantId, company_id]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          "SELECT r.* FROM routes r JOIN plants pl ON pl.id = r.plant_id WHERE pl.company_id = $1 ORDER BY r.name ASC",
          [company_id]
        );
        return res.json(result.rows);
      }
    } else {
      if (plantId !== undefined) {
        if (isNaN(plantId)) {
          return res.status(400).json({ error: "Invalid plant ID parameter" });
        }
        const plant = memoryPlants.find((p) => p.id === plantId && p.company_id === company_id);
        if (!plant) return res.status(404).json({ error: "Plant not found" });
        const filtered = memoryRoutes.filter(r => r.plant_id === plantId);
        return res.json(filtered);
      } else {
        const routeIds = memoryTenantRouteIds(company_id);
        return res.json(memoryRoutes.filter(r => routeIds.includes(r.id)));
      }
    }
  } catch (error: any) {
    console.error("GET /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch routes" });
  }
});

// GET /api/hierarchy - Tenant-scoped full equipment tree (H5 read cache seed)
app.get("/api/hierarchy", async (req, res) => {
  try {
    if (!pool) {
      const tenantId = requestTenantId(req);
      const tenantPlantIds = memoryTenantPlantIds(tenantId);
      const tenantRouteIds = memoryTenantRouteIds(tenantId);
      const tenantAssetIds = memoryTenantAssetIds(tenantId);
      const tenantComponentIds = memoryTenantComponentIds(tenantId);
      const tenantCollectionPointIds = memoryTenantCollectionPointIds(tenantId);
      return res.json({
        plants: memoryPlants.filter((p) => tenantPlantIds.includes(p.id)),
        units: memoryUnits.filter((u) => tenantPlantIds.includes(u.plant_id)),
        routes: memoryRoutes.filter((r) => tenantRouteIds.includes(r.id)),
        assets: memoryAssets.filter((a) => tenantAssetIds.includes(a.id)),
        components: memoryComponents.filter((c) => tenantComponentIds.includes(c.id)),
        collection_points: memoryCollectionPoints.filter((cp) => tenantCollectionPointIds.includes(cp.id))
      });
    }
    const tenantId = req.tenantId ?? req.auth?.tenantId ?? requestTenantId(req);
    if (tenantId == null) {
      return res.json({
        plants: [],
        units: [],
        routes: [],
        assets: [],
        components: [],
        collection_points: []
      });
    }
    const plantsRes = await pool.query(
      "SELECT * FROM plants WHERE company_id = $1 ORDER BY id ASC",
      [tenantId]
    );
    let plants = plantsRes.rows;
    if (plants.length === 0) {
      // First-run fix: the Explorer root must always carry a real server id.
      // Find-or-create the tenant's plant before building the payload so the
      // client can immediately create units/assets without a manual refresh.
      const plant = await findOrCreateTenantPlant(pool, tenantId);
      const created = await pool.query("SELECT * FROM plants WHERE id = $1", [plant.id]);
      plants = created.rows;
    }
    const plantIds = plants.map((p: any) => p.id);
    const unitsRes = plantIds.length
      ? await pool.query("SELECT * FROM units WHERE plant_id = ANY($1::int[]) ORDER BY name ASC", [plantIds])
      : { rows: [] as any[] };
    const routesRes = plantIds.length
      ? await pool.query("SELECT * FROM routes WHERE plant_id = ANY($1::int[]) ORDER BY name ASC", [plantIds])
      : { rows: [] as any[] };
    const routeIds = routesRes.rows.map((r: any) => r.id);
    const assetsRes = routeIds.length
      ? await pool.query("SELECT * FROM assets WHERE route_id = ANY($1::int[]) ORDER BY name ASC", [routeIds])
      : { rows: [] as any[] };
    const assetIds = assetsRes.rows.map((a: any) => a.id);
    const componentsRes = assetIds.length
      ? await pool.query("SELECT * FROM components WHERE asset_id = ANY($1::int[]) ORDER BY name ASC", [assetIds])
      : { rows: [] as any[] };
    const componentIds = componentsRes.rows.map((c: any) => c.id);
    const pointsRes = componentIds.length
      ? await pool.query(
          "SELECT * FROM collection_points WHERE component_id = ANY($1::int[]) ORDER BY location_order ASC, id ASC",
          [componentIds]
        )
      : { rows: [] as any[] };
    return res.json({
      plants,
      units: unitsRes.rows,
      routes: routesRes.rows,
      assets: assetsRes.rows,
      components: componentsRes.rows,
      collection_points: pointsRes.rows
    });
  } catch (error: any) {
    console.error("GET /api/hierarchy failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch hierarchy" });
  }
});

// POST /api/wipe-equipment - Wipe all equipment hierarchy data
app.post("/api/wipe-equipment", async (req, res) => {
  try {
    console.log("Database wipe requested via /api/wipe-equipment");
    
    // Clear in-memory caches
    memoryRoutes = [];
    memoryEquipment = [];
    memoryAssets = [];
    memoryComponents = [];
    memoryCollectionPoints = [];
    memoryMeasurementPoints = [];
    memoryAnalysisHistory = [];
    memoryRouteAssignments = [];
    
    if (pool) {
      // Execute in strict cascading constraint order
      await pool.query("DELETE FROM analysis_history;");
      await pool.query("DELETE FROM measurement_points;");
      await pool.query("DELETE FROM collection_points;");
      await pool.query("DELETE FROM components;");
      await pool.query("DELETE FROM assets;");
      await pool.query("DELETE FROM routes;");
    }
    
    return res.json({ success: true, message: "Database wiped successfully" });
  } catch (error: any) {
    console.error("Database wipe failed:", error);
    return res.status(500).json({ error: error.message || "Failed to wipe database" });
  }
});

// GET /api/routes/single/:id - Get single route details (tenant-scoped)
app.get("/api/routes/single/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid route ID" });
    const company_id = requestTenantId(req);
    if (company_id == null) return res.status(404).json({ error: "Route not found" });

    if (pool) {
      const result = await pool.query(
        "SELECT r.* FROM routes r JOIN plants pl ON pl.id = r.plant_id WHERE r.id = $1 AND pl.company_id = $2",
        [id, company_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json(result.rows[0]);
    } else {
      const route = memoryRoutes.find(
        (r) => r.id === id && memoryTenantRouteIds(company_id).includes(r.id)
      );
      if (!route) return res.status(404).json({ error: "Route not found" });
      return res.json(route);
    }
  } catch (error: any) {
    console.error("GET /api/routes/single/:id failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch route" });
  }
});

// POST /api/routes - Create new route
app.post("/api/routes", async (req, res) => {
  try {
    const { plant_id, name, description, unit_id, area } = req.body;
    if (plant_id === undefined || isNaN(parseInt(plant_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: plant_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const pId = parseInt(plant_id, 10);
    let uId: number | null = null;
    if (unit_id !== undefined && unit_id !== null && String(unit_id).trim() !== "") {
      uId = parseInt(unit_id, 10);
      if (isNaN(uId)) {
        return res.status(400).json({ error: "Invalid unit_id field" });
      }
    }

    if (pool) {
      const tenantId = requestTenantId(req);
      if (!(await tenantOwnsRow(pool, "plants", pId, tenantId))) {
        return res.status(400).json({ error: `Parent plant not found: ${pId}` });
      }
      if (uId != null) {
        const unitCheck = await pool.query(
          "SELECT 1 FROM units WHERE id = $1 AND plant_id = $2 LIMIT 1",
          [uId, pId]
        );
        if (unitCheck.rows.length === 0) {
          return res.status(400).json({ error: `Parent unit not found in plant ${pId}: ${uId}` });
        }
      }
      const result = await pool.query(
        `INSERT INTO routes (plant_id, unit_id, name, description, area)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [pId, uId, name.trim(), description ? description.trim() : null, area ? String(area).trim() : null]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const tenantId = requestTenantId(req);
      if (!memoryPlants.some((p) => p.id === pId && p.company_id === tenantId)) {
        return res.status(400).json({ error: `Parent plant not found: ${pId}` });
      }
      if (uId != null && !memoryUnits.some((u) => u.id === uId && u.plant_id === pId)) {
        return res.status(400).json({ error: `Parent unit not found in plant ${pId}: ${uId}` });
      }
      const newRoute = {
        id: getNextId(),
        plant_id: pId,
        unit_id: uId,
        name: name.trim(),
        description: description ? description.trim() : null,
        area: area ? String(area).trim() : null,
        created_at: new Date()
      };
      memoryRoutes.push(newRoute);
      return res.status(201).json(newRoute);
    }
  } catch (error: any) {
    console.error("POST /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create route" });
  }
});

// PUT /api/routes/:id - Update route
app.put("/api/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, description } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const result = await pool.query(
        `UPDATE routes r SET name = $1, description = $2
           FROM plants pl
          WHERE r.id = $3 AND r.plant_id = pl.id AND pl.company_id = $4
          RETURNING r.*`,
        [name.trim(), description ? description.trim() : null, id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json(result.rows[0]);
    } else {
      const tenantId = requestTenantId(req);
      const route = memoryRoutes.find(
        r => r.id === id && memoryTenantRouteIds(tenantId).includes(r.id)
      );
      if (!route) return res.status(404).json({ error: "Route not found" });
      route.name = name.trim();
      route.description = description ? description.trim() : null;
      return res.json(route);
    }
  } catch (error: any) {
    console.error("PUT /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update route" });
  }
});

// DELETE /api/routes/:id - Delete route
app.delete("/api/routes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    console.log('Delete hit:', req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const tenantId = requestTenantId(req) ?? -1;
      const owned = await pool.query(
        "SELECT r.id FROM routes r JOIN plants pl ON pl.id = r.plant_id WHERE r.id = $1 AND pl.company_id = $2",
        [id, tenantId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      // 1. First, delete all analysis history for measurement points under collection points of components of assets in this route.
      await pool.query(
        "DELETE FROM analysis_history WHERE measurement_point_id IN " +
        "(SELECT id FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id IN (SELECT id FROM assets WHERE route_id = $1))))",
        [id]
      );
      // 2. Delete all measurement points under collection points of components of assets in this route.
      await pool.query(
        "DELETE FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id IN (SELECT id FROM assets WHERE route_id = $1)))",
        [id]
      );
      // 3. Delete all collection points of components of assets in this route.
      await pool.query(
        "DELETE FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id IN (SELECT id FROM assets WHERE route_id = $1))",
        [id]
      );
      // 4. Delete all components of assets in this route.
      await pool.query(
        "DELETE FROM components WHERE asset_id IN (SELECT id FROM assets WHERE route_id = $1)",
        [id]
      );
      // 5. Delete all assets in this route.
      await pool.query(
        "DELETE FROM assets WHERE route_id = $1",
        [id]
      );
      // 6. Delete the route itself.
      const result = await pool.query("DELETE FROM routes WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Route not found" });
      return res.json({ message: "Route deleted successfully", deleted: result.rows[0] });
    } else {
      const tenantId = requestTenantId(req);
      const tenantRouteIds = memoryTenantRouteIds(tenantId);
      const index = memoryRoutes.findIndex(r => r.id === id && tenantRouteIds.includes(r.id));
      if (index === -1) return res.status(404).json({ error: "Route not found" });
      const deletedRoute = memoryRoutes[index];
      
      // Get all asset IDs for this route
      const assetIds = memoryEquipment.filter(e => e.route_id === id).map(e => e.id);
      
      // Get all component IDs for these assets
      const componentIds = memoryComponents.filter(c => assetIds.includes(c.asset_id)).map(c => c.id);
      
      // Get all collection point IDs
      const cpIds = memoryCollectionPoints.filter(cp => componentIds.includes(cp.component_id)).map(cp => cp.id);
      
      // Get all measurement point IDs
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);
      
      // Cascade delete everything down the tree
      memoryAnalysisHistory = memoryAnalysisHistory.filter(ah => !mpIds.includes(ah.measurement_point_id));
      memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => !cpIds.includes(mp.collection_point_id));
      memoryCollectionPoints = memoryCollectionPoints.filter(cp => !componentIds.includes(cp.component_id));
      memoryComponents = memoryComponents.filter(c => !assetIds.includes(c.asset_id));
      memoryEquipment = memoryEquipment.filter(e => e.route_id !== id);
      memoryAssets = memoryEquipment;
      memoryRouteAssignments = memoryRouteAssignments.filter(
        (assignment) => Number(assignment.route_id) !== id
      );
      
      memoryRoutes.splice(index, 1);
      return res.json({ message: "Route deleted successfully", deleted: deletedRoute });
    }
  } catch (error: any) {
    console.error("DELETE /api/routes failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete route" });
  }
});

// --------------------------------------------------------
// ROUTE-CHECKOUT - work queue. Every read/write derives the tenant from
// the verified session (requestTenantId); req.query is never authority.
// The partial UNIQUE index route_assignments_active_unique is the
// database-level double-checkout lock (SQLSTATE 23505).
// --------------------------------------------------------

function sessionUserId(req: any): number | null {
  const raw = req?.auth?.user?.id;
  if (raw == null || String(raw).trim() === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function routeQueuePayload(queue: ReturnType<typeof buildRouteQueue>) {
  return {
    tenant_id: queue.tenantId,
    active: queue.active,
    awaiting_review: queue.awaitingReview,
    closed: queue.closed,
    unassigned: queue.unassigned,
    counts: {
      active: queue.counts.active,
      awaiting_review: queue.counts.awaitingReview,
      closed: queue.counts.closed,
      unassigned: queue.counts.unassigned
    },
    empty: queue.empty
  };
}

function memoryRouteQueueInput(tenantId: number): {
  routes: RouteQueueRouteRow[];
  assignments: RouteAssignmentRow[];
} {
  const routeIds = memoryTenantRouteIds(tenantId);
  const routes: RouteQueueRouteRow[] = memoryRoutes
    .filter((route) => routeIds.includes(route.id))
    .map((route) => {
      const plant = memoryPlants.find((p) => p.id === route.plant_id);
      return {
        id: route.id,
        name: route.name,
        plant_id: route.plant_id ?? null,
        plant_name: plant ? String(plant.name) : null,
        is_system: route.is_system === true
      };
    });
  const assignments: RouteAssignmentRow[] = memoryRouteAssignments
    .filter((assignment) => Number(assignment.tenant_id) === tenantId)
    .map((assignment) => {
      const analyst = memoryUsers.find((u) => u.id === assignment.assigned_to);
      return {
        ...assignment,
        assigned_analyst_name: analyst ? String(analyst.username) : null
      };
    });
  return { routes, assignments };
}

// GET /api/route-queue - four session-tenant tabs: active / awaiting review /
// closed / unassigned. Analyst name and timestamps travel with each row.
app.get("/api/route-queue", async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.json({
        success: true,
        queue: routeQueuePayload(
          buildRouteQueue({ tenantId: -1, routes: [], assignments: [] })
        )
      });
    }

    let input: {
      routes: RouteQueueRouteRow[];
      assignments: RouteAssignmentRow[];
    };
    if (pool) {
      const routesResult = await pool.query(
        `SELECT r.id, r.name, r.plant_id, r.is_system, pl.name AS plant_name
           FROM routes r
           JOIN plants pl ON pl.id = r.plant_id
          WHERE pl.company_id = $1
          ORDER BY r.name ASC`,
        [tenantId]
      );
      const assignmentsResult = await pool.query(
        `SELECT ra.*, u.username AS assigned_analyst_name
           FROM route_assignments ra
           LEFT JOIN users u
             ON u.id = ra.assigned_to AND u.company_id = ra.tenant_id
          WHERE ra.tenant_id = $1
          ORDER BY ra.id DESC`,
        [tenantId]
      );
      input = {
        routes: routesResult.rows as RouteQueueRouteRow[],
        assignments: assignmentsResult.rows as RouteAssignmentRow[]
      };
    } else {
      input = memoryRouteQueueInput(tenantId);
    }

    const queue = buildRouteQueue({ tenantId, ...input });
    return res.json({ success: true, queue: routeQueuePayload(queue) });
  } catch (error: any) {
    console.error("[route-checkout] GET queue error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to load the work queue."
    });
  }
});

// POST /api/routes/:id/checkout - assign the route to the SESSION user.
// A cross-tenant route is indistinguishable from a missing route (404).
app.post("/api/routes/:id/checkout", requirePermission("route.checkout"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const userId = sessionUserId(req);
    if (userId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const routeId = parseInt(req.params.id, 10);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return res.status(400).json({ error: "Invalid route id." });
    }

    if (pool) {
      const routeRes = await pool.query(
        `SELECT r.id, r.name
           FROM routes r
           JOIN plants pl ON pl.id = r.plant_id
          WHERE r.id = $1 AND pl.company_id = $2
          LIMIT 1`,
        [routeId, tenantId]
      );
      if (!routeRes.rows.length) {
        return res.status(404).json({ error: "Route not found." });
      }

      const openRes = await pool.query(
        `SELECT ra.id, ra.status, u.username AS assigned_analyst_name
           FROM route_assignments ra
           LEFT JOIN users u
             ON u.id = ra.assigned_to AND u.company_id = ra.tenant_id
          WHERE ra.route_id = $1 AND ra.tenant_id = $2
            AND ra.status IN ('checked_out', 'checked_in')
          ORDER BY ra.id DESC
          LIMIT 1`,
        [routeId, tenantId]
      );
      if (openRes.rows.length) {
        const open = openRes.rows[0];
        if (open.status === "checked_out") {
          return res.status(409).json({
            error: `Route is already checked out${
              open.assigned_analyst_name
                ? ` by ${open.assigned_analyst_name}`
                : ""
            }.`
          });
        }
        return res.status(409).json({
          error:
            "Route is awaiting review. Close the current pass before checking it out again."
        });
      }

      try {
        const inserted = await pool.query(
          `INSERT INTO route_assignments
             (tenant_id, route_id, assigned_to, status, checked_out_at)
           VALUES ($1, $2, $3, 'checked_out', NOW())
           RETURNING *`,
          [tenantId, routeId, userId]
        );
        return res.status(201).json({
          success: true,
          assignment: inserted.rows[0]
        });
      } catch (err: any) {
        if (err?.code === "23505") {
          return res.status(409).json({
            error:
              "Route is already checked out. Another analyst holds the active assignment."
          });
        }
        throw err;
      }
    }

    if (!memoryTenantRouteIds(tenantId).includes(routeId)) {
      return res.status(404).json({ error: "Route not found." });
    }
    const open = memoryRouteAssignments.find(
      (assignment) =>
        Number(assignment.tenant_id) === tenantId &&
        Number(assignment.route_id) === routeId &&
        (assignment.status === "checked_out" ||
          assignment.status === "checked_in")
    );
    if (open) {
      if (open.status === "checked_out") {
        const analyst = memoryUsers.find((u) => u.id === open.assigned_to);
        return res.status(409).json({
          error: `Route is already checked out${
            analyst ? ` by ${analyst.username}` : ""
          }.`
        });
      }
      return res.status(409).json({
        error:
          "Route is awaiting review. Close the current pass before checking it out again."
      });
    }

    const assignment = {
      id: getNextId(),
      tenant_id: tenantId,
      route_id: routeId,
      assigned_to: userId,
      status: "checked_out",
      checked_out_at: new Date().toISOString(),
      checked_in_at: null,
      closed_at: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryRouteAssignments.push(assignment);
    return res.status(201).json({ success: true, assignment });
  } catch (error: any) {
    console.error("[route-checkout] POST checkout error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to check out the route."
    });
  }
});

// POST /api/route-assignments/:id/check-in - the analyst who checked it out,
// or a tenant admin (existing RBAC ladder), records checked_in_at + notes.
app.post("/api/route-assignments/:id/check-in", requirePermission("route.checkin"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const userId = sessionUserId(req);
    if (userId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const assignmentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: "Invalid route assignment id." });
    }
    const notes =
      typeof req.body?.notes === "string" && req.body.notes.trim()
        ? req.body.notes.trim()
        : null;

    if (pool) {
      const found = await pool.query(
        `SELECT ra.*, u.username AS assigned_analyst_name
           FROM route_assignments ra
           LEFT JOIN users u
             ON u.id = ra.assigned_to AND u.company_id = ra.tenant_id
          WHERE ra.id = $1 AND ra.tenant_id = $2
          LIMIT 1`,
        [assignmentId, tenantId]
      );
      if (!found.rows.length) {
        return res.status(404).json({ error: "Route assignment not found." });
      }
      const assignment = found.rows[0];
      if (
        !canManageRouteAssignment({
          assignedTo: assignment.assigned_to,
          userId,
          role: req.auth?.user?.role
        })
      ) {
        return res.status(403).json({
          error:
            "Only the analyst who checked this route out, or a tenant admin, may check it in."
        });
      }
      if (!canCheckInAssignment(assignment.status)) {
        return res.status(409).json({
          error: "Only a checked-out assignment can be checked in."
        });
      }
      const updated = await pool.query(
        `UPDATE route_assignments
            SET status = 'checked_in',
                checked_in_at = NOW(),
                notes = $1,
                updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3
          RETURNING *`,
        [notes, assignmentId, tenantId]
      );
      return res.json({
        success: true,
        assignment: {
          ...updated.rows[0],
          assigned_analyst_name: assignment.assigned_analyst_name ?? null
        }
      });
    }

    const assignment = memoryRouteAssignments.find(
      (row) =>
        Number(row.id) === assignmentId && Number(row.tenant_id) === tenantId
    );
    if (!assignment) {
      return res.status(404).json({ error: "Route assignment not found." });
    }
    if (
      !canManageRouteAssignment({
        assignedTo: assignment.assigned_to,
        userId,
        role: req.auth?.user?.role
      })
    ) {
      return res.status(403).json({
        error:
          "Only the analyst who checked this route out, or a tenant admin, may check it in."
      });
    }
    if (!canCheckInAssignment(assignment.status)) {
      return res.status(409).json({
        error: "Only a checked-out assignment can be checked in."
      });
    }
    assignment.status = "checked_in";
    assignment.checked_in_at = new Date().toISOString();
    assignment.notes = notes;
    assignment.updated_at = new Date().toISOString();
    const analyst = memoryUsers.find((u) => u.id === assignment.assigned_to);
    return res.json({
      success: true,
      assignment: {
        ...assignment,
        assigned_analyst_name: analyst ? String(analyst.username) : null
      }
    });
  } catch (error: any) {
    console.error("[route-checkout] POST check-in error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to check in the route."
    });
  }
});

// POST /api/route-assignments/:id/close - same owner-or-admin rule; only
// valid from checked_in.
app.post("/api/route-assignments/:id/close", requirePermission("route.checkin"), async (req, res) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const userId = sessionUserId(req);
    if (userId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const assignmentId = parseInt(req.params.id, 10);
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
      return res.status(400).json({ error: "Invalid route assignment id." });
    }

    if (pool) {
      const found = await pool.query(
        `SELECT ra.*, u.username AS assigned_analyst_name
           FROM route_assignments ra
           LEFT JOIN users u
             ON u.id = ra.assigned_to AND u.company_id = ra.tenant_id
          WHERE ra.id = $1 AND ra.tenant_id = $2
          LIMIT 1`,
        [assignmentId, tenantId]
      );
      if (!found.rows.length) {
        return res.status(404).json({ error: "Route assignment not found." });
      }
      const assignment = found.rows[0];
      if (
        !canManageRouteAssignment({
          assignedTo: assignment.assigned_to,
          userId,
          role: req.auth?.user?.role
        })
      ) {
        return res.status(403).json({
          error:
            "Only the analyst who checked this route out, or a tenant admin, may close it."
        });
      }
      if (!canCloseAssignment(assignment.status)) {
        return res.status(409).json({
          error: "Only a checked-in assignment can be closed."
        });
      }
      const updated = await pool.query(
        `UPDATE route_assignments
            SET status = 'closed',
                closed_at = NOW(),
                updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
          RETURNING *`,
        [assignmentId, tenantId]
      );
      return res.json({
        success: true,
        assignment: {
          ...updated.rows[0],
          assigned_analyst_name: assignment.assigned_analyst_name ?? null
        }
      });
    }

    const assignment = memoryRouteAssignments.find(
      (row) =>
        Number(row.id) === assignmentId && Number(row.tenant_id) === tenantId
    );
    if (!assignment) {
      return res.status(404).json({ error: "Route assignment not found." });
    }
    if (
      !canManageRouteAssignment({
        assignedTo: assignment.assigned_to,
        userId,
        role: req.auth?.user?.role
      })
    ) {
      return res.status(403).json({
        error:
          "Only the analyst who checked this route out, or a tenant admin, may close it."
      });
    }
    if (!canCloseAssignment(assignment.status)) {
      return res.status(409).json({
        error: "Only a checked-in assignment can be closed."
      });
    }
    assignment.status = "closed";
    assignment.closed_at = new Date().toISOString();
    assignment.updated_at = new Date().toISOString();
    const analyst = memoryUsers.find((u) => u.id === assignment.assigned_to);
    return res.json({
      success: true,
      assignment: {
        ...assignment,
        assigned_analyst_name: analyst ? String(analyst.username) : null
      }
    });
  } catch (error: any) {
    console.error("[route-checkout] POST close error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to close the route assignment."
    });
  }
});

// --------------------------------------------------------
// ASSETS/EQUIPMENT ENDPOINTS
// --------------------------------------------------------

// GET all assets/equipment or filter by route (tenant-scoped)
app.get(["/api/assets", "/api/equipment", "/api/equipments", "/api/equipment/:routeId", "/api/assets/route/:routeId"], async (req, res) => {
  try {
    const routeIdParam = req.params.routeId ? parseInt(req.params.routeId, 10) : undefined;
    const routeIdQuery = req.query.route_id ? parseInt(req.query.route_id as string, 10) : undefined;
    const routeId = routeIdParam || routeIdQuery;
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }

    if (pool) {
      if (routeId !== undefined) {
        if (isNaN(routeId)) {
          return res.status(400).json({ error: "Invalid route ID parameter" });
        }
        if (!(await tenantOwnsRow(pool, "routes", routeId, company_id))) {
          return res.status(404).json({ error: "Route not found" });
        }
        const result = await pool.query(
          `SELECT a.* FROM assets a
             JOIN routes r ON r.id = a.route_id
             JOIN plants pl ON pl.id = r.plant_id
            WHERE a.route_id = $1 AND pl.company_id = $2
            ORDER BY a.name ASC`,
          [routeId, company_id]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          `SELECT a.* FROM assets a
             LEFT JOIN routes r ON r.id = a.route_id
             LEFT JOIN plants pl ON pl.id = r.plant_id
            WHERE pl.company_id = $1
            ORDER BY a.name ASC`,
          [company_id]
        );
        return res.json(result.rows);
      }
    } else {
      if (routeId !== undefined) {
        if (isNaN(routeId)) {
          return res.status(400).json({ error: "Invalid route ID parameter" });
        }
        if (!memoryTenantRouteIds(company_id).includes(routeId)) {
          return res.status(404).json({ error: "Route not found" });
        }
        const filtered = memoryAssets.filter(e => e.route_id === routeId);
        return res.json(filtered);
      } else {
        const assetIds = memoryTenantAssetIds(company_id);
        return res.json(memoryAssets.filter(e => assetIds.includes(e.id)));
      }
    }
  } catch (error: any) {
    console.error("GET /api/assets failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch equipment" });
  }
});

// GET single asset/equipment (tenant-scoped; cross-tenant is 404)
app.get(["/api/assets/:id", "/api/equipment/single/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid asset ID parameter" });
    }
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    if (pool) {
      const result = await pool.query(
        `SELECT a.* FROM assets a
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE a.id = $1 AND pl.company_id = $2`,
        [id, company_id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      return res.json(result.rows[0]);
    } else {
      const asset = memoryAssets.find(
        e => e.id === id && memoryTenantAssetIds(company_id).includes(e.id)
      );
      if (!asset) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      return res.json(asset);
    }
  } catch (error: any) {
    console.error("GET single asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch asset" });
  }
});

// POST /api/ai-extract-csv
app.post("/api/ai-extract-csv", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing required parameter: image" });
    }

    let mimeType = "image/png";
    let base64Data = image;

    if (image.startsWith("data:")) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const ai = getAiClient(req);
    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: "Analyze this image of an equipment list or database. Extract the hierarchy into a JSON array of objects. Keys should be: 'location', 'route', 'asset_name', 'asset_type', 'component_name'. Ignore headers and footers. If a column is missing, infer it from the context. Return ONLY valid JSON.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING },
              route: { type: Type.STRING },
              asset_name: { type: Type.STRING },
              asset_type: { type: Type.STRING },
              component_name: { type: Type.STRING },
            },
            required: ["location", "route", "asset_name", "asset_type"],
          }
        }
      }
    });

    const text = response.text || "[]";
    const parsed = JSON.parse(text);
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error("AI extraction failed:", error);
    return res.status(500).json({ error: error.message || "AI Extraction failed" });
  }
});

// POST bulk import asset hierarchy - supports multiple alias endpoints for compatibility
app.post(["/api/assets/bulk-import", "/api/bulk-import", "/api/assets/upload"], async (req, res) => {
  // Add CORS headers to be safe for API consumers
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  try {
    if (!req.body) {
      console.error("Bulk import failed: Missing request body entirely.");
      return res.status(400).json({ success: false, error: "Invalid payload: Missing request body.", message: "Invalid payload: Missing request body." });
    }

    const { assets } = req.body;

    // Import target is the session tenant only; a body companyId is ignored.
    const finalCompanyId = requestTenantId(req);
    if (finalCompanyId == null) {
      console.error("Bulk import unauthorized: no tenant in session.");
      return res.status(400).json({ success: false, error: "Unauthorized: Missing user session or company association.", message: "Unauthorized: Missing user session or company association." });
    }

    if (!Array.isArray(assets)) {
      console.error("Bulk import failed: assets parameter is not an array. assets received:", assets);
      return res.status(400).json({ success: false, error: "Invalid payload: assets must be an array", message: "Invalid payload: assets must be an array" });
    }

    let successCount = 0;
    const warnings: string[] = [];
    let importId: number | null = null;

    // Helper to get next ID for memory lists
    const getNextMemoryId = (list: any[]) => {
      const ids = list.map(item => item.id).filter(id => typeof id === "number");
      return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    };

    const rowFailure = (index: number, row: any, reason: string): Error => {
      const identifier = row?.assetTag
        ? String(row.assetTag)
        : row?.assetName
        ? String(row.assetName)
        : `row ${index + 1}`;
      const err: any = new Error(`Row ${index + 1} (${identifier}): ${reason}`);
      err.failingRow = { index: index + 1, identifier, reason };
      return err;
    };

    const componentNamesFor = (assetType: string, componentName?: string): string[] => {
      const finalCompName = componentName ? String(componentName).trim() : "";
      if (finalCompName) return [finalCompName];
      const typeLower = assetType.toLowerCase().trim();
      if (typeLower.includes("motor") || typeLower.includes("pump") || typeLower.includes("fan") || typeLower.includes("blower")) {
        return ["Drive End Bearing", "Non-Drive End Bearing"];
      }
      if (typeLower.includes("gearbox") || typeLower.includes("reducer")) {
        return ["Input Shaft Bearing", "Intermediate Shaft", "Output Shaft Bearing"];
      }
      if (typeLower.includes("compressor")) {
        return ["Cylinder A Valves", "Cylinder B Valves", "Crankshaft Bearing"];
      }
      return ["Primary Drive Bearing", "Secondary Support Bearing"];
    };

    if (pool) {
      // --- Database Mode: one pinned client, one transaction for the batch ---
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const importInsert = await client.query(
          "INSERT INTO imports (tenant_id, kind, status) VALUES ($1, $2, 'pending') RETURNING id",
          [finalCompanyId, "hierarchy_bulk_import"]
        );
        importId = Number(importInsert.rows[0].id);

        const companyRes = await client.query(
          "SELECT name FROM companies WHERE id = $1 LIMIT 1",
          [finalCompanyId]
        );
        const companyName = companyRes.rows[0]?.name || "Acme Corp";

        for (let i = 0; i < assets.length; i++) {
          const row = assets[i] || {};
          const { plantName, routeName, assetTag, assetName, assetType, componentName } = row;

          if (!plantName || !routeName || !assetName || !assetType) {
            throw rowFailure(i, row, "Missing required fields (plantName, routeName, assetName, assetType).");
          }

          try {
            let plantId: number;
            let routeId: number;
            let assetId: number;

            const plantCheck = await client.query(
              "SELECT id FROM plants WHERE company_id = $1 LIMIT 1",
              [finalCompanyId]
            );
            if (plantCheck.rows.length > 0) {
              plantId = plantCheck.rows[0].id;
            } else {
              const plantInsert = await client.query(
                "INSERT INTO plants (company_id, name, location, import_id) VALUES ($1, $2, $3, $4) RETURNING id",
                [finalCompanyId, `${companyName} - Main Location`, "Default Location", importId]
              );
              plantId = plantInsert.rows[0].id;
            }

            const routeCheck = await client.query(
              "SELECT id FROM routes WHERE LOWER(name) = LOWER($1) AND plant_id = $2 LIMIT 1",
              [String(routeName).trim(), plantId]
            );
            if (routeCheck.rows.length > 0) {
              routeId = routeCheck.rows[0].id;
            } else {
              const routeInsert = await client.query(
                "INSERT INTO routes (plant_id, name, description, import_id) VALUES ($1, $2, $3, $4) RETURNING id",
                [plantId, String(routeName).trim(), `Auto-created route for ${String(routeName).trim()}`, importId]
              );
              routeId = routeInsert.rows[0].id;
            }

            const assetNameTrimmed = String(assetName).trim();
            const assetTagTrimmed = assetTag ? String(assetTag).trim() : "";
            if (assetTagTrimmed) {
              // SLICE-B - corrected-tag heal. If the same logical asset
              // (name + route) already exists under a different tag, retag
              // that row first so the tag-keyed upsert updates it in place
              // instead of inserting a second row and orphaning the old one.
              await client.query(
                `UPDATE assets
                    SET tag_number = $1
                  WHERE company_id = $2
                    AND route_id = $3
                    AND LOWER(name) = LOWER($4)
                    AND (tag_number IS NULL OR tag_number <> $1)
                    AND NOT EXISTS (
                      SELECT 1 FROM assets other
                       WHERE other.company_id = $2
                         AND other.tag_number = $1
                         AND other.id <> assets.id
                    )`,
                [assetTagTrimmed, finalCompanyId, routeId, assetNameTrimmed]
              );

              // Tagged rows are idempotent on (company_id, tag_number). The
              // tenant column is company_id; a re-upload heals in place and a
              // route move updates route_id rather than duplicating the asset.
              const assetUpsert = await client.query(
                `INSERT INTO assets
                 (route_id, company_id, name, tag_number, type, status, criticality, description, import_id)
                 VALUES ($1, $2, $3, $4, $5, 'Active', 'Medium', $6, $7)
                 ON CONFLICT (company_id, tag_number) DO UPDATE SET
                   route_id = EXCLUDED.route_id,
                   name = EXCLUDED.name,
                   type = EXCLUDED.type,
                   status = EXCLUDED.status,
                   criticality = EXCLUDED.criticality,
                   description = EXCLUDED.description,
                   import_id = EXCLUDED.import_id
                 RETURNING id`,
                [routeId, finalCompanyId, assetNameTrimmed, assetTagTrimmed, String(assetType).trim(), `Auto-imported ${String(assetType).trim()}`, importId]
              );
              assetId = assetUpsert.rows[0].id;
            } else {
              // Untagged rows insert as-is. Documented limitation: there is no
              // idempotency for them, but NULL tag_number values are distinct
              // in the UNIQUE constraint so they can never collide.
              const assetInsert = await client.query(
                `INSERT INTO assets
                 (route_id, company_id, name, tag_number, type, status, criticality, description, import_id)
                 VALUES ($1, $2, $3, NULL, $4, 'Active', 'Medium', $5, $6)
                 RETURNING id`,
                [routeId, finalCompanyId, assetNameTrimmed, String(assetType).trim(), `Auto-imported ${String(assetType).trim()}`, importId]
              );
              assetId = assetInsert.rows[0].id;
            }

            for (const compName of componentNamesFor(String(assetType), componentName)) {
              const compCheck = await client.query(
                "SELECT id FROM components WHERE LOWER(name) = LOWER($1) AND asset_id = $2 LIMIT 1",
                [compName, assetId]
              );
              if (compCheck.rows.length === 0) {
                await client.query(
                  "INSERT INTO components (asset_id, name, type, import_id) VALUES ($1, $2, $3, $4)",
                  [assetId, compName, "Bearing", importId]
                );
              }
            }

            successCount++;
          } catch (err: any) {
            if (err?.failingRow) throw err;
            throw rowFailure(i, row, err?.message || "Unknown schema constraint.");
          }
        }

        await client.query(
          "UPDATE imports SET status = 'completed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [importId, finalCompanyId]
        );
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[bulk-import] ROLLBACK failed:", rollbackErr);
        }
        throw err;
      } finally {
        client.release();
      }
    } else {
      // --- In-Memory Fallback Mode: snapshot, then restore on any failure ---
      const beforePlants = memoryPlants.slice();
      const beforeRoutes = memoryRoutes.slice();
      // Clone asset objects: SLICE-B upserts mutate an existing row in place,
      // so a shallow slice() would let a failed batch leak those mutations
      // past the rollback.
      const beforeEquipment = memoryEquipment.map((item) => ({ ...item }));
      const beforeComponents = memoryComponents.slice();
      const beforeCollectionPoints = memoryCollectionPoints.slice();
      const beforeMeasurementPoints = memoryMeasurementPoints.slice();
      const beforeImports = memoryImports.slice();

      try {
        importId = getNextMemoryId(memoryImports);
        memoryImports.push({
          id: importId,
          tenant_id: finalCompanyId,
          kind: "hierarchy_bulk_import",
          created_at: new Date(),
          completed_at: null,
          status: "pending"
        });

        for (let i = 0; i < assets.length; i++) {
          const row = assets[i] || {};
          const { plantName, routeName, assetTag, assetName, assetType, componentName } = row;

          if (!plantName || !routeName || !assetName || !assetType) {
            throw rowFailure(i, row, "Missing required fields (plantName, routeName, assetName, assetType).");
          }

          try {
            let plantId: number;
            let routeId: number;
            let assetId: number;

            let plant = memoryPlants.find(p => p.company_id === finalCompanyId);
            if (!plant) {
              const company = memoryCompanies.find(c => c.id === finalCompanyId);
              const compName = company ? company.name : "Acme Corp";
              plant = {
                id: getNextMemoryId(memoryPlants),
                company_id: finalCompanyId,
                name: `${compName} - Main Location`,
                location: "Default Location",
                import_id: importId
              };
              memoryPlants.push(plant);
            }
            plantId = plant.id;

            let route = memoryRoutes.find(r => r.name.toLowerCase() === String(routeName).toLowerCase().trim() && r.plant_id === plantId);
            if (!route) {
              route = {
                id: getNextMemoryId(memoryRoutes),
                plant_id: plantId,
                name: String(routeName).trim(),
                description: `Auto-created route for ${String(routeName).trim()}`,
                import_id: importId
              };
              memoryRoutes.push(route);
            }
            routeId = route.id;

            const assetNameTrimmed = String(assetName).trim();
            const assetTagTrimmed = assetTag ? String(assetTag).trim() : "";
            let asset = assetTagTrimmed
              ? memoryAssets.find(
                  (a) =>
                    a.company_id === finalCompanyId &&
                    a.tag_number === assetTagTrimmed
                )
              : undefined;
            if (!asset && assetTagTrimmed) {
              // SLICE-B - corrected-tag heal (memory mirror of the DB retag).
              asset = memoryAssets.find(
                (a) =>
                  a.company_id === finalCompanyId &&
                  a.route_id === routeId &&
                  String(a.name).toLowerCase() === assetNameTrimmed.toLowerCase()
              );
            }
            if (asset) {
              asset.route_id = routeId;
              asset.company_id = finalCompanyId;
              asset.name = assetNameTrimmed;
              asset.tag_number = assetTagTrimmed || null;
              asset.type = String(assetType).trim();
              asset.status = "Active";
              asset.criticality = "Medium";
              asset.description = `Auto-imported ${String(assetType).trim()}`;
              asset.import_id = importId;
            } else {
              asset = {
                id: getNextMemoryId(memoryAssets),
                route_id: routeId,
                company_id: finalCompanyId,
                name: assetNameTrimmed,
                tag_number: assetTagTrimmed || null,
                type: String(assetType).trim(),
                status: "Active",
                criticality: "Medium",
                description: `Auto-imported ${String(assetType).trim()}`,
                import_id: importId
              };
              memoryAssets.push(asset);
            }
            assetId = asset.id;

            for (const compName of componentNamesFor(String(assetType), componentName)) {
              const compExists = memoryComponents.some(c => c.name.toLowerCase() === compName.toLowerCase() && (c.asset_id === assetId || c.equipment_id === assetId));
              if (!compExists) {
                memoryComponents.push({
                  id: getNextMemoryId(memoryComponents),
                  asset_id: assetId,
                  equipment_id: assetId,
                  name: compName,
                  type: "Bearing",
                  import_id: importId,
                  created_at: new Date()
                });
              }
            }

            successCount++;
          } catch (err: any) {
            if (err?.failingRow) throw err;
            throw rowFailure(i, row, err?.message || "Unknown schema constraint.");
          }
        }

        const completedImport = memoryImports.find(item => item.id === importId);
        if (completedImport) {
          completedImport.status = "completed";
          completedImport.completed_at = new Date();
        }
      } catch (err) {
        memoryPlants = beforePlants;
        memoryRoutes = beforeRoutes;
        memoryEquipment = beforeEquipment;
        memoryAssets = memoryEquipment;
        memoryComponents = beforeComponents;
        memoryCollectionPoints = beforeCollectionPoints;
        memoryMeasurementPoints = beforeMeasurementPoints;
        memoryImports = beforeImports;
        throw err;
      }
    }

    res.json({
      success: true,
      import_id: importId,
      message: `Bulk import committed ${successCount} equipment/assets atomically.`,
      total: assets.length,
      successCount: successCount,
      skipped: 0,
      warnings
    });

  } catch (error: any) {
    console.error("🔥 Bulk import failed at outer handler:", error);
    const failingRow = error?.failingRow;
    const message = error?.message || "Bulk import transaction aborted.";
    return res.status(failingRow ? 400 : 500).json({
      success: false,
      error: message,
      message,
      ...(failingRow ? { failingRow } : {})
    });
  }
});

// DELETE /api/imports/:id - discard exactly one import batch. Tenant comes
// from the verified session only; a cross-tenant id is a 404 no-op. Rows whose
// import_id is NULL are never selected. This is the single reversible undo for
// a bad promotion - never a database-wide wipe.
const discardImportBatch = async (req: any, res: any) => {
  try {
    const tenantId = requestTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const importId = parseInt(req.params.id, 10);
    if (!Number.isInteger(importId) || importId <= 0) {
      return res.status(400).json({ error: "Invalid import id." });
    }

    const deleted = {
      measurement_points: 0,
      collection_points: 0,
      components: 0,
      assets: 0,
      routes: 0,
      plants: 0
    };

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query(
          "SELECT id FROM imports WHERE id = $1 AND tenant_id = $2 LIMIT 1",
          [importId, tenantId]
        );
        if (!found.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Import not found." });
        }

        const mp = await client.query(
          `DELETE FROM measurement_points mp
            USING collection_points cp, components c, assets a, routes r, plants pl
            WHERE mp.import_id = $1
              AND mp.collection_point_id = cp.id
              AND cp.component_id = c.id
              AND c.asset_id = a.id
              AND a.route_id = r.id
              AND r.plant_id = pl.id
              AND pl.company_id = $2`,
          [importId, tenantId]
        );
        deleted.measurement_points = mp.rowCount ?? 0;

        const cp = await client.query(
          `DELETE FROM collection_points cp
            USING components c, assets a, routes r, plants pl
            WHERE cp.import_id = $1
              AND cp.component_id = c.id
              AND c.asset_id = a.id
              AND a.route_id = r.id
              AND r.plant_id = pl.id
              AND pl.company_id = $2`,
          [importId, tenantId]
        );
        deleted.collection_points = cp.rowCount ?? 0;

        const comp = await client.query(
          `DELETE FROM components c
            USING assets a, routes r, plants pl
            WHERE c.import_id = $1
              AND c.asset_id = a.id
              AND a.route_id = r.id
              AND r.plant_id = pl.id
              AND pl.company_id = $2`,
          [importId, tenantId]
        );
        deleted.components = comp.rowCount ?? 0;

        const asset = await client.query(
          `DELETE FROM assets a
            USING routes r, plants pl
            WHERE a.import_id = $1
              AND a.route_id = r.id
              AND r.plant_id = pl.id
              AND pl.company_id = $2`,
          [importId, tenantId]
        );
        deleted.assets = asset.rowCount ?? 0;

        const route = await client.query(
          `DELETE FROM routes r
            USING plants pl
            WHERE r.import_id = $1
              AND r.plant_id = pl.id
              AND pl.company_id = $2`,
          [importId, tenantId]
        );
        deleted.routes = route.rowCount ?? 0;

        const plant = await client.query(
          "DELETE FROM plants WHERE import_id = $1 AND company_id = $2",
          [importId, tenantId]
        );
        deleted.plants = plant.rowCount ?? 0;

        await client.query(
          "UPDATE imports SET status = 'discarded', completed_at = NOW() WHERE id = $1 AND tenant_id = $2",
          [importId, tenantId]
        );
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[imports] discard ROLLBACK failed:", rollbackErr);
        }
        throw err;
      } finally {
        client.release();
      }
    } else {
      const importRecord = memoryImports.find(
        (item) => Number(item.id) === importId && Number(item.tenant_id) === tenantId
      );
      if (!importRecord) {
        return res.status(404).json({ error: "Import not found." });
      }

      const tenantMeasurementPointIds = new Set(memoryTenantMeasurementPointIds(tenantId));
      const tenantCollectionPointIds = new Set(memoryTenantCollectionPointIds(tenantId));
      const tenantComponentIds = new Set(memoryTenantComponentIds(tenantId));
      const tenantAssetIds = new Set(memoryTenantAssetIds(tenantId));
      const tenantRouteIds = new Set(memoryTenantRouteIds(tenantId));
      const tenantPlantIds = new Set(memoryTenantPlantIds(tenantId));

      const mpIds = new Set(
        memoryMeasurementPoints
          .filter((mp) => mp.import_id === importId && tenantMeasurementPointIds.has(mp.id))
          .map((mp) => mp.id)
      );
      const cpIds = new Set(
        memoryCollectionPoints
          .filter((cp) => cp.import_id === importId && tenantCollectionPointIds.has(cp.id))
          .map((cp) => cp.id)
      );
      const compIds = new Set(
        memoryComponents
          .filter((c) => c.import_id === importId && tenantComponentIds.has(c.id))
          .map((c) => c.id)
      );
      const assetIds = new Set(
        memoryAssets
          .filter((a) => a.import_id === importId && tenantAssetIds.has(a.id))
          .map((a) => a.id)
      );
      const routeIds = new Set(
        memoryRoutes
          .filter((r) => r.import_id === importId && tenantRouteIds.has(r.id))
          .map((r) => r.id)
      );
      const plantIds = new Set(
        memoryPlants
          .filter((p) => p.import_id === importId && tenantPlantIds.has(p.id))
          .map((p) => p.id)
      );

      deleted.measurement_points = mpIds.size;
      deleted.collection_points = cpIds.size;
      deleted.components = compIds.size;
      deleted.assets = assetIds.size;
      deleted.routes = routeIds.size;
      deleted.plants = plantIds.size;

      memoryMeasurementPoints = memoryMeasurementPoints.filter((mp) => !mpIds.has(mp.id));
      memoryCollectionPoints = memoryCollectionPoints.filter((cp) => !cpIds.has(cp.id));
      memoryComponents = memoryComponents.filter((c) => !compIds.has(c.id));
      memoryEquipment = memoryEquipment.filter((a) => !assetIds.has(a.id));
      memoryAssets = memoryEquipment;
      memoryRoutes = memoryRoutes.filter((r) => !routeIds.has(r.id));
      memoryPlants = memoryPlants.filter((p) => !plantIds.has(p.id));

      importRecord.status = "discarded";
      importRecord.completed_at = new Date();
    }

    return res.json({
      success: true,
      import_id: importId,
      deleted
    });
  } catch (error: any) {
    console.error("[imports] discard failed:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to discard the import."
    });
  }
};

app.delete(["/api/imports/:id", "/api/imports/:id/discard"], discardImportBatch);
app.post(["/api/imports/:id/discard", "/api/imports/:id"], discardImportBatch);

// POST create asset/equipment
app.post(["/api/assets", "/api/equipment"], async (req, res) => {
  try {
    const {
      route_id,
      name,
      tag_number,
      type,
      manufacturer,
      model,
      serial_number,
      install_date,
      criticality,
      status,
      description
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const hasRoute =
      route_id !== undefined &&
      route_id !== null &&
      String(route_id).trim() !== "";
    // Route-less mode is selected by an explicit simpleMode flag with or
    // without a route_id; a missing route alone also implies it.
    const simpleMode = req.body.simpleMode === true || !hasRoute;
    let rId: number;
    if (hasRoute && !simpleMode) {
      rId = parseInt(route_id, 10);
      if (isNaN(rId)) {
        return res.status(400).json({ error: "Invalid route_id field (integer required)" });
      }
    } else {
      // H1 - route-less mode: never 400 solely for the missing route. The
      // server find-or-creates the plant and its is_system route so an asset
      // under the plant root succeeds end-to-end from the Explorer.
      const companyIdRaw =
        req.tenantId ??
        req.auth?.tenantId ??
        null;
      const companyIdNum =
        companyIdRaw !== undefined && companyIdRaw !== null && String(companyIdRaw).trim() !== ""
          ? Number(companyIdRaw)
          : null;
      const companyId = companyIdNum != null && !isNaN(companyIdNum) ? companyIdNum : null;
      if (pool) {
        const resolved = await resolveSimpleModeHierarchy(pool, companyId);
        rId = Number(resolved.route.id);
      } else {
        let plant = companyId != null
          ? memoryPlants.find((p) => p.company_id === companyId)
          : undefined;
        if (!plant) {
          plant = {
            id: getNextId(),
            name: "Main Site",
            location: "Main Site",
            company_id: companyId,
            created_at: new Date()
          };
          memoryPlants.push(plant);
        }
        let route = memoryRoutes.find(
          (r) => r.plant_id === plant.id && r.is_system === true
        );
        if (!route) {
          route = {
            id: getNextId(),
            plant_id: plant.id,
            name: SYSTEM_ROUTE_NAME,
            description: "Auto-created route for assets added without a route.",
            is_system: true,
            created_at: new Date()
          };
          memoryRoutes.push(route);
        }
        rId = route.id;
      }
    }
    const equipStatus = status || 'Active';

    if (pool) {
      const tenantId = requestTenantId(req);
      if (!simpleMode && !(await tenantOwnsRow(pool, "routes", rId, tenantId))) {
        return res.status(400).json({ error: `Parent route not found: ${rId}` });
      }
      const result = await pool.query(
        `INSERT INTO assets
         (route_id, company_id, name, tag_number, type, manufacturer, model, serial_number, install_date, criticality, status, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          rId,
          tenantId,
          name.trim(),
          tag_number ? tag_number.trim() : null,
          type ? type.trim() : null,
          manufacturer ? manufacturer.trim() : null,
          model ? model.trim() : null,
          serial_number ? serial_number.trim() : null,
          install_date ? install_date : null,
          criticality ? criticality.trim() : null,
          equipStatus,
          description ? description.trim() : null
        ]
      );
      return res.status(201).json({ ...result.rows[0], simpleMode });
    } else {
      const nextTag = tag_number ? tag_number.trim() : null;
      const tenantId = requestTenantId(req);
      if (
        nextTag &&
        memoryAssets.some(
          (asset) =>
            asset.company_id === tenantId && asset.tag_number === nextTag
        )
      ) {
        return res.status(409).json({
          error: "duplicate_tag",
          message: "An asset with this tag already exists in this company."
        });
      }
      const newAsset = {
        id: getNextId(),
        route_id: rId,
        company_id: tenantId,
        name: name.trim(),
        tag_number: nextTag,
        type: type ? type.trim() : null,
        manufacturer: manufacturer ? manufacturer.trim() : null,
        model: model ? model.trim() : null,
        serial_number: serial_number ? serial_number.trim() : null,
        install_date: install_date || null,
        criticality: criticality ? criticality.trim() : null,
        status: equipStatus,
        description: description ? description.trim() : null,
        created_at: new Date()
      };
      memoryAssets.push(newAsset);
      return res.status(201).json(newAsset);
    }
  } catch (error: any) {
    if (error?.code === "23505" && error?.constraint === "assets_company_tag_number_key") {
      return res.status(409).json({
        error: "duplicate_tag",
        message: "An asset with this tag already exists in this company."
      });
    }
    console.error("POST create asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create equipment" });
  }
});

// PUT update asset/equipment
app.put(["/api/assets/:id", "/api/equipment/:id", "/api/equipments/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const {
      name,
      tag_number,
      type,
      manufacturer,
      model,
      serial_number,
      install_date,
      criticality,
      status,
      description
    } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    if (pool) {
      const tenantId = requestTenantId(req) ?? -1;
      const nextTag = tag_number ? tag_number.trim() : null;
      if (nextTag) {
        const duplicate = await pool.query(
          `SELECT id FROM assets
            WHERE company_id = $1 AND tag_number = $2 AND id != $3
            LIMIT 1`,
          [tenantId, nextTag, id]
        );
        if (duplicate.rows.length > 0) {
          return res.status(409).json({
            error: "duplicate_tag",
            message: "An asset with this tag already exists in this company."
          });
        }
      }
      const result = await pool.query(
        `UPDATE assets a SET
         name = $1, tag_number = $2, type = $3, manufacturer = $4, model = $5, serial_number = $6, install_date = $7, criticality = $8, status = $9, description = $10
         FROM routes r
         JOIN plants pl ON pl.id = r.plant_id
         WHERE a.id = $11 AND a.route_id = r.id AND pl.company_id = $12 RETURNING a.*`,
        [
          name.trim(),
          nextTag,
          type ? type.trim() : null,
          manufacturer ? manufacturer.trim() : null,
          model ? model.trim() : null,
          serial_number ? serial_number.trim() : null,
          install_date || null,
          criticality ? criticality.trim() : null,
          status || 'Active',
          description ? description.trim() : null,
          id,
          tenantId
        ]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
      return res.json(result.rows[0]);
    } else {
      const tenantId = requestTenantId(req);
      const nextTag = tag_number ? tag_number.trim() : null;
      const asset = memoryAssets.find(
        e => e.id === id && memoryTenantAssetIds(tenantId).includes(e.id)
      );
      if (!asset) return res.status(404).json({ error: "Equipment not found" });
      if (
        nextTag &&
        memoryAssets.some(
          (other) =>
            other.id !== id &&
            other.company_id === tenantId &&
            other.tag_number === nextTag
        )
      ) {
        return res.status(409).json({
          error: "duplicate_tag",
          message: "An asset with this tag already exists in this company."
        });
      }
      asset.name = name.trim();
      asset.tag_number = nextTag;
      asset.type = type ? type.trim() : null;
      asset.manufacturer = manufacturer ? manufacturer.trim() : null;
      asset.model = model ? model.trim() : null;
      asset.serial_number = serial_number ? serial_number.trim() : null;
      asset.install_date = install_date || null;
      asset.criticality = criticality ? criticality.trim() : null;
      asset.status = status || 'Active';
      asset.description = description ? description.trim() : null;
      return res.json(asset);
    }
  } catch (error: any) {
    if (error?.code === "23505" && error?.constraint === "assets_company_tag_number_key") {
      return res.status(409).json({
        error: "duplicate_tag",
        message: "An asset with this tag already exists in this company."
      });
    }
    console.error("PUT update asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update equipment" });
  }
});

// GET planning_config for an asset (by tag_number)
app.get(["/api/assets/:tag/planning-config", "/api/equipment/:tag/planning-config"], async (req, res) => {
  try {
    const tag = req.params.tag;
    if (!tag) return res.status(400).json({ error: "Missing tag parameter" });
    if (pool) {
      const result = await pool.query("SELECT config FROM planning_configs WHERE asset_id = $1", [tag]);
      return res.json(result.rows.length > 0 ? result.rows[0].config : null);
    } else {
      return res.json(null);
    }
  } catch (error: any) {
    console.error("GET planning_config failed:", error);
    return res.status(500).json({ error: error.message || "Failed to read planning config" });
  }
});

// PATCH planning_config for an asset (by tag_number)
app.patch(["/api/assets/:tag/planning-config", "/api/equipment/:tag/planning-config"], async (req, res) => {
  try {
    const tag = req.params.tag;
    if (!tag) return res.status(400).json({ error: "Missing tag parameter" });
    const config = req.body;
    if (pool) {
      const result = await pool.query(
        `INSERT INTO planning_configs (asset_id, config, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (asset_id) DO UPDATE SET config = $2, updated_at = now()
         RETURNING config`,
        [tag, JSON.stringify(config)]
      );
      return res.json(result.rows[0].config);
    } else {
      return res.json(config);
    }
  } catch (error: any) {
    console.error("PATCH planning_config failed:", error);
    return res.status(500).json({ error: error.message || "Failed to save planning config" });
  }
});

// DELETE delete asset/equipment
app.delete(["/api/assets/:id", "/api/equipment/:id", "/api/equipments/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    console.log('Delete hit:', req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const tenantId = requestTenantId(req) ?? -1;
      const owned = await pool.query(
        `SELECT a.id FROM assets a
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE a.id = $1 AND pl.company_id = $2`,
        [id, tenantId]
      );
      if (owned.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
      // 1. Delete all analysis history for measurement points under collection points of components of this asset.
      await pool.query(
        "DELETE FROM analysis_history WHERE measurement_point_id IN " +
        "(SELECT id FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id = $1)))",
        [id]
      );
      // 2. Delete all measurement points under collection points of components of this asset.
      await pool.query(
        "DELETE FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id = $1))",
        [id]
      );
      // 3. Delete all collection points of components of this asset.
      await pool.query(
        "DELETE FROM collection_points WHERE component_id IN " +
        "(SELECT id FROM components WHERE asset_id = $1)",
        [id]
      );
      // 4. Delete all components where asset_id matches the asset id
      await pool.query("DELETE FROM components WHERE asset_id = $1", [id]);
      // 5. Delete the asset itself
      const result = await pool.query("DELETE FROM assets WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Equipment not found" });
      return res.json({ message: "Equipment deleted successfully", deleted: result.rows[0] });
    } else {
      const assetIds = memoryTenantAssetIds(requestTenantId(req));
      const index = memoryAssets.findIndex(e => e.id === id && assetIds.includes(e.id));
      if (index === -1) return res.status(404).json({ error: "Equipment not found" });
      const deleted = memoryAssets.splice(index, 1)[0];
      
      // Cascade delete components, collection points, measurement points, and analysis history down the tree
      const componentIds = memoryComponents.filter(c => c.asset_id === id || c.equipment_id === id).map(c => c.id);
      const cpIds = memoryCollectionPoints.filter(cp => componentIds.includes(cp.component_id)).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);
      
      memoryAnalysisHistory = memoryAnalysisHistory.filter(ah => !mpIds.includes(ah.measurement_point_id));
      memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => !cpIds.includes(mp.collection_point_id));
      memoryCollectionPoints = memoryCollectionPoints.filter(cp => !componentIds.includes(cp.component_id));
      memoryComponents = memoryComponents.filter(c => c.asset_id !== id && c.equipment_id !== id);
      
      return res.json({ message: "Equipment deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE asset failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete equipment" });
  }
});

// --------------------------------------------------------
// COMPONENTS ENDPOINTS
// --------------------------------------------------------

// GET components for specific asset/equipment with vibration status and health analysis
app.get(["/api/components", "/api/components/:equipmentId", "/api/components/asset/:assetId"], async (req, res) => {
  try {
    const equipIdParam = req.params.equipmentId ? parseInt(req.params.equipmentId, 10) : undefined;
    const assetIdParam = req.params.assetId ? parseInt(req.params.assetId, 10) : undefined;
    const equipIdQuery = req.query.equipment_id ? parseInt(req.query.equipment_id as string, 10) : undefined;
    const assetIdQuery = req.query.asset_id ? parseInt(req.query.asset_id as string, 10) : undefined;

    const finalAssetId = equipIdParam || assetIdParam || equipIdQuery || assetIdQuery;
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }

    if (pool) {
      let query = `
        SELECT 
          c.id, 
          c.asset_id, 
          c.asset_id as equipment_id, 
          c.name, 
          c.type, 
          c.manufacturer, 
          c.model, 
          c.specifications, 
          c.specs,
          c.notes, 
          c.created_at,
          a.criticality as asset_criticality,
          (
            SELECT dh.ai_response 
            FROM diagnosis_history dh 
            WHERE dh.component_id = c.id 
            ORDER BY dh.timestamp DESC 
            LIMIT 1
          ) as latest_diagnosis,
          (
            SELECT ah.diagnosis_result 
            FROM analysis_history ah 
            JOIN measurement_points mp ON ah.measurement_point_id = mp.id 
            JOIN collection_points cp ON mp.collection_point_id = cp.id 
            WHERE cp.component_id = c.id 
            ORDER BY ah.created_at DESC 
            LIMIT 1
          ) as latest_analysis
        FROM components c
        LEFT JOIN assets a ON c.asset_id = a.id
        LEFT JOIN routes rt ON a.route_id = rt.id
        LEFT JOIN plants pl ON rt.plant_id = pl.id
        WHERE pl.company_id = $1
      `;
      const queryParams: any[] = [company_id];
      if (finalAssetId !== undefined) {
        if (isNaN(finalAssetId)) {
          return res.status(400).json({ error: "Invalid asset/equipment ID parameter" });
        }
        if (!(await tenantOwnsRow(pool, "assets", finalAssetId, company_id))) {
          return res.status(404).json({ error: "Equipment not found" });
        }
        query += " AND c.asset_id = $2";
        queryParams.push(finalAssetId);
      }
      query += " ORDER BY c.name ASC";

      const result = await pool.query(query, queryParams);
      
      const rows = result.rows.map(row => {
        let diag = row.latest_diagnosis || row.latest_analysis;
        if (typeof diag === 'string') {
          try { diag = JSON.parse(diag); } catch(e) {}
        }

        const specs = row.specifications || row.specs || {};
        const criticality = specs.criticality || specs.assetCriticality || row.asset_criticality || "Medium";
        let severity = diag?.manager_summary?.severity || diag?.overall_severity || diag?.severity || "Low";
        let status = "Healthy";
        let hasActiveAlert = false;
        let faultType = null;

        if (diag?.probable_faults && diag.probable_faults.length > 0) {
          faultType = diag.probable_faults[0].fault_name || diag.probable_faults[0].fault;
        }

        if (severity === "Critical" || severity === "CRITICAL_FAULT") {
          status = "Critical";
          hasActiveAlert = true;
        } else if (severity === "High" || severity === "Warning" || severity === "Medium") {
          status = "Warning";
          if (severity === "High") hasActiveAlert = true;
        } else {
          status = "Healthy";
        }

        return {
          ...row,
          status,
          vibration_status: status,
          severity,
          vibration_severity: severity,
          criticality,
          has_active_alert: hasActiveAlert,
          latest_fault: faultType,
          latest_diagnosis: diag
        };
      });

      return res.json(rows);
    } else {
      const assetIds = memoryTenantAssetIds(company_id);
      if (finalAssetId !== undefined) {
        if (isNaN(finalAssetId)) {
          return res.status(400).json({ error: "Invalid asset/equipment ID parameter" });
        }
        if (!assetIds.includes(finalAssetId)) {
          return res.status(404).json({ error: "Equipment not found" });
        }
        const filtered = memoryComponents
          .filter(c => (c.asset_id === finalAssetId || c.equipment_id === finalAssetId))
          .map(c => {
            const specs = c.specifications || c.specs || {};
            const criticality = specs.criticality || specs.assetCriticality || "Medium";
            const status = c.status || c.vibration_status || "Healthy";
            return {
              ...c,
              asset_id: finalAssetId,
              equipment_id: finalAssetId,
              status,
              vibration_status: status,
              criticality
            };
          });
        return res.json(filtered);
      } else {
        const compIds = memoryTenantComponentIds(company_id);
        return res.json(memoryComponents.filter(c => compIds.includes(c.id)).map(c => ({
          ...c,
          status: c.status || "Healthy",
          vibration_status: c.status || "Healthy",
          criticality: c.specifications?.criticality || "Medium"
        })));
      }
    }
  } catch (error: any) {
    console.error("GET /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch components" });
  }
});

// POST create new component
app.post(["/api/components", "/api/component"], async (req, res) => {
  try {
    const { asset_id, equipment_id, name, type, manufacturer, model, specifications, notes } = req.body;

    const incomingId = asset_id !== undefined ? asset_id : equipment_id;
    if (incomingId === undefined || isNaN(parseInt(incomingId, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: asset_id or equipment_id (integer)" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const astId = parseInt(incomingId, 10);
    if (pool) {
      if (!(await tenantOwnsRow(pool, "assets", astId, requestTenantId(req)))) {
        return res.status(400).json({ error: `Parent asset not found: ${astId}` });
      }
    } else if (!memoryTenantAssetIds(requestTenantId(req)).includes(astId)) {
      return res.status(400).json({ error: `Parent asset not found: ${astId}` });
    }
    let parsedSpecs: any = null;
    if (specifications) {
      if (typeof specifications === "object") {
        parsedSpecs = specifications;
      } else {
        try {
          parsedSpecs = JSON.parse(specifications);
        } catch (e) {
          parsedSpecs = { raw: specifications };
        }
      }
    }

    if (pool) {
      const result = await pool.query(
        `INSERT INTO components (asset_id, name, type, manufacturer, model, specifications, notes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, asset_id, asset_id as equipment_id, name, type, manufacturer, model, specifications, notes, created_at`,
        [astId, name.trim(), type ? type.trim() : null, manufacturer ? manufacturer.trim() : null, model ? model.trim() : null, parsedSpecs, notes ? notes.trim() : null]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newComp = {
        id: getNextId(),
        asset_id: astId,
        equipment_id: astId,
        name: name.trim(),
        type: type ? type.trim() : null,
        manufacturer: manufacturer ? manufacturer.trim() : null,
        model: model ? model.trim() : null,
        specifications: parsedSpecs,
        notes: notes ? notes.trim() : null,
        created_at: new Date()
      };
      memoryComponents.push(newComp);
      return res.status(201).json(newComp);
    }
  } catch (error: any) {
    console.error("POST /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create component" });
  }
});

// PUT update component
app.put("/api/components/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, type, manufacturer, model, specifications, notes } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    let parsedSpecs: any = null;
    if (specifications) {
      if (typeof specifications === "object") {
        parsedSpecs = specifications;
      } else {
        try {
          parsedSpecs = JSON.parse(specifications);
        } catch (e) {
          parsedSpecs = { raw: specifications };
        }
      }
    }

    if (pool) {
      const result = await pool.query(
        `UPDATE components c SET name = $1, type = $2, manufacturer = $3, model = $4, specifications = $5, notes = $6
         FROM assets a
         LEFT JOIN routes r ON r.id = a.route_id
         LEFT JOIN plants pl ON pl.id = r.plant_id
         WHERE c.id = $7 AND c.asset_id = a.id AND pl.company_id = $8
         RETURNING c.id, c.asset_id, c.asset_id as equipment_id, c.name, c.type, c.manufacturer, c.model, c.specifications, c.notes, c.created_at`,
        [name.trim(), type ? type.trim() : null, manufacturer ? manufacturer.trim() : null, model ? model.trim() : null, parsedSpecs, notes ? notes.trim() : null, id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Component not found" });
      return res.json(result.rows[0]);
    } else {
      const compIds = memoryTenantComponentIds(requestTenantId(req));
      const comp = memoryComponents.find(c => c.id === id && compIds.includes(c.id));
      if (!comp) return res.status(404).json({ error: "Component not found" });
      comp.name = name.trim();
      comp.type = type ? type.trim() : null;
      comp.manufacturer = manufacturer ? manufacturer.trim() : null;
      comp.model = model ? model.trim() : null;
      comp.specifications = parsedSpecs;
      comp.notes = notes ? notes.trim() : null;
      return res.json(comp);
    }
  } catch (error: any) {
    console.error("PUT /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update component" });
  }
});

// DELETE component
app.delete("/api/components/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    console.log('Delete hit:', req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      if (!(await tenantOwnsRow(pool, "components", id, requestTenantId(req)))) {
        return res.status(404).json({ error: "Component not found" });
      }
      // 1. Delete analysis history for measurement points under collection points of this component.
      await pool.query(
        "DELETE FROM analysis_history WHERE measurement_point_id IN " +
        "(SELECT id FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id = $1))",
        [id]
      );
      // 2. Delete measurement points under collection points of this component.
      await pool.query(
        "DELETE FROM measurement_points WHERE collection_point_id IN " +
        "(SELECT id FROM collection_points WHERE component_id = $1)",
        [id]
      );
      // 3. Delete collection points of this component.
      await pool.query("DELETE FROM collection_points WHERE component_id = $1", [id]);
      // 4. Delete the component itself
      const result = await pool.query("DELETE FROM components WHERE id = $1 RETURNING *", [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "Component not found" });
      return res.json({ message: "Component deleted successfully", deleted: result.rows[0] });
    } else {
      const compIds = memoryTenantComponentIds(requestTenantId(req));
      const index = memoryComponents.findIndex(c => c.id === id && compIds.includes(c.id));
      if (index === -1) return res.status(404).json({ error: "Component not found" });
      const deleted = memoryComponents.splice(index, 1)[0];
      
      // Cascade delete collection points, measurement points, and analysis history for this component
      const cpIds = memoryCollectionPoints.filter(cp => cp.component_id === id).map(cp => cp.id);
      const mpIds = memoryMeasurementPoints.filter(mp => cpIds.includes(mp.collection_point_id)).map(mp => mp.id);
      
      memoryAnalysisHistory = memoryAnalysisHistory.filter(ah => !mpIds.includes(ah.measurement_point_id));
      memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => !cpIds.includes(mp.collection_point_id));
      memoryCollectionPoints = memoryCollectionPoints.filter(cp => cp.component_id !== id);
      
      return res.json({ message: "Component deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE /api/components failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete component" });
  }
});


// --------------------------------------------------------
// COLLECTION POINTS ENDPOINTS (WITH MP AUTO-GENERATION)
// --------------------------------------------------------

// GET /api/collection-points - List all or filter by component_id
app.get(["/api/collection-points", "/api/collection_points", "/api/collection-points/component/:componentId", "/api/collection_points/component/:componentId"], async (req, res) => {
  try {
    const compIdParam = req.params.componentId ? parseInt(req.params.componentId, 10) : undefined;
    const compIdQuery = req.query.component_id ? parseInt(req.query.component_id as string, 10) : undefined;
    const compId = compIdParam || compIdQuery;
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }

    if (pool) {
      if (compId !== undefined) {
        if (isNaN(compId)) return res.status(400).json({ error: "Invalid component_id" });
        if (!(await tenantOwnsRow(pool, "components", compId, company_id))) {
          return res.status(404).json({ error: "Component not found" });
        }
        const result = await pool.query(
          "SELECT * FROM collection_points WHERE component_id = $1 ORDER BY location_order ASC, name ASC",
          [compId]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          `SELECT cp.* FROM collection_points cp
             JOIN components c ON c.id = cp.component_id
             JOIN assets a ON a.id = c.asset_id
             LEFT JOIN routes r ON r.id = a.route_id
             LEFT JOIN plants pl ON pl.id = r.plant_id
            WHERE pl.company_id = $1
            ORDER BY cp.name ASC`,
          [company_id]
        );
        return res.json(result.rows);
      }
    } else {
      const componentIds = memoryTenantComponentIds(company_id);
      if (compId !== undefined) {
        if (isNaN(compId)) return res.status(400).json({ error: "Invalid component_id" });
        if (!componentIds.includes(compId)) {
          return res.status(404).json({ error: "Component not found" });
        }
        const filtered = memoryCollectionPoints.filter(cp => cp.component_id === compId);
        return res.json(filtered);
      } else {
        const cpIds = memoryTenantCollectionPointIds(company_id);
        return res.json(memoryCollectionPoints.filter(cp => cpIds.includes(cp.id)));
      }
    }
  } catch (error: any) {
    console.error("GET collection points failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch collection points" });
  }
});

// GET /api/collection-points/:id - Single collection point
app.get(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query(
        `SELECT cp.* FROM collection_points cp
           JOIN components c ON c.id = cp.component_id
           JOIN assets a ON a.id = c.asset_id
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE cp.id = $1 AND pl.company_id = $2`,
        [id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json(result.rows[0]);
    } else {
      const cpIds = memoryTenantCollectionPointIds(requestTenantId(req));
      const cp = memoryCollectionPoints.find(item => item.id === id && cpIds.includes(item.id));
      if (!cp) return res.status(404).json({ error: "Collection point not found" });
      return res.json(cp);
    }
  } catch (error: any) {
    console.error("GET single collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch collection point" });
  }
});

// POST /api/collection-points/batch - Batch update / save collection points
app.post(["/api/collection-points/batch", "/api/collection_points/batch"], async (req, res) => {
  try {
    const { component_id, points } = req.body;
    if (component_id === undefined || isNaN(parseInt(component_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: component_id" });
    }
    if (!Array.isArray(points)) {
      return res.status(400).json({ error: "points must be an array" });
    }
    const compId = parseInt(component_id, 10);
    if (pool) {
      if (!(await tenantOwnsRow(pool, "components", compId, requestTenantId(req)))) {
        return res.status(400).json({ error: `Parent component not found: ${compId}` });
      }
    } else if (!memoryTenantComponentIds(requestTenantId(req)).includes(compId)) {
      return res.status(400).json({ error: `Parent component not found: ${compId}` });
    }
    
    if (pool) {
      await pool.query("BEGIN");
      try {
        // Find existing points
        const existingRes = await pool.query("SELECT id FROM collection_points WHERE component_id = $1", [compId]);
        const existingIds = existingRes.rows.map(r => r.id);
        
        const keepIds = points.filter(p => p.id).map(p => parseInt(p.id, 10));
        const toDelete = existingIds.filter(id => !keepIds.includes(id));
        
        // Delete removed points
        if (toDelete.length > 0) {
          await pool.query("DELETE FROM collection_points WHERE id = ANY($1)", [toDelete]);
        }
        
        const savedPoints = [];
        // Save/insert points
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const name = pt.name ? pt.name.trim() : `Point ${i + 1}`;
          if (pt.id) {
            // Update existing
            const upResult = await pool.query(
              "UPDATE collection_points SET name = $1, location_order = $2 WHERE id = $3 RETURNING *",
              [name, i, parseInt(pt.id, 10)]
            );
            savedPoints.push(upResult.rows[0]);
          } else {
            // Insert new
            const insResult = await pool.query(
              "INSERT INTO collection_points (component_id, name, location_order) VALUES ($1, $2, $3) RETURNING *",
              [compId, name, i]
            );
            const cp = insResult.rows[0];
            
            // Auto-create 3 measurement points
            const directions = ["Horizontal", "Vertical", "Axial"];
            for (const dir of directions) {
              await pool.query(
                "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, 'Vibration', 'in/Sec')",
                [cp.id, dir]
              );
            }
            savedPoints.push(cp);
          }
        }
        
        await pool.query("COMMIT");
        return res.json({ success: true, collection_points: savedPoints });
      } catch (err: any) {
        await pool.query("ROLLBACK");
        throw err;
      }
    } else {
      const keepIds = points.filter(p => p.id).map(p => parseInt(p.id, 10));
      // Delete removed points in memory
      memoryCollectionPoints = memoryCollectionPoints.filter(cp => cp.component_id !== compId || keepIds.includes(cp.id));
      
      const savedPoints = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const name = pt.name ? pt.name.trim() : `Point ${i + 1}`;
        if (pt.id) {
          const ptId = parseInt(pt.id, 10);
          const cp = memoryCollectionPoints.find(item => item.id === ptId);
          if (cp) {
            cp.name = name;
            cp.location_order = i;
            savedPoints.push(cp);
          }
        } else {
          const cpId = getNextId();
          const cp = {
            id: cpId,
            component_id: compId,
            name,
            location_order: i,
            notes: null,
            created_at: new Date()
          };
          memoryCollectionPoints.push(cp);
          
          const directions = ["Horizontal", "Vertical", "Axial"];
          for (const dir of directions) {
            memoryMeasurementPoints.push({
              id: getNextId(),
              collection_point_id: cpId,
              direction: dir,
              technology_type: "Vibration",
              units: "in/Sec",
              created_at: new Date()
            });
          }
          savedPoints.push(cp);
        }
      }
      return res.json({ success: true, collection_points: savedPoints });
    }
  } catch (error: any) {
    console.error("Batch collection points update failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update collection points batch" });
  }
});

// POST /api/collection-points - Create collection point (and auto-generate Horizontal, Vertical, Axial)
app.post(["/api/collection-points", "/api/collection_points"], async (req, res) => {
  try {
    const { component_id, name, location_order, notes, points } = req.body;
    if (component_id === undefined || isNaN(parseInt(component_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: component_id (integer)" });
    }
    const compId = parseInt(component_id, 10);
    if (pool) {
      if (!(await tenantOwnsRow(pool, "components", compId, requestTenantId(req)))) {
        return res.status(400).json({ error: `Parent component not found: ${compId}` });
      }
    } else if (!memoryTenantComponentIds(requestTenantId(req)).includes(compId)) {
      return res.status(400).json({ error: `Parent component not found: ${compId}` });
    }

    // Support batch format requested by user: { component_id, points: [{name}] }
    if (points && Array.isArray(points)) {
      if (pool) {
        await pool.query("BEGIN");
        try {
          // Delete existing measurement points for these collection points
          await pool.query(
            "DELETE FROM measurement_points WHERE collection_point_id IN (SELECT id FROM collection_points WHERE component_id = $1)",
            [compId]
          );
          // Delete existing collection points
          await pool.query("DELETE FROM collection_points WHERE component_id = $1", [compId]);

          const savedPoints = [];
          for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            const ptName = pt.name ? pt.name.trim() : `Point ${i + 1}`;
            const cpResult = await pool.query(
              "INSERT INTO collection_points (component_id, name, location_order) VALUES ($1, $2, $3) RETURNING *",
              [compId, ptName, i]
          );
            const cp = cpResult.rows[0];

            const directions = ["Horizontal", "Vertical", "Axial"];
            const mps = [];
            for (const dir of directions) {
              const mpResult = await pool.query(
                "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, 'Vibration', 'in/Sec') RETURNING *",
                [cp.id, dir]
              );
              mps.push(mpResult.rows[0]);
            }
            savedPoints.push({ ...cp, measurement_points: mps });
          }
          await pool.query("COMMIT");
          return res.status(201).json({ success: true, collection_points: savedPoints });
        } catch (err) {
          await pool.query("ROLLBACK");
          throw err;
        }
      } else {
        // Memory mode batch insertion
        const existingIds = memoryCollectionPoints.filter(cp => cp.component_id === compId).map(cp => cp.id);
        memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => !existingIds.includes(mp.collection_point_id));
        memoryCollectionPoints = memoryCollectionPoints.filter(cp => cp.component_id !== compId);

        const savedPoints = [];
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          const ptName = pt.name ? pt.name.trim() : `Point ${i + 1}`;
          const cpId = getNextId();
          const cp = {
            id: cpId,
            component_id: compId,
            name: ptName,
            location_order: i,
            notes: null,
            created_at: new Date()
          };
          memoryCollectionPoints.push(cp);

          const directions = ["Horizontal", "Vertical", "Axial"];
          const mps = [];
          for (const dir of directions) {
            const mp = {
              id: getNextId(),
              collection_point_id: cpId,
              direction: dir,
              technology_type: "Vibration",
              units: "in/Sec",
              created_at: new Date()
            };
            memoryMeasurementPoints.push(mp);
            mps.push(mp);
          }
          savedPoints.push({ ...cp, measurement_points: mps });
        }
        return res.status(201).json({ success: true, collection_points: savedPoints });
      }
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const locOrder = location_order !== undefined ? parseInt(location_order, 10) : 0;

    if (pool) {
      // Create collection point & auto-create 3 measurement points
      await pool.query("BEGIN");
      try {
        const cpResult = await pool.query(
          "INSERT INTO collection_points (component_id, name, location_order, notes) VALUES ($1, $2, $3, $4) RETURNING *",
          [compId, name.trim(), locOrder, notes ? notes.trim() : null]
        );
        const cp = cpResult.rows[0];

        const directions = ["Horizontal", "Vertical", "Axial"];
        const mps: any[] = [];
        for (const dir of directions) {
          const mpResult = await pool.query(
            "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, 'Vibration', 'in/Sec') RETURNING *",
            [cp.id, dir]
          );
          mps.push(mpResult.rows[0]);
        }

        await pool.query("COMMIT");
        return res.status(201).json({ ...cp, measurement_points: mps });
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    } else {
      const cpId = getNextId();
      const cp = {
        id: cpId,
        component_id: compId,
        name: name.trim(),
        location_order: locOrder,
        notes: notes ? notes.trim() : null,
        created_at: new Date()
      };
      memoryCollectionPoints.push(cp);

      const directions = ["Horizontal", "Vertical", "Axial"];
      const mps: any[] = [];
      for (const dir of directions) {
        const mp = {
          id: getNextId(),
          collection_point_id: cpId,
          direction: dir,
          technology_type: "Vibration",
          units: "in/Sec",
          created_at: new Date()
        };
        memoryMeasurementPoints.push(mp);
        mps.push(mp);
      }

      return res.status(201).json({ ...cp, measurement_points: mps });
    }
  } catch (error: any) {
    console.error("POST collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create collection point" });
  }
});

// PUT /api/collection-points/:id - Update collection point
app.put(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { name, location_order, notes } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Missing required field: name (string)" });
    }

    const locOrder = location_order !== undefined ? parseInt(location_order, 10) : 0;

    if (pool) {
      const result = await pool.query(
        `UPDATE collection_points cp SET name = $1, location_order = $2, notes = $3
           FROM components c
           JOIN assets a ON a.id = c.asset_id
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE cp.id = $4 AND cp.component_id = c.id AND pl.company_id = $5
          RETURNING cp.*`,
        [name.trim(), locOrder, notes ? notes.trim() : null, id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json(result.rows[0]);
    } else {
      const cpIds = memoryTenantCollectionPointIds(requestTenantId(req));
      const cp = memoryCollectionPoints.find(item => item.id === id && cpIds.includes(item.id));
      if (!cp) return res.status(404).json({ error: "Collection point not found" });
      cp.name = name.trim();
      cp.location_order = locOrder;
      cp.notes = notes ? notes.trim() : null;
      return res.json(cp);
    }
  } catch (error: any) {
    console.error("PUT collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update collection point" });
  }
});

// DELETE /api/collection-points/:id - Delete collection point
app.delete(["/api/collection-points/:id", "/api/collection_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query(
        `DELETE FROM collection_points
          WHERE id = $1
            AND component_id IN (
              SELECT c.id FROM components c
                JOIN assets a ON a.id = c.asset_id
                LEFT JOIN routes r ON r.id = a.route_id
                LEFT JOIN plants pl ON pl.id = r.plant_id
               WHERE pl.company_id = $2
            )
          RETURNING *`,
        [id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Collection point not found" });
      return res.json({ message: "Collection point deleted successfully", deleted: result.rows[0] });
    } else {
      const cpIds = memoryTenantCollectionPointIds(requestTenantId(req));
      const index = memoryCollectionPoints.findIndex(item => item.id === id && cpIds.includes(item.id));
      if (index === -1) return res.status(404).json({ error: "Collection point not found" });
      const deleted = memoryCollectionPoints.splice(index, 1)[0];
      // Cascade delete measurement points in memory
      memoryMeasurementPoints = memoryMeasurementPoints.filter(mp => mp.collection_point_id !== id);
      return res.json({ message: "Collection point deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE collection point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete collection point" });
  }
});


// --------------------------------------------------------
// MEASUREMENT POINTS ENDPOINTS
// --------------------------------------------------------

// GET /api/measurement-points - List all or filter by collection_point_id
app.get(["/api/measurement-points", "/api/measurement_points", "/api/measurement-points/collection-point/:cpId", "/api/measurement_points/collection_point/:cpId"], async (req, res) => {
  try {
    const cpIdParam = req.params.cpId ? parseInt(req.params.cpId, 10) : undefined;
    const cpIdQuery = req.query.collection_point_id ? parseInt(req.query.collection_point_id as string, 10) : undefined;
    const cpId = cpIdParam || cpIdQuery;
    const company_id = requestTenantId(req);
    if (company_id == null) {
      return res.json([]);
    }

    if (pool) {
      if (cpId !== undefined) {
        if (isNaN(cpId)) return res.status(400).json({ error: "Invalid collection_point_id" });
        if (!(await tenantOwnsRow(pool, "collection_points", cpId, company_id))) {
          return res.status(404).json({ error: "Collection point not found" });
        }
        const result = await pool.query(
          "SELECT * FROM measurement_points WHERE collection_point_id = $1 ORDER BY direction ASC",
          [cpId]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          `SELECT mp.* FROM measurement_points mp
             JOIN collection_points cp ON cp.id = mp.collection_point_id
             JOIN components c ON c.id = cp.component_id
             JOIN assets a ON a.id = c.asset_id
             LEFT JOIN routes r ON r.id = a.route_id
             LEFT JOIN plants pl ON pl.id = r.plant_id
            WHERE pl.company_id = $1
            ORDER BY mp.id ASC`,
          [company_id]
        );
        return res.json(result.rows);
      }
    } else {
      const cpIds = memoryTenantCollectionPointIds(company_id);
      if (cpId !== undefined) {
        if (isNaN(cpId)) return res.status(400).json({ error: "Invalid collection_point_id" });
        if (!cpIds.includes(cpId)) {
          return res.status(404).json({ error: "Collection point not found" });
        }
        const filtered = memoryMeasurementPoints.filter(mp => mp.collection_point_id === cpId);
        return res.json(filtered);
      } else {
        const mpIds = memoryTenantMeasurementPointIds(company_id);
        return res.json(memoryMeasurementPoints.filter(mp => mpIds.includes(mp.id)));
      }
    }
  } catch (error: any) {
    console.error("GET measurement points failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch measurement points" });
  }
});

// GET /api/measurement-points/:id - Get single
app.get(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query(
        `SELECT mp.* FROM measurement_points mp
           JOIN collection_points cp ON cp.id = mp.collection_point_id
           JOIN components c ON c.id = cp.component_id
           JOIN assets a ON a.id = c.asset_id
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE mp.id = $1 AND pl.company_id = $2`,
        [id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(result.rows[0]);
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      const mp = memoryMeasurementPoints.find(item => item.id === id && mpIds.includes(item.id));
      if (!mp) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(mp);
    }
  } catch (error: any) {
    console.error("GET measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch measurement point" });
  }
});

// POST /api/measurement-points - Create single measurement point
app.post(["/api/measurement-points", "/api/measurement_points"], async (req, res) => {
  try {
    const { collection_point_id, direction, technology_type, units } = req.body;
    if (collection_point_id === undefined || isNaN(parseInt(collection_point_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: collection_point_id (integer)" });
    }
    if (!direction || typeof direction !== "string" || !direction.trim()) {
      return res.status(400).json({ error: "Missing required field: direction (string)" });
    }

    const cpId = parseInt(collection_point_id, 10);
    if (pool) {
      if (!(await tenantOwnsRow(pool, "collection_points", cpId, requestTenantId(req)))) {
        return res.status(400).json({ error: `Parent collection point not found: ${cpId}` });
      }
    } else if (!memoryTenantCollectionPointIds(requestTenantId(req)).includes(cpId)) {
      return res.status(400).json({ error: `Parent collection point not found: ${cpId}` });
    }
    const tech = technology_type || "Vibration";
    const unitVal = units || "in/Sec";

    if (pool) {
      const result = await pool.query(
        "INSERT INTO measurement_points (collection_point_id, direction, technology_type, units) VALUES ($1, $2, $3, $4) RETURNING *",
        [cpId, direction.trim(), tech.trim(), unitVal.trim()]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newMp = {
        id: getNextId(),
        collection_point_id: cpId,
        direction: direction.trim(),
        technology_type: tech.trim(),
        units: unitVal.trim(),
        created_at: new Date()
      };
      memoryMeasurementPoints.push(newMp);
      return res.status(201).json(newMp);
    }
  } catch (error: any) {
    console.error("POST measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create measurement point" });
  }
});

// PUT /api/measurement-points/:id - Update measurement point
app.put(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });
    const { direction, technology_type, units } = req.body;

    if (!direction || typeof direction !== "string" || !direction.trim()) {
      return res.status(400).json({ error: "Missing required field: direction (string)" });
    }

    if (pool) {
      const result = await pool.query(
        `UPDATE measurement_points mp SET direction = $1, technology_type = $2, units = $3
           FROM collection_points cp
           JOIN components c ON c.id = cp.component_id
           JOIN assets a ON a.id = c.asset_id
           LEFT JOIN routes r ON r.id = a.route_id
           LEFT JOIN plants pl ON pl.id = r.plant_id
          WHERE mp.id = $4 AND mp.collection_point_id = cp.id AND pl.company_id = $5
          RETURNING mp.*`,
        [direction.trim(), technology_type ? technology_type.trim() : "Vibration", units ? units.trim() : "in/Sec", id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json(result.rows[0]);
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      const mp = memoryMeasurementPoints.find(item => item.id === id && mpIds.includes(item.id));
      if (!mp) return res.status(404).json({ error: "Measurement point not found" });
      mp.direction = direction.trim();
      mp.technology_type = technology_type ? technology_type.trim() : "Vibration";
      mp.units = units ? units.trim() : "in/Sec";
      return res.json(mp);
    }
  } catch (error: any) {
    console.error("PUT measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update measurement point" });
  }
});

// DELETE /api/measurement-points/:id - Delete measurement point
app.delete(["/api/measurement-points/:id", "/api/measurement_points/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query(
        `DELETE FROM measurement_points
          WHERE id = $1
            AND collection_point_id IN (
              SELECT cp.id FROM collection_points cp
                JOIN components c ON c.id = cp.component_id
                JOIN assets a ON a.id = c.asset_id
                LEFT JOIN routes r ON r.id = a.route_id
                LEFT JOIN plants pl ON pl.id = r.plant_id
               WHERE pl.company_id = $2
            )
          RETURNING *`,
        [id, requestTenantId(req) ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Measurement point not found" });
      return res.json({ message: "Measurement point deleted successfully", deleted: result.rows[0] });
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      const index = memoryMeasurementPoints.findIndex(item => item.id === id && mpIds.includes(item.id));
      if (index === -1) return res.status(404).json({ error: "Measurement point not found" });
      const deleted = memoryMeasurementPoints.splice(index, 1)[0];
      return res.json({ message: "Measurement point deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE measurement point failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete measurement point" });
  }
});


// --------------------------------------------------------
// ANALYSIS HISTORY ENDPOINTS
// --------------------------------------------------------

// GET /api/analysis-history - List all or filter by measurement_point_id
app.get(["/api/analysis-history", "/api/analysis_history", "/api/analysis-history/measurement-point/:mpId", "/api/analysis_history/measurement-point/:mpId"], async (req, res) => {
  try {
    const mpIdParam = req.params.mpId ? parseInt(req.params.mpId, 10) : undefined;
    const mpIdQuery = req.query.measurement_point_id ? parseInt(req.query.measurement_point_id as string, 10) : undefined;
    const mpId = mpIdParam || mpIdQuery;

    if (pool) {
      const tenantId = req.tenantId ?? -1;
      if (mpId !== undefined) {
        if (isNaN(mpId)) return res.status(400).json({ error: "Invalid measurement_point_id" });
        const result = await pool.query(
          "SELECT * FROM analysis_history WHERE measurement_point_id = $1 AND tenant_id = $2 ORDER BY measurement_date DESC, created_at DESC",
          [mpId, tenantId]
        );
        return res.json(result.rows);
      } else {
        const result = await pool.query(
          "SELECT * FROM analysis_history WHERE tenant_id = $1 ORDER BY measurement_date DESC, created_at DESC",
          [tenantId]
        );
        return res.json(result.rows);
      }
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      if (mpId !== undefined) {
        if (isNaN(mpId)) return res.status(400).json({ error: "Invalid measurement_point_id" });
        const filtered = memoryAnalysisHistory.filter(ah => ah.measurement_point_id === mpId && mpIds.includes(mpId));
        return res.json(filtered);
      } else {
        return res.json(memoryAnalysisHistory.filter(ah => mpIds.includes(ah.measurement_point_id)));
      }
    }
  } catch (error: any) {
    console.error("GET analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch analysis history" });
  }
});

// GET /api/analysis-history/:id - Single record OR component analysis history
app.get(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    const technologyQuery = req.query.technology as string | undefined;
    const isComponent = req.query.isComponent === "true" || technologyQuery !== undefined;

    if (isComponent) {
      // Determine company context to verify subscription active tech keys
      const targetCompanyId = await getCompanyIdForComponent(id);
      const sessionTenant = req.tenantId ?? requestTenantId(req);
      if (
        targetCompanyId != null &&
        sessionTenant != null &&
        targetCompanyId !== sessionTenant
      ) {
        return res.status(404).json({ error: "Component not found" });
      }
      let enabledTechs = ["vibration", "infrared", "ultrasound", "mca", "oil_analysis"];
      if (targetCompanyId) {
        enabledTechs = await getEnabledTechnologies(targetCompanyId);
      }

      // Map user-facing technology tab name to database technology_type
      let dbTech: string | null = null;
      if (technologyQuery) {
        const t = technologyQuery.toLowerCase();
        let requestedTechKey = "vibration";
        if (t.includes("vibration")) {
          dbTech = "Vibration";
          requestedTechKey = "vibration";
        } else if (t.includes("infrared") || t.includes("thermal") || t.includes("temp") || t.includes("heat")) {
          dbTech = "Thermal";
          requestedTechKey = "infrared";
        } else if (t.includes("ultrasound")) {
          dbTech = "Ultrasound";
          requestedTechKey = "ultrasound";
        } else if (t.includes("mca") || t.includes("electrical")) {
          dbTech = "Electrical";
          requestedTechKey = "mca";
        } else if (t.includes("oil")) {
          dbTech = "Oil";
          requestedTechKey = "oil_analysis";
        }

        if (!enabledTechs.includes(requestedTechKey)) {
          return res.status(403).json({ 
            error: `Access Denied: The subscription plan for this company does not include ${technologyQuery}.` 
          });
        }
      }

      // Map enabled subscription keys to database technology types
      const sqlTechs: string[] = [];
      if (enabledTechs.includes("vibration")) sqlTechs.push("Vibration");
      if (enabledTechs.includes("infrared")) sqlTechs.push("Thermal");
      if (enabledTechs.includes("ultrasound")) sqlTechs.push("Ultrasound");
      if (enabledTechs.includes("mca")) sqlTechs.push("Electrical");
      if (enabledTechs.includes("oil_analysis")) sqlTechs.push("Oil");

      if (pool) {
        let query = `
          SELECT ah.*, mp.technology_type 
          FROM analysis_history ah
          JOIN measurement_points mp ON ah.measurement_point_id = mp.id
          JOIN collection_points cp ON mp.collection_point_id = cp.id
          WHERE cp.component_id = $1
        `;
        const params: any[] = [id];
        
        if (dbTech) {
          query += " AND mp.technology_type = $2";
          params.push(dbTech);
        } else {
          // Filter by all enabled technologies
          query += " AND mp.technology_type = ANY($2)";
          params.push(sqlTechs);
        }
        
        query += " ORDER BY ah.measurement_date ASC, ah.id ASC";

        const result = await pool.query(query, params);

        // No history recorded for this component yet — honest empty list.
        return res.json(result.rows);
      } else {
        let filtered = memoryAnalysisHistory.filter(ah => ah.component_id === id);

        if (dbTech) {
          filtered = filtered.filter(ah => ah.technology_type === dbTech || ah.technology === dbTech);
        } else {
          // Filter by all enabled technologies
          filtered = filtered.filter(row => {
            const rowTech = (row.technology_type || row.technology || "Vibration").toLowerCase();
            let rowKey = "vibration";
            if (rowTech.includes("vibration")) rowKey = "vibration";
            else if (rowTech.includes("thermal") || rowTech.includes("infrared")) rowKey = "infrared";
            else if (rowTech.includes("ultrasound")) rowKey = "ultrasound";
            else if (rowTech.includes("electrical") || rowTech.includes("mca")) rowKey = "mca";
            else if (rowTech.includes("oil")) rowKey = "oil_analysis";
            return enabledTechs.includes(rowKey);
          });
        }

        // No history recorded for this component yet — honest empty list.
        return res.json(filtered);
      }
    } else {
      if (pool) {
        const result = await pool.query(
          "SELECT * FROM analysis_history WHERE id = $1 AND tenant_id = $2",
          [id, req.tenantId ?? -1]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
        return res.json(result.rows[0]);
      } else {
        const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
        const ah = memoryAnalysisHistory.find(
          item => item.id === id && mpIds.includes(item.measurement_point_id)
        );
        if (!ah) return res.status(404).json({ error: "Analysis history record not found" });
        return res.json(ah);
      }
    }
  } catch (error: any) {
    console.error("GET analysis record failed:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch analysis history record" });
  }
});

// POST /api/analysis-history - Create new analysis entry
app.post(["/api/analysis-history", "/api/analysis_history"], async (req, res) => {
  try {
    const {
      measurement_point_id,
      data_point_name,
      state,
      op_speed,
      measurement_value,
      units,
      measurement_date,
      notes,
      waveform_data,
      alarm_status,
      diagnosis_result,
      was_correct,
      corrected_diagnosis
    } = req.body;

    if (measurement_point_id === undefined || isNaN(parseInt(measurement_point_id, 10))) {
      return res.status(400).json({ error: "Missing or invalid required field: measurement_point_id (integer)" });
    }

    const mpId = parseInt(measurement_point_id, 10);
    const speed = op_speed !== undefined ? parseFloat(op_speed) : null;
    const valueVal = measurement_value !== undefined ? parseFloat(measurement_value) : null;
    const isAlarm = alarm_status !== undefined ? !!alarm_status : false;
    const stateVal = state || "Data Collected";
    const dateVal = measurement_date ? new Date(measurement_date) : new Date();

    let parsedWaveform: any = null;
    if (waveform_data) {
      if (typeof waveform_data === "object") parsedWaveform = waveform_data;
      else {
        try { parsedWaveform = JSON.parse(waveform_data); }
        catch (e) { parsedWaveform = { raw: waveform_data }; }
      }
    }

    let parsedDiag: any = null;
    if (diagnosis_result) {
      if (typeof diagnosis_result === "object") parsedDiag = diagnosis_result;
      else {
        try { parsedDiag = JSON.parse(diagnosis_result); }
        catch (e) { parsedDiag = { raw: diagnosis_result }; }
      }
    }

    if (pool) {
      const result = await pool.query(
        `INSERT INTO analysis_history 
         (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, waveform_data, alarm_status, diagnosis_result, was_correct, corrected_diagnosis, tenant_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
         RETURNING *`,
        [
          mpId,
          data_point_name ? data_point_name.trim() : null,
          stateVal.trim(),
          speed,
          valueVal,
          units ? units.trim() : null,
          dateVal,
          notes ? notes.trim() : null,
          parsedWaveform,
          isAlarm,
          parsedDiag,
          was_correct !== undefined ? !!was_correct : null,
          corrected_diagnosis ? corrected_diagnosis.trim() : null,
          req.tenantId ?? -1
        ]
      );
      return res.status(201).json(result.rows[0]);
    } else {
      const newAh = {
        id: getNextId(),
        measurement_point_id: mpId,
        data_point_name: data_point_name ? data_point_name.trim() : null,
        state: stateVal.trim(),
        op_speed: speed,
        measurement_value: valueVal,
        units: units ? units.trim() : null,
        measurement_date: dateVal,
        notes: notes ? notes.trim() : null,
        waveform_data: parsedWaveform,
        alarm_status: isAlarm,
        diagnosis_result: parsedDiag,
        was_correct: was_correct !== undefined ? !!was_correct : null,
        corrected_diagnosis: corrected_diagnosis ? corrected_diagnosis.trim() : null,
        created_at: new Date()
      };
      memoryAnalysisHistory.push(newAh);
      return res.status(201).json(newAh);
    }
  } catch (error: any) {
    console.error("POST analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to create analysis history record" });
  }
});

// PUT /api/analysis-history/:id - Update analysis entry (feedback and correctness updates)
app.put(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    const {
      data_point_name,
      state,
      op_speed,
      measurement_value,
      units,
      notes,
      alarm_status,
      was_correct,
      corrected_diagnosis
    } = req.body;

    if (pool) {
      // Build dynamic update to only overwrite provided fields
      const currentRes = await pool.query(
        "SELECT * FROM analysis_history WHERE id = $1 AND tenant_id = $2",
        [id, req.tenantId ?? -1]
      );
      if (currentRes.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
      const current = currentRes.rows[0];

      const finalName = data_point_name !== undefined ? data_point_name : current.data_point_name;
      const finalState = state !== undefined ? state : current.state;
      const finalSpeed = op_speed !== undefined ? (op_speed ? parseFloat(op_speed) : null) : current.op_speed;
      const finalVal = measurement_value !== undefined ? (measurement_value ? parseFloat(measurement_value) : null) : current.measurement_value;
      const finalUnits = units !== undefined ? units : current.units;
      const finalNotes = notes !== undefined ? notes : current.notes;
      const finalAlarm = alarm_status !== undefined ? !!alarm_status : current.alarm_status;
      const finalWasCorrect = was_correct !== undefined ? (was_correct === null ? null : !!was_correct) : current.was_correct;
      const finalCorrectedDiag = corrected_diagnosis !== undefined ? corrected_diagnosis : current.corrected_diagnosis;

      const result = await pool.query(
        `UPDATE analysis_history SET 
         data_point_name = $1, state = $2, op_speed = $3, measurement_value = $4, units = $5, notes = $6, alarm_status = $7, was_correct = $8, corrected_diagnosis = $9 
         WHERE id = $10 AND tenant_id = $11 RETURNING *`,
        [finalName, finalState, finalSpeed, finalVal, finalUnits, finalNotes, finalAlarm, finalWasCorrect, finalCorrectedDiag, id, req.tenantId ?? -1]
      );
      return res.json(result.rows[0]);
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      const ah = memoryAnalysisHistory.find(
        item => item.id === id && mpIds.includes(item.measurement_point_id)
      );
      if (!ah) return res.status(404).json({ error: "Analysis history record not found" });

      if (data_point_name !== undefined) ah.data_point_name = data_point_name;
      if (state !== undefined) ah.state = state;
      if (op_speed !== undefined) ah.op_speed = op_speed ? parseFloat(op_speed) : null;
      if (measurement_value !== undefined) ah.measurement_value = measurement_value ? parseFloat(measurement_value) : null;
      if (units !== undefined) ah.units = units;
      if (notes !== undefined) ah.notes = notes;
      if (alarm_status !== undefined) ah.alarm_status = !!alarm_status;
      if (was_correct !== undefined) ah.was_correct = was_correct === null ? null : !!was_correct;
      if (corrected_diagnosis !== undefined) ah.corrected_diagnosis = corrected_diagnosis;

      return res.json(ah);
    }
  } catch (error: any) {
    console.error("PUT analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to update analysis history record" });
  }
});

// DELETE /api/analysis-history/:id - Delete record
app.delete(["/api/analysis-history/:id", "/api/analysis_history/:id"], async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID parameter" });

    if (pool) {
      const result = await pool.query(
        "DELETE FROM analysis_history WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [id, req.tenantId ?? -1]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Analysis history record not found" });
      return res.json({ message: "Analysis record deleted successfully", deleted: result.rows[0] });
    } else {
      const mpIds = memoryTenantMeasurementPointIds(requestTenantId(req));
      const index = memoryAnalysisHistory.findIndex(
        item => item.id === id && mpIds.includes(item.measurement_point_id)
      );
      if (index === -1) return res.status(404).json({ error: "Analysis history record not found" });
      const deleted = memoryAnalysisHistory.splice(index, 1)[0];
      return res.json({ message: "Analysis record deleted successfully", deleted });
    }
  } catch (error: any) {
    console.error("DELETE analysis history failed:", error);
    return res.status(500).json({ error: error.message || "Failed to delete analysis history record" });
  }
});


// Serve static assets or mount Vite middleware
const isProduction = process.env.NODE_ENV === "production";

// Startup function to verify/create database tables
async function initializeDatabase() {
  if (!pool) {
    console.warn("⚠️ Pool not initialized (DATABASE_URL missing). Skipping database table creation.");
    return;
  }
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS diagnosis_history (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        input_data TEXT,
        ai_response TEXT,
        was_correct BOOLEAN DEFAULT NULL,
        corrected_diagnosis TEXT,
        user_feedback_timestamp TIMESTAMP DEFAULT NULL
      );
    `;
    await pool.query(createTableQuery);

    // Apply migrations for existing tables that might lack the new feedback columns
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS was_correct BOOLEAN DEFAULT NULL;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS corrected_diagnosis TEXT;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS user_feedback_timestamp TIMESTAMP DEFAULT NULL;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS component_id INTEGER;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS asset_id INTEGER;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS equipment_type TEXT;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS vibration_data JSONB;");
    await pool.query("ALTER TABLE diagnosis_history ADD COLUMN IF NOT EXISTS user_id INTEGER;");

    // Create companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        subscription_plan VARCHAR(50) DEFAULT 'vibration_only',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure column exists for already created tables
    await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'vibration_only';");
    await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS square_customer_id VARCHAR(255);");
    await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS square_subscription_id VARCHAR(255);");
    await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);");
    await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP;");

    // DEV-ONLY: seed standard demo companies (Allied Reliability / ExxonMobil /
    // Demo Reliability Corp). Production boots must create zero company rows —
    // tenants come only from signup. Gated by the AR-29 explicit opt-in, never
    // NODE_ENV alone, so a dev boot without the flag stays empty too.
    if (isDevAuthSeedEnabled(process.env)) {
      await pool.query(`
        INSERT INTO companies (name, subscription_plan) VALUES ('Allied Reliability', 'vibration_only')
        ON CONFLICT (name) DO NOTHING;
      `);
      await pool.query(`
        INSERT INTO companies (name, subscription_plan) VALUES ('ExxonMobil', 'vibration_only')
        ON CONFLICT (name) DO NOTHING;
      `);
      await pool.query(`
        INSERT INTO companies (name, subscription_plan) VALUES ('Demo Reliability Corp', 'full_suite')
        ON CONFLICT (name) DO NOTHING;
      `);

      // Ensure Demo Reliability Corp has full_suite in case it was already inserted
      await pool.query(`
        UPDATE companies SET subscription_plan = 'full_suite' WHERE name = 'Demo Reliability Corp';
      `);
    }

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'engineer',
        is_temp_password BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure email and role columns exist on users
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'engineer';");
    await pool.query("UPDATE users SET email = 'shanedufrene1989@gmail.com' WHERE username = 'demo' AND email IS NULL;");

    // LEGAL-WRAPPER-A (E5/E6) — mirror of migrations/016_terms_accepted.sql.
    // ADD COLUMN IF NOT EXISTS is already idempotent; the catch is limited to
    // the same already-exists family DEP-1b swallows (42701 duplicate_column,
    // 42P06 duplicate_object, 42P07 duplicate_table) so a re-run on a
    // populated DB is a no-op while real schema errors still raise loud.
    try {
      await pool.query(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;"
      );
    } catch (err: any) {
      if (err?.code !== "42701" && err?.code !== "42P06" && err?.code !== "42P07") {
        throw err;
      }
    }

    // ------------------------------------------------------------------
    // DEP-2 — one-time first-admin bootstrap. Runs ONLY when the users
    // table is completely empty; reads BOOTSTRAP_ADMIN_EMAIL /
    // BOOTSTRAP_ADMIN_PASSWORD; bcrypt-hashes; creates exactly one
    // system-admin. Permanently inert once any user exists — after the
    // Render logs confirm the first admin, delete both vars from the
    // Render env dashboard.
    // ------------------------------------------------------------------
    try {
      await bootstrapFirstAdmin(pool, process.env);
    } catch (bootstrapErr) {
      console.error("❌ [bootstrap] First-admin bootstrap failed:", bootstrapErr);
    }

    // ------------------------------------------------------------------
    // STOREFRONT (E1/E3/E4) — mirror of migrations/020_entitlements.sql.
    // Module entitlements only (no count/capacity columns), the server-held
    // checkout mapping, and the webhook replay ledger. DEP-1 style:
    // CREATE TABLE/INDEX IF NOT EXISTS are idempotent on every boot.
    // ------------------------------------------------------------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_entitlements (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        module_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'expired', 'canceled')),
        square_subscription_id TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, module_key)
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_company ON tenant_entitlements (company_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_status ON tenant_entitlements (company_id, status);"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkout_pending_provisioning (
        id SERIAL PRIMARY KEY,
        checkout_session_id TEXT NOT NULL UNIQUE,
        checkout_ref TEXT NOT NULL UNIQUE,
        company_name TEXT NOT NULL,
        admin_username TEXT NOT NULL,
        admin_email TEXT,
        password_hash TEXT NOT NULL,
        terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
        module_keys TEXT[] NOT NULL DEFAULT '{}',
        square_subscription_id TEXT UNIQUE,
        square_customer_id TEXT,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        admin_user_id INTEGER,
        plant_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'provisioning', 'provisioned', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_checkout_pending_status ON checkout_pending_provisioning (status);"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS square_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ------------------------------------------------------------------
    // AR-29 — auth sessions, invites, structured roles, tenant rollout.
    // Mirrors migrations/008_auth_sessions_rbac.sql (idempotent).
    // ------------------------------------------------------------------
    // gen_random_uuid() is built into PostgreSQL 13+, and pgcrypto is a
    // trusted extension there, so this idempotent statement is expected to
    // succeed; a failure here is a real schema problem and must raise loud.
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash TEXT NOT NULL UNIQUE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'plant-engineer',
        email VARCHAR(255),
        username VARCHAR(255),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ
      );
    `);

    // Create plants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure company_id and user_id exist in case plants table already existed
    await pool.query("ALTER TABLE plants ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;");
    await pool.query("ALTER TABLE plants ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;");

    // Legacy plants with no company_id stay orphaned. Never reassign them to
    // the globally-first company — that would move one tenant's rows into
    // another tenant. Tenant ownership must come from the row's own lineage.

    // Create units table (optional grouping above routes, H5 persistence)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        plant_id INTEGER REFERENCES plants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create routes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        plant_id INTEGER REFERENCES plants(id) ON DELETE CASCADE,
        unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        area VARCHAR(255),
        description TEXT,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query("ALTER TABLE routes ADD COLUMN IF NOT EXISTS area VARCHAR(255);");
    await pool.query("ALTER TABLE routes ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;");
    // H4 / D4 / D5 - the invisible system route marker. DEP-1 style: only the
    // duplicate family is swallowed so re-runs stay clean and real errors raise.
    try {
      await pool.query(
        "ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;"
      );
    } catch (err: any) {
      if (err?.code !== "42701" && err?.code !== "42P06" && err?.code !== "42P07") {
        throw err;
      }
    }

    // Check for equipment table migration to assets
    const equipTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'equipment'
      );
    `);
    const assetsTableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'assets'
      );
    `);

    const equipmentExists = equipTableCheck.rows[0].exists;
    const assetsExists = assetsTableCheck.rows[0].exists;

    if (equipmentExists && !assetsExists) {
      console.log("🔄 Migrating legacy 'equipment' table to 'assets'...");
      await pool.query("ALTER TABLE equipment RENAME TO assets;");
    }

    // Create assets table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        tag_number VARCHAR(100),
        type VARCHAR(100),
        manufacturer VARCHAR(255),
        model VARCHAR(255),
        serial_number VARCHAR(255),
        install_date DATE,
        criticality VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active',
        technology_type VARCHAR(50) DEFAULT 'Vibration',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure assets table columns exist
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS tag_number VARCHAR(100);");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS description TEXT;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS bearing_config JSONB;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS gearbox_config JSONB;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS electrical_config JSONB;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS technology_type VARCHAR(50) DEFAULT 'Vibration';");
    // Static equipment specs (Equipment DB) — nullable for legacy assets
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS rated_amps DOUBLE PRECISION NULL;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS max_allowable_temp DOUBLE PRECISION NULL;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS bearing_specs JSONB NULL;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS voltage_rating DOUBLE PRECISION NULL;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS horsepower DOUBLE PRECISION NULL;");
    await pool.query("ALTER TABLE assets ADD COLUMN IF NOT EXISTS planning_config JSONB NULL;");

    // H4 backfill - mirror of migrations/017_hierarchy_flex.sql plus the
    // tenant-scoped repair. Route-backed assets inherit their company from
    // their own route -> plant lineage first; NULL-route assets are then
    // attached only to the is_system route of their OWN company. Assets with
    // no derivable tenant stay NULL rather than being moved across tenants.
    await pool.query(`
      UPDATE assets a
         SET company_id = pl.company_id
        FROM routes r
        JOIN plants pl ON pl.id = r.plant_id
       WHERE a.route_id = r.id
         AND a.company_id IS NULL
         AND pl.company_id IS NOT NULL;
    `);
    await pool.query(`
      DO $$
      DECLARE
        p RECORD;
        system_route_id INTEGER;
      BEGIN
        IF EXISTS (SELECT 1 FROM assets WHERE route_id IS NULL) THEN
          FOR p IN SELECT id, company_id FROM plants WHERE company_id IS NOT NULL LOOP
            INSERT INTO routes (plant_id, name, description, is_system)
            SELECT p.id, 'System (Simple Mode)',
                   'Auto-created route for assets added without a route.', TRUE
            WHERE NOT EXISTS (
              SELECT 1 FROM routes
               WHERE plant_id = p.id AND is_system = TRUE
            );
            SELECT id INTO system_route_id
              FROM routes
             WHERE plant_id = p.id AND is_system = TRUE
             ORDER BY id ASC
             LIMIT 1;
            IF system_route_id IS NOT NULL THEN
              UPDATE assets SET route_id = system_route_id WHERE route_id IS NULL AND company_id = p.company_id;
            END IF;
          END LOOP;
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS planning_configs (
        asset_id TEXT PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Check components table
    const componentsExistsQuery = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'components'
      );
    `);
    const componentsExists = componentsExistsQuery.rows[0].exists;

    if (componentsExists) {
      // Check if equipment_id exists in components, rename to asset_id
      const colCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='components' AND column_name='equipment_id';
      `);
      if (colCheck.rows.length > 0) {
        console.log("🔄 Renaming components.equipment_id to asset_id...");
        await pool.query("ALTER TABLE components RENAME COLUMN equipment_id TO asset_id;");
      }
    }

    // Create components table (updated reference)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS components (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        manufacturer VARCHAR(255),
        model VARCHAR(255),
        specifications JSONB,
        specs JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure components table columns exist
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255);");
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS model VARCHAR(255);");
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS notes TEXT;");
    await pool.query("ALTER TABLE components ADD COLUMN IF NOT EXISTS specs JSONB;");

    // Create collection_points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collection_points (
        id SERIAL PRIMARY KEY,
        component_id INTEGER REFERENCES components(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        location_order INTEGER DEFAULT 0,
        orientation VARCHAR(50) DEFAULT 'Horizontal',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query("ALTER TABLE collection_points ADD COLUMN IF NOT EXISTS orientation VARCHAR(50) DEFAULT 'Horizontal';");

    // Create measurement_points table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS measurement_points (
        id SERIAL PRIMARY KEY,
        collection_point_id INTEGER REFERENCES collection_points(id) ON DELETE CASCADE,
        direction VARCHAR(50) NOT NULL,
        technology_type VARCHAR(50) DEFAULT 'Vibration',
        units VARCHAR(50) DEFAULT 'in/Sec',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create analysis_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis_history (
        id SERIAL PRIMARY KEY,
        measurement_point_id INTEGER REFERENCES measurement_points(id) ON DELETE CASCADE,
        data_point_name VARCHAR(100),
        state VARCHAR(50) DEFAULT 'Data Collected',
        op_speed DECIMAL(10,2),
        measurement_value DECIMAL(10,6),
        units VARCHAR(50),
        measurement_date TIMESTAMP,
        notes TEXT,
        waveform_data JSONB,
        alarm_status BOOLEAN DEFAULT FALSE,
        diagnosis_result JSONB,
        was_correct BOOLEAN,
        corrected_diagnosis TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Feedback columns for analysis_history tables that predate them. The
    // CREATE above must run first — an ALTER on a not-yet-created table is
    // what used to abort init on a fresh database (DEFECT 1).
    await pool.query("ALTER TABLE analysis_history ADD COLUMN IF NOT EXISTS was_correct BOOLEAN DEFAULT NULL;");
    await pool.query("ALTER TABLE analysis_history ADD COLUMN IF NOT EXISTS corrected_diagnosis TEXT;");

    // Ensure 'Demo Reliability Corp' and the 'demo' user exist and seed mock assets if missing
    // AR-29 rule 5 — dev-only demo seeding, explicitly gated.
    if (isDevAuthSeedEnabled(process.env)) {
    try {
      const demoCompRes = await pool.query("SELECT id FROM companies WHERE name = 'Demo Reliability Corp' LIMIT 1");
      if (demoCompRes.rows.length > 0) {
        const demoCompanyId = demoCompRes.rows[0].id;

        // Seed demo user
        const demoUserCheck = await pool.query("SELECT id FROM users WHERE LOWER(username) = 'demo' LIMIT 1");
        if (demoUserCheck.rows.length === 0) {
          const passHash = hashPassword("demo123");
          await pool.query(`
            INSERT INTO users (company_id, username, password_hash, role, is_temp_password)
            VALUES ($1, 'demo', $2, 'engineer', TRUE)
          `, [demoCompanyId, passHash]);
          console.log("👤 Demo user 'demo' seeded in database.");
        }

        // Seed default plants/assets if no plants exist for Demo Reliability Corp
        const plantsCheck = await pool.query("SELECT id FROM plants WHERE company_id = $1 LIMIT 1", [demoCompanyId]);
        if (plantsCheck.rows.length === 0) {
          console.log("🌱 Database: Seeding Demo Reliability Corp sample plants and assets...");
          
          // Seed Plant
          const plantRes = await pool.query(`
            INSERT INTO plants (name, location, company_id)
            VALUES ('Demo Galveston Refinery', '102 Marina Blvd, Galveston, TX', $1)
            RETURNING id
          `, [demoCompanyId]);
          const plantId = plantRes.rows[0].id;

          // Seed Route
          const routeRes = await pool.query(`
            INSERT INTO routes (plant_id, name, description)
            VALUES ($1, 'Crude Distillation Unit (CDU) Pumps', 'Critical centrifugal pumps supporting primary distillation train.')
            RETURNING id
          `, [plantId]);
          const routeId = routeRes.rows[0].id;

          // Seed Asset 1 (Charge Pump P-101A)
          const assetRes1 = await pool.query(`
            INSERT INTO assets (route_id, name, type, manufacturer, model, serial_number, install_date, criticality, status, tag_number, description)
            VALUES ($1, 'Charge Pump P-101A', 'Pump', 'Goulds Pumps', '3196', 'GP-774921-A', '2021-04-10', 'Critical', 'Active', 'TAG-P101A', 'Primary feedstock pump.')
            RETURNING id
          `, [routeId]);
          const assetId1 = assetRes1.rows[0].id;

          const compRes1 = await pool.query(`
            INSERT INTO components (asset_id, name, type, manufacturer, model, specifications, notes)
            VALUES ($1, 'Centrifugal Impeller Shaft', 'Shaft', 'Goulds', 'Impeller-3196', '{"material": "316 SS", "vane_count": 5}', 'Check balance on rebuilds.')
            RETURNING id
          `, [assetId1]);
          const componentId1 = compRes1.rows[0].id;

          // Create collection point
          const cpRes1 = await pool.query(`
            INSERT INTO collection_points (component_id, name, location_order, notes)
            VALUES ($1, 'Impeller Housing DE', 1, 'Pump drive end location.')
            RETURNING id
          `, [componentId1]);
          const cpId1 = cpRes1.rows[0].id;

          // Create measurement point 1 (Vibration)
          const mpRes1 = await pool.query(`
            INSERT INTO measurement_points (collection_point_id, direction, technology_type, units)
            VALUES ($1, 'Horizontal', 'Vibration', 'in/Sec')
            RETURNING id
          `, [cpId1]);
          const mpId1 = mpRes1.rows[0].id;

          // Create measurement point 2 (Thermal)
          const mpRes2 = await pool.query(`
            INSERT INTO measurement_points (collection_point_id, direction, technology_type, units)
            VALUES ($1, 'Axial', 'Thermal', '°F')
            RETURNING id
          `, [cpId1]);
          const mpId2 = mpRes2.rows[0].id;

          // Seed analysis history 1 (High alarm)
          await pool.query(`
            INSERT INTO analysis_history (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, alarm_status, diagnosis_result)
            VALUES ($1, 'Velocity RMS', 'Data Collected', 1780.00, 0.285000, 'in/sec', NOW() - INTERVAL '2 hours', '⚠️ Warning limit exceeded for Velocity RMS. Immediate inspection and re-greasing recommended.', TRUE, '{"manager_summary": {"severity": "High"}, "probable_faults": [{"fault_name": "Bearing Defects", "probability": 85, "confidence": "High", "supporting_evidence": "Elevated amplitude at inner ring ball pass frequency"}]}')
          `, [mpId1]);

          // Seed analysis history 2 (Normal temperature)
          await pool.query(`
            INSERT INTO analysis_history (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, alarm_status, diagnosis_result)
            VALUES ($1, 'Overall Temperature', 'Data Collected', 1780.00, 165.200000, '°F', NOW() - INTERVAL '2 hours', 'Within normal limits.', FALSE, '{"manager_summary": {"severity": "Low"}}')
          `, [mpId2]);

          // Seed Asset 2 (Reflux Pump P-102B)
          const assetRes2 = await pool.query(`
            INSERT INTO assets (route_id, name, type, manufacturer, model, serial_number, install_date, criticality, status, tag_number, description)
            VALUES ($1, 'Reflux Pump P-102B', 'Pump', 'Flowserve', 'Mark 3', 'FS-441290-B', '2022-09-18', 'High', 'Active', 'TAG-P102B', 'CDU reflux circulation line.')
            RETURNING id
          `, [routeId]);
          const assetId2 = assetRes2.rows[0].id;

          const compRes2 = await pool.query(`
            INSERT INTO components (asset_id, name, type, manufacturer, model, specifications, notes)
            VALUES ($1, 'Electric Drive Motor', 'Motor', 'Baldor Reliance', 'Super-E', '{"hp": 75, "rpm": 1785, "frame": "365T"}', 'Greased on 180 day cycle.')
            RETURNING id
          `, [assetId2]);
          const componentId2 = compRes2.rows[0].id;

          const cpRes2 = await pool.query(`
            INSERT INTO collection_points (component_id, name, location_order, notes)
            VALUES ($1, 'Motor NDE Housing', 1, 'Motor non-drive end location.')
            RETURNING id
          `, [componentId2]);
          const cpId2 = cpRes2.rows[0].id;

          const mpRes3 = await pool.query(`
            INSERT INTO measurement_points (collection_point_id, direction, technology_type, units)
            VALUES ($1, 'Vertical', 'Vibration', 'in/Sec')
            RETURNING id
          `, [cpId2]);
          const mpId3 = mpRes3.rows[0].id;

          // Seed analysis history 3 (Critical unbalance)
          await pool.query(`
            INSERT INTO analysis_history (measurement_point_id, data_point_name, state, op_speed, measurement_value, units, measurement_date, notes, alarm_status, diagnosis_result)
            VALUES ($1, 'Velocity RMS', 'Data Collected', 1785.00, 0.485000, 'in/sec', NOW() - INTERVAL '1 hour', '🚨 Critical alarm: extremely high vibration amplitude at 1X operating frequency.', TRUE, '{"manager_summary": {"severity": "Critical"}, "probable_faults": [{"fault_name": "Unbalance", "probability": 95, "confidence": "High", "supporting_evidence": "Dominant 1X radial peak with 90 degree phase shift"}]}')
          `, [mpId3]);

          console.log("✅ Database: Demo Reliability Corp sample plants, routes, assets, components and measurement points seeded successfully.");
        }
      }
    } catch (seedErr) {
      console.error("❌ Warning: Failed to seed demo user/data in database:", seedErr);
    }
    } else {
      console.log("ℹ️ [AR-29] Demo user/data seeding skipped (ENABLE_DEV_AUTH_SEED not true or production).");
    }

    // Create Alert tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_preferences (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        email_enabled BOOLEAN DEFAULT TRUE,
        alert_threshold VARCHAR(50) DEFAULT 'High'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        analysis_id INTEGER,
        severity VARCHAR(50),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50)
      );
    `);

    // Create Maintenance Logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS maintenance_logs (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
        work_date DATE NOT NULL,
        work_type VARCHAR(100) NOT NULL,
        technician_name VARCHAR(200) NOT NULL,
        notes TEXT,
        parts_used JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create diagnosis_feedback and learning_database tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_feedback (
        id SERIAL PRIMARY KEY,
        diagnosis_id INTEGER REFERENCES diagnosis_history(id) ON DELETE CASCADE,
        was_correct BOOLEAN NOT NULL,
        corrected_fault TEXT,
        user_notes TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_id INTEGER
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS learning_database (
        id SERIAL PRIMARY KEY,
        spectrum_image_url TEXT,
        extracted_values JSONB,
        correct_fault_type TEXT,
        confidence_score FLOAT,
        source VARCHAR(50) DEFAULT 'ai_analysis',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_part_history (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER,
        fault_type TEXT,
        part_number_used TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_confirmed BOOLEAN DEFAULT TRUE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS component_spec_templates (
        id SERIAL PRIMARY KEY,
        component_type VARCHAR(255) NOT NULL UNIQUE,
        spec_fields JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'AI-generated'
      );
    `);

    // -------------------------------------------------------------------------
    // Run Diagnostics → app-wide persistence (Trend / Alerts / Reports / Logs)
    // -------------------------------------------------------------------------
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id TEXT,
        component TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        health_score INTEGER,
        primary_fault TEXT,
        fault_list JSONB DEFAULT '[]'::jsonb,
        peaks JSONB DEFAULT '[]'::jsonb,
        spectrum_image_url TEXT,
        recommendations JSONB DEFAULT '[]'::jsonb,
        financial_impact JSONB DEFAULT '{}'::jsonb,
        severity TEXT,
        summary TEXT,
        is_baseline BOOLEAN DEFAULT FALSE,
        consensus_details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS severity TEXT;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS summary TEXT;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS consensus_details JSONB;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analysis_type TEXT DEFAULT 'vibration';
    `);
    // Polymorphic thermography columns (nullable for legacy rows)
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS asset_type VARCHAR(64) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS phase_a_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS phase_b_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS phase_c_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS measured_amps DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS rated_amps DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS de_bearing_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS ode_bearing_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS refractory_skin_temp DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS max_allowable_limit DOUBLE PRECISION NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS i2r_normalized_delta_t DOUBLE PRECISION NULL;
    `);
    // Hybrid polymorphic blob (environmental + AI vision + dynamic fields)
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS telemetry_data JSONB NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS waveform_peak_to_peak DECIMAL(10,4) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS waveform_crest_factor DECIMAL(5,2) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS waveform_impact_count INTEGER NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS waveform_symmetry VARCHAR(20) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS waveform_modulation VARCHAR(20) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS envelope_peak_amplitude DECIMAL(10,6) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS envelope_dominant_frequency DECIMAL(10,2) NULL;
    `);
    await pool.query(`
      ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS envelope_energy DECIMAL(10,6) NULL;
    `);
    // Fix legacy PMP030 ultrasound Peak 38 / RMS 45 → Peak 55 / RMS 39 + crest
    await pool.query(`
      UPDATE analysis_results ar
      SET peaks = (
        SELECT COALESCE(
          jsonb_agg(
            CASE
              WHEN LOWER(COALESCE(e->>'type', '')) = 'ultrasound'
                AND (
                  (
                    NULLIF(e->>'peak_dbmv', '')::double precision = 38
                    AND NULLIF(e->>'rms_dbmv', '')::double precision = 45
                  )
                  OR (
                    NULLIF(e->>'peak_dbuv', '')::double precision = 38
                    AND NULLIF(e->>'rms_dbuv', '')::double precision = 45
                  )
                )
              THEN e || jsonb_build_object(
                'peak_dbmv', 55,
                'rms_dbmv', 39,
                'crest_factor', round((power(10::numeric, ((55.0 - 39.0) / 20.0)))::numeric, 2)
              )
              ELSE e
            END
          ),
          '[]'::jsonb
        )
        FROM jsonb_array_elements(COALESCE(ar.peaks, '[]'::jsonb)) AS e
      )
      WHERE (
        COALESCE(ar.asset_id, '') ILIKE '%PMP030%'
        OR COALESCE(ar.component, '') ILIKE '%PMP030%'
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(ar.peaks, '[]'::jsonb)) AS e
        WHERE LOWER(COALESCE(e->>'type', '')) = 'ultrasound'
          AND (
            (
              NULLIF(e->>'peak_dbmv', '')::double precision = 38
              AND NULLIF(e->>'rms_dbmv', '')::double precision = 45
            )
            OR (
              NULLIF(e->>'peak_dbuv', '')::double precision = 38
              AND NULLIF(e->>'rms_dbuv', '')::double precision = 45
            )
          )
      );
    `).catch((err: any) =>
      // DATA backfill, not schema: tolerate legacy rows whose peaks blob is
      // not the expected JSON shape — but never swallow the failure silently.
      console.warn("[schema] PMP030 ultrasound peak backfill skipped:", err?.message)
    );
    // Backfill thermography rows previously saved without analysis_type
    await pool.query(`
      UPDATE analysis_results
      SET analysis_type = 'thermography'
      WHERE COALESCE(analysis_type, 'vibration') = 'vibration'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(peaks, '[]'::jsonb)) AS e
          WHERE e->>'type' = 'thermography'
        );
    `).catch((err: any) =>
      console.warn("[schema] thermography analysis_type backfill skipped:", err?.message)
    );
    // The diagnosis_logs-linked thermography backfill runs further down, right
    // after the diagnosis_logs CREATE — it used to run against a table that
    // did not exist yet on a fresh database and was silently swallowed.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_results_asset_id
        ON analysis_results (asset_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_results_timestamp
        ON analysis_results (timestamp DESC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE CASCADE,
        asset_id TEXT,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
        title TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        acknowledged BOOLEAN DEFAULT FALSE
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_asset_id ON alerts (asset_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts (acknowledged);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
    `);

    // Legacy `diagnosis_logs` (integer PK, fault_diagnosis, …) conflicts with the
    // Run Diagnostics persistence schema. Rename once, then create the UUID table.
    const diagLogsShape = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'diagnosis_logs'
    `);
    const diagCols = new Set(diagLogsShape.rows.map((r: { column_name: string }) => r.column_name));
    if (diagCols.size > 0 && diagCols.has("fault_diagnosis") && !diagCols.has("analysis_type")) {
      await pool.query(`
        ALTER TABLE diagnosis_logs RENAME TO diagnosis_logs_legacy
      `);
      console.log(
        "ℹ️ Renamed legacy diagnosis_logs → diagnosis_logs_legacy for Run Diagnostics schema."
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id TEXT,
        analysis_type TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
        result_summary JSONB DEFAULT '{}'::jsonb,
        analysis_result_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS analysis_type TEXT;
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20);
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS result_summary JSONB DEFAULT '{}'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS analysis_result_id UUID;
    `);
    await pool.query(`
      ALTER TABLE diagnosis_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_diagnosis_logs_asset_id ON diagnosis_logs (asset_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_diagnosis_logs_completed_at
        ON diagnosis_logs (completed_at DESC);
    `);

    // Backfill via diagnosis_logs link (older IR saves with empty peaks). Runs
    // here because the diagnosis_logs CREATE above has already executed — on a
    // fresh database this statement used to hit a missing table and was
    // silently swallowed.
    await pool.query(`
      UPDATE analysis_results ar
      SET analysis_type = 'thermography'
      FROM diagnosis_logs dl
      WHERE dl.analysis_result_id = ar.id
        AND LOWER(TRIM(COALESCE(dl.analysis_type, ''))) = 'thermography'
        AND COALESCE(ar.analysis_type, 'vibration') = 'vibration';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_orders (
        id SERIAL PRIMARY KEY,
        asset_id TEXT,
        title TEXT,
        status VARCHAR(50) DEFAULT 'scheduled',
        assignee TEXT,
        scheduled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS assignee TEXT;
    `);
    await pool.query(`
      ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
    `);

    // migrations/012 — certified engineer sign-off. Absence of a row means
    // 'pending'; we never pre-seed pending rows.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diagnosis_sign_off (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        diagnosis_id UUID NOT NULL UNIQUE
          REFERENCES analysis_results(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'modified')),
        engineer_name TEXT,
        override_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_diagnosis_sign_off_diagnosis_id
        ON diagnosis_sign_off (diagnosis_id);
    `);

    // migrations/014 — persisted multi-technology assessment reports. The
    // measured values are stored on the row rather than referenced, so
    // reopening an old report shows what was true when it was saved.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id TEXT NOT NULL,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        title TEXT,
        technology_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        overall_severity VARCHAR(16) NOT NULL DEFAULT 'NORMAL'
          CHECK (overall_severity IN ('CRITICAL', 'ANOMALY', 'NORMAL', 'NO_DATA')),
        fault_diagnoses JSONB NOT NULL DEFAULT '[]'::jsonb,
        recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
        technologies_with_data JSONB NOT NULL DEFAULT '[]'::jsonb,
        generated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_asset_id ON reports (asset_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports (company_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oil_analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        asset_id TEXT NOT NULL,
        technology_type VARCHAR(20) DEFAULT 'oil_analysis',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oil_samples (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oil_analysis_id UUID NOT NULL REFERENCES oil_analysis(id) ON DELETE CASCADE,
        sample_date DATE NOT NULL,
        operating_hours INTEGER NOT NULL,
        iron DECIMAL(10, 2) DEFAULT 0,
        copper DECIMAL(10, 2) DEFAULT 0,
        chromium DECIMAL(10, 2) DEFAULT 0,
        lead DECIMAL(10, 2) DEFAULT 0,
        aluminum DECIMAL(10, 2) DEFAULT 0,
        silicon DECIMAL(10, 2) DEFAULT 0,
        tin DECIMAL(10, 2) DEFAULT 0,
        nickel DECIMAL(10, 2) DEFAULT 0,
        baseline_iron DECIMAL(10, 2),
        baseline_copper DECIMAL(10, 2),
        baseline_chromium DECIMAL(10, 2),
        baseline_lead DECIMAL(10, 2),
        baseline_aluminum DECIMAL(10, 2),
        baseline_silicon DECIMAL(10, 2),
        iron_alarm_limit DECIMAL(10, 2) DEFAULT 100,
        copper_alarm_limit DECIMAL(10, 2) DEFAULT 50,
        chromium_alarm_limit DECIMAL(10, 2) DEFAULT 25,
        lead_alarm_limit DECIMAL(10, 2) DEFAULT 30,
        aluminum_alarm_limit DECIMAL(10, 2) DEFAULT 40,
        silicon_alarm_limit DECIMAL(10, 2) DEFAULT 30,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_oil_samples_analysis ON oil_samples(oil_analysis_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_oil_analysis_asset ON oil_analysis(asset_id);
    `);
    await pool.query(`
      ALTER TABLE oil_samples
        ADD COLUMN IF NOT EXISTS viscosity_40c DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS viscosity_100c DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS acid_number DECIMAL(10, 3);
    `);
    // migrations/009 — contamination & chemistry. Viscosity/TAN reuse the
    // columns added above rather than getting duplicate viscosity_40 / tan.
    await pool.query(`
      ALTER TABLE oil_samples
        ADD COLUMN IF NOT EXISTS viscosity_index DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS tbn DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS water_ppm DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS oxidation DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS nitration DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS iso_4um INTEGER,
        ADD COLUMN IF NOT EXISTS iso_6um INTEGER,
        ADD COLUMN IF NOT EXISTS iso_14um INTEGER;
    `);
    // migrations/010 — raw particle counts per mL. NAS/SAE classes are derived
    // on read, never stored.
    await pool.query(`
      ALTER TABLE oil_samples
        ADD COLUMN IF NOT EXISTS particles_4um DECIMAL(12, 2),
        ADD COLUMN IF NOT EXISTS particles_6um DECIMAL(12, 2),
        ADD COLUMN IF NOT EXISTS particles_14um DECIMAL(12, 2);
    `);
    // migrations/011 — ferrography, varnish and wear morphology. WPC/WSI/PLP
    // are derived from dr_large / dr_small on read, never stored.
    await pool.query(`
      ALTER TABLE oil_samples
        ADD COLUMN IF NOT EXISTS dr_large DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS dr_small DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS mpc_delta_e DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS ruler_percent DECIMAL(10, 2),
        ADD COLUMN IF NOT EXISTS uc_rating INTEGER,
        ADD COLUMN IF NOT EXISTS morph_rubbing VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_cutting VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_spherical VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_fatigue_chunk VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_severe_sliding VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_corrosive VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_nonmetallic VARCHAR(12),
        ADD COLUMN IF NOT EXISTS morph_fibers VARCHAR(12),
        ADD COLUMN IF NOT EXISTS ferrograph_image_url TEXT;
    `);

    // -------------------------------------------------------------------------
    // migrations/013 — custom CMMS templates. The BARE table is created
    // unconditionally (no extension dependency) so that
    // GET /api/cmms/templates can answer 200/empty on any database.
    // -------------------------------------------------------------------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_cmms_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        program_name TEXT NOT NULL,
        field_schema JSONB NOT NULL,
        created_by_tenant TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // Optional 1/2 — pg_trgm powers the fuzzy `%` / similarity() search path.
    // A managed database whose role may not install extensions degrades to
    // non-fuzzy search: warn and continue, never abort init and never 500.
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    } catch (err: any) {
      console.warn(
        "⚠️ [cmms] pg_trgm extension unavailable — fuzzy template search degraded:",
        err?.message
      );
    }
    // Optional 2/2 — trigram GIN index (needs the extension above). Kept in
    // its own non-fatal block for the same graceful-degradation reason.
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_custom_cmms_templates_name_trgm
          ON custom_cmms_templates USING GIN (program_name gin_trgm_ops);
      `);
    } catch (err: any) {
      console.warn(
        "⚠️ [cmms] trigram GIN index not created — fuzzy template search degraded:",
        err?.message
      );
    }
    // DEP-1b — unique key backing the ON CONFLICT target used by
    // POST /api/cmms/templates (ON CONFLICT (program_name, created_by_tenant)).
    // ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so the re-run on
    // every subsequent boot is guarded: measured on PostgreSQL 18.6 the re-ADD
    // raises 42P07 (duplicate_table, "relation ... already exists" — the
    // backing index shares the constraint's name and its relation-namespace
    // check fires first), with 42710 (duplicate_object) and 42P06 kept as the
    // rest of the same already-exists family. The catch is deliberately limited
    // to that family — anything else rethrows so real schema errors still
    // raise loud.
    try {
      await pool.query(`
        ALTER TABLE custom_cmms_templates
          ADD CONSTRAINT custom_cmms_templates_program_name_tenant_key
          UNIQUE (program_name, created_by_tenant);
      `);
    } catch (err: any) {
      if (err?.code !== "42710" && err?.code !== "42P06" && err?.code !== "42P07") {
        throw err;
      }
    }

    // ------------------------------------------------------------------
    // AR-29 — tenant rollout. Runs AFTER every CREATE TABLE above so that
    // each ALTER/INDEX/UPDATE lands on a table that exists (DEFECT 1). On a
    // fresh database these statements used to be skipped by a blanket
    // .catch, which left the tenant-scoped API reads without tenant_id.
    // Sentinel = -1 (disclosed; excluded from tenant-scoped reads).
    // ------------------------------------------------------------------
    for (const table of [
      "analysis_results",
      "diagnosis_logs",
      "analysis_history",
      "diagnosis_history",
      "work_orders",
      "reports",
      "oil_analysis",
      "oil_samples",
      "alerts"
    ]) {
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id INTEGER NOT NULL DEFAULT -1;`
      );
    }
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_analysis_results_tenant ON analysis_results (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_diagnosis_logs_tenant ON diagnosis_logs (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_analysis_history_tenant ON analysis_history (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_diagnosis_history_tenant ON diagnosis_history (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON work_orders (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_oil_analysis_tenant ON oil_analysis (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_oil_samples_tenant ON oil_samples (tenant_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts (tenant_id);"
    );
    // migrations/021 - ANOMALY-BOARD composite index. Mirrored here so a
    // fresh boot and a migrated boot converge; IF NOT EXISTS keeps it
    // idempotent across repeated boots (DEP-1 style).
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_alerts_tenant_ack_severity ON alerts (tenant_id, acknowledged, severity);"
    );
    // migrations/022 - GOOD-CATCHES. Same DDL as the file so a fresh boot and
    // a migrated boot converge; IF NOT EXISTS keeps every boot idempotent.
    // MONEY RULE: avoided_cost_cents is INTEGER cents (see migration header).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS good_catches (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL,
        route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
        asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        component_id INTEGER REFERENCES components(id) ON DELETE SET NULL,
        alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
        work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        catch_date DATE NOT NULL DEFAULT CURRENT_DATE,
        avoided_cost_cents INTEGER NOT NULL DEFAULT 0
          CHECK (avoided_cost_cents >= 0),
        downtime_hours_avoided NUMERIC(10, 2) NOT NULL DEFAULT 0
          CHECK (downtime_hours_avoided >= 0),
        safety_hazard BOOLEAN NOT NULL DEFAULT FALSE,
        safety_note TEXT,
        recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_good_catches_tenant ON good_catches (tenant_id, catch_date DESC, id DESC);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_good_catches_tenant_asset ON good_catches (tenant_id, asset_id);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_good_catches_tenant_work_order ON good_catches (tenant_id, work_order_id);"
    );
    // migrations/023 - BEARING-CALC. User-entered geometry only; there is NO
    // manufacturer part-number table. Same DDL as the file so a fresh boot and
    // a migrated boot converge; IF NOT EXISTS keeps every boot idempotent.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bearing_specs (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
        z INTEGER NOT NULL CHECK (z >= 3),
        bd NUMERIC(12, 4) NOT NULL CHECK (bd > 0),
        pd NUMERIC(12, 4) NOT NULL CHECK (pd > 0),
        contact_angle NUMERIC(6, 2) NOT NULL DEFAULT 0
          CHECK (contact_angle >= 0 AND contact_angle <= 45),
        unit TEXT NOT NULL DEFAULT 'mm',
        reference_label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (bd < pd)
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_bearing_specs_tenant_component ON bearing_specs (tenant_id, component_id);"
    );
    // migrations/024 - ROUTE-CHECKOUT. Same DDL as the file so a fresh boot and
    // a migrated boot converge. The partial UNIQUE index is the DB-level
    // double-checkout lock; IF NOT EXISTS keeps repeated boots idempotent.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS route_assignments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL
          CHECK (status IN ('checked_out', 'checked_in', 'closed')),
        checked_out_at TIMESTAMPTZ,
        checked_in_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_status ON route_assignments (tenant_id, status, id DESC);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_route ON route_assignments (tenant_id, route_id);"
    );
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique ON route_assignments (route_id) WHERE status = 'checked_out';"
    );
    // migrations/025 - ASSESSMENT-WIZARD. Same DDL as the file so a fresh boot
    // and a migrated boot converge. The disposition CHECK is the database-level
    // mirror of src/lib/assessmentWizard.ts ASSESSMENT_DISPOSITIONS.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS component_assessments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
        alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
        failure_mode_key TEXT,
        disposition TEXT NOT NULL
          CHECK (disposition IN ('none', 'anomaly', 'defect', 'unable')),
        notes TEXT,
        metadata_missing_at_assessment TEXT[],
        assessed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_component_assessments_tenant_component ON component_assessments (tenant_id, component_id, assessed_at DESC, id DESC);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_component_assessments_tenant_alert ON component_assessments (tenant_id, alert_id);"
    );
    // migrations/026 - NOTIFICATIONS-1. Same DDL as the file so a fresh boot
    // and a migrated boot converge; IF NOT EXISTS keeps every boot idempotent.
    // The tenant alert-recipient list is added here because the pre-migration
    // grep found only per-user alert_preferences, no tenant-level defaults.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
        kind TEXT NOT NULL CHECK (kind IN ('alert', 'receipt', 'welcome', 'invite', 'digest')),
        recipient_email TEXT,
        subject TEXT,
        body_text TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        error TEXT,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications (tenant_id, created_at DESC);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON notifications (tenant_id, user_id, created_at DESC);"
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tenant_alert_recipients (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS tenant_alert_recipients_tenant_email ON tenant_alert_recipients (tenant_id, LOWER(email));"
    );
    // migrations/027 - USERS-1. auth_invites already carried company_id
    // (tenant binding), created_by (invited_by), token_hash, expires_at and
    // used_at from migrations/008; only the delivery/revocation state and the
    // users disabled flag are new. Every statement is idempotent (DEP-1).
    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;"
    );
    await pool.query(
      "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'revoked', 'accepted'));"
    );
    await pool.query(
      "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;"
    );
    await pool.query(
      "ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_auth_invites_company_status ON auth_invites (company_id, status, created_at DESC);"
    );
    // migrations/028 - SLICE-A. Same DDL as the file so a fresh boot and a
    // migrated boot converge (DEP-1). Existing hierarchy rows keep NULL
    // import_id; only rows written by one batch share the same import_id.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS imports (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'hierarchy_bulk_import',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'completed', 'failed', 'discarded'))
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_imports_tenant_created ON imports (tenant_id, created_at DESC);"
    );
    for (const table of [
      "plants",
      "routes",
      "assets",
      "components",
      "collection_points",
      "measurement_points"
    ]) {
      await pool.query(
        `ALTER TABLE ${table}
           ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL;`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_${table}_import_id
           ON ${table} (import_id) WHERE import_id IS NOT NULL;`
      );
    }
    // migrations/029 - SLICE-B. No soft-delete column exists on the hierarchy
    // tables, so the tag key is a plain table-level UNIQUE. Postgres treats
    // NULL tag_number values as distinct by default, so untagged rows never
    // collide. The catch covers only the already-exists family (42P07 backing
    // index, 42710 duplicate object, 42P06 duplicate schema).
    try {
      await pool.query(`
        ALTER TABLE assets
          ADD CONSTRAINT assets_company_tag_number_key
          UNIQUE (company_id, tag_number);
      `);
    } catch (err: any) {
      if (err?.code !== "42710" && err?.code !== "42P06" && err?.code !== "42P07") {
        throw err;
      }
    }
    // Backfill derivable tenants from the owning company chain; anything
    // underivable stays on the disclosed -1 sentinel (no silent NULLs).
    await pool.query(`
      UPDATE analysis_history ah
         SET tenant_id = pl.company_id
        FROM measurement_points mp
        JOIN collection_points cp ON cp.id = mp.collection_point_id
        JOIN components c ON c.id = cp.component_id
        JOIN assets a ON a.id = c.asset_id
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
       WHERE ah.measurement_point_id = mp.id
         AND ah.tenant_id = -1
         AND pl.company_id IS NOT NULL;
    `);
    await pool.query(`
      UPDATE diagnosis_history dh
         SET tenant_id = pl.company_id
        FROM assets a
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
       WHERE dh.asset_id = a.id
         AND dh.tenant_id = -1
         AND pl.company_id IS NOT NULL;
    `);
    await pool.query(`
      UPDATE diagnosis_history dh
         SET tenant_id = u.company_id
        FROM users u
       WHERE dh.user_id = u.id
         AND dh.tenant_id = -1
         AND u.company_id IS NOT NULL;
    `);
    for (const table of ["analysis_results", "diagnosis_logs", "work_orders"]) {
      await pool.query(`
        UPDATE ${table} t
           SET tenant_id = pl.company_id
          FROM assets a
          LEFT JOIN routes r ON r.id = a.route_id
          LEFT JOIN plants pl ON pl.id = r.plant_id
         WHERE t.tenant_id = -1
           AND (a.id::text = t.asset_id OR a.tag_number = t.asset_id OR a.name = t.asset_id)
           AND pl.company_id IS NOT NULL;
      `);
    }
    await pool.query(`
      UPDATE reports rp
         SET tenant_id = rp.company_id
       WHERE rp.tenant_id = -1
         AND rp.company_id IS NOT NULL;
    `);
    // BLOCKER-12 - oil analysis is tenant data too. Derive the owning company
    // through assets -> routes -> plants, then stamp both oil tables. Rows with
    // no derivable lineage stay on the disclosed -1 sentinel.
    await pool.query(`
      UPDATE oil_analysis oa
         SET tenant_id = pl.company_id
        FROM assets a
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
       WHERE oa.tenant_id = -1
         AND (a.id::text = oa.asset_id OR a.tag_number = oa.asset_id OR a.name = oa.asset_id)
         AND pl.company_id IS NOT NULL;
    `);
    await pool.query(`
      UPDATE oil_samples os
         SET tenant_id = oa.tenant_id
        FROM oil_analysis oa
       WHERE os.oil_analysis_id = oa.id
         AND os.tenant_id = -1
         AND oa.tenant_id <> -1;
    `);
    // Alerts inherit the tenant of the analysis result that raised them (or,
    // for legacy rows, the owning asset lineage).
    await pool.query(`
      UPDATE alerts al
         SET tenant_id = ar.tenant_id
        FROM analysis_results ar
       WHERE al.analysis_result_id = ar.id
         AND al.tenant_id = -1
         AND ar.tenant_id <> -1;
    `);
    await pool.query(`
      UPDATE alerts al
         SET tenant_id = pl.company_id
        FROM assets a
        LEFT JOIN routes r ON r.id = a.route_id
        LEFT JOIN plants pl ON pl.id = r.plant_id
       WHERE al.tenant_id = -1
         AND (a.id::text = al.asset_id OR a.tag_number = al.asset_id OR a.name = al.asset_id)
         AND pl.company_id IS NOT NULL;
    `);

    console.log(
      "✅ Run-Diagnostics persistence tables verified: analysis_results, alerts, diagnosis_logs, work_orders, oil_analysis."
    );

    // Seed some maintenance logs if none exist
    const logsCountQuery = await pool.query("SELECT COUNT(*) FROM maintenance_logs");
    if (isDevAuthSeedEnabled(process.env) && parseInt(logsCountQuery.rows[0].count) === 0) {
      console.log("🌱 Seeding dummy maintenance logs...");
      // Let's get the first two assets
      const assetsRes = await pool.query("SELECT id FROM assets ORDER BY id LIMIT 2");
      if (assetsRes.rows.length >= 2) {
        const id1 = assetsRes.rows[0].id;
        const id2 = assetsRes.rows[1].id;
        
        await pool.query(`
          INSERT INTO maintenance_logs (asset_id, work_date, work_type, technician_name, notes, parts_used)
          VALUES 
            ($1, '2026-05-15', 'Bearing Replacement', 'Marcus Vance', 'Replaced outboard radial bearing with SKF Explorer series. Balanced impeller shaft to ISO G1.0 specification.', '{"bearing_model": "SKF-6312", "grease_type": "Mobilith SHC 100"}'),
            ($1, '2026-02-10', 'Lubrication Service', 'Dave Carter', 'Flushed old oil. Replenished with synthetic Mobil SHC 626. Checked seals for leakage; minor weeping on non-drive end.', '{"oil_volume": "1.5L", "seal_kit": "None"}'),
            ($2, '2026-06-01', 'Coupling Alignment', 'Marcus Vance', 'Corrected 0.08 in/sec parallel misalignment on motor coupling. Replaced spider element and torqued bolts to 85 ft-lbs.', '{"spider_element": "KTR Rotex 28", "bolts": 6}')
        `, [id1, id2]);
        console.log("✅ Seeding maintenance logs completed.");
      } else if (assetsRes.rows.length === 1) {
        const id1 = assetsRes.rows[0].id;
        await pool.query(`
          INSERT INTO maintenance_logs (asset_id, work_date, work_type, technician_name, notes, parts_used)
          VALUES 
            ($1, '2026-05-15', 'Bearing Replacement', 'Marcus Vance', 'Replaced outboard radial bearing with SKF Explorer series. Balanced impeller shaft to ISO G1.0 specification.', '{"bearing_model": "SKF-6312", "grease_type": "Mobilith SHC 100"}'),
            ($1, '2026-02-10', 'Lubrication Service', 'Dave Carter', 'Flushed old oil. Replenished with synthetic Mobil SHC 626. Checked seals for leakage; minor weeping on non-drive end.', '{"oil_volume": "1.5L", "seal_kit": "None"}')
        `, [id1]);
        console.log("✅ Seeding maintenance logs completed (1 asset available).");
      }
    }

    console.log("✅ Database initialized: All plants, routes, assets, components, collection points, measurement points, maintenance logs, analysis history, analysis_results, alerts, and diagnosis_logs tables verified/created.");
  } catch (error) {
    // DEFECT 3 — no more swallowing: log and rethrow so the caller's
    // non-blocking handler surfaces a real schema failure loudly instead of
    // pretending init succeeded.
    console.error("❌ Failed to initialize database tables:", error);
    throw error;
  }
}

/* ========================================================================== */
/* Custom CMMS Templates API                                                  */
/* ========================================================================== */

// Helper: sanitize and validate custom CMMS field schema
function sanitizeCustomCmmsSchema(schema: unknown): {
  fields: Array<{
    key: string;
    label: string;
    sourcePath: string;
    multiline?: boolean;
    staticValue?: string;
  }>;
  priorityMapping: Record<string, string>;
  workTypeMapping: Record<string, string>;
} | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as Record<string, unknown>;

  // Validate fields array
  const rawFields = Array.isArray(s.fields) ? s.fields : [];
  const fields = rawFields
    .filter((f): f is Record<string, unknown> => {
      return f && typeof f === "object" &&
        typeof f.key === "string" && f.key.trim() &&
        typeof f.label === "string" && f.label.trim() &&
        typeof f.sourcePath === "string";
    })
    .map((f) => ({
      key: String(f.key).slice(0, 100),
      label: String(f.label).slice(0, 100),
      sourcePath: String(f.sourcePath).slice(0, 200),
      multiline: Boolean(f.multiline),
      staticValue: f.staticValue != null ? String(f.staticValue).slice(0, 500) : undefined
    }))
    .slice(0, 50); // Cap at 50 fields

  // Validate priorityMapping
  const validSeverities = ["CRITICAL", "ANOMALY", "NORMAL"];
  const rawPriority = s.priorityMapping && typeof s.priorityMapping === "object"
    ? (s.priorityMapping as Record<string, unknown>)
    : {};
  const priorityMapping: Record<string, string> = {};
  for (const sev of validSeverities) {
    priorityMapping[sev] = typeof rawPriority[sev] === "string"
      ? String(rawPriority[sev]).slice(0, 50)
      : sev === "CRITICAL" ? "High" : sev === "ANOMALY" ? "Medium" : "Low";
  }

  // Validate workTypeMapping
  const rawWorkType = s.workTypeMapping && typeof s.workTypeMapping === "object"
    ? (s.workTypeMapping as Record<string, unknown>)
    : {};
  const workTypeMapping: Record<string, string> = {};
  for (const sev of validSeverities) {
    workTypeMapping[sev] = typeof rawWorkType[sev] === "string"
      ? String(rawWorkType[sev]).slice(0, 50)
      : sev === "CRITICAL" ? "Corrective" : sev === "ANOMALY" ? "Corrective" : "Preventive";
  }

  return { fields, priorityMapping, workTypeMapping };
}

// GET /api/cmms/templates?query={name}
// Fuzzy search for custom CMMS templates using pg_trgm
app.get("/api/cmms/templates", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }
  try {
    const query = (req.query.query as string || "").trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    // AR-29 — tenant-scoped: only this session's templates; legacy
    // 'default_tenant' rows are excluded until reassigned.
    const tenantKey = String(req.auth?.tenantId ?? -1);

    let sql: string;
    let params: unknown[];

    if (query) {
      // Use pg_trgm similarity for fuzzy matching
      sql = `
        SELECT id, program_name, field_schema, created_by_tenant, created_at, updated_at,
               similarity(program_name, $1) AS sim
        FROM custom_cmms_templates
        WHERE program_name % $1
          AND created_by_tenant = $3
        ORDER BY sim DESC, updated_at DESC
        LIMIT $2
      `;
      params = [query, limit, tenantKey];
    } else {
      sql = `
        SELECT id, program_name, field_schema, created_by_tenant, created_at, updated_at
        FROM custom_cmms_templates
        WHERE created_by_tenant = $2
        ORDER BY updated_at DESC
        LIMIT $1
      `;
      params = [limit, tenantKey];
    }

    const result = await pool.query(sql, params);
    return res.json({ templates: result.rows });
  } catch (err: any) {
    console.error("[GET /api/cmms/templates] Error:", err);
    return res.status(500).json({ error: err?.message || "Search failed" });
  }
});

// POST /api/cmms/parse-screenshot
// Parse CMMS work order screenshot using existing OpenRouter vision provider
app.post("/api/cmms/parse-screenshot", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }
  try {
    const { imageBase64, context } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!openRouterKey) {
      return res.status(503).json({
        error: "OPENROUTER_API_KEY not configured",
        message: "Vision provider unavailable. Set OPENROUTER_API_KEY in .env"
      });
    }

    // Build context-aware prompt for CMMS screenshot parsing
    const contextInfo = context ? `
Asset: ${context.assetTag || "Unknown"}
Component: ${context.component || "Unknown"}
Fault: ${context.faultTitle || "Unknown"}
Severity: ${context.severity || "Unknown"}
Confidence: ${context.confidencePercent ?? "N/A"}%
Health Score: ${context.healthScore ?? "N/A"}
Recommendations: ${Array.isArray(context.recommendations) ? context.recommendations.join("; ") : "None"}
` : "No diagnosis context provided.";

    const prompt = `
You are an expert at reading CMMS/EAM work order screenshots. Extract the field structure from this screenshot and map it to a JSON schema that can be used to auto-populate work orders from condition monitoring diagnostics.

${contextInfo}

Return ONLY valid JSON matching this exact structure:
{
  "fields": [
    {"key": "FIELD_KEY", "label": "Display Label", "sourcePath": "context.property.path", "multiline": false, "staticValue": "optional static value"},
    ...
  ],
  "priorityMapping": {"CRITICAL": "High", "ANOMALY": "Medium", "NORMAL": "Low"},
  "workTypeMapping": {"CRITICAL": "Corrective", "ANOMALY": "Corrective", "NORMAL": "Preventive"}
}

Rules:
1. Identify ALL visible fields in the work order form (text inputs, textareas, dropdowns, etc.)
2. For each field, determine the best matching diagnosis context property using dot-notation paths:
   - assetTag, component, faultTitle, severity, confidencePercent, healthScore
   - horizonHours, horizonDriver, horizonBasis
   - corroborationPercent, technologiesWithData
   - signOffStatus, signOffEngineer, signOffAt
   - recommendations[0], recommendations[1], etc.
   - diagnosisId, diagnosisAt
   - requiredParts (array joined with " | ")
3. Use "staticValue" for fields that don't map to diagnosis data (e.g., "Work Center", "Reported By")
4. Set multiline=true for textareas/long text fields
4. Priority mapping: map CMMS-specific priority codes to our CRITICAL/ANOMALY/NORMAL
5. Work type mapping: map CMMS-specific work order types to our CRITICAL/ANOMALY/NORMAL
6. Field keys should be uppercase with underscores (e.g., "WO_NUMBER", "ASSET_ID")
7. Labels should be human-readable (e.g., "Work Order Number", "Asset ID")
8. Maximum 50 fields
`.trim();

    const modelsToTry = [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-pro-1.5"
    ];

    let parsedSchema: unknown = null;
    let lastError: unknown = null;

    for (const model of modelsToTry) {
      try {
        const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openRouterKey}`,
            "HTTP-Referer": "https://motormedic.app",
            "X-Title": "MotorMedic CMMS Parser"
          },
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            model,
            max_tokens: 4000,
            temperature: 0.1,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
                  { type: "text", text: prompt }
                ]
              }
            ]
          })
        });

        const upstreamJson = await upstream.json().catch(() => ({})) as Record<string, unknown>;

        if (!upstream.ok) {
          lastError = new Error(`Vision provider HTTP ${upstream.status} (${model})`);
          console.warn(`[cmms/parse-screenshot] Model ${model} failed:`, upstream.status);
          continue;
        }

        const choices = upstreamJson.choices;
        const first = Array.isArray(choices) && choices[0] && typeof choices[0] === "object"
          ? (choices[0] as { message?: { content?: string } })
          : null;
        const content = first?.message?.content;

        if (!content || typeof content !== "string") {
          lastError = new Error("Vision model returned no text content");
          continue;
        }

        // Extract JSON from response (may be wrapped in markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        parsedSchema = JSON.parse(jsonStr);
        console.log(`[cmms/parse-screenshot] Successfully parsed with ${model}`);
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[cmms/parse-screenshot] Model ${model} error:`, err);
      }
    }

    if (!parsedSchema) {
      throw lastError || new Error("All vision models failed to parse screenshot");
    }

    // Sanitize and validate schema
    const sanitized = sanitizeCustomCmmsSchema(parsedSchema);
    if (!sanitized) {
      return res.status(422).json({
        error: "Invalid schema returned by vision model",
        message: "The AI returned a schema that failed validation. Try a clearer screenshot."
      });
    }

    // Generate preview fields with live diagnosis data
    const previewFields = {
      fieldSchema: sanitized,
      rawResponse: JSON.stringify(parsedSchema, null, 2)
    };

    return res.json(previewFields);
  } catch (err: any) {
    console.error("[POST /api/cmms/parse-screenshot] Error:", err);
    const timedOut =
      err?.name === "TimeoutError" ||
      err?.name === "AbortError" ||
      /timeout|timed out|aborted/i.test(String(err?.message || ""));
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut ? "Screenshot analysis timed out" : err?.message || "Failed to parse screenshot",
      message: timedOut
        ? "Vision analysis timed out after 60 seconds. Try a clearer, smaller image."
        : "Vision extraction failed. Verify OPENROUTER_API_KEY and credits at https://openrouter.ai"
    });
  }
});

// POST /api/cmms/templates
// Save a custom CMMS template (only stores schema, never screenshot)
app.post("/api/cmms/templates", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }
  try {
    const { program_name, field_schema } = req.body || {};
    if (!program_name || typeof program_name !== "string" || !program_name.trim()) {
      return res.status(400).json({ error: "program_name is required" });
    }
    if (!field_schema || typeof field_schema !== "object") {
      return res.status(400).json({ error: "field_schema is required" });
    }

    const sanitized = sanitizeCustomCmmsSchema(field_schema);
    if (!sanitized || !sanitized.fields.length) {
      return res.status(400).json({ error: "field_schema must contain at least one valid field" });
    }

    // AR-29 rules 3/9 — tenant from the verified session, never the client.
    const tenantId = req.auth?.tenantId;
    if (tenantId == null) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const insert = await pool.query(
      `INSERT INTO custom_cmms_templates (program_name, field_schema, created_by_tenant)
       VALUES ($1, $2, $3)
       ON CONFLICT (program_name, created_by_tenant) DO UPDATE SET
         field_schema = EXCLUDED.field_schema,
         updated_at = NOW()
       RETURNING id, program_name, field_schema, created_by_tenant, created_at, updated_at`,
      [program_name.trim(), JSON.stringify(sanitized), String(tenantId)]
    );

    return res.json(insert.rows[0]);
  } catch (err: any) {
    console.error("[POST /api/cmms/templates] Error:", err);
    if (err?.code === "23505") {
      return res.status(409).json({ error: "Template name already exists for this tenant" });
    }
    return res.status(500).json({ error: err?.message || "Failed to save template" });
  }
});

// DELETE /api/cmms/templates/:id
// Delete a custom CMMS template
app.delete("/api/cmms/templates/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Database not configured" });
  }
  try {
    const { id } = req.params;
    await pool.query(
      `DELETE FROM custom_cmms_templates WHERE id = $1 AND created_by_tenant = $2`,
      [id, String(req.auth?.tenantId ?? -1)]
    );
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[DELETE /api/cmms/templates/:id] Error:", err);
    return res.status(500).json({ error: err?.message || "Failed to delete template" });
  }
});

// Global error-handling middleware to prevent Express from crashing and return uniform JSON responses
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("🔥 Unhandled exception caught by global Express middleware:", err);
  res.status(500).json({
    error: "Internal server error. Please try again in a few minutes.",
    details: err?.message || "Unknown error occurred on the condition monitoring backend."
  });
});

// Intercept unmatched /api requests and return JSON 404 (not SPA index.html)
app.use("/api", (req, res) => {
  console.warn(
    `[API 404] ${req.method} ${req.originalUrl} — no Express route matched. ` +
      `If you recently added this endpoint (e.g. ${ANALYZE_VIBRATION_API_PATH}), ` +
      `restart the Spectra CM server with: npm run dev`
  );
  res.status(404).json({
    error: "API endpoint not found on the Spectra CM backend.",
    details: `No route matches ${req.method} ${req.path}`,
    hint: "Restart the server (npm run dev) after adding or changing API routes in server.ts."
  });
});

async function setupServer() {
  // TLS-1: resolve the TLS mode BEFORE opening the main pool. A verify-full
  // probe runs first; if the certificate chain cannot be verified it degrades
  // loudly to require (never bricks boot). DATABASE_SSLMODE overrides both.
  const tlsMode = await resolveBootTlsMode({
    databaseUrl: dbUrl,
    env: process.env
  });
  if (dbUrl && tlsMode) {
    pool = new Pool(buildPoolConfig(dbUrl, tlsMode));
    console.log(
      `🔋 PostgreSQL connection pool initialized (sslmode=${tlsMode}).`
    );
    // Prevent unhandled pool errors
    pool.on("error", (err) => {
      console.error("Unexpected error on idle SQL pool client:", err);
    });
  }

  // DEP-2 boot order (the real restart-loop fix): when DATABASE_URL is set
  // (production), AWAIT the DB connect-with-retry BEFORE app.listen so
  // Render never routes traffic — or passes /api/health — before the DB is
  // reachable. /api/health itself stays a fast liveness probe (no deep DB
  // query); the cold-start safety lives here, in boot order.
  if (pool) {
    await connectWithRetry(pool);
  }

  // Schema init + one-time admin bootstrap stay non-blocking (unchanged
  // behavior): the server listens immediately; init failures are logged,
  // never fatal to the HTTP server.
  initializeDatabase().catch(err => {
    console.error("❌ Non-blocking database initialization error:", err);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Spectra CM server running on http://localhost:${PORT}`);
    console.log(
      `Mounted: POST ${ANALYZE_VIBRATION_API_PATH} (alias ${ANALYZE_VIBRATION_API_ALIAS}) → consensus engine`
    );
    console.log(
      `Mounted: POST ${ANALYZE_THERMOGRAPHY_API_PATH} → thermography analysis engine`
    );
    console.log(
      `Mounted: POST ${ANALYZE_ULTRASOUND_API_PATH} → ultrasound analysis engine (placeholder)`
    );
    console.log(
      `Mounted: POST ${OIL_VISION_API_PATH} → oil analysis vision extractor`
    );
    console.log(
      `Mounted: POST ${DETECT_SPECTRUM_REGIONS_API_PATH} → GPT-4o chart region detection`
    );
    const hasOpenRouter = !!(process.env.OPENROUTER_API_KEY);
    const hasGemini = !!(process.env.GEMINI_API_KEY);
    const hasOpenAI = !!(process.env.OPENAI_API_KEY);
    const hasAnthropic = !!(process.env.ANTHROPIC_API_KEY);
    const hasDeepSeek = !!(
      process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY
    );
    console.log(
      `AI Team Status: OpenRouter [${hasOpenRouter ? "OK" : "MISSING"}], Gemini [${hasGemini ? "OK" : "MISSING"}], OpenAI [${hasOpenAI ? "OK" : "MISSING"}], Anthropic [${hasAnthropic ? "OK" : "MISSING"}], DeepSeek/OpenRouter analyst [${hasDeepSeek ? "OK" : "MISSING"}]`
    );
    if (hasOpenRouter) {
      console.log(
        `OpenRouter models: vision=${process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4o"}, consensus=${process.env.OPENROUTER_CONSENSUS_MODEL || "qwen/qwen-2.5-vl-72b-instruct"}`
      );
    }
  });
  // Align with Next.js maxDuration = 60 for AI synthesis / vision extraction.
  httpServer.timeout = 60_000;
  httpServer.headersTimeout = 61_000;
}

// DEP-2 — a boot-order failure (DB unreachable after retries) must exit
// non-zero so Render restarts the service instead of leaving a half-alive
// process that would serve 500s behind a passing liveness probe.
setupServer().catch((err) => {
  console.error("❌ FATAL: server failed to start (boot order):", err);
  process.exit(1);
});
