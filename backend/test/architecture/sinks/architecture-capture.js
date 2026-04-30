/**
 * Capture Sink for Architecture Contract Tests
 *
 * Records all dispatched events for test assertions.
 * Optionally flushes to JSONL files in tests/logs/architecture/.
 */

const { writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const LOG_DIR = join(__dirname, '../../logs/architecture');

function createArchitectureCaptureSink(testName) {
  const captured = [];
  const sink = (event) => { captured.push(event); };
  const flush = () => {
    mkdirSync(LOG_DIR, { recursive: true });
    const safe = testName.replace(/\W+/g, '-');
    const path = join(LOG_DIR, `${safe}-${Date.now()}.jsonl`);
    writeFileSync(path, captured.map(e => JSON.stringify(e)).join('\n') + '\n');
    return path;
  };
  const clear = () => { captured.length = 0; };
  return { sink, flush, clear, captured };
}

module.exports = { createArchitectureCaptureSink };
