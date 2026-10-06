import process from "process";
import { Buffer } from "buffer";

/**
 * The OAuth-discovery half of an MCP resource server, spoken against agendo's own Clerk
 * instance.
 *
 * The plan (docs/mcp-server-plan.md, decision #2) called for `@clerk/mcp-tools`. It is
 * not usable here, for two independent reasons:
 *
 *  - 0.6.0 (current) peer-requires `express ^5` and `@clerk/express ^2`. agendo is on
 *    express 4 and @clerk/express 1, so `npm install` refuses it outright (ERESOLVE).
 *  - 0.3.1, the last release without those peers, ships a *vendored copy* of
 *    @clerk/backend 1.7.12 with its own `clerkClient` singleton — a second Clerk client
 *    resolving tokens independently of the rest of the app.
 *
 * What the package actually provides is the ~60 lines below: derive the Clerk Frontend
 * API origin from the publishable key, emit RFC 9728 protected-resource metadata, and
 * proxy Clerk's authorization-server metadata. Keeping it here costs one small file and
 * removes a dependency conflict. If agendo moves to express 5 + @clerk/express 2, this
 * file can be deleted in favour of `@clerk/mcp-tools/express`.
 */

/**
 * Clerk's Frontend API origin — the OAuth authorization server for this instance.
 *
 * A publishable key is `pk_test_<base64url("fapi.host$")>` / `pk_live_<...>`, so the
 * origin is derivable without a network call. `CLERK_FRONTEND_API_URL` overrides it for
 * instances on a custom domain where the encoded host is not the one clients should use.
 */
export function clerkFrontendApiUrl() {
  const override = process.env.CLERK_FRONTEND_API_URL;
  if (override) {
    return override.replace(/\/+$/, "");
  }

  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error(
      "CLERK_PUBLISHABLE_KEY is required to serve MCP OAuth metadata",
    );
  }

  const encoded = publishableKey
    .replace(/^pk_(test|live)_/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const host = Buffer.from(encoded, "base64")
    .toString("utf8")
    .replace(/\$+$/, "");

  if (!host.includes(".")) {
    throw new Error(
      "could not derive the Clerk frontend API host from CLERK_PUBLISHABLE_KEY; set CLERK_FRONTEND_API_URL",
    );
  }

  return `https://${host}`;
}

/**
 * The public origin this request arrived on.
 *
 * Render terminates TLS at its proxy, so `req.protocol` is `http` there while the client
 * used `https`. The `resource` value in the metadata below and the URL in the
 * `WWW-Authenticate` challenge must match the URL the client actually typed, character
 * for character, or the client rejects the discovery document — so trust the forwarding
 * headers, with `MCP_PUBLIC_URL` as the explicit escape hatch.
 */
export function publicOrigin(req) {
  const override = process.env.MCP_PUBLIC_URL;
  if (override) {
    return override.replace(/\/+$/, "");
  }
  const first = (value) => String(value || "").split(",")[0].trim();
  const proto = first(req.headers["x-forwarded-proto"]) || req.protocol;
  const host = first(req.headers["x-forwarded-host"]) || req.get("host");
  return `${proto}://${host}`;
}

/**
 * The scopes a client must request to use agendo's MCP server — and no more.
 *
 * Declaring this is not cosmetic. A client that is told nothing falls back to the
 * *authorization server's* `scopes_supported`, which for Clerk includes
 * `public_metadata` and `private_metadata`. A correctly-scoped Clerk OAuth app does not
 * grant those, so the authorization request is rejected outright:
 *
 *   "The OAuth 2.0 Client is not allowed to request scope 'public_metadata'"
 *
 * agendo needs identity and nothing else. It resolves the caller by Clerk user id and
 * reads every attribute — role included — from Mongo; reading Clerk metadata for
 * authorization is forbidden (docs/knowledge/clerk-mongo-boundary.md). Requesting those
 * scopes would be asking for access the server must never act on.
 *
 * `offline_access` earns its place: it is what grants a refresh token, so a connection
 * survives without sending the user back through Google every time the access token
 * expires.
 */
export const MCP_REQUIRED_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
];

/** RFC 9728 protected-resource metadata pointing clients at Clerk. */
export function protectedResourceMetadata(resourceUrl) {
  const authServerUrl = clerkFrontendApiUrl();
  return {
    resource: resourceUrl,
    authorization_servers: [authServerUrl],
    scopes_supported: MCP_REQUIRED_SCOPES,
    token_types_supported: ["urn:ietf:params:oauth:token-type:access_token"],
    token_introspection_endpoint: `${authServerUrl}/oauth/token`,
    token_introspection_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    jwks_uri: `${authServerUrl}/.well-known/jwks.json`,
    authorization_data_types_supported: ["oauth_scope"],
    authorization_data_locations_supported: ["header", "body"],
    key_challenges_supported: [
      {
        challenge_type: "urn:ietf:params:oauth:pkce:code_challenge",
        challenge_algs: ["S256"],
      },
    ],
    service_documentation: "https://clerk.com/docs",
  };
}

/**
 * Clerk's own authorization-server metadata, fetched live.
 *
 * Clients that follow the current spec read this from Clerk directly (the
 * `authorization_servers` entry above). It is mirrored on agendo's origin for clients
 * that still look for it next to the resource.
 */
export async function fetchAuthorizationServerMetadata() {
  const response = await fetch(
    `${clerkFrontendApiUrl()}/.well-known/oauth-authorization-server`,
  );
  if (!response.ok) {
    throw new Error(
      `Clerk authorization server metadata returned ${response.status}`,
    );
  }
  return await response.json();
}

/**
 * Loopback callback ports offered to the `mcp-remote` bridge.
 *
 * Clerk matches a redirect URI against `redirect_uris` *exactly* — there is no loopback
 * wildcard, despite RFC 8252 §7.3 recommending one. Two consequences shape this list:
 *
 *  - **Both host spellings are required.** `mcp-remote` defaults its callback host to
 *    `127.0.0.1` on Windows and `localhost` everywhere else, and they are different
 *    strings to an exact matcher. A document listing only one works on half the team's
 *    laptops and fails on the other half with `redirect_uri_mismatch`.
 *  - **More than one port.** `mcp-remote` does not fall back when its callback port is
 *    taken; it exits with `Callback port N is already in use`. That happens as soon as a
 *    second bridge is running for another server. Extra ports let someone edit one digit
 *    in their config instead of waiting on a redeploy and a Clerk metadata refresh.
 *
 * The range stays short on purpose. Every entry is a loopback address, so this is not the
 * part of the design doing security work — any local program can already impersonate a
 * native client (docs/mcp-server-plan.md). It is a usability list, not a trust boundary.
 */
const MCP_CLIENT_CALLBACK_PORTS = [3334, 3335, 3336];

/** The path the client metadata document is served from. */
export const MCP_CLIENT_METADATA_PATH = "/mcp-client.json";

/**
 * A Client ID Metadata Document (CIMD) for the `mcp-remote` bridge.
 *
 * CIMD replaces the client id/secret pair a teammate would otherwise paste into their
 * Claude config: the client's id *is* the HTTPS URL this document is served from, and
 * Clerk fetches it to learn what the client is. Nothing secret is involved, which is the
 * point — a native client cannot keep a secret (RFC 8252 §8.5), so distributing one to
 * every laptop bought no security and a rotation problem.
 *
 * Clerk's requirements, all load-bearing:
 *
 *  - `client_id` must equal the URL Clerk fetched, character for character. It is built
 *    from the request rather than hardcoded so the document stays correct behind Render's
 *    proxy and on any other host this is deployed to.
 *  - `token_endpoint_auth_method` must be `"none"`. Clerk **rejects** a document that
 *    carries a client secret or names a secret-based method — public clients only.
 *  - `redirect_uris` must contain the exact URI the client will use (see above).
 *
 * Admission is still Clerk's call: with "Pre-registered clients only" set, this URL has
 * to be allowlisted in the dashboard before any token is issued. Serving the document is
 * necessary, not sufficient — which is the property we wanted over DCR.
 */
export function clientMetadataDocument(clientIdUrl) {
  const redirectUris = MCP_CLIENT_CALLBACK_PORTS.flatMap((port) => [
    `http://127.0.0.1:${port}/oauth/callback`,
    `http://localhost:${port}/oauth/callback`,
  ]);

  return {
    client_id: clientIdUrl,
    client_name: "agendo (mcp-remote bridge)",
    client_uri: "https://github.com/joaoluizc/agendo",
    application_type: "native",
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: MCP_REQUIRED_SCOPES.join(" "),
    redirect_uris: redirectUris,
  };
}
