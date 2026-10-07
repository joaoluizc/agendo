import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import mcpAuth from "./lib/mcpAuth.js";
import { mcpRoute, publicRoute } from "../middlewares/requirePermission.js";
import { createMcpServer } from "./server.js";
import {
  clientMetadataDocument,
  fetchAuthorizationServerMetadata,
  MCP_CLIENT_METADATA_PATH,
  protectedResourceMetadata,
  publicOrigin,
} from "./lib/clerkOauth.js";

/**
 * Routes for the MCP server (self-contained module — see README.md to remove it).
 *
 * Mounted with `mountMcpRoutes(app)` rather than exported as a plain router, because two
 * of the three routes have to live at the application root: a client discovers this
 * server by fetching `/.well-known/oauth-protected-resource/mcp`, which is not under the
 * `/mcp` mount point.
 *
 * CORS is per-route and deliberately open. agendo's global policy is locked to the Vercel
 * origin, which is right for the web app and wrong here: the discovery documents must be
 * publicly readable, and `WWW-Authenticate` must be exposed or a browser-based client
 * cannot see where to authenticate. `mountMcpRoutes` must therefore be called *before*
 * `app.use(cors(corsOptions))` in app.js — the global policy answers preflights itself,
 * so anything mounted after it never sees an OPTIONS request.
 */

const mcpCors = cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "mcp-protocol-version",
    "mcp-session-id",
    "last-event-id",
  ],
  exposedHeaders: ["WWW-Authenticate", "mcp-session-id", "mcp-protocol-version"],
  maxAge: 86400,
});

/** `/.well-known/oauth-protected-resource[/mcp]` — RFC 9728 discovery. */
function protectedResourceHandler(req, res) {
  try {
    return res.json(protectedResourceMetadata(`${publicOrigin(req)}/mcp`));
  } catch (err) {
    console.error(`[${req.requestId}] - [mcp] protected resource metadata failed: ${err.message}`);
    return res.status(500).json({ error: "metadata unavailable" });
  }
}

/** `/.well-known/oauth-authorization-server` — mirrors Clerk's own document. */
async function authorizationServerHandler(req, res) {
  try {
    return res.json(await fetchAuthorizationServerMetadata());
  } catch (err) {
    console.error(`[${req.requestId}] - [mcp] authorization server metadata failed: ${err.message}`);
    return res.status(502).json({ error: "authorization server metadata unavailable" });
  }
}

/**
 * `/mcp-client.json` — the Client ID Metadata Document for the `mcp-remote` bridge.
 *
 * Fetched by Clerk, not by the user's client: the client sends this URL *as* its
 * client_id, and Clerk resolves it. Public by necessity and by design — it contains no
 * secret, only a description of the bridge and the loopback URIs it may be sent back to.
 *
 * Cached for an hour because Clerk refetches it; the dashboard has an explicit "Refresh
 * metadata" button for when this file changes and the wait is unwelcome.
 */
function clientMetadataHandler(req, res) {
  const document = clientMetadataDocument(
    `${publicOrigin(req)}${MCP_CLIENT_METADATA_PATH}`,
  );
  res.set("Cache-Control", "public, max-age=3600");
  return res.json(document);
}

/**
 * The MCP endpoint itself. Stateless: one server + transport per request.
 *
 * Exported so the protocol layer can be exercised with a caller supplied directly,
 * without minting a Clerk OAuth token first.
 */
export async function mcpHandler(req, res) {
  const server = createMcpServer(req.mcpCaller);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(`[${req.requestId}] - [mcp] request failed: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

export function mountMcpRoutes(app) {
  // Public, unauthenticated — this is how a client finds out it needs a token.
  app.get(
    "/.well-known/oauth-protected-resource/mcp",
    publicRoute,
    mcpCors,
    protectedResourceHandler,
  );
  app.get(
    "/.well-known/oauth-protected-resource",
    publicRoute,
    mcpCors,
    protectedResourceHandler,
  );
  app.get(
    "/.well-known/oauth-authorization-server",
    publicRoute,
    mcpCors,
    authorizationServerHandler,
  );
  app.get(MCP_CLIENT_METADATA_PATH, publicRoute, mcpCors, clientMetadataHandler);

  // Authenticated. `app.all` so GET and DELETE get a protocol-shaped answer from the
  // transport instead of an Express 404.
  app.all("/mcp", mcpRoute, mcpCors, mcpAuth, mcpHandler);

  console.log("[mcp] mounted /mcp and OAuth discovery routes");
}

export default mountMcpRoutes;
