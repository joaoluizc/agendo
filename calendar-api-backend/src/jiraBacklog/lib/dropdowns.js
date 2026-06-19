import { STATUS_OPTIONS } from "./status.js";

/**
 * Canonical dropdown option values, taken verbatim from the seed export's
 * `dropdownOptions` so they stay consistent with the seed data and the urgency
 * scoring keys. Order is meaningful (matches the source). The frontend keeps an
 * identical copy in pages/JiraBacklog/constants.ts.
 *
 * Used server-side to sanitise incoming dropdown values (an unknown value is coerced
 * to "" so it can never corrupt the urgency calc or the views).
 */
export const DROPDOWN_OPTIONS = {
  status: STATUS_OPTIONS,
  priority: ["Major", "Minor", "Critical"],
  squad: [
    "AEO",
    "AI Infra",
    "Architects",
    "Engineering",
    "F&B (Editor)",
    "Pricing (Monetization)",
    "Snipcart (Store Ops)",
    "Store front (eCommerce)",
    "Vibe",
  ],
  complexity: [
    "Needs research",
    "1 - Small",
    "2 - Minor",
    "3 - Medium",
    "4 - Moderate",
    "5 - Complex",
  ],
  scope: [
    "Confirmed all sites / master",
    "One site, one client",
    "Several clients, not confirmed widespread",
    "Several sites, one client",
  ],
  planTier: [
    "Agency",
    "Managed enterprise",
    "Enterprise/mid-market",
    "VIP managed enterprise",
  ],
  workaround: [
    "No workaround found",
    "Workaround found — client accepted it",
    "Workaround found — client rejected it",
  ],
  frustration: [
    "Low — minor inconvenience",
    "Medium — slowing workflow",
    "High — blocking or escalating",
  ],
  scopeConf: ["Scope is as reported", "Likely wider than reported"],
  workaroundQ: [
    "No workaround / N/A",
    "Workaround is reasonable",
    "Workaround is poor / complex",
  ],
  bugType: ["Bug", "Regression"],
};
