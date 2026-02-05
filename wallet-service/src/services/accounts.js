const { v4: uuidv4 } = require('uuid');
const { getAccountByAddress, userAccounts } = require('../config/hardhat-accounts');

// In-memory session storage
// Maps sessionId -> { address, privateKey, name, nickname, createdAt }
const sessions = new Map();

// Session TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new session for an account
 * @param {string} address - The account address
 * @returns {{ sessionId: string, account: object }} Session info
 */
function createSession(address) {
  const account = getAccountByAddress(address);
  if (!account) {
    throw new Error(`Account not found for address: ${address}`);
  }

  const sessionId = uuidv4();
  const session = {
    address: account.address,
    privateKey: account.privateKey,
    name: account.name,
    nickname: account.nickname,
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);

  return {
    sessionId,
    account: {
      address: account.address,
      name: account.name,
      nickname: account.nickname,
    },
  };
}

/**
 * Get session by ID
 * @param {string} sessionId - The session ID
 * @returns {object|null} Session info or null if not found/expired
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Check if expired
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Get public session info (without private key)
 * @param {string} sessionId - The session ID
 * @returns {object|null} Public session info
 */
function getPublicSession(sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    return null;
  }

  return {
    address: session.address,
    name: session.name,
    nickname: session.nickname,
  };
}

/**
 * Delete a session
 * @param {string} sessionId - The session ID
 */
function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Get all available user accounts (public info only)
 * @returns {object[]} List of accounts
 */
function getAvailableAccounts() {
  return userAccounts.map((a) => ({
    address: a.address,
    name: a.name,
    nickname: a.nickname,
  }));
}

/**
 * Clean up expired sessions (called periodically)
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  getPublicSession,
  deleteSession,
  getAvailableAccounts,
};
