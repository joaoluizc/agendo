import { registerTool } from "./registerTool.js";

/**
 * The only way a Zendesk tool gets registered.
 *
 * agendo's connector is named "agendo", and nothing in that name says it also reaches
 * Zendesk — while "agent", "ticket", "queue" and "user" mean different things in the two
 * systems. The model and the person have to be able to tell, from the tool list alone,
 * which system a tool acts on. Doing that by remembering to write the right words in each
 * tool is how it gets forgotten, so this wrapper does it by construction, the same way
 * `registerTool` makes `requires` mandatory:
 *
 *  - the name must start with `zendesk_`;
 *  - the title gets a `Zendesk: ` prefix and the description a `[Zendesk, read-only]`
 *    opener (a test checks every listed tool, so a tool registered some other way fails);
 *  - the annotations are fixed: read-only, not destructive, idempotent, and
 *    `openWorldHint: true` — the protocol's own marker for "talks to an external system";
 *  - the requirement is fixed at `zendesk:view`. A tool that needs more than reading
 *    Zendesk is not a tool for this wrapper, and must not be registered through it.
 *
 * **Logging fails closed.** A search query or a customer's name can be an email address,
 * and every call is logged with its arguments to a log that is not ours. So here a tool
 * does not opt *in* to redaction, it opts *out*, argument by argument: `logArgs` lists the
 * arguments that are safe to record, and every other argument is logged by size only. A
 * tool that lists nothing logs nothing but sizes. "Safe" is checked, not trusted: only a
 * number, boolean, enum or literal field (or a list of them) can be listed, because a
 * free-text field is
 * exactly what must not be (this is also why a `z.object` schema is refused — every
 * argument has to be visible here). If the schema library ever stops exposing field types
 * this way, nothing can be listed and everything is redacted: it fails in the safe direction.
 *
 * The same goes for errors. A Zendesk tool's own code may throw an error that quotes what
 * was asked ("No ticket for <query>"); the person and their model see it, but the log gets a
 * generic line unless the error carries its own `logMessage` (as `ZendeskError` does).
 */

export const ZENDESK_TOOL_PREFIX = "zendesk_";
export const ZENDESK_TITLE_PREFIX = "Zendesk: ";
export const ZENDESK_DESCRIPTION_OPENER = "[Zendesk, read-only]";

const ZENDESK_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

/** Field types that cannot carry free text. */
const LOGGABLE_TYPES = new Set(["ZodNumber", "ZodBoolean", "ZodEnum", "ZodNativeEnum", "ZodLiteral"]);
/** Wrappers around a field type (`.optional()`, `.default()` …) to look through. */
const WRAPPER_TYPES = new Set(["ZodOptional", "ZodNullable", "ZodDefault", "ZodCatch", "ZodReadonly"]);

/**
 * Is this zod field a number, boolean, enum or literal — or a list of them — however it is
 * wrapped? A list of enums (`status: ["open", "pending"]`) carries no free text either.
 */
function isSafeToLog(field) {
  let type = field;
  for (let depth = 0; depth < 8 && type?._def; depth += 1) {
    const name = type._def.typeName;
    if (LOGGABLE_TYPES.has(name)) return true;
    if (WRAPPER_TYPES.has(name)) type = type._def.innerType;
    else if (name === "ZodEffects") type = type._def.schema;
    else if (name === "ZodArray") type = type._def.type;
    else return false;
  }
  return false;
}

export function registerZendeskTool(server, caller, definition) {
  const {
    name,
    title,
    description,
    requires,
    annotations,
    redactArgs,
    logArgs = [],
    inputSchema,
    handler,
    ...rest
  } = definition;

  if (!name?.startsWith(ZENDESK_TOOL_PREFIX)) {
    throw new Error(`registerZendeskTool: "${name}" must be named ${ZENDESK_TOOL_PREFIX}*`);
  }
  if (!title || !description) {
    throw new Error(`registerZendeskTool: tool "${name}" needs a title and a description`);
  }
  if (typeof handler !== "function") {
    throw new Error(`registerZendeskTool: tool "${name}" needs a handler function`);
  }
  if (requires !== undefined || annotations !== undefined) {
    throw new Error(
      `registerZendeskTool: tool "${name}" must not set requires or annotations — ` +
        `they are fixed (zendesk:view, read-only). A tool that needs more is not for this wrapper.`,
    );
  }
  if (redactArgs !== undefined) {
    throw new Error(
      `registerZendeskTool: tool "${name}" must not set redactArgs — redaction is automatic. ` +
        `List only the arguments that are safe to log, in logArgs.`,
    );
  }
  if (!Array.isArray(logArgs) || logArgs.some((key) => typeof key !== "string")) {
    throw new Error(`registerZendeskTool: tool "${name}" logArgs must be a list of argument names`);
  }

  let redact = [];
  if (inputSchema !== undefined) {
    if (inputSchema === null || typeof inputSchema !== "object" || inputSchema._def) {
      throw new Error(
        `registerZendeskTool: tool "${name}" inputSchema must be a plain { field: z.type() } object, ` +
          `so every argument can be accounted for in the log`,
      );
    }
    const fields = Object.keys(inputSchema);
    const unknown = logArgs.filter((key) => !fields.includes(key));
    if (unknown.length) {
      throw new Error(
        `registerZendeskTool: tool "${name}" lists ${unknown.join(", ")} in logArgs, which its inputSchema does not have`,
      );
    }
    const freeText = logArgs.filter((key) => !isSafeToLog(inputSchema[key]));
    if (freeText.length) {
      throw new Error(
        `registerZendeskTool: tool "${name}" lists ${freeText.join(", ")} in logArgs, but it is not a number, ` +
          `boolean, enum or literal — a free-text field can hold a customer's email and must be redacted`,
      );
    }
    redact = fields.filter((key) => !logArgs.includes(key));
  } else if (logArgs.length) {
    throw new Error(`registerZendeskTool: tool "${name}" has no inputSchema, so nothing for logArgs to name`);
  }

  // Whatever a handler throws, only an error that vouches for its own log line is logged as
  // written; anything else is logged generically and still shown in full to the client.
  const guardedHandler = async (...handlerArgs) => {
    try {
      return await handler(...handlerArgs);
    } catch (error) {
      if (typeof error?.logMessage === "string") throw error;
      const wrapped = new Error(error?.message ?? String(error));
      wrapped.logMessage = "an unexpected error occurred (details are not logged for Zendesk tools)";
      throw wrapped;
    }
  };

  return registerTool(server, caller, {
    ...rest,
    name,
    requires: "zendesk:view",
    title: `${ZENDESK_TITLE_PREFIX}${title}`,
    description: `${ZENDESK_DESCRIPTION_OPENER} ${description}`,
    annotations: ZENDESK_ANNOTATIONS,
    ...(inputSchema !== undefined ? { inputSchema } : {}),
    redactArgs: redact,
    handler: guardedHandler,
  });
}

export default { registerZendeskTool };
