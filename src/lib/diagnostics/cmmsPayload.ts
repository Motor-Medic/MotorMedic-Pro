/**
 * Dynamic CMMS payload builder.
 *
 * Each target system gets its own field keys and its own priority vocabulary —
 * SAP's priority 1 is "very high" on a 1–4 scale, Maximo runs 1–5, MaintainX
 * and Fiix use words. Translating severity once per system here keeps the
 * mapping auditable in one place.
 *
 * Every value comes from the live diagnosis context. Fields whose source data
 * is missing are omitted rather than filled with a plausible-looking default.
 */

import type { SignOffStatus } from "./signOff";

export type CmmsTargetId =
  | "sap"
  | "maximo"
  | "maintainx"
  | "fiix"
  | "oracle_eam";

export const CMMS_TARGETS: { id: CmmsTargetId; label: string }[] = [
  { id: "sap", label: "SAP PM / S4HANA" },
  { id: "maximo", label: "IBM Maximo" },
  { id: "maintainx", label: "MaintainX" },
  { id: "fiix", label: "Fiix CMMS" },
  { id: "oracle_eam", label: "Oracle EAM" }
];

/** Normalized severity the priority tables key off. */
export type DiagnosisSeverity = "CRITICAL" | "ANOMALY" | "NORMAL";

export interface CmmsPayloadContext {
  assetTag: string;
  component: string;
  faultTitle: string;
  severity: DiagnosisSeverity;
  confidencePercent: number | null;
  healthScore: number | null;
  /** Soonest projected failure horizon, in hours. */
  horizonHours: number | null;
  horizonDriver: string | null;
  horizonBasis: "operating" | "calendar" | null;
  corroborationPercent: number | null;
  technologiesWithData: string[];
  signOffStatus: SignOffStatus;
  signOffEngineer: string | null;
  signOffAt: string | null;
  recommendations: string[];
  diagnosisId: string | null;
  /** Timestamp of the saved diagnosis; drives the malfunction-start field. */
  diagnosisAt?: string | null;
  /** Parts drawn from a saved BOM. Empty means the field is omitted, never guessed. */
  requiredParts?: string[];
}

/**
 * One work-order field: the system's own key, a human label for the field card,
 * and the value from the diagnosis.
 */
export interface CmmsField {
  key: string;
  label: string;
  value: string;
  /** Long prose that needs a textarea rather than a single-line input. */
  multiline?: boolean;
}

/** Priority code per system, indexed by severity. */
const PRIORITY: Record<CmmsTargetId, Record<DiagnosisSeverity, string>> = {
  // SAP priority scale: 1 = very high … 4 = low
  sap: { CRITICAL: "1", ANOMALY: "2", NORMAL: "4" },
  // Maximo WOPRIORITY: 1 = highest … 5 = lowest
  maximo: { CRITICAL: "1", ANOMALY: "3", NORMAL: "5" },
  maintainx: { CRITICAL: "High", ANOMALY: "Medium", NORMAL: "Low" },
  fiix: { CRITICAL: "Critical", ANOMALY: "Medium", NORMAL: "Low" },
  // Oracle EAM priority: 1 = emergency … 5 = routine
  oracle_eam: { CRITICAL: "1", ANOMALY: "3", NORMAL: "5" }
};

/** Work order type / order type per system. */
const WORK_TYPE: Record<CmmsTargetId, Record<DiagnosisSeverity, string>> = {
  sap: { CRITICAL: "PM01", ANOMALY: "PM02", NORMAL: "PM03" },
  maximo: { CRITICAL: "EM", ANOMALY: "CM", NORMAL: "PM" },
  maintainx: { CRITICAL: "Reactive", ANOMALY: "Corrective", NORMAL: "Preventive" },
  fiix: { CRITICAL: "Emergency", ANOMALY: "Corrective", NORMAL: "Preventive" },
  oracle_eam: { CRITICAL: "Emergency", ANOMALY: "Corrective", NORMAL: "Routine" }
};

export function normalizeSeverity(raw?: string | null): DiagnosisSeverity {
  const s = (raw ?? "").toUpperCase();
  if (s.includes("CRITICAL") || s === "HIGH") return "CRITICAL";
  if (s.includes("ANOMALY") || s === "MEDIUM" || s === "WARNING") {
    return "ANOMALY";
  }
  return "NORMAL";
}

/** Human-readable sign-off line embedded in every payload. */
function signOffText(ctx: CmmsPayloadContext): string {
  if (ctx.signOffStatus === "pending") {
    return "PENDING ENGINEER SIGN-OFF - AI recommendation not yet certified";
  }
  const when = ctx.signOffAt
    ? new Date(ctx.signOffAt).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "unknown time";
  const verb = ctx.signOffStatus === "approved" ? "Approved" : "Modified";
  return `${verb} by ${ctx.signOffEngineer || "unnamed engineer"} at ${when}`;
}

function horizonText(ctx: CmmsPayloadContext): string | null {
  if (ctx.horizonHours == null) return null;
  const basis = ctx.horizonBasis === "calendar" ? "calendar" : "operating";
  const driver = ctx.horizonDriver ? `, driven by ${ctx.horizonDriver}` : "";
  return `~${Math.round(ctx.horizonHours).toLocaleString()} ${basis} hours${driver}`;
}

function corroborationText(ctx: CmmsPayloadContext): string {
  if (ctx.corroborationPercent == null) {
    return `Single-domain diagnosis - cross-validation pending (${ctx.technologiesWithData.join(", ") || "no technologies"})`;
  }
  return `${ctx.corroborationPercent}% across ${ctx.technologiesWithData.join(", ")}`;
}

type FieldSpec = [
  key: string,
  label: string,
  value: string | number | null | undefined,
  multiline?: boolean
];

/** Drop fields whose source value was never recorded. */
function fields(specs: FieldSpec[]): CmmsField[] {
  const out: CmmsField[] = [];
  for (const [key, label, value, multiline] of specs) {
    if (value == null || value === "") continue;
    out.push({ key, label, value: String(value), multiline });
  }
  return out;
}

/** Local date-time in the form CMMS malfunction-start fields expect. */
function malfunctionStart(ctx: CmmsPayloadContext): string | null {
  if (!ctx.diagnosisAt) return null;
  const d = new Date(ctx.diagnosisAt);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The work order for the current diagnosis, expressed in one system's field
 * vocabulary. Same values everywhere; only keys, labels and coded values move.
 */
export function buildCmmsFieldList(
  target: CmmsTargetId,
  ctx: CmmsPayloadContext
): CmmsField[] {
  const priority = PRIORITY[target][ctx.severity];
  const workType = WORK_TYPE[target][ctx.severity];
  const description = `${ctx.faultTitle} detected on ${ctx.assetTag} ${ctx.component}`.trim();
  const horizon = horizonText(ctx);
  const confidence =
    ctx.confidencePercent != null ? `${ctx.confidencePercent}%` : null;
  const started = malfunctionStart(ctx);
  const parts = (ctx.requiredParts ?? []).join(" | ");
  const steps = ctx.recommendations.join(" | ");

  switch (target) {
    case "sap":
      return fields([
        ["ORDER_TYPE", "Notification Type", workType],
        ["EQUNR", "Equipment ID", ctx.assetTag],
        ["SHORT_TEXT", "Short Text", description.slice(0, 40)],
        ["MALFUNCTION_START", "Malfunction Start", started],
        ["PRIORITY", "Priority", priority],
        ["MN_WK_CTR", "Main Work Center", "PDM"],
        ["PMACTTYPE", "Maintenance Activity Type", "004"],
        ["USER_STATUS", "User Status", ctx.signOffStatus.toUpperCase()],
        ["DIAGNOSIS_CONFIDENCE", "Diagnosis Confidence", confidence],
        ["HEALTH_SCORE", "Health Score", ctx.healthScore],
        ["FAILURE_HORIZON", "Failure Horizon", horizon],
        ["CORROBORATION", "Corroboration", corroborationText(ctx)],
        ["SIGN_OFF", "Engineer Sign-Off", signOffText(ctx)],
        ["EXTERNAL_ID", "External Reference", ctx.diagnosisId],
        ["REQUIRED_PARTS", "Required Parts", parts],
        ["LONG_TEXT", "Long Text", description, true],
        ["OPERATIONS", "Operations", steps, true]
      ]);

    case "maximo":
      return fields([
        ["WONUM", "Work Order Number", "AUTO"],
        ["WORKTYPE", "Work Type", workType],
        ["ASSETNUM", "Asset Number", ctx.assetTag],
        ["LOCATION", "Location", ctx.component],
        ["REPORTDATE", "Report Date", started],
        ["WOPRIORITY", "Work Order Priority", priority],
        ["FAILURECODE", "Failure Code", ctx.faultTitle],
        ["STATUS", "Status", ctx.signOffStatus === "approved" ? "APPR" : "WAPPR"],
        ["REPORTEDBY", "Reported By", "MOTORMEDIC-PDM"],
        ["DIAGNOSIS_CONFIDENCE", "Diagnosis Confidence", confidence],
        ["HEALTHSCORE", "Health Score", ctx.healthScore],
        ["FAILUREHORIZON", "Failure Horizon", horizon],
        ["CORROBORATION", "Corroboration", corroborationText(ctx)],
        ["SIGNOFF", "Engineer Sign-Off", signOffText(ctx)],
        ["EXTREFID", "External Reference", ctx.diagnosisId],
        ["ITEMNUM", "Required Parts", parts],
        ["DESCRIPTION", "Description", description, true],
        ["WOTASKS", "Work Order Tasks", steps, true]
      ]);

    case "maintainx":
      return fields([
        ["category", "Category", workType],
        ["asset", "Asset", ctx.assetTag],
        ["location", "Location", ctx.component],
        ["title", "Title", description.slice(0, 60)],
        ["dueDate", "Reported At", started],
        ["priority", "Priority", priority],
        ["status", "Status", ctx.signOffStatus === "approved" ? "Open" : "On Hold"],
        ["confidence", "Diagnosis Confidence", confidence],
        ["healthScore", "Health Score", ctx.healthScore],
        ["failureHorizon", "Failure Horizon", horizon],
        ["corroboration", "Corroboration", corroborationText(ctx)],
        ["signOff", "Engineer Sign-Off", signOffText(ctx)],
        ["externalId", "External Reference", ctx.diagnosisId],
        ["partsNeeded", "Parts Needed", parts],
        ["description", "Description", description, true],
        ["procedure", "Procedure", steps, true]
      ]);

    case "fiix":
      return fields([
        ["strCode", "Work Order Code", "AUTO"],
        ["strMaintenanceType", "Maintenance Type", workType],
        ["strAssetCode", "Asset Code", ctx.assetTag],
        ["strLocation", "Location", ctx.component],
        ["dtmDateCreated", "Date Created", started],
        ["strPriority", "Priority", priority],
        ["strStatus", "Status", ctx.signOffStatus === "approved" ? "Open" : "Awaiting Approval"],
        ["strFailureCode", "Failure Code", ctx.faultTitle],
        ["intConfidence", "Diagnosis Confidence", ctx.confidencePercent],
        ["intHealthScore", "Health Score", ctx.healthScore],
        ["strFailureHorizon", "Failure Horizon", horizon],
        ["strCorroboration", "Corroboration", corroborationText(ctx)],
        ["strSignOff", "Engineer Sign-Off", signOffText(ctx)],
        ["strExternalId", "External Reference", ctx.diagnosisId],
        ["strParts", "Required Parts", parts],
        ["strDescription", "Description", description, true],
        ["strTasks", "Tasks", steps, true]
      ]);

    case "oracle_eam":
      return fields([
        ["WORK_ORDER_TYPE", "Work Order Type", workType],
        ["ASSET_NUMBER", "Asset Number", ctx.assetTag],
        ["ASSET_GROUP", "Asset Group", ctx.component],
        ["REPORTED_DATE", "Reported Date", started],
        ["PRIORITY_CODE", "Priority Code", priority],
        [
          "WORK_ORDER_STATUS",
          "Work Order Status",
          ctx.signOffStatus === "approved" ? "Released" : "Unreleased"
        ],
        ["FAILURE_CODE", "Failure Code", ctx.faultTitle],
        ["OWNING_DEPARTMENT", "Owning Department", "RELIABILITY"],
        ["CONFIDENCE_PCT", "Diagnosis Confidence", ctx.confidencePercent],
        ["HEALTH_SCORE", "Health Score", ctx.healthScore],
        ["FAILURE_HORIZON", "Failure Horizon", horizon],
        ["CORROBORATION", "Corroboration", corroborationText(ctx)],
        ["SIGN_OFF", "Engineer Sign-Off", signOffText(ctx)],
        ["SOURCE_REFERENCE", "Source Reference", ctx.diagnosisId],
        ["MATERIAL_LIST", "Required Parts", parts],
        ["DESCRIPTION", "Description", description, true],
        ["OPERATION_STEPS", "Operation Steps", steps, true]
      ]);
  }
}

/** Key/value form of the same field list, for API posting. */
export function buildCmmsPayload(
  target: CmmsTargetId,
  ctx: CmmsPayloadContext
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of buildCmmsFieldList(target, ctx)) {
    out[field.key] = field.value;
  }
  return out;
}
