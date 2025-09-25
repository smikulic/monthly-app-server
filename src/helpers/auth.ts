import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/constants.js";
import { JwtPayload } from "../authenticateUser.js";

export function generateAuthToken(
  userId: string,
  expiresIn: any = "90d"
): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
