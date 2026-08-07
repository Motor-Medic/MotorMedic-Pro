/** Client-side routes for the Vite SPA (URL sync without Next.js). */

export type AppTab =
  | "dashboard"
  | "assets"
  | "diagnose"
  | "trends"
  | "sensors"
  | "migration"
  | "analysis"
  | "rca"
  | "fmea"
  | "calendar"
  | "alerts"
  | "history"
  | "admin";

export const TAB_TO_PATH: Record<AppTab, string> = {
  dashboard: "/",
  assets: "/equipment-db",
  diagnose: "/run-diagnostics",
  trends: "/trend-analyzer",
  sensors: "/mounting-planner",
  migration: "/ai-data-migration",
  analysis: "/analysis-reports",
  rca: "/root-cause-analysis",
  fmea: "/fmea-analysis",
  calendar: "/maintenance-calendar",
  alerts: "/alerts-control",
  history: "/diagnosis-logs",
  admin: "/tenant-settings"
};

const PATH_TO_TAB: Record<string, AppTab> = {
  "/": "dashboard",
  "/equipment-db": "assets",
  "/run-diagnostics": "diagnose",
  "/trend-analyzer": "trends",
  "/mounting-planner": "sensors",
  "/ai-data-migration": "migration",
  "/analysis-reports": "analysis",
  "/root-cause-analysis": "rca",
  "/fmea-analysis": "fmea",
  "/maintenance-calendar": "calendar",
  "/alerts-control": "alerts",
  "/diagnosis-logs": "history",
  "/tenant-settings": "admin"
};

export function normalizePath(pathname: string): string {
  if (!pathname || pathname === "") return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function tabFromPath(pathname: string): AppTab | null {
  const path = normalizePath(pathname);
  if (path === "/terms" || path === "/privacy") return null;
  return PATH_TO_TAB[path] ?? null;
}

export function pathFromTab(tab: AppTab): string {
  return TAB_TO_PATH[tab] ?? "/";
}

/** Push a new browser URL (path + optional query) and notify listeners. */
export function navigateApp(pathWithOptionalQuery: string): void {
  const qIndex = pathWithOptionalQuery.indexOf("?");
  const rawPath =
    qIndex >= 0 ? pathWithOptionalQuery.slice(0, qIndex) : pathWithOptionalQuery;
  const query = qIndex >= 0 ? pathWithOptionalQuery.slice(qIndex + 1) : "";
  const nextPath = normalizePath(rawPath);
  const next = query ? `${nextPath}?${query}` : nextPath;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.pushState({}, "", next);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateToTab(tab: AppTab, params?: Record<string, string>): void {
  const base = pathFromTab(tab);
  if (!params) {
    navigateApp(base);
    return;
  }
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") sp.set(key, value);
  }
  const qs = sp.toString();
  navigateApp(qs ? `${base}?${qs}` : base);
}
