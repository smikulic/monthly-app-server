import { Prisma, GroupRole } from "@prisma/client";
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

// Whether the caller may edit/remove an item owned by `ownerUserId` and living
// in `category`: they created it, or they are a group OWNER/ADMIN (moderation).
// Used for categories (owner = category.userId), subcategories (owner = parent
// category.userId), and expenses (owner = the expense's payer/enterer userId).
export function canManage(
  ownerUserId: string,
  category: { userId: string; groupId: string | null },
  context: AuthContext,
): boolean {
  if (!canAccessCategory(category, context)) {
    return false;
  }
  if (ownerUserId === context.currentUser.id) {
    return true;
  }
  if (category.groupId) {
    const membership = context.groups.find(
      (g) => g.groupId === category.groupId,
    );
    return (
      membership?.role === GroupRole.OWNER ||
      membership?.role === GroupRole.ADMIN
    );
  }
  return false;
}
