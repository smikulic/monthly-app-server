import { PrismaClient } from "@prisma/client";
import { IncomingMessage } from "http";
import { authenticateUser } from "./authenticateUser.js";
import { createSubcategoryLoader } from "./loaders/subcategoryLoader.js";

export const prisma = new PrismaClient();

export async function contextFactory(
  req: IncomingMessage & { headers: Record<string, string | undefined> },
) {
  const currentUser = await authenticateUser(prisma, req);

  // Load the caller's group memberships once so scoping/role checks are cheap.
  const groups = currentUser
    ? await prisma.groupMember.findMany({
        where: { userId: currentUser.id },
        select: { groupId: true, role: true },
      })
    : [];

  return {
    prisma,
    currentUser,
    groups,
    loaders: {
      subcategory: createSubcategoryLoader(prisma),
    },
  };
}
