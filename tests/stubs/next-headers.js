// Minimal cookie jar so code that reads/sets cookies can run in tests.
const jar = new Map();
export function cookies() {
  return {
    get: (k) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
    set: (k, v) => { jar.set(k, typeof v === "object" ? v.value : v); },
    delete: (k) => { jar.delete(k); },
  };
}
export function headers() { return new Map([["host", "localhost:3000"]]); }
export const __jar = jar;
