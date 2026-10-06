import mongoose from "mongoose";
import { User } from "../../models/UserModel.js";
import { Agent } from "../models/agentModel.js";
import { Fact } from "../models/factModel.js";
import { Period } from "../models/periodModel.js";
import periodService from "./periodService.js";
import { loadDirectory } from "./directory.js";
import { REGIONS } from "../lib/regions.js";
import { badRequest, conflict, notFound } from "../lib/httpError.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Performance-only agents, each with the account it now resolves to (if any). */
async function listAgents() {
  const directory = await loadDirectory();
  return directory.agents
    .map((a) => {
      const linkedTo = directory.linkTo.get(a.agentId) ?? null;
      return {
        agentId: a.agentId,
        name: a.name,
        email: a.email,
        region: a.region ?? null,
        linkedTo,
        linkedName: linkedTo ? directory.people.get(linkedTo)?.name ?? null : null,
        createdAt: a.createdAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds someone without an agendo account. With `periodKey` (and `role`), they also join
 * that quarter's agent setup, so a role like billing specialist is set in one step.
 */
async function createAgent({ name, email, region, periodKey, role, createdBy }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanName || cleanName.length > 120) throw badRequest("name is required");
  if (!EMAIL.test(cleanEmail)) throw badRequest("a valid email is required");
  if (region != null && !REGIONS.includes(region)) throw badRequest(`region must be one of ${REGIONS.join(", ")}`);

  const escaped = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (await User.exists({ email: new RegExp(`^${escaped}$`, "i") })) {
    throw conflict(`${cleanEmail} already has an agendo account — pick them instead`);
  }
  if (await Agent.exists({ email: cleanEmail })) throw conflict(`${cleanEmail} is already added`);

  let period = null;
  if (periodKey) {
    period = await periodService.getPeriod(periodKey);
    periodService.assertOpen(period);
  }

  const agent = await Agent.create({
    agentId: `ext_${new mongoose.Types.ObjectId().toHexString()}`,
    name: cleanName,
    email: cleanEmail,
    region: region ?? null,
    createdBy,
  });

  if (period) {
    await Period.updateOne(
      { key: period.key, "agents.clerkId": { $ne: agent.agentId } },
      {
        $push: {
          agents: { clerkId: agent.agentId, region: region ?? null, role: role || "regular", cohortOverride: null, note: "" },
        },
      },
    );
  }
  return agent.toObject();
}

/** Only while nothing has been imported for them — removing would orphan those numbers. */
async function deleteAgent(agentId) {
  const agent = await Agent.findOne({ agentId }).lean();
  if (!agent) throw notFound("no such agent");
  if (await Fact.exists({ clerkId: agentId })) {
    throw conflict(`${agent.name} has imported data — re-import those sources without them first`);
  }
  await Period.updateMany({}, { $pull: { agents: { clerkId: agentId } } });
  await Agent.deleteOne({ agentId });
}

export default { listAgents, createAgent, deleteAgent };
