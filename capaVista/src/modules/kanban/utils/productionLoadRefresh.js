// Refreshes share one request and one pending invalidation. A write holds reads
// until it finishes, so an earlier response cannot overwrite the updated load.
export function createProductionLoadRefresh({ read, onLoad, onError, onPending, onSettled }) {
  let active = true;
  let generation = 0;
  let suspensions = 0;
  let dirty = false;
  let scheduled = false;
  let pending = false;
  let running = null;

  function current(request) {
    return active && request.generation === generation && !request.controller.signal.aborted;
  }

  function settle() {
    if (!active || running || dirty || suspensions || !pending) return;
    pending = false;
    onSettled?.();
  }

  function schedule() {
    if (!active || scheduled || running || suspensions) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!active || running || suspensions || !dirty) return;
      dirty = false;
      pending = true;
      const request = { generation, controller: new AbortController() };
      running = request;
      // Keep the promise private: refreshing after a successful write must not
      // turn a failed read into a rejected mutation or an unhandled rejection.
      void run(request).catch(() => {});
    });
  }

  async function run(request) {
    try {
      onPending?.();
      if (!current(request)) return;
      let value;
      try {
        value = await read({ signal: request.controller.signal });
      } catch (error) {
        if (current(request)) onError?.(error);
        return;
      }
      if (current(request)) onLoad?.(value);
    } finally {
      running = null;
      if (active && dirty) schedule();
      else settle();
    }
  }

  function invalidate() {
    generation += 1;
    dirty = true;
    running?.controller.abort();
  }

  return {
    refresh() {
      if (!active) return;
      invalidate();
      schedule();
    },
    suspend() {
      if (!active) return () => {};
      suspensions += 1;
      invalidate();
      let released = false;
      return () => {
        if (released || !active) return;
        released = true;
        suspensions -= 1;
        invalidate();
        schedule();
      };
    },
    dispose() {
      if (!active) return;
      active = false;
      generation += 1;
      dirty = false;
      running?.controller.abort();
    },
  };
}
