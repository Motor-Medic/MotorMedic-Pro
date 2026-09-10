/**
 * Canonical CMMS Work-Order Bridge — the single source of truth for
 * work-order field generation, system selection, per-field copy, custom
 * template upload, and DB persistence.
 *
 * All pages that render a CMMS data-bridge section import from this file.
 * The implementation lives in ./diagnostics/CmmsPayloadBridge.tsx; this
 * module re-exports it under the canonical name so the import path is
 * stable regardless of internal file organisation.
 */

export { default as CmmsWorkOrderBridge } from "./diagnostics/CmmsPayloadBridge";
export type {
  CmmsPayloadBridgeProps,
} from "./diagnostics/CmmsPayloadBridge";

/* ── Re-export shared types and constants so consumers never need to reach
     into lib/diagnostics/cmmsPayload directly for bridge-related work. ── */
export {
  CMMS_TARGETS,
  buildCmmsFieldList,
  buildCustomCmmsFields,
  type CmmsPayloadContext,
  type CmmsTargetId,
  type CustomCmmsFieldSchema,
  type CustomCmmsTemplate,
  type CmmsField,
  type DiagnosisSeverity,
} from "../lib/diagnostics/cmmsPayload";
