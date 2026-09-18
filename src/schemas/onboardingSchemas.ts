export const onboardingTypeDefs = `
  """
  The canonical dataset the first-run demo runs on.

  The payload is serialised JSON rather than a typed graph on purpose. It is
  never stitched into the real schema: the client caches it, answers its own
  queries from it and discards it. Typing it here would mean keeping a second
  copy of every model in step for no gain.
  """
  type DemoDataset {
    key: String!
    "Bump this when the payload changes; the client refetches on a mismatch."
    version: Int!
    payload: String!
  }

  extend type Query {
    "The dataset the first-run demo runs on. Fetched on demand, never seeded."
    demoDataset(key: String): DemoDataset!
  }

  extend type Mutation {
    "Records that the caller has finished or dismissed the first-run tour."
    markOnboardingSeen: User!
    "Clears the marker so the tour can be replayed from Settings."
    replayOnboarding: User!
  }
`;
