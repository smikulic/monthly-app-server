import { secured } from "../utils/secured.js";
import { notFoundError } from "../utils/notFoundError.js";

const DEFAULT_KEY = "default";

export const onboardingResolvers = {
  Query: {
    demoDataset: secured(async (_parent, args, context) => {
      const key = args.key || DEFAULT_KEY;

      const dataset = await context.prisma.demoDataset.findUnique({
        where: { key },
      });

      // The row is written by `seed:demo` on every deploy, so its absence means
      // that step did not run rather than that the caller asked for something
      // unreasonable.
      if (!dataset) {
        return notFoundError("DemoDataset");
      }

      return {
        key: dataset.key,
        version: dataset.version,
        // Stringified here rather than exposed as a typed graph: the client
        // parses it once into its own domain model.
        payload: JSON.stringify(dataset.payload),
      };
    }),
  },
  Mutation: {
    markOnboardingSeen: secured(async (_parent, _args, context) =>
      context.prisma.user.update({
        where: { id: context.currentUser.id },
        data: { onboardingSeenAt: new Date() },
      }),
    ),
    replayOnboarding: secured(async (_parent, _args, context) =>
      context.prisma.user.update({
        where: { id: context.currentUser.id },
        data: { onboardingSeenAt: null },
      }),
    ),
  },
};
