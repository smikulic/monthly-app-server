import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "./auth";

const prisma = new PrismaClient();

export async function contextFactory(req) {
  return {
    prisma,
    // currentUser: { email: 'ha'},
    currentUser: await authenticateUser(prisma, req),
  };
}
