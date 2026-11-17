/**
 * DOM Storage binding for the `dom` vitest project.
 *
 * Node 26 ships experimental `localStorage` / `sessionStorage` globals
 * (`localStorage` is `undefined` unless `--localstorage-file` is passed).
 * Vitest's jsdom environment only copies window keys that are absent from
 * `globalThis`, so those Node getters shadow the real jsdom Storage. The
 * harness specs seed and clear DOM storage, so bind the globals back to the
 * jsdom window.
 */
const jsdomWindow = (
  globalThis as typeof globalThis & { jsdom?: { window: Window } }
).jsdom?.window;

if (!jsdomWindow) {
  throw new Error("jsdom DOM Storage setup requires the jsdom environment");
}

for (const key of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    value: jsdomWindow[key],
    writable: true,
  });
}
