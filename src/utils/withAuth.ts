import { GraphQLResolveInfo } from "graphql";
import { User } from "./secured.js";

export const ensureAuthenticated = (currentUser: User | null) => {
  if (currentUser === null) {
    throw new Error("Unauthenticated!");
  }
  if (!currentUser.emailConfirmed) {
    throw new Error("Please confirm your email before continuing");
  }
};

type ResolverFn<Parent = any, Args = any, Context = any, Return = any> = (
  parent: Parent,
  args: Args,
  context: Context & { currentUser: User | null },
  info: GraphQLResolveInfo
) => Promise<Return> | Return;

export function withAuth<Parent = any, Args = any, Context = any, Return = any>(
  resolver: ResolverFn<Parent, Args, Context, Return>
): ResolverFn<Parent, Args, Context, Return> {
  return async function (parent, args, context, info) {
    ensureAuthenticated(context.currentUser);
    return resolver(parent, args, context, info);
  };
}
