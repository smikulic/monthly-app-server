import { verify } from "jsonwebtoken";

export const APP_SECRET = "this is my secret";

export async function authenticateUser(prisma, req) {
  if (req.headers.authorization) {
    // 1
    const token = req.headers.authorization.split(" ")[1];
    console.log({token})
    // 2
    const tokenPayload = verify(token, APP_SECRET);
    console.log({tokenPayload})
    // 3
    return await prisma.user.findUnique({ where: { id: tokenPayload.userId } });
  }

  return null;
}
