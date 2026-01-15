/**
 * Authentication middleware using Sign-In with Ethereum (SIWE)
 */

const { SiweMessage } = require("siwe");

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing authorization header",
        code: "UNAUTHORIZED",
      });
    }

    const token = authHeader.split(" ")[1];

    // Token format: base64(JSON({ message, signature }))
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(token, "base64").toString());
    } catch {
      return res.status(401).json({
        error: "Invalid token format",
        code: "INVALID_TOKEN",
      });
    }

    const { message, signature } = parsed;

    if (!message || !signature) {
      return res.status(401).json({
        error: "Missing message or signature",
        code: "INVALID_TOKEN",
      });
    }

    // Verify SIWE message
    const siweMessage = new SiweMessage(message);

    // In development mode, allow mock signatures (SHA-256 hash)
    // Production should always verify real signatures
    const isDev = process.env.NODE_ENV !== "production";
    const isMockSignature = signature.length === 66; // 0x + 64 hex chars

    if (isDev && isMockSignature) {
      console.log(
        "DEV MODE: Accepting mock signature for address:",
        siweMessage.address,
      );
    } else {
      const fields = await siweMessage.verify({ signature });

      if (!fields.success) {
        return res.status(401).json({
          error: "Invalid signature",
          code: "INVALID_SIGNATURE",
        });
      }
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

    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(401).json({
      error: "Authentication failed",
      code: "AUTH_FAILED",
    });
  }
}

module.exports = authMiddleware;
