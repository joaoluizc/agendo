/**
 * The only way a tool gets registered on agendo's MCP server.
 *
 * Unlike an Express router there is no mount point that covers every tool by default, so
 * a forgotten guard would be a silent hole rather than a visible one. `level` is
 * therefore required and validated at registration time: a tool that does not state
 * whether it is for any user or for admins only fails to load the server at all.
 *
 * Two enforcement points, deliberately:
 *  - **Visibility** — an admin tool is not registered for a non-admin caller, so it never
 *    appears in `tools/list`. (The server is built per request, from the resolved
 *    caller — see server.js.)
 *  - **Execution** — the wrapper re-checks `level` on every call. Redundant today, and
 *    kept that way: the day someone registers tools before resolving the caller, this is
 *    the check that still holds.
 */

const LEVELS = new Set(["user", "admin"]);

/** A tool result that reads as an error to the client rather than crashing the call. */
function toolError(text) {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{clerkId: string, mongoUser: object, isAdmin: boolean, clientId: string, requestId: string}} caller
 * @param {{
 *   name: string,
 *   level: "user" | "admin",
 *   description: string,
 *   title?: string,
 *   inputSchema?: object,
 *   annotations?: object,
 *   handler: (args: object, caller: object) => Promise<object>,
 * }} definition
 */
export function registerTool(server, caller, definition) {
  const { name, level, title, description, inputSchema, annotations, handler } =
    definition;

  if (!name) {
    throw new Error("registerTool: every tool needs a name");
  }
  if (!LEVELS.has(level)) {
    throw new Error(
      `registerTool: tool "${name}" must declare level: "user" or "admin"`,
    );
  }
  if (typeof handler !== "function") {
    throw new Error(`registerTool: tool "${name}" needs a handler function`);
  }

  // Hidden from listing, not just refused on call.
  if (level === "admin" && !caller.isAdmin) {
    return null;
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

    if (level === "admin" && !caller.isAdmin) {
      console.warn(
        `[${caller.requestId}] - [mcp] denied ${name} for ${caller.mongoUser.email}: not an admin`,
      );
      return toolError(
        `"${name}" is restricted to agendo admins. You are signed in as ${caller.mongoUser.email} (role: ${caller.mongoUser.type}).`,
      );
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

export default registerTool;
