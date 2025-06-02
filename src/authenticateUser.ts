import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { IncomingMessage } from "http";
import "dotenv/config";

export interface JwtPayload {
  userId: string;
  // add other JWT claims here if needed
}

/**
 * Attempts to read a JWT from the Authorization header,
 * verify it, and then fetch the corresponding user from Prisma.
 *
 * @param prisma  An instance of PrismaClient
 * @param req     The incoming HTTP request (must have a `headers.authorization`)
 * @returns       The User record if valid token was provided, or null
 */

export async function authenticateUser(
  prisma: PrismaClient,
  req: IncomingMessage & { headers: Record<string, string | undefined> }
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Expect “Bearer <token>”
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  const token = parts[1];

  // Verify the token. If it fails, jwt.verify will throw.
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
  } catch (err) {
    // Token invalid / expired / malformed
    return null;
  }

  // Fetch the user by ID from Prisma
  return prisma.user.findUnique({
    where: { id: payload.userId },
  });

  // if (req.headers.authorization) {
  //   // 1
  //   const token = req.headers.authorization.split(" ")[1];
  //   // 2
  //   const tokenPayload = verify(token, process.env.JWT_SECRET);
  //   // 3
  //   return await prisma.user.findUnique({ where: { id: tokenPayload.userId } });
  // }

  // return null;
}
