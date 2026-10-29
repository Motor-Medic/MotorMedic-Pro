import { afterEach, describe, expect, it, vi } from "vitest";
import { createUnit, deleteHierarchyNode } from "./hierarchyApi";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function response(
  body: unknown,
  status = 200,
  contentLength?: string
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length" ? contentLength ?? null : null
    },
    json: async () => body
  } as unknown as Response;
}

describe("apiJson empty-body and cached responses", () => {
  it("does not throw on a cached 304 response and bypasses browser cache", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        response({}, 304)
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(deleteHierarchyNode("unit", 1)).resolves.toBeUndefined();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
  });

  it("does not throw on a 204 response", async () => {
    globalThis.fetch = vi.fn(async () =>
      response(null, 204)
    ) as unknown as typeof fetch;

    await expect(deleteHierarchyNode("route", 2)).resolves.toBeUndefined();
  });

  it("does not parse a 200 response with content-length 0", async () => {
    const fetchMock = vi.fn(async () => response(null, 200, "0"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(deleteHierarchyNode("asset", 3)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still throws on a genuine 500 with the server message", async () => {
    globalThis.fetch = vi.fn(async () =>
      response({ error: "DB unavailable" }, 500)
    ) as unknown as typeof fetch;

    await expect(deleteHierarchyNode("unit", 1)).rejects.toThrow(
      "DB unavailable"
    );
  });

  it("still parses a normal 200 JSON body when content-length is absent", async () => {
    globalThis.fetch = vi.fn(async () =>
      response({ id: 101, plant_id: 1, name: "Pump House" })
    ) as unknown as typeof fetch;

    const created = await createUnit(1, "Pump House");
    expect(created.id).toBe(101);
    expect(created.name).toBe("Pump House");
  });
});
