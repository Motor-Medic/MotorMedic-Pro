/**
 * High-precision diagnostic tracing for the vibration analysis pipeline.
 * Browser console + server terminal should be watched together.
 */

export type PipelineFailureKind =
  | "NETWORK_ABORT"
  | "HTTP_504_GATEWAY_TIMEOUT"
  | "HTTP_503"
  | "HTTP_OTHER"
  | "JSON_PARSE"
  | "PROVIDER_TIMEOUT"
  | "UNCAUGHT";

export function pipelineElapsedSec(startTime: number): string {
  return ((performance.now() - startTime) / 1000).toFixed(2);
}

export function pipelineErrorFields(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  status?: unknown;
  code?: unknown;
} {
  if (error instanceof Error) {
    const extra = error as Error & { cause?: unknown; status?: unknown; code?: unknown };
    return {
      name: extra.name,
      message: extra.message,
      stack: extra.stack,
      cause: extra.cause,
      status: extra.status,
      code: extra.code
    };
  }
  return {
    name: typeof error === "object" && error ? (error as { name?: string }).name || "Unknown" : typeof error,
    message: String(error)
  };
}

export function classifyPipelineFailure(
  error: unknown,
  response?: { status?: number; ok?: boolean } | null
): PipelineFailureKind {
  const fields = pipelineErrorFields(error);
  const name = (fields.name || "").toLowerCase();
  const message = (fields.message || "").toLowerCase();
  const status = response?.status ?? (typeof fields.status === "number" ? fields.status : undefined);

  if (
    name === "aborterror" ||
    name === "timeouterror" ||
    name === "apiconnectiontimeouterror" ||
    message.includes("aborted") ||
    message.includes("the operation was aborted")
  ) {
    return "NETWORK_ABORT";
  }
  if (
    status === 504 ||
    message.includes("504") ||
    message.includes("gateway timeout")
  ) {
    return "HTTP_504_GATEWAY_TIMEOUT";
  }
  if (status === 503 || message.includes("503")) {
    return "HTTP_503";
  }
  if (
    name === "syntaxerror" ||
    message.includes("json") && (message.includes("parse") || message.includes("unexpected"))
  ) {
    return "JSON_PARSE";
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout")
  ) {
    return "PROVIDER_TIMEOUT";
  }
  if (typeof status === "number" && status >= 400) {
    return "HTTP_OTHER";
  }
  return "UNCAUGHT";
}

export function logPayloadSize(label: string, imageData: string | null | undefined): void {
  const length = typeof imageData === "string" ? imageData.length : 0;
  const mb = length / 1024 / 1024;
  console.log(
    `📊 [PAYLOAD CHECK] ${label} Image Base64 length: ${length} characters (~${mb.toFixed(2)} MB)`
  );
  if (mb >= 4) {
    console.warn(
      `⚠️ [PAYLOAD CHECK] ${label} image is very large (>= 4 MB encoded). This can choke the AI provider request body parser.`
    );
  }
}

export function logPipelineStart(scope: string, extra?: Record<string, unknown>): number {
  const startTime = performance.now();
  console.log(`⏱️ [PIPELINE] ${scope} Diagnostic request initiated at:`, new Date().toISOString(), extra || "");
  return startTime;
}

export function logPipelineSend(scope: string, extra?: Record<string, unknown>): void {
  console.log(`📤 [PIPELINE] ${scope} Sending payload to AI provider...`, extra || "");
}

export function logPipelineSuccess(scope: string, startTime: number, extra?: Record<string, unknown>): void {
  const duration = pipelineElapsedSec(startTime);
  console.log(`📥 [PIPELINE] ${scope} AI provider responded successfully in ${duration}s`, extra || "");
}

export function logPipelineFail(
  scope: string,
  startTime: number,
  error: unknown,
  response?: { status?: number; ok?: boolean; statusText?: string } | null
): PipelineFailureKind {
  const duration = pipelineElapsedSec(startTime);
  const kind = classifyPipelineFailure(error, response);
  const fields = pipelineErrorFields(error);
  console.error(`❌ [PIPELINE FAIL] ${scope} Request failed after ${duration}s:`, {
    kind,
    httpStatus: response?.status,
    httpStatusText: response?.statusText,
    name: fields.name,
    message: fields.message,
    stack: fields.stack,
    cause: fields.cause,
    code: fields.code,
    status: fields.status
  });
  return kind;
}
