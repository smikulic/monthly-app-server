import { OAuth2Client } from "google-auth-library";
import { PrismaClient } from "@prisma/client";

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export function getGoogleAuthUrl(): string {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  return client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
}

export async function getGoogleUserInfo(code: string): Promise<GoogleUserInfo> {
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Failed to get user info from Google");
  }

  return {
    id: payload.sub,
    email: payload.email!,
    verified_email: payload.email_verified || false,
    name: payload.name || "",
    given_name: payload.given_name,
    family_name: payload.family_name,
    picture: payload.picture,
  };
}

export async function findOrCreateGoogleUser(
  prisma: PrismaClient,
  googleUser: GoogleUserInfo
) {
  // Check if user exists with this Google ID
  let user = await prisma.user.findUnique({
    where: { googleId: googleUser.id },
  });

  if (user) {
    // Update user info from Google (in case name or picture changed)
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: googleUser.name,
        picture: googleUser.picture,
      },
    });
  } else {
    // Check if a user with this email exists (might have signed up with email/password)
    const existingEmailUser = await prisma.user.findUnique({
      where: { email: googleUser.email },
    });

    if (existingEmailUser) {
      // Link existing account with Google
      user = await prisma.user.update({
        where: { id: existingEmailUser.id },
        data: {
          googleId: googleUser.id,
          provider: existingEmailUser.password ? "both" : "google", // Keep "both" if they have password
          name: googleUser.name || existingEmailUser.name, // Don't overwrite if they already have a name
          picture: googleUser.picture,
          emailConfirmed: true, // Google emails are pre-verified
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          googleId: googleUser.id,
          provider: "google",
          name: googleUser.name,
          picture: googleUser.picture,
          emailConfirmed: true, // Google emails are pre-verified
        },
      });
    }
  }

  return user;
}
