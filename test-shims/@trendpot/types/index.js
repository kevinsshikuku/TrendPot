class TrendPotGraphQLClient {
  constructor() {
    /* placeholder client for tests */
  }
}
const challengeLeaderboardSchema = {
  parse(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const leaders = Array.isArray(payload.leaders) ? payload.leaders : [];
    return {
      generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : new Date().toISOString(),
      leaders
    };
  }
};
module.exports = { TrendPotGraphQLClient, challengeLeaderboardSchema };
