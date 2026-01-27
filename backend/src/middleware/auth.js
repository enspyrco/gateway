/**
 * Authentication middleware using Sign-In with Ethereum (SIWE)
 */

const { SiweMessage } = require("siwe");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    console.log("[AUTH] Checking authorization header...");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[AUTH] Missing or invalid authorization header");
      return res.status(401).json({
        error: "Missing authorization header",
        code: "UNAUTHORIZED",
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("[AUTH] Token length:", token.length);

    // Token format: base64(JSON({ message, signature }))
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(token, "base64").toString());
      console.log("[AUTH] Token decoded successfully");
    } catch (e) {
      console.log("[AUTH] Failed to decode token:", e.message);
      return res.status(401).json({
        error: "Invalid token format",
        code: "INVALID_TOKEN",
      });
    }

    const { message, signature } = parsed;
    console.log("[AUTH] Message preview:", message?.substring(0, 100) + "...");
    console.log("[AUTH] Signature length:", signature?.length);

    if (!message || !signature) {
      console.log("[AUTH] Missing message or signature");
      return res.status(401).json({
        error: "Missing message or signature",
        code: "INVALID_TOKEN",
      });
    }

    // Verify SIWE message
    let siweMessage;
    try {
      siweMessage = new SiweMessage(message);
      console.log("[AUTH] SIWE message parsed, address:", siweMessage.address);
    } catch (e) {
      console.log("[AUTH] Failed to parse SIWE message:", e.message);
      return res.status(401).json({
        error: "Invalid SIWE message format: " + e.message,
        code: "INVALID_TOKEN",
      });
    }

    // In development mode, allow mock signatures (SHA-256 hash)
    // Production should always verify real signatures
    const isDev = process.env.NODE_ENV !== "production";
    const isMockSignature = signature.length === 66; // 0x + 64 hex chars
    console.log("[AUTH] isDev:", isDev, "isMockSignature:", isMockSignature);

    if (isDev && isMockSignature) {
      console.log(
        "[AUTH] DEV MODE: Accepting mock signature for address:",
        siweMessage.address,
      );
    } else {
      console.log("[AUTH] Verifying real signature...");
      const fields = await siweMessage.verify({ signature });

      if (!fields.success) {
        console.log("[AUTH] Signature verification failed");
        return res.status(401).json({
          error: "Invalid signature",
          code: "INVALID_SIGNATURE",
        });
      }
      console.log("[AUTH] Signature verified successfully");
    }

    // Check expiration
    if (siweMessage.expirationTime) {
      const expiration = new Date(siweMessage.expirationTime);
      if (expiration < new Date()) {
        return res.status(401).json({
          error: "Token expired",
          code: "TOKEN_EXPIRED",
        });
      }
    }

    // Attach wallet address to request
    req.wallet = siweMessage.address.toLowerCase();
    req.chainId = siweMessage.chainId;

    console.log("[AUTH] Success! Wallet:", req.wallet, "ChainId:", req.chainId);
    next();
  } catch (error) {
    console.error("[AUTH] Unexpected error:", error.message);
    console.error("[AUTH] Stack:", error.stack);
    return res.status(401).json({
      error: "Authentication failed: " + error.message,
      code: "AUTH_FAILED",
    });
  }
}

module.exports = authMiddleware;
