import { test } from "node:test";
import assert from "node:assert/strict";
import { job } from "../src/jobs";
test("Worker is terminated on success, error, deadline, malformed response and postMessage failure", async () => {
  const original = globalThis.Worker;
  for (const mode of ["success", "error", "timeout", "malformed", "throw"]) {
    let terminated = 0;
    class FakeWorker {
      onmessage: ((e: any) => void) | null = null;
      onerror: (() => void) | null = null;
      terminate() {
        terminated++;
      }
      postMessage(req: any) {
        if (mode === "throw") throw new Error();
        if (mode === "timeout") return;
        queueMicrotask(() => {
          if (mode === "error") this.onerror?.();
          else
            this.onmessage?.({
              data: mode === "malformed" ? null : { id: req.id, value: 42 },
            });
        });
      }
    }
    globalThis.Worker = FakeWorker as any;
    try {
      if (mode === "success") assert.equal(await job({ kind: "test" }, 15), 42);
      else await assert.rejects(job({ kind: "test" }, 15));
      assert.equal(terminated, 1);
    } finally {
      globalThis.Worker = original;
    }
  }
});
