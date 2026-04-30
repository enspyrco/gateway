/**
 * Event Dispatch — Fans events to registered sinks.
 *
 * Sinks are registered externally (by test capture, logging dashboard, etc.).
 * The sinks array starts empty. Other code adds sinks as needed:
 * - Test capture sinks record events for assertions
 * - Production sinks route to stdout, audit logs, metrics
 *
 * This is comonoid extraction: comultiplication fans one event to many sinks,
 * counit extracts a value from each copy.
 */

/** @typedef {import('./types').AppEvent} AppEvent */

/** @type {Array<(event: AppEvent) => void | Promise<void>>} */
const sinks = [];

/**
 * Register a sink to receive all dispatched events.
 * @param {(event: AppEvent) => void | Promise<void>} sink
 */
function registerSink(sink) {
  sinks.push(sink);
}

/**
 * Remove a previously registered sink.
 * @param {(event: AppEvent) => void | Promise<void>} sink
 */
function removeSink(sink) {
  const index = sinks.indexOf(sink);
  if (index !== -1) {
    sinks.splice(index, 1);
  }
}

/**
 * Remove all registered sinks.
 */
function clearSinks() {
  sinks.length = 0;
}

/**
 * Dispatch events to all registered sinks.
 * @param {AppEvent[]} events
 */
async function dispatch(events) {
  for (const event of events) {
    for (const sink of sinks) {
      try {
        await sink(event);
      } catch (error) {
        // Sink failure must not break the caller, but log for observability.
        console.error('[dispatch] Sink error:', error);
      }
    }
  }
}

/**
 * Get the current number of registered sinks (for testing).
 * @returns {number}
 */
function sinkCount() {
  return sinks.length;
}

module.exports = {
  registerSink,
  removeSink,
  clearSinks,
  dispatch,
  sinkCount,
};
