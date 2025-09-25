import assert from "node:assert/strict";
import test from "node:test";
import { generateLeaderboardSnapshot, createLeaderboardJobHandler } from "./leaderboard-job";

// The worker is tiny today, so validating the shape of its payload guards
// against regressions as more complex scoring rules are introduced later on.
test("generateLeaderboardSnapshot produces a schema compliant payload", () => {
  const snapshot = generateLeaderboardSnapshot();

  assert.equal(snapshot.leaders.length, 3);
  snapshot.leaders.forEach((leader) => {
    assert.ok(leader.id.length > 0);
    assert.ok(leader.title.length > 0);
    assert.ok(Number.isInteger(leader.score));
  });
});

test("createLeaderboardJobHandler resolves to the same snapshot", async () => {
  const handler = createLeaderboardJobHandler();
  const snapshot = await handler();

  assert.equal(snapshot.leaders.length, 3);
});
