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

/** RFC 9728 protected-resource metadata pointing clients at Clerk. */
export function protectedResourceMetadata(resourceUrl) {
  const authServerUrl = clerkFrontendApiUrl();
  return {
    resource: resourceUrl,
    authorization_servers: [authServerUrl],
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
