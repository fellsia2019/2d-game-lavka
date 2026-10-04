let nextId = 0;
// Each job has its own worker; termination bounds wall time and cancels all work.
// Generator acceptance depends on node counts, never machine speed.
export function job<T>(request: object): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const id = ++nextId;
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("Проверка заняла слишком долго. Попробуйте ещё раз."));
    }, 12000);
    worker.onmessage = (event) => {
      if (event.data.id !== id) return;
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.value as T);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Не удалось проверить заказ."));
    };
    worker.postMessage({ ...request, id });
  });
}
