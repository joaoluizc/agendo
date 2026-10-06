import { test } from "node:test";
import assert from "node:assert/strict";
import { classifierFrom, foldGroupMinutes } from "./groupMinutes.js";

const at = (h) => new Date(Date.UTC(2027, 0, 5, h));

test("folds shifts into minutes per agent and group, clamped to the range", () => {
  const classify = classifierFrom([
    { name: "Tickets", positionNames: ["General Queue"] },
    { name: "Chats", positionNames: [" chat "] },
  ]);
  const shifts = [
    { userId: "u1", startTime: at(8), endTime: at(12), positionId: "p-chat" },
    // straddles the range start at 10:00: only 10–11 counts
    { userId: "u1", startTime: at(9), endTime: at(11), positionId: "p-queue" },
    { userId: "u1", startTime: at(13), endTime: at(14), positionId: "p-gone" },
    { userId: "dev-only", startTime: at(10), endTime: at(12), positionId: "p-chat" },
    { userId: "u1", startTime: at(20), endTime: at(21), positionId: "p-chat" },
  ];
  const { agents, skippedUnmatched } = foldGroupMinutes(shifts, {
    rangeStart: at(10),
    rangeEnd: at(18),
    userByClerkId: new Map([["u1", { clerkId: "u1", firstName: "Test", lastName: "Agent" }]]),
    positionNameById: new Map([
      ["p-chat", "Chat"],
      ["p-queue", "general queue"],
    ]),
    classify,
  });
  assert.equal(skippedUnmatched, 1);
  const u1 = agents.get("u1");
  assert.equal(u1.name, "Test Agent");
  assert.deepEqual(u1.minutes, { Chats: 120, Tickets: 60, Other: 60 });
  assert.equal(u1.unresolvedPositionMinutes, 60);
});
