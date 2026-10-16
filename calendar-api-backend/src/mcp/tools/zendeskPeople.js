import { z } from "zod";
import { registerZendeskTool } from "../lib/registerZendeskTool.js";
import { zendesk } from "../lib/zendeskClient.js";
import { buildOrganizationQuery, buildUserQuery, USER_ROLES, ZendeskQueryError } from "../lib/zendeskPeopleQuery.js";
import { UNTRUSTED_NOTICE, fencePayload, fitPage, jsonLine } from "../lib/zendeskShape.js";
import { CURSOR, pageInfo, paging, toolOptions } from "../lib/zendeskCommon.js";
import { ORGANIZATION_FIELDS, USER_FIELDS, isId, organizationRecord, userRecord } from "../lib/zendeskRecord.js";
import { loadMany, SHOW_MANY_LIMIT } from "../lib/zendeskSideload.js";
import { textResult } from "../lib/format.js";

/**
 * Finding people and organizations in Zendesk.
 *
 * Like ticket search these take structured filters and no search string (the connector the
 * team uses today does the same), and page by cursor through the *Export Search Results*
 * endpoint with `filter[type]=user` or `organization`. Zendesk documents no user-id keyword for
 * search, and looking someone up by id is a different thing from searching, so `ids` is its own
 * mode — a lookup of up to a hundred records with `show_many` — and cannot be mixed with filters.
 *
 * Names, emails, phone numbers, tags and notes here are customer data (and for staff, internal
 * data). Everything Zendesk sent is inside one fence; what the tool says for itself is outside.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const NAMES_LOOSE =
  "Names match loosely in Zendesk, so a name filter can also return similarly named records. " +
  "Use an id when you need an exact match.";

/** Which way the page runs, from its own timestamps (only when the records carry them). */
function direction(rows) {
  const first = Date.parse(rows[0]?.created_at);
  const last = Date.parse(rows[rows.length - 1]?.created_at);
  if (rows.length < 2 || !Number.isFinite(first) || !Number.isFinite(last) || first === last) return "";
  return first > last ? " On this page they run newest first." : " On this page they run oldest first.";
}

const tags = {
  include_tags: z.array(z.string().min(1).max(100)).min(1).max(20).optional().describe("Records with ANY of these tags. Use this or require_tags, not both. Tags may use letters, digits, _ . and - only."),
  require_tags: z.array(z.string().min(1).max(100)).min(1).max(20).optional().describe("Records with ALL of these tags. Use this or include_tags, not both."),
  exclude_tags: z.array(z.string().min(1).max(100)).min(1).max(20).optional().describe("Records with none of these tags."),
};
const created = {
  start_date: z.string().max(40).optional().describe("Created on or after: a UTC day (YYYY-MM-DD) or an ISO 8601 time with a zone, such as 2026-10-06T15:30:00Z."),
  end_date: z.string().max(40).optional().describe("Created up to: a UTC day (YYYY-MM-DD, that whole day included) or an ISO 8601 time with a zone."),
};
const text = (description) => z.string().min(1).max(200).optional().describe(description);

/** What differs between finding users and finding organizations. */
const KINDS = {
  user: {
    tool: "zendesk_search_users",
    title: "Search users",
    type: "user",
    plural: "users",
    description:
      "Find Zendesk users (customers, agents, admins) with structured filters, or look up users by " +
      "id. Give filters, not search syntax; there is no free-text search. Filters combine (all must " +
      "match); a list means 'any of'. Each user has only id, name, email and role unless you ask for " +
      "more in `include_fields`. Ordered by creation date, no total count; page with `after_cursor`. " +
      "Names, emails, phone numbers and notes are customer or staff data and arrive fenced as " +
      "untrusted. Zendesk's agent here is a Zendesk user with the agent role, not necessarily " +
      "someone on agendo's schedule. Read as one shared Zendesk user, not as you.",
    fieldsList: USER_FIELDS,
    filters: {
      name: text("Partial or full name."),
      email: text("A full email address, or `none` for users with no email."),
      role: z.array(z.enum(USER_ROLES)).min(1).max(3).optional().describe("Role, any of: end-user, agent, admin."),
      organization: text("The user's organization: a name, an id, or `none`."),
      group: text("A group's name (for agents and admins)."),
      phone: text("A phone number with a leading + in international format, or `none`."),
      external_id: text("The external id, or `none`."),
      ...tags,
      ...created,
      is_verified: z.boolean().optional().describe("Only users with (true) or without (false) a verified identity."),
      is_suspended: z.boolean().optional().describe("Only suspended (true) or not suspended (false) users."),
    },
    filterNames: [
      "name", "email", "role", "organization", "group", "phone", "external_id",
      "include_tags", "require_tags", "exclude_tags", "start_date", "end_date", "is_verified", "is_suspended",
    ],
    logArgs: ["role", "is_verified", "is_suspended"],
    build: buildUserQuery,
    record: userRecord,
    showMany: "/api/v2/users/show_many.json",
    usesNames: (args) => ["name", "organization", "group"].some((key) => typeof args[key] === "string" && !/^\d+$/.test(args[key].trim()) && args[key].trim().toLowerCase() !== "none"),
  },
  organization: {
    tool: "zendesk_search_organizations",
    title: "Search organizations",
    type: "organization",
    plural: "organizations",
    description:
      "Find Zendesk organizations with structured filters, or look up organizations by id. Give " +
      "filters, not search syntax. Filters combine (all must match). Each organization has only id " +
      "and name unless you ask for more in `include_fields`. Ordered by creation date, no total " +
      "count; page with `after_cursor`. Names, domains and notes are customer data and arrive " +
      "fenced as untrusted. Read as one shared Zendesk user, not as you.",
    fieldsList: ORGANIZATION_FIELDS,
    filters: {
      name: text("Partial or full name."),
      external_id: text("The external id, or `none`."),
      ...tags,
      ...created,
    },
    filterNames: ["name", "external_id", "include_tags", "require_tags", "exclude_tags", "start_date", "end_date"],
    logArgs: [],
    build: buildOrganizationQuery,
    record: organizationRecord,
    showMany: "/api/v2/organizations/show_many.json",
    usesNames: (args) => typeof args.name === "string",
  },
};

function registerFinder(server, caller, spec) {
  registerZendeskTool(server, caller, {
    name: spec.tool,
    title: spec.title,
    description: spec.description,
    inputSchema: {
      ids: z
        .array(z.number().int().positive())
        .min(1)
        .max(SHOW_MANY_LIMIT)
        .optional()
        .describe(`Look up these ${spec.plural} by id instead of searching (up to ${SHOW_MANY_LIMIT}). Cannot be combined with filters or a cursor.`),
      ...spec.filters,
      include_fields: z
        .array(z.enum(spec.fieldsList))
        .max(spec.fieldsList.length)
        .optional()
        .describe(`Extra fields, any of: ${spec.fieldsList.join(", ")}.`),
      page_size: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_SIZE)
        .optional()
        .describe(`Records per page, up to ${MAX_PAGE_SIZE} (default ${DEFAULT_PAGE_SIZE}).`),
      after_cursor: z
        .string()
        .regex(CURSOR, "after_cursor must be exactly the value a previous answer gave")
        .optional()
        .describe("To continue: the `after_cursor` a previous answer gave, with the same filters. It expires after an hour."),
    },
    logArgs: [...spec.logArgs, "ids", "include_fields", "page_size"],
    handler: async (args, caller, extra) => {
      const zd = zendesk.forCaller(caller.clerkId);
      const options = toolOptions(extra);
      const fields = args.include_fields ?? [];
      const host = zendesk.host();
      const toLine = (row) => jsonLine(spec.record(row, fields));
      const head = (what) => `Zendesk ${spec.type} ${what}, read-only, as the shared Zendesk user (${host}).`;

      /* ---- by id: a lookup, not a search ---- */
      if (args.ids !== undefined) {
        if (spec.filterNames.some((name) => args[name] !== undefined) || args.after_cursor !== undefined) {
          throw new ZendeskQueryError("ids cannot be combined with filters or a cursor: look records up by id, or search by filters");
        }
        // The schema's `.int()` lets 1e21 through. A bad id is refused, not quietly dropped: an id
        // that was ignored would read as one that was not found.
        if (!args.ids.every(isId)) throw new ZendeskQueryError("ids must be positive whole numbers");
        const wanted = [...new Set(args.ids)];
        const rows = await loadMany(zd, spec.showMany, spec.plural, wanted, options);
        const found = new Set(rows.map((row) => row?.id));
        const missing = wanted.filter((one) => !found.has(one)).length;
        const fit = fitPage({ blocks: rows.map(toLine) });
        const lines = [
          head("lookup"),
          `Looked up ${wanted.length} id(s); found ${rows.length}.`,
          UNTRUSTED_NOTICE,
          fencePayload([`${spec.plural}:`, ...(fit.kept.length ? fit.kept : ["(none)"])], { source: `zendesk ${spec.type} lookup` }),
        ];
        if (missing) lines.push(`${missing} of the ${wanted.length} could not be found (deleted, or not visible to the shared Zendesk user).`);
        // A lookup has no pages or cursors, so say what to do instead of what `fitPage` says for a search.
        if (fit.omitted) {
          lines.push(`${fit.omitted} of the ${rows.length} found did not fit and are not shown. Look them up again in smaller groups of ids, or with fewer include_fields.`);
        }
        return textResult(lines);
      }

      /* ---- by filters: the export search ---- */
      const { query } = spec.build(args);
      if (args.after_cursor !== undefined && !CURSOR.test(args.after_cursor)) {
        throw new Error("after_cursor must be exactly the value a previous answer gave");
      }
      const page = await zd.get(
        "/api/v2/search/export.json",
        {
          query,
          "filter[type]": spec.type,
          "page[size]": args.page_size ?? DEFAULT_PAGE_SIZE,
          "page[after]": args.after_cursor,
        },
        options,
      );
      if (!Array.isArray(page?.results)) throw new Error("Zendesk answered the search in a shape this tool does not understand");

      const rows = page.results.filter((row) => isId(row?.id));
      const skipped = page.results.length - rows.length;
      const { hasMore, cursor } = pageInfo(page.meta);
      const fit = fitPage({ blocks: rows.map(toLine), nextCursor: cursor });
      const shown = rows.slice(0, fit.kept.length);

      const lines = [
        head("search"),
        `Query sent to Zendesk: ${query}`,
        `${spec.plural[0].toUpperCase()}${spec.plural.slice(1)} on this page: ${fit.kept.length}. Ordered by creation date; Zendesk gives no total count.${direction(shown)}`,
      ];
      if (skipped) lines.push(`${skipped} result(s) without a usable id were left out.`);
      lines.push(UNTRUSTED_NOTICE, fencePayload([`${spec.plural}:`, ...(fit.kept.length ? fit.kept : ["(none)"])], { source: `zendesk ${spec.type} search results` }));
      if (fit.note) lines.push(fit.note, "Ask for a smaller page_size, or fewer include_fields, to see them all in one page.");
      if (spec.usesNames(args)) lines.push(NAMES_LOOSE);
      if (fit.kept.length === 0) {
        lines.push(`No ${spec.plural} matched. Zendesk matches names loosely, so also check the spelling, and that the dates are UTC days.`);
      }
      lines.push(...paging({ hasMore, cut: fit.omitted > 0, nextCursor: fit.nextCursor, noun: spec.plural }));
      return textResult(lines);
    },
  });
}

export function registerZendeskPeopleTools(server, caller) {
  registerFinder(server, caller, KINDS.user);
  registerFinder(server, caller, KINDS.organization);
}

export default { registerZendeskPeopleTools };
