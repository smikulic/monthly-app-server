import { GraphQLResolveInfo } from "graphql";
import { PrismaClient } from "@prisma/client";
import { withErrorHandle } from "./withErrorHandle";
import { withAuth } from "./withAuth";

export interface User {
  id: string;
  email: string;
  emailConfirmed: boolean;
  // add other user properties here if needed
}

export type AuthContext = { currentUser: User; prisma: PrismaClient };

export type ResolverFn<
  Parent = any,
  Args = any,
  Context = AuthContext,
  Return = any
> = (
  parent: Parent,
  args: Args,
  context: Context,
  info: GraphQLResolveInfo
) => Promise<Return> | Return;

export function secured<
  Parent = any,
  Args = any,
  Context extends AuthContext = AuthContext,
  Return = any
>(
  resolver: ResolverFn<Parent, Args, Context, Return>
): ResolverFn<Parent, Args, Context, Return> {
  return withErrorHandle(withAuth(resolver));
}
