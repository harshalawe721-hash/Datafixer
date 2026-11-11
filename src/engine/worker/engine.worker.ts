/// <reference lib="webworker" />
/**
 * Engine Web Worker. All parsing, inspection and querying happens here so the
 * page stays responsive. Makes no network requests.
 *
 * Cancellation: the page terminates this worker (instant, frees all memory);
 * the cooperative token below additionally stops work between chunks.
 */
import { EngineCore } from "../core.ts";
import { toSerializedError } from "../errors.ts";
import type { EngineRequest, EngineResponse } from "../protocol.ts";
import type { ProgressEvent } from "../types.ts";

declare const self: DedicatedWorkerGlobalScope;

const core = new EngineCore();
const token = { cancelled: false };

function post(msg: EngineResponse) {
  self.postMessage(msg);
}

// Assigned after imports so nothing a library installed can handle our messages.
self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const req = event.data;
  // Throttle progress messages to ~10 per second.
  let lastProgress = 0;
  const onProgress = (progress: ProgressEvent) => {
    const now = Date.now();
    if (now - lastProgress < 100 && progress.loaded !== progress.total) return;
    lastProgress = now;
    post({ id: req.id, type: "progress", progress });
  };
  try {
    let result: unknown;
    switch (req.type) {
      case "open":
        result = await core.open(req.file, req.format, req.options ?? {}, onProgress, token);
        break;
      case "loadSheet":
        result = await core.loadSheet(req.sheet, onProgress, token);
        break;
      case "scan":
        result = await core.scan(req.sheet, req.options, onProgress, token);
        break;
      case "getRows":
        result = core.getRows(req.sheet, req.query);
        break;
      case "close":
        core.close();
        result = null;
        break;
    }
    post({ id: req.id, type: "result", result });
  } catch (err) {
    post({ id: req.id, type: "error", error: toSerializedError(err) });
  }
};
