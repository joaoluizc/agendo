import { getAuth } from "@clerk/express";

/**
 * The sign-in gate for agendo's REST API: the request must carry a Clerk **session**
 * token — the browser's `__session` cookie, or the Settings › API Token (a JWT-template
 * session token).
 *
 * This replaces Clerk's `requireAuth()`, which is not safe here. `requireAuth()` (like the
 * global `clerkMiddleware()`) verifies with `acceptsToken: "any"` — hard-coded after your
 * options are spread, so it cannot be narrowed — and an OAuth access token's auth object
 * carries the user's id. So the long-lived token the MCP bridge keeps on each laptop
 * (`~/.mcp-auth`) passed every route that was only behind `requireAuth()`, and the
 * controllers that decide "is this an admin?" from `req.auth.userId` handed an admin's
 * MCP token the admin roster and draft shifts. MCP tokens belong to `/mcp` alone, which
 * checks them itself (`mcp/lib/mcpAuth.js`, `acceptsToken: "oauth_token"`).
 *
 * `adminOnly` and the Performance gate already read `getAuth(req)`, which defaults to
 * session tokens, so this brings the remaining routes to the same rule. Code that needs
 * the caller's id for an authorization decision should read `getAuth(req).userId` too,
 * never `req.auth.userId`: that deprecated property is computed without the token-type
 * filter and answers for any token type.
 *
 * Answers a JSON 401 instead of `requireAuth()`'s 302 redirect, which an API client can
 * only misread.
 */
export default function requireSession(req, res, next) {
  let userId;
  try {
    ({ userId } = getAuth(req, { acceptsToken: "session_token" }));
  } catch (err) {
    // getAuth throws only when clerkMiddleware is missing — a wiring bug, not a caller's.
    console.error(`[${req.requestId}] - session check failed: ${err.message}`);
    return res.status(500).json({ error: "Could not verify session" });
  }

  if (!userId) {
    logRefusedToken(req);
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

/**
 * A valid token of the wrong type (an MCP OAuth token, say) is worth a line: it is either
 * a client that relied on the old behavior or a token used somewhere it shouldn't be.
 * A plain missing session (signed-out browser) is not logged.
 */
function logRefusedToken(req) {
  try {
    const any = getAuth(req, { acceptsToken: "any" });
    if (any?.tokenType && any.tokenType !== "session_token") {
      console.warn(
        `[${req.requestId}] - requireSession refused a ${any.tokenType} for ${any.userId ?? any.subject ?? "unknown"} on ${req.method} ${req.originalUrl}`,
      );
    }
  } catch {
    // Logging only; the 401 stands either way.
  }
}
