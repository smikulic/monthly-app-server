import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "./auth.js";

const prisma = new PrismaClient();

export async function contextFactory(req) {
  return {
    prisma,
    currentUser: await authenticateUser(prisma, req),
  };
}
