// Shim for @vercel/blob/client which statically imports `undici` for server use.
// In the browser bundle we re-export the platform's native fetch / Request / Headers.
const globalFetch = typeof fetch === "function" ? fetch.bind(globalThis) : null;

if (!globalFetch) {
  throw new Error("undici-web shim requires a global fetch implementation");
}

export { globalFetch as fetch };
export const Request = typeof globalThis.Request !== "undefined" ? globalThis.Request : undefined;
export const Headers = typeof globalThis.Headers !== "undefined" ? globalThis.Headers : undefined;
export const Response = typeof globalThis.Response !== "undefined" ? globalThis.Response : undefined;
export const FormData = typeof globalThis.FormData !== "undefined" ? globalThis.FormData : undefined;
export default { fetch: globalFetch };
