import { decide, levelOf, parseRequirement } from "../../permissions/evaluate.js";
import { PERMISSION_AREAS } from "../../permissions/registry.js";

/**
 * The only way a tool gets registered on agendo's MCP server.
 *
 * Unlike an Express router there is no mount point that covers every tool by default, so
 * a forgotten guard would be a silent hole rather than a visible one. `requires` is
 * therefore mandatory and validated at registration time: a tool that does not state what
 * it needs fails to load the server at all. It takes the same requirements as the REST
 * route markers (permissions/evaluate.js): "signedIn", "admin", or "<area>:<level>"
 * — e.g. "scheduling:edit". MCP grants exactly what the web app grants.
 *
 * Enforcement, deliberately in two places:
 *  - **Visibility** — a tool the caller can't use is not registered, so it never appears in
 *    `tools/list`. (The server is built per request, from the caller resolved from Mongo
 *    on that request — see server.js — so a permission change shows on the client's next
 *    `tools/list`, with no reinstall or re-login.)
 *  - **Execution** — the wrapper re-checks on every call. Redundant today, and kept that
 *    way: the day someone registers tools before resolving the caller, this still holds.
 *
 * **A stale client list.** Clients cache `tools/list`, so someone whose access was just
 * revoked may still call a tool they no longer have. Rather than the SDK's bare "Tool X
 * not found", a request that calls such a tool gets a one-request stub under the same
 * name that explains what is needed. It only exists on that `tools/call` request
 * (`caller.toolCallNames`), so it never shows up in a listing.
 */

/** The caller kinds a tool may require. Public/webhook/mcp are route-only declarations. */
const TOOL_REQUIREMENT_KINDS = new Set(["signedIn", "admin", "level"]);

/** A tool result that reads as an error to the client rather than crashing the call. */
function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

/** "Scheduling: edit" from "scheduling:edit"; "admin" stays "agendo admin". */
export function describeRequirement(requires) {
  if (requires === "admin") return "agendo admin";
  if (requires === "signedIn") return "an agendo account";
  const [area, level] = requires.split(":");
  return `${PERMISSION_AREAS[area]?.label ?? area}: ${level}`;
}

/** Why `caller` can't use a tool needing `requires`, phrased for the person and their LLM. */
export function refusalText(name, requires, parsed, caller) {
  const who = caller?.mongoUser?.email ?? "this account";
  const have =
    parsed.kind === "level"
      ? `you have ${describeRequirement(`${parsed.area}:${levelOf(caller, parsed.area)}`)}`
      : `${who} is not an admin`;
  return (
    `"${name}" needs ${describeRequirement(requires)} — ${have}. ` +
    `An agendo admin can change access in Settings → Users. ` +
    `If access was just granted, restart or refresh your MCP client so its tool list updates.`
  );
}

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{clerkId: string, mongoUser: object, isAdmin: boolean, clientId: string,
 *   requestId: string, toolCallNames?: string[]}} caller
 * @param {{
 *   name: string,
 *   requires: string,
 *   description: string,
 *   title?: string,
 *   inputSchema?: object,
 *   annotations?: object,
 *   handler: (args: object, caller: object) => Promise<object>,
 * }} definition
 */
export function registerTool(server, caller, definition) {
  const { name, requires, title, description, inputSchema, annotations, handler } =
    definition;

  if (!name) {
    throw new Error("registerTool: every tool needs a name");
  }
  if (!requires) {
    throw new Error(
      `registerTool: tool "${name}" must declare requires: "signedIn", "admin" or "<area>:<level>"`,
    );
  }
  // Throws on an unknown area or level — a typo fails the server load, not a call.
  const parsed = parseRequirement(requires);
  if (!TOOL_REQUIREMENT_KINDS.has(parsed.kind)) {
    throw new Error(
      `registerTool: tool "${name}" requires "${requires}", which is for routes only — use "signedIn", "admin" or "<area>:<level>"`,
    );
  }
  if (typeof handler !== "function") {
    throw new Error(`registerTool: tool "${name}" needs a handler function`);
  }

  if (!decide(caller, parsed).allowed) {
    // Hidden from listing, not just refused on call — unless this very request is calling
    // it (a stale client list): then a stub explains instead of "Tool not found".
    if (!caller?.toolCallNames?.includes(name)) {
      return null;
    }
    return server.registerTool(name, { description }, async () => {
      console.warn(
        `[${caller.requestId}] - [mcp] denied ${name} for ${caller.mongoUser?.email}: requires ${requires} (stale tool list)`,
      );
      return toolError(refusalText(name, requires, parsed, caller));
    });
  }

  const config = { description };
  if (title) config.title = title;
  if (inputSchema) config.inputSchema = inputSchema;
  if (annotations) config.annotations = annotations;

  return server.registerTool(name, config, async (...params) => {
    // The SDK calls the handler as (args, extra) for a tool with an inputSchema and as
    // (extra) for one without.
    const args = params.length > 1 ? params[0] : {};

    // Every call is logged with who asked and what for. An LLM acting on a fuzzy
    // instruction is exactly when "what happened, and who asked for it" has to be
    // reconstructable after the fact.
    console.log(
      `[${caller.requestId}] - [mcp] tool=${name} caller=${caller.mongoUser.email} client=${caller.clientId} args=${JSON.stringify(args)}`,
    );

    if (!decide(caller, parsed).allowed) {
      console.warn(
        `[${caller.requestId}] - [mcp] denied ${name} for ${caller.mongoUser.email}: requires ${requires}`,
      );
      return toolError(refusalText(name, requires, parsed, caller));
    }

    try {
      return await handler(args, caller);
    } catch (err) {
      // A thrown error would reach the client as an opaque protocol failure; this keeps
      // it legible and keeps the connection alive.
      console.error(
        `[${caller.requestId}] - [mcp] tool=${name} failed: ${err.message}`,
      );
      return toolError(`${name} failed: ${err.message}`);
    }
  });
}

/**
 * The tool names a JSON-RPC body calls (one message or a batch), so registerTool can stub
 * tools this caller no longer has. Anything malformed simply yields no names.
 */
export function toolCallNamesOf(body) {
  const messages = Array.isArray(body) ? body : [body];
  return messages
    .filter((message) => message?.method === "tools/call" && typeof message.params?.name === "string")
    .map((message) => message.params.name);
}

export default registerTool;
