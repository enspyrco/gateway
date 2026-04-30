/**
 * JSON Log Sink — Structured JSON logging for all dispatched events.
 *
 * Outputs one JSON line per event to stdout, suitable for log aggregation
 * (CloudWatch, Datadog, ELK). Replaces scattered console.log calls.
 */

/**
 * @param {import('../types').AppEvent} event
 */
function jsonLogSink(event) {
  const { type, timestamp, ...data } = event;
  const entry = {
    level: type.includes('failed') || type.includes('error') ? 'error' : 'info',
    type,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : new Date().toISOString(),
    ...data,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports = { jsonLogSink };
