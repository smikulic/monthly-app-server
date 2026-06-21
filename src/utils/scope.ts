import { Prisma } from "@prisma/client";
import type { AuthContext } from "./secured.js";

export type ScopeMode = "ALL" | "MINE" | "GROUP";

export interface ScopeArgs {
  scope?: ScopeMode | null;
  groupId?: string | null;
}

// Build a Prisma Category `where` fragment for the requested scope.
// ALL (default): personal + every group I belong to.
// MINE: only my personal categories.
// GROUP: a single group I'm a member of.
export function categoryScopeWhere(
  args: ScopeArgs | undefined,
  context: AuthContext,
): Prisma.CategoryWhereInput {
  const userId = context.currentUser.id;
  const myGroupIds = context.groups.map((g) => g.groupId);
  const mode: ScopeMode = args?.scope ?? "ALL";

  if (mode === "MINE") {
    return { userId, groupId: null };
  }

  if (mode === "GROUP") {
    if (!args?.groupId || !myGroupIds.includes(args.groupId)) {
      throw new Error("You are not a member of this group");
    }
    return { groupId: args.groupId };
  }

  // ALL
  return {
    OR: [{ userId, groupId: null }, { groupId: { in: myGroupIds } }],
  };
}

// Whether the caller can read/write a category (and its subcategories/expenses):
// they own it personally, or it's shared with a group they belong to.
export function canAccessCategory(
  category: { userId: string; groupId: string | null },
  context: AuthContext,
): boolean {
  if (category.groupId) {
    return context.groups.some((g) => g.groupId === category.groupId);
  }
  return category.userId === context.currentUser.id;
}
