/**
 * Event Types — Pure data describing what happened in business operations.
 *
 * Events are past tense (token.reserved, not reserveToken).
 * Events are facts (what happened, not what to do about it).
 * Events are immutable (once created, they don't change).
 *
 * Sinks consume events in separate files. Business logic never logs directly.
 *
 * @typedef {Object} BaseEvent
 * @property {string} type - Event type identifier (dot-separated namespace)
 * @property {Date} timestamp - When the event occurred
 *
 * @typedef {BaseEvent & { tokenId: number, expiry: number, transactionHash: string, mock: boolean }} TokenReservedEvent
 * @typedef {BaseEvent & { tokenId: number, to: string, transactionHash: string, blockNumber: number, imageHash: string, ipfsUri: string, uri: string, licenseType: number, mock: boolean }} TokenMintedEvent
 * @typedef {BaseEvent & { tokenId: number, price: string, licenseType: number, transactionHash: string, mock: boolean }} TokenListedEvent
 * @typedef {BaseEvent & { tokenId: number, licenseType: number, mock: boolean }} TokenDelistedEvent
 * @typedef {BaseEvent & { tokenId: number, mock: boolean }} TokenDelistedAllEvent
 * @typedef {BaseEvent & { tokenId: number, seller: string, buyer: string, price: string, licenseType: number, mock: boolean }} TokenSoldEvent
 * @typedef {BaseEvent & { newTokenId: number, parentTokenId: number, buyer: string, licenseType: number, mock: boolean }} LicenseGrantedEvent
 * @typedef {BaseEvent & { tokenId: number, licenseType: number, licenseTypeName: string, arweaveTxId: string, licenseHash: string }} LicenseCreatedEvent
 * @typedef {BaseEvent & { message: string, method: string }} WatermarkAppliedEvent
 * @typedef {BaseEvent & { progress: string, percent: number }} WatermarkProgressEvent
 * @typedef {BaseEvent & { filename: string, cid: string, uri: string, mock: boolean }} IpfsUploadedEvent
 * @typedef {BaseEvent & { filename: string, uri: string }} IpfsCacheHitEvent
 * @typedef {BaseEvent & { cid: string, existed: boolean, mock: boolean }} IpfsUnpinnedEvent
 * @typedef {BaseEvent & { txId: string, hash: string, contentType: string, mock: boolean }} ArweaveUploadedEvent
* @typedef {BaseEvent & { detected: boolean, message: string, confidence: number, tokenId?: number, wallet?: string }} WatermarkDetectedEvent
 * @typedef {BaseEvent & { generationId: string, prompt: string, style: string, count: number, mock: boolean }} AiGeneratedEvent
 * @typedef {BaseEvent & { cleaned: number }} AiCleanupEvent
 * @typedef {BaseEvent & { mintId: string, wallet: string }} MintStartedEvent
 * @typedef {BaseEvent & { mintId: string, step: string, detail?: string }} MintStepEvent
 * @typedef {BaseEvent & { mintId: string, tokenId: number, transactionHash: string }} MintCompletedEvent
 * @typedef {BaseEvent & { mintId: string, error: string }} MintFailedEvent
 * @typedef {BaseEvent & { detectId: string, wallet: string }} DetectStartedEvent
 * @typedef {BaseEvent & { detectId: string, detected: boolean, tokenId?: number, wallet?: string }} DetectCompletedEvent
 * @typedef {BaseEvent & { detectId: string, error: string }} DetectFailedEvent
 *
 * @typedef {TokenReservedEvent | TokenMintedEvent | TokenListedEvent | TokenDelistedEvent | TokenDelistedAllEvent | TokenSoldEvent | LicenseGrantedEvent | LicenseCreatedEvent | WatermarkAppliedEvent | WatermarkProgressEvent | IpfsUploadedEvent | IpfsCacheHitEvent | IpfsUnpinnedEvent | ArweaveUploadedEvent | WatermarkDetectedEvent | AiGeneratedEvent | AiCleanupEvent | MintStartedEvent | MintStepEvent | MintCompletedEvent | MintFailedEvent | DetectStartedEvent | DetectCompletedEvent | DetectFailedEvent} AppEvent
 */

/**
 * Create a timestamped event
 * @param {string} type
 * @param {Object} data
 * @returns {AppEvent}
 */
function event(type, data = {}) {
  return { type, timestamp: new Date(), ...data };
}

// ── Token lifecycle ──────────────────────────────────────────

function tokenReserved({ tokenId, expiry, transactionHash, mock = false }) {
  return event('token.reserved', { tokenId, expiry, transactionHash, mock });
}

function tokenMinted({ tokenId, to, transactionHash, blockNumber, imageHash, ipfsUri, uri, licenseType, mock = false }) {
  return event('token.minted', { tokenId, to, transactionHash, blockNumber, imageHash, ipfsUri, uri, licenseType, mock });
}

function tokenListed({ tokenId, price, licenseType, transactionHash, mock = false }) {
  return event('token.listed', { tokenId, price, licenseType, transactionHash, mock });
}

function tokenDelisted({ tokenId, licenseType, mock = false }) {
  return event('token.delisted', { tokenId, licenseType, mock });
}

function tokenDelistedAll({ tokenId, mock = false }) {
  return event('token.delisted_all', { tokenId, mock });
}

function tokenSold({ tokenId, seller, buyer, price, licenseType, mock = false }) {
  return event('token.sold', { tokenId, seller, buyer, price, licenseType, mock });
}

function licenseGranted({ newTokenId, parentTokenId, buyer, licenseType, mock = false }) {
  return event('license.granted', { newTokenId, parentTokenId, buyer, licenseType, mock });
}

// ── License documents ────────────────────────────────────────

function licenseCreated({ tokenId, licenseType, licenseTypeName, arweaveTxId, licenseHash }) {
  return event('license.created', { tokenId, licenseType, licenseTypeName, arweaveTxId, licenseHash });
}

// ── Watermark ────────────────────────────────────────────────

function watermarkApplied({ message, method }) {
  return event('watermark.applied', { message, method });
}

function watermarkProgress({ progress, percent }) {
  return event('watermark.progress', { progress, percent });
}

// ── Storage ──────────────────────────────────────────────────

function ipfsUploaded({ filename, cid, uri, mock = false }) {
  return event('ipfs.uploaded', { filename, cid, uri, mock });
}

function ipfsCacheHit({ filename, uri }) {
  return event('ipfs.cache_hit', { filename, uri });
}

function ipfsUnpinned({ cid, existed, mock = false }) {
  return event('ipfs.unpinned', { cid, existed, mock });
}

function arweaveUploaded({ txId, hash, contentType, mock = false }) {
  return event('arweave.uploaded', { txId, hash, contentType, mock });
}

// ── Detection ────────────────────────────────────────────────

function watermarkDetected({ detected, message, confidence, tokenId, wallet }) {
  return event('watermark.detected', { detected, message, confidence, tokenId, wallet });
}

// ── AI Generation ────────────────────────────────────────────

function aiGenerated({ generationId, prompt, style, count, mock = false }) {
  return event('ai.generated', { generationId, prompt, style, count, mock });
}

function aiCleanup({ cleaned }) {
  return event('ai.cleanup', { cleaned });
}

// ── Mint flow (route-level) ──────────────────────────────────

function mintStarted({ mintId, wallet }) {
  return event('mint.started', { mintId, wallet });
}

function mintStep({ mintId, step, detail }) {
  return event('mint.step', { mintId, step, detail });
}

function mintCompleted({ mintId, tokenId, transactionHash }) {
  return event('mint.completed', { mintId, tokenId, transactionHash });
}

function mintFailed({ mintId, error }) {
  return event('mint.failed', { mintId, error });
}

// ── Detection flow (route-level) ─────────────────────────────

function detectStarted({ detectId, wallet }) {
  return event('detect.started', { detectId, wallet });
}

function detectCompleted({ detectId, detected, tokenId, wallet }) {
  return event('detect.completed', { detectId, detected, tokenId, wallet });
}

function detectFailed({ detectId, error }) {
  return event('detect.failed', { detectId, error });
}

// ── Auth ────────────────────────────────────────────────────

function authVerified({ wallet, chainId, mock = false }) {
  return event('auth.verified', { wallet, chainId, mock });
}

function authFailed({ reason, detail }) {
  return event('auth.failed', { reason, detail });
}

module.exports = {
  event,
  // Token lifecycle
  tokenReserved,
  tokenMinted,
  tokenListed,
  tokenDelisted,
  tokenDelistedAll,
  tokenSold,
  licenseGranted,
  // License documents
  licenseCreated,
  // Watermark
  watermarkApplied,
  watermarkProgress,
  // Storage
  ipfsUploaded,
  ipfsCacheHit,
  ipfsUnpinned,
  arweaveUploaded,
  // Detection
  watermarkDetected,
  // AI
  aiGenerated,
  aiCleanup,
  // Mint flow
  mintStarted,
  mintStep,
  mintCompleted,
  mintFailed,
  // Detect flow
  detectStarted,
  detectCompleted,
  detectFailed,
  // Auth
  authVerified,
  authFailed,
};
