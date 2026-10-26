import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";
import { createUnit } from "./hierarchyApi";

const explorerSource = readFileSync(
  fileURLToPath(new URL("../components/EquipmentExplorer.tsx", import.meta.url)),
  "utf8"
);
const modalSource = readFileSync(
  fileURLToPath(new URL("../components/CreateComponentModal.tsx", import.meta.url)),
  "utf8"
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** A fetch response that only resolves after the given delay (slow DB wake). */
function slowResponse(
  delayMs: number,
  body: unknown,
  status = 200
): Promise<Response> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
      } as Response);
    }, delayMs);
  });
}

describe("MICRO-FIX double-submit guard on hierarchy writes", () => {
  it("a slow hierarchyApi create issues exactly one POST when save is clicked twice", async () => {
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, _init?: RequestInit) =>
        slowResponse(25, { id: 101, plant_id: 1, name: "Pump House" })
    );
    globalThis.fetch = fetchMock;

    const guard = createSingleFlight();
    // Mirrors the Explorer/toolbar save handler: every click goes through the
    // same latch before it can call hierarchyApi.
    const clickSave = () => guard.run(() => createUnit(1, "Pump House"));

    const firstClick = clickSave();
    const secondClick = clickSave();
    const [first, second] = await Promise.all([firstClick, secondClick]);

    expect(first.started).toBe(true);
    expect(second.started).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/units");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(guard.pending).toBe(false);
  });

  it("re-enables after a failed save, surfaces the error, and allows one retry", async () => {
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, _init?: RequestInit) =>
        slowResponse(25, { error: "DB unavailable" }, 503)
    );
    globalThis.fetch = fetchMock;

    const guard = createSingleFlight();
    let errorMessage = "";
    const clickSave = () =>
      guard
        .run(() => createUnit(1, "Pump House"))
        .catch((err: unknown) => {
          errorMessage = err instanceof Error ? err.message : String(err);
        });

    const firstClick = clickSave();
    const secondClick = clickSave();
    await Promise.all([firstClick, secondClick]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errorMessage).toBe("DB unavailable");
    expect(guard.pending).toBe(false);

    fetchMock.mockImplementationOnce(() =>
      slowResponse(0, { id: 102, plant_id: 1, name: "Pump House" })
    );
    const retry = await guard.run(() => createUnit(1, "Pump House"));
    expect(retry.started).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("MICRO-FIX every hierarchy dialog is wired to the latch", () => {
  it("save, update, quick-add, rename and delete all run through a single-flight guard", () => {
    expect(explorerSource).toContain("const saveGuard = useSingleFlight();");
    expect(explorerSource).toContain("const deleteGuard = useSingleFlight();");
    expect(explorerSource).toContain("const renameGuard = useSingleFlight();");

    const guardedRuns =
      explorerSource.match(/await saveGuard\.run\(/g) ?? [];
    expect(guardedRuns).toHaveLength(3);
    expect(explorerSource).toContain("saveGuard.run(saveNode)");
    expect(explorerSource).toContain("saveGuard.run(updateNode)");
    expect(explorerSource).toContain(
      "saveGuard.run(() => saveQuickAddNode(displayName))"
    );
    expect(explorerSource).toContain("await deleteGuard.run(async () => {");
    expect(explorerSource).toContain("await renameGuard.run(async () => {");
  });

  it("buttons disable, show honest pending copy, and render failure copy", () => {
    expect(
      explorerSource.match(/disabled=\{saveGuard\.pending\}/g) ?? []
    ).toHaveLength(2); // right-panel save + Quick Add save
    expect(explorerSource).toContain(
      "disabled={deleteGuard.pending}"
    );
    expect(explorerSource).toContain(
      "disabled={renameGuard.pending}"
    );
    expect(explorerSource).toContain("Saving...");
    expect(explorerSource).toContain("Deleting...");
    expect(explorerSource).toContain('Failed to save hierarchy node.');
    expect(explorerSource).toContain(
      'Failed to delete hierarchy node.'
    );
    expect(explorerSource).toContain('Failed to rename plant.');
  });

  it("CreateComponentModal guards its save and waits for the async parent write", () => {
    expect(modalSource).toContain(
      "const saveGuard = useSingleFlight();"
    );
    expect(modalSource).toContain("await saveGuard.run(async () => {");
    expect(modalSource).toContain("await onSave({");
    expect(modalSource).toContain("disabled={saveGuard.pending}");
    expect(modalSource).toContain("Saving...");
    expect(modalSource).toContain("Failed to save component.");
    expect(modalSource).toContain("{error && (");
  });
});
