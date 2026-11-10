import { EngineError } from "./errors.ts";

/** Cooperative cancellation checked between chunks of work. */
export interface CancelToken {
  readonly cancelled: boolean;
}

export function throwIfCancelled(token?: CancelToken): void {
  if (token?.cancelled) throw new EngineError("cancelled", "Processing was cancelled. Your file has not been changed.");
}

/** Let the event loop breathe (lets cancel messages arrive between chunks). */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
