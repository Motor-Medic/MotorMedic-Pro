/**
 * E5 — nav/router module gating.
 *
 * A tab maps to the catalog modules that can justify it (any-of). A tab with
 * no entry is core and always present. The list is derived from the session
 * company's active entitlements; an unpaid module's entry is ABSENT, not
 * merely disabled. Server-side requireModule remains authoritative.
 */
import type { AppTab } from "../navigation";
import { MODULE_KEYS, type ModuleKey } from "./entitlements";

export const TAB_MODULE_REQUIREMENTS: Partial<
  Record<AppTab, readonly ModuleKey[]>
> = {
  diagnose: MODULE_KEYS,
  trends: ["vibration"],
  sensors: ["vibration"],
  "multi-tech": MODULE_KEYS,
  analysis: MODULE_KEYS,
  rca: MODULE_KEYS
};

export function isTabEntitled(
  tab: AppTab,
  activeModules: readonly string[]
): boolean {
  const required = TAB_MODULE_REQUIREMENTS[tab];
  if (!required || required.length === 0) return true;
  return required.some((moduleKey) => activeModules.includes(moduleKey));
}

export function visibleTabs(
  tabs: readonly AppTab[],
  activeModules: readonly string[]
): AppTab[] {
  return tabs.filter((tab) => isTabEntitled(tab, activeModules));
}
