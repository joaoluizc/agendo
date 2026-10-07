import process from "process";
import { getAuth } from "@clerk/express";
import { resolveUser } from "../../services/authz.js";
import { publicOrigin, MCP_REQUIRED_SCOPES } from "./clerkOauth.js";

/**
 * The MCP perimeter: who is allowed to open a connection at all.
 *
 * Three gates, in order, all failing closed:
 *
 *  1. Clerk must accept the bearer token as an **OAuth** access token
 *     (`acceptsToken: "oauth_token"` — a browser session token is not enough).
 *  2. That Clerk id must resolve to a Mongo user (`services/authz.resolveUser`). This is
 *     also the deprovisioning story: deleting the Mongo user kills MCP access instantly,
 *     independent of Clerk and Google.
 *  3. That user's email must be in an allowed domain.
 *
 * Gate 3 is deliberate belt-and-braces. Access is already limited to Duda accounts by
 * Google itself — Clerk login is Google-only and agendo's Google Cloud OAuth app is
 * "Internal", so Google refuses consent outside Duda's Workspace. But that perimeter is
 * three uncommitted dashboard settings; MCP credentials are long-lived and sit on
 * laptops, so the domain is asserted here in committed code as well.
 */

const DEFAULT_ALLOWED_DOMAINS = "duda.co";

/** Allowed email domains, lowercased. `MCP_ALLOWED_EMAIL_DOMAINS` is comma-separated. */
function allowedDomains() {
  return (process.env.MCP_ALLOWED_EMAIL_DOMAINS || DEFAULT_ALLOWED_DOMAINS)
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function emailDomainAllowed(email) {
  const domain = String(email || "")
    .toLowerCase()
    .split("@")[1];
  if (!domain) {
    return false;
  }
  return allowedDomains().includes(domain);
}

/**
 * 401 with the `WWW-Authenticate` challenge that tells the client where to discover the
 * authorization server. Without this header a client has no way to start the OAuth flow —
 * it just sees a failure.
 *
 * `scope` is included as well as `resource_metadata`. Some clients read the challenge
 * before they fetch the metadata document, and a client left to guess falls back to the
 * authorization server's `scopes_supported` — Clerk's full list, which includes metadata
 * scopes a correctly-scoped OAuth app refuses to issue. Stating the scopes in both places
 * means neither kind of client has to guess.
 */
function unauthorized(req, res, reason) {
  // e.g. https://agendo.example.com/.well-known/oauth-protected-resource/mcp
  const resourcePath = (req.originalUrl || "/mcp").split("?")[0].replace(/\/+$/, "");
  const prmUrl = `${publicOrigin(req)}/.well-known/oauth-protected-resource${resourcePath}`;
  console.warn(`[${req.requestId}] - [mcp] 401: ${reason}`);
  return res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${prmUrl}", scope="${MCP_REQUIRED_SCOPES.join(" ")}"`,
    )
    .json({ error: "unauthorized", error_description: reason });
}

function forbidden(req, res, reason) {
  console.warn(`[${req.requestId}] - [mcp] 403: ${reason}`);
  return res.status(403).json({ error: "forbidden", error_description: reason });
}

/**
 * Express middleware for `/mcp`. On success it attaches:
 *  - `req.mcpCaller` — the resolved caller every tool handler is given.
 *  - `req.auth` — the MCP SDK's `AuthInfo`, which the streamable transport reads and
 *    forwards to tool handlers as `extra.authInfo`.
 */
export default async function mcpAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return unauthorized(req, res, "missing bearer token");
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return unauthorized(req, res, "empty bearer token");
  }

  let authData;
  try {
    authData = getAuth(req, { acceptsToken: "oauth_token" });
  } catch (err) {
    console.error(`[${req.requestId}] - [mcp] token verification failed: ${err.message}`);
    return unauthorized(req, res, "token could not be verified");
  }

  if (!authData?.isAuthenticated || !authData.userId) {
    return unauthorized(req, res, "not a valid Clerk OAuth access token");
  }

  let mongoUser;
  let isAdmin;
  try {
    ({ mongoUser, isAdmin } = await resolveUser(authData.userId));
  } catch (err) {
    console.error(`[${req.requestId}] - [mcp] could not resolve caller: ${err.message}`);
    return res.status(500).json({ error: "could not verify permissions" });
  }

  // Fails closed exactly like the REST permission markers: a Clerk account with no agendo
  // user is nobody.
  if (!mongoUser) {
    return forbidden(
      req,
      res,
      `clerkId ${authData.userId} has no agendo account`,
    );
  }

  if (!emailDomainAllowed(mongoUser.email)) {
    return forbidden(
      req,
      res,
      `${mongoUser.email} is outside the allowed email domain(s)`,
    );
  }

  const caller = {
    clerkId: authData.userId,
    mongoUser,
    isAdmin,
    clientId: authData.clientId || "unknown-client",
    scopes: authData.scopes || [],
    requestId: req.requestId,
  };

  req.mcpCaller = caller;
  // Consumed by StreamableHTTPServerTransport, which passes it to handlers as
  // `extra.authInfo`. Handlers use `req.mcpCaller` instead — they must never make an
  // authorization decision from a raw Clerk id.
  req.auth = {
    token,
    clientId: caller.clientId,
    scopes: caller.scopes,
    extra: { userId: caller.clerkId },
  };

  console.log(
    `[${req.requestId}] - [mcp] authenticated ${mongoUser.email} (${isAdmin ? "admin" : "normal"}) via client ${caller.clientId}`,
  );

  return next();
}
