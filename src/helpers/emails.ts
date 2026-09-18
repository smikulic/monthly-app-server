import postmark from "postmark";
import type { User as PrismaUser } from "../generated/prisma/client.js";
import { POSTMARK_API_KEY } from "../config/constants.js";

// Postmark client for sending emails
const postmarkClient = new postmark.ServerClient(POSTMARK_API_KEY);

const FROM = "Monthly <support@yourmonthly.app>";
const APP_URL = "https://app.yourmonthly.app";

/**
 * `mailto:`, not a bare address.
 *
 * This was `"support@yourmonthly.app"` and the templates used it as an `href`,
 * so "contact support" resolved relative to whatever page the mail client
 * thought it was on and went nowhere.
 */
const SUPPORT_URL = "mailto:support@yourmonthly.app";

/** Bodies and subjects live in `emails/`; see `src/emails/templates.ts`. */
const send = (to: string, alias: string, model: Record<string, unknown>) =>
  postmarkClient.sendEmailWithTemplate({
    From: FROM,
    To: to,
    TemplateAlias: alias,
    TemplateModel: { support_url: SUPPORT_URL, ...model },
    MessageStream: "outbound",
  });

// Helper: Send confirmation email
export async function sendConfirmationEmail(
  user: PrismaUser,
  token: string,
): Promise<void> {
  await send(user.email, "email-confirmation", {
    // Optional, and the template branches on it. Email signups have no name;
    // Google signups do, and greeting them by it costs nothing.
    name: user.name ?? "",
    preheader: "One click and your budget is ready to set up.",
    action_url: `${APP_URL}/confirm-email?token=${token}`,
  });
}

// Helper: Send password reset email
export async function sendPasswordResetEmail(
  user: PrismaUser,
  token: string,
): Promise<void> {
  await send(user.email, "password-reset", {
    preheader: "The link works for the next 24 hours.",
    action_url: `${APP_URL}/reset-password?resetToken=${token}`,
  });
}

// Helper: Send a group invitation email
export async function sendGroupInviteEmail(
  email: string,
  token: string,
  groupName: string,
  invitedByName: string,
): Promise<void> {
  await send(email, "group-invite", {
    preheader: `Join ${groupName} and you'll both see the same figures.`,
    group_name: groupName,
    invited_by: invitedByName,
    action_url: `${APP_URL}/accept-invite?token=${token}`,
  });
}

export async function sendWeeklyReminderEmail(
  user: PrismaUser,
  model: {
    week_range: string;
    total_spent: string;
    budget_left: string;
    total_budget_week: string;
    /** Flips the second figure from "Left" in green to "Over" in red. */
    over_budget: boolean;
  },
): Promise<void> {
  if (!user.email) return;

  await send(user.email, "weekly-reminder", {
    preheader: "And where that leaves the rest of the week.",
    action_url: APP_URL,
    // `/profile` until now, which is not a route: `App.tsx` registers
    // `/settings`, so the unsubscribe link fell through to the catch-all and
    // landed people on the login page.
    settings_url: `${APP_URL}/settings`,
    ...model,
  });
}
