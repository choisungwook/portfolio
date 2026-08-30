'use strict';

(function () {

/** Run requests concurrently, but let only the newest one change page state. */
function createLatestRequest() {
  let generation = 0;

  return async function latest(start, onSuccess, onFailure) {
    const token = (generation += 1);
    let value;
    try {
      value = await start();
    } catch (error) {
      if (token !== generation) return false;
      await onFailure(error, () => token === generation);
      return token === generation;
    }
    if (token !== generation) return false;
    await onSuccess(value, () => token === generation);
    return token === generation;
  };
}

/** Persist optimistic values, restoring the last confirmed value on failure. */
function createLatestPersistence(options) {
  const latest = createLatestRequest();

  return function persist(requested, callbacks = {}) {
    if (options.optimistic) options.optimistic(requested);
    return latest(
      () => options.save(requested),
      async (value, isCurrent) => {
        await options.confirm(value);
        if (!isCurrent()) return;
        if (callbacks.confirm) await callbacks.confirm(value);
      },
      async (error, isCurrent) => {
        let confirmed = options.confirmed();
        if (options.recover) {
          try {
            confirmed = await options.recover();
          } catch (_recoveryError) {
            // Keep the last local checkpoint when the confirmation read also
            // fails; the original save error remains the useful one to show.
          }
        }
        if (!isCurrent()) return;
        await options.restore(confirmed);
        if (!isCurrent()) return;
        if (callbacks.fail) await callbacks.fail(error);
        else if (options.fail) await options.fail(error);
      },
    );
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createLatestRequest, createLatestPersistence };
} else {
  globalThis.latestLib = { createLatestRequest, createLatestPersistence };
}
})();
