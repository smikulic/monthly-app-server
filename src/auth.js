import jwt from "jsonwebtoken";
const { verify } = jwt;
import "dotenv/config";

export async function authenticateUser(prisma, req) {
  if (req.headers.authorization) {
    // 1
    const token = req.headers.authorization.split(" ")[1];
    // 2
    const tokenPayload = verify(token, process.env.JWT_SECRET);
    // 3
    return await prisma.user.findUnique({ where: { id: tokenPayload.userId } });
  }

  return null;
}
