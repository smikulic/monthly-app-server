import { GraphQLResolveInfo } from "graphql";

type ResolverFn<Parent = any, Args = any, Context = any, Return = any> = (
  parent: Parent,
  args: Args,
  context: Context,
  info: GraphQLResolveInfo
) => Promise<Return> | Return;

export function withErrorHandle<
  Parent = any,
  Args = any,
  Context = any,
  Return = any
>(
  resolver: ResolverFn<Parent, Args, Context, Return>
): ResolverFn<Parent, Args, Context, Return> {
  return async function (parent, args, context, info) {
    try {
      return await resolver(parent, args, context, info);
    } catch (error) {
      // Optionally log error here (e.g., Sentry)
      throw error;
    }
  };
}
