/**
 * Stdout Sink — Logs dispatched events to console with structured formatting.
 *
 * Register at startup: registerSink(stdoutSink)
 */

/**
 * @param {import('../types').AppEvent} event
 */
function stdoutSink(event) {
  const ts = event.timestamp instanceof Date
    ? event.timestamp.toISOString()
    : new Date().toISOString();
  const { type, timestamp, ...data } = event;
  const detail = Object.keys(data).length > 0
    ? ' ' + JSON.stringify(data)
    : '';
  console.log(`[${ts}] [EVENT] ${type}${detail}`);
}

module.exports = { stdoutSink };
