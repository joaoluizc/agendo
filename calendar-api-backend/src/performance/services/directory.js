/**
 * Everyone Performance can attribute numbers to: agendo users, plus Performance-only
 * agents (models/agentModel.js) for people without an account. An agent whose email now
 * belongs to an agendo user is *linked*: `resolve(agentId)` returns that user's clerk id,
 * so facts and setup saved under the agent id land on the real person at read time.
 */
import { User } from "../../models/UserModel.js";
import { Agent } from "../models/agentModel.js";

export const isAgentId = (id) => typeof id === "string" && id.startsWith("ext_");

export async function loadDirectory() {
  const [users, agents] = await Promise.all([
    User.find().select("clerkId firstName lastName email").lean(),
    Agent.find().lean(),
  ]);
  const people = new Map(); // id -> { id, firstName, lastName, name, email, external, region }
  const byEmail = new Map();
  for (const u of users) {
    if (!u.clerkId) continue;
    const person = {
      id: u.clerkId,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email ?? null,
      external: false,
      region: null,
    };
    people.set(u.clerkId, person);
    if (u.email) byEmail.set(String(u.email).toLowerCase(), person);
  }
  const linkTo = new Map(); // agentId -> clerkId
  for (const a of agents) {
    const user = byEmail.get(a.email);
    if (user) {
      linkTo.set(a.agentId, user.id);
      continue;
    }
    people.set(a.agentId, {
      id: a.agentId,
      firstName: a.name,
      lastName: "",
      name: a.name,
      email: a.email,
      external: true,
      region: a.region ?? null,
    });
  }
  return {
    people,
    linkTo,
    agents,
    /** The id to file something under now: a linked agent's user, else the id itself. */
    resolve: (id) => linkTo.get(id) ?? id,
    /** Shape matchAgent expects: { clerkId, firstName, lastName, email }. */
    matchable: () =>
      [...people.values()].map((p) => ({
        clerkId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
      })),
  };
}
