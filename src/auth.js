import { verify } from "jsonwebtoken";

export const APP_SECRET = "this is my secret";

export async function authenticateUser(prisma, req) {
  if (req.headers.authorization) {
    // 1
    const token = req.headers.authorization.split(" ")[1];
    // 2
    const tokenPayload = verify(token, APP_SECRET);
    // 3
    const userId = tokenPayload.userId;
    // 4
    return await prisma.user.findUnique({ where: { id: userId } });
  }

  return null;
}
