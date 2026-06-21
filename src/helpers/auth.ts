import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/constants.js";
import { JwtPayload } from "../authenticateUser.js";

export function generateAuthToken(
  userId: string,
  expiresIn: any = "90d"
): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): JwtPayload {
  // Pin the algorithm to prevent algorithm-confusion attacks
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;
}
