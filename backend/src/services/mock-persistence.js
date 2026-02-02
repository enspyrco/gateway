/**
 * Mock Persistence Layer
 * Saves mock service data to disk so it survives restarts
 */

const fs = require('fs');
const path = require('path');

const PERSISTENCE_DIR = process.env.MOCK_PERSISTENCE_DIR || path.join(__dirname, '..', '..', '.mock-data');

// Ensure persistence directory exists
if (!fs.existsSync(PERSISTENCE_DIR)) {
  fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
  console.log(`[Persistence] Created mock data directory: ${PERSISTENCE_DIR}`);
}

/**
 * Save a Map to disk as JSON
 * For Maps with Buffer values, converts to base64
 */
function saveMap(name, map) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);
  const data = {};

  for (const [key, value] of map.entries()) {
    if (Buffer.isBuffer(value)) {
      data[key] = { _type: 'buffer', data: value.toString('base64') };
    } else if (value instanceof Date) {
      data[key] = { _type: 'date', data: value.toISOString() };
    } else {
      data[key] = value;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[Persistence] Saved ${map.size} entries to ${name}.json`);
}

/**
 * Load a Map from disk
 */
function loadMap(name) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);
  const map = new Map();

  if (!fs.existsSync(filePath)) {
    console.log(`[Persistence] No existing data for ${name}`);
    return map;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const [key, value] of Object.entries(data)) {
      if (value && value._type === 'buffer') {
        map.set(key, Buffer.from(value.data, 'base64'));
      } else if (value && value._type === 'date') {
        map.set(key, new Date(value.data));
      } else {
        map.set(key, value);
      }
    }

    console.log(`[Persistence] Loaded ${map.size} entries from ${name}.json`);
  } catch (e) {
    console.warn(`[Persistence] Failed to load ${name}.json:`, e.message);
  }

  return map;
}

/**
 * Save an array to disk
 */
function saveArray(name, array) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(array, null, 2));
  console.log(`[Persistence] Saved ${array.length} entries to ${name}.json`);
}

/**
 * Load an array from disk
 */
function loadArray(name) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`[Persistence] No existing data for ${name}`);
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`[Persistence] Loaded ${data.length} entries from ${name}.json`);
    return data;
  } catch (e) {
    console.warn(`[Persistence] Failed to load ${name}.json:`, e.message);
    return [];
  }
}

/**
 * Save a single value to disk
 */
function saveValue(name, value) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ value }, null, 2));
}

/**
 * Load a single value from disk
 */
function loadValue(name, defaultValue) {
  const filePath = path.join(PERSISTENCE_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data.value;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Clear all persisted mock data
 */
function clearAll() {
  const files = fs.readdirSync(PERSISTENCE_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(PERSISTENCE_DIR, file));
    }
  }
  console.log(`[Persistence] Cleared all mock data`);
}

/**
 * Get persistence directory path
 */
function getDir() {
  return PERSISTENCE_DIR;
}

module.exports = {
  saveMap,
  loadMap,
  saveArray,
  loadArray,
  saveValue,
  loadValue,
  clearAll,
  getDir,
};
