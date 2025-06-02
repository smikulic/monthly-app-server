import { PrismaClient } from "@prisma/client";
import { IncomingMessage } from "http";
import { authenticateUser } from "./authenticateUser.js";

const prisma = new PrismaClient();

export async function contextFactory(
  req: IncomingMessage & { headers: Record<string, string | undefined> }
) {
  return {
    prisma,
    currentUser: await authenticateUser(prisma, req),
  };
}
