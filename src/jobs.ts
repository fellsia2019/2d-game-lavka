let nextId = 0;
// One worker per request. A deadline also terminates the computation itself.
export function job<T>(request: object, timeoutMs = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker?.terminate();
      if (error) reject(error);
      else resolve(value as T);
    };
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      const id = ++nextId;
      timer = setTimeout(
        () =>
          finish(
            new Error(
              "Не удалось завершить проверку вовремя. Помощь не потрачена. Попробуйте ещё раз.",
            ),
          ),
        Math.min(12000, Math.max(1, timeoutMs)),
      );
      worker.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== "object") {
          finish(new Error("Не удалось проверить заказ."));
          return;
        }
        if (data.id !== id) return;
        if (data.error)
          finish(
            new Error(
              typeof data.error === "string"
                ? data.error
                : "Не удалось проверить заказ.",
            ),
          );
        else if (Object.hasOwn(data, "value")) finish(undefined, data.value);
        else finish(new Error("Не удалось проверить заказ."));
      };
      worker.onerror = () => finish(new Error("Не удалось проверить заказ."));
      worker.postMessage({ ...request, id });
    } catch {
      finish(
        new Error(
          "Не удалось запустить проверку заказа. Попробуйте обновить страницу.",
        ),
      );
    }
  });
}
