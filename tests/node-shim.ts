// Minimal browser globals so store.ts can be imported under node in tests.
const mem = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
if (!g.localStorage) {
  g.localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
}
if (!g.window) g.window = globalThis;
export {};
