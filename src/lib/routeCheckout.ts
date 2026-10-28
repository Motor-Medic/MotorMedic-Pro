/**
 * ROUTE-CHECKOUT - pure state and permission helpers for the work queue.
 *
 * The small state model is deliberately closed:
 *   unassigned (no open row) -> checked_out -> checked_in -> closed
 *
 * Permission rule reuses the existing RBAC ordering in src/lib/auth/rbac.ts:
 * the analyst who checked the route out may check it back in, and a tenant
 * admin (reliability-manager or system-admin) may also manage it. The tenant
 * provisioner creates the tenant's admin as 'reliability-manager'
 * (src/lib/tenantProvisioning.ts:118), so roleAtLeast(..., "reliability-manager")
 * is the existing admin bar rather than a new role vocabulary.
 *
 * Every row here is expected to have already been filtered by the session
 * tenant; the grouping helpers re-check tenant_id so a future read regression
 * cannot merge another tenant's queue into this one.
 */
import { normalizeRole, roleAtLeast } from "./auth/rbac";

export const ROUTE_ASSIGNMENT_STATUSES = [
  "checked_out",
  "checked_in",
  "closed"
] as const;

export type RouteAssignmentStatus = (typeof ROUTE_ASSIGNMENT_STATUSES)[number];

export interface RouteAssignmentRow {
  id: number;
  tenant_id: number;
  route_id: number;
  assigned_to?: number | null;
  status: RouteAssignmentStatus;
  checked_out_at?: string | Date | null;
  checked_in_at?: string | Date | null;
  closed_at?: string | Date | null;
  notes?: string | null;
  assigned_analyst_name?: string | null;
}

export interface RouteQueueRouteRow {
  id: number;
  name: string;
  plant_id?: number | null;
  plant_name?: string | null;
  is_system?: boolean | null;
}

export type RouteQueueState = RouteAssignmentStatus | "unassigned";

export interface RouteQueueItem {
  assignment_id: number | null;
  route_id: number;
  route_name: string;
  plant_id: number | null;
  plant_name: string | null;
  state: RouteQueueState;
  assigned_to: number | null;
  assigned_analyst_name: string | null;
  checked_out_at: string | null;
  checked_in_at: string | null;
  closed_at: string | null;
  notes: string | null;
}

export interface RouteQueue {
  tenantId: number;
  active: RouteQueueItem[];
  awaitingReview: RouteQueueItem[];
  closed: RouteQueueItem[];
  unassigned: RouteQueueItem[];
  counts: {
    active: number;
    awaitingReview: number;
    closed: number;
    unassigned: number;
  };
  empty: boolean;
}

function numericTenant(tenantId: number | null | undefined): number {
  const numeric = tenantId == null ? NaN : Number(tenantId);
  return Number.isFinite(numeric) ? numeric : -1;
}

function iso(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function sortNewestFirst(
  items: RouteQueueItem[],
  field: "checked_out_at" | "checked_in_at" | "closed_at"
): RouteQueueItem[] {
  return items
    .slice()
    .sort((a, b) => {
      const delta = timeValue(b[field]) - timeValue(a[field]);
      if (delta !== 0) return delta;
      return (b.assignment_id ?? 0) - (a.assignment_id ?? 0);
    });
}

function queueItem(
  route: RouteQueueRouteRow,
  assignment: RouteAssignmentRow | null,
  state: RouteQueueState
): RouteQueueItem {
  return {
    assignment_id: assignment ? Number(assignment.id) : null,
    route_id: Number(route.id),
    route_name: String(route.name ?? ""),
    plant_id: route.plant_id == null ? null : Number(route.plant_id),
    plant_name: route.plant_name == null ? null : String(route.plant_name),
    state,
    assigned_to:
      assignment?.assigned_to == null ? null : Number(assignment.assigned_to),
    assigned_analyst_name:
      assignment?.assigned_analyst_name == null
        ? null
        : String(assignment.assigned_analyst_name),
    checked_out_at: iso(assignment?.checked_out_at),
    checked_in_at: iso(assignment?.checked_in_at),
    closed_at: iso(assignment?.closed_at),
    notes: assignment?.notes == null ? null : String(assignment.notes)
  };
}

/**
 * Group tenant routes + assignments into the four queue tabs.
 *
 * "unassigned" means the route has no OPEN row (checked_out / checked_in).
 * A closed pass is history, so the route is available for a new pass. The
 * partial unique index still guarantees only one checked_out row at a time.
 */
export function buildRouteQueue(input: {
  tenantId: number | null | undefined;
  routes: RouteQueueRouteRow[];
  assignments: RouteAssignmentRow[];
}): RouteQueue {
  const tenantId = numericTenant(input.tenantId);
  const emptyCounts = {
    active: 0,
    awaitingReview: 0,
    closed: 0,
    unassigned: 0
  };
  if (tenantId < 0) {
    return {
      tenantId,
      active: [],
      awaitingReview: [],
      closed: [],
      unassigned: [],
      counts: emptyCounts,
      empty: true
    };
  }

  const routes = input.routes.filter((route) => route != null);
  const routeById = new Map<number, RouteQueueRouteRow>();
  for (const route of routes) routeById.set(Number(route.id), route);

  const tenantAssignments = input.assignments.filter(
    (assignment) => Number(assignment.tenant_id) === tenantId
  );

  const openByRoute = new Map<number, RouteAssignmentRow>();
  for (const assignment of tenantAssignments) {
    if (
      assignment.status !== "checked_out" &&
      assignment.status !== "checked_in"
    ) {
      continue;
    }
    const routeId = Number(assignment.route_id);
    const current = openByRoute.get(routeId);
    if (!current || Number(assignment.id) > Number(current.id)) {
      openByRoute.set(routeId, assignment);
    }
  }

  const active: RouteQueueItem[] = [];
  const awaitingReview: RouteQueueItem[] = [];
  const closed: RouteQueueItem[] = [];

  for (const assignment of tenantAssignments) {
    const route = routeById.get(Number(assignment.route_id));
    if (!route) continue;
    if (assignment.status === "checked_out") {
      active.push(queueItem(route, assignment, "checked_out"));
    } else if (assignment.status === "checked_in") {
      awaitingReview.push(queueItem(route, assignment, "checked_in"));
    } else if (assignment.status === "closed") {
      closed.push(queueItem(route, assignment, "closed"));
    }
  }

  const unassigned: RouteQueueItem[] = routes
    .filter((route) => {
      if (route.is_system === true) return false;
      return !openByRoute.has(Number(route.id));
    })
    .map((route) => queueItem(route, null, "unassigned"))
    .sort((a, b) => a.route_name.localeCompare(b.route_name));

  const sortedActive = sortNewestFirst(active, "checked_out_at");
  const sortedAwaiting = sortNewestFirst(awaitingReview, "checked_in_at");
  const sortedClosed = sortNewestFirst(closed, "closed_at");

  return {
    tenantId,
    active: sortedActive,
    awaitingReview: sortedAwaiting,
    closed: sortedClosed,
    unassigned,
    counts: {
      active: sortedActive.length,
      awaitingReview: sortedAwaiting.length,
      closed: sortedClosed.length,
      unassigned: unassigned.length
    },
    empty:
      sortedActive.length === 0 &&
      sortedAwaiting.length === 0 &&
      sortedClosed.length === 0 &&
      unassigned.length === 0
  };
}

/** Tenant admin = the existing reliability-manager bar in the RBAC ladder. */
export function isTenantAdminRole(role: unknown): boolean {
  return roleAtLeast(normalizeRole(role), "reliability-manager");
}

/**
 * Check-in / close are allowed for the analyst who checked the route out and
 * for a tenant admin. Anyone else gets 403 at the API layer.
 */
export function canManageRouteAssignment(input: {
  assignedTo: number | null | undefined;
  userId: number | null | undefined;
  role: unknown;
}): boolean {
  const userId = input.userId == null ? NaN : Number(input.userId);
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const assignedTo =
    input.assignedTo == null ? NaN : Number(input.assignedTo);
  if (Number.isInteger(assignedTo) && assignedTo === userId) return true;
  return isTenantAdminRole(input.role);
}

export function canCheckInAssignment(status: RouteAssignmentStatus): boolean {
  return status === "checked_out";
}

export function canCloseAssignment(status: RouteAssignmentStatus): boolean {
  return status === "checked_in";
}
