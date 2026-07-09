import mongoose from "mongoose";
import process from "process";

const { Schema } = mongoose;

/**
 * Admin-managed MRR resolution overrides. Some enterprise clients file Zendesk tickets from
 * emails that aren't tied to any Duda account (e.g. 1&1/IONOS's hosting-jira@1und1.de), so
 * requester-email resolution can't find them. An override maps a matcher to the Duda account
 * email whose MRR should be used instead:
 *
 * - matchType "org": matchValue is a Zendesk organization id (as a string). One mapping
 *   covers every requester under that org — orgs are curated by Duda's support team, so
 *   this stays correct as the client's agents change. Preferred for big partners.
 * - matchType "email": matchValue is an exact requester email (lowercased). For one-off
 *   cases without a clean org.
 *
 * An override *wins* over requester-email resolution (a partner employee's personal Duda
 * account must not be counted in place of the real enterprise account).
 */
const MrrOverrideSchema = new Schema(
  {
    matchType: { type: String, required: true, enum: ["org", "email"] },
    matchValue: { type: String, required: true, trim: true },
    // Display name shown in the UI and in traces (e.g. "1&1 / IONOS").
    label: { type: String, default: "", trim: true },
    // The Duda account email resolveOwnerAccount() is pointed at instead.
    accountEmail: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// One mapping per matcher.
MrrOverrideSchema.index({ matchType: 1, matchValue: 1 }, { unique: true });

const isDev = process.env.NODE_ENV === "development";
const collectionName = isDev ? "dev-mrr-overrides" : "mrr-overrides";

export const MrrOverride = mongoose.model("MrrOverride", MrrOverrideSchema, collectionName);
