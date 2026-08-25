export function createRetryablePromise<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;

  return () => {
    if (!promise) {
      promise = factory().catch((cause) => {
        promise = null;
        throw cause;
      });
    }
    return promise;
  };
}
