/// <reference lib="webworker" />
/**
 * Generates synthetic CSV data for the diagnostics page. No user data is
 * involved; the result is a Blob built from chunks (never one huge string).
 */
declare const self: DedicatedWorkerGlobalScope;
export {};

const words = ["alpha", "bravo", "delta", "echo", "kilo", "lima", "oscar", "papa", "Zürich", "café"];

self.onmessage = (e: MessageEvent<{ bytes: number }>) => {
  const target = e.data.bytes;
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [enc.encode("id,name,email,city,amount,date\n")];
  let size = parts[0]!.length;
  let i = 0;
  while (size < target) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      lines.push(
        `${i},${words[i % words.length]} ${Math.floor(rnd() * 1e6)},user${Math.floor(rnd() * 1e7)}@example.com,City ${i % 500},${(rnd() * 1e5).toFixed(2)},2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}\n`,
      );
    }
    const chunk = enc.encode(lines.join(""));
    parts.push(chunk);
    size += chunk.length;
    self.postMessage({ type: "progress", loaded: size, total: target });
  }
  self.postMessage({ type: "done", blob: new Blob(parts as BlobPart[], { type: "text/csv" }), rows: i });
};
