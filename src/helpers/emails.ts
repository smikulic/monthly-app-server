import postmark from "postmark";
import { User as PrismaUser } from "@prisma/client";
import { POSTMARK_API_KEY } from "../config/constants.js";

// Postmark client for sending emails
const postmarkClient = new postmark.ServerClient(POSTMARK_API_KEY);

// Helper: Send confirmation email
export async function sendConfirmationEmail(
  user: PrismaUser,
  token: string,
): Promise<void> {
  await postmarkClient.sendEmailWithTemplate({
    From: "support@yourmonthly.app",
    To: user.email,
    TemplateAlias: "email-confirmation",
    TemplateModel: {
      product_name: "Monthly App",
      action_url: `https://app.yourmonthly.app/confirm-email?token=${token}`,
      support_url: "support@yourmonthly.app",
    },
    MessageStream: "outbound",
  });
}

// Helper: Send password reset email
export async function sendPasswordResetEmail(
  user: PrismaUser,
  token: string,
): Promise<void> {
  await postmarkClient.sendEmailWithTemplate({
    From: "support@yourmonthly.app",
    To: user.email,
    TemplateAlias: "password-reset",
    TemplateModel: {
      product_name: "Monthly App",
      action_url: `https://app.yourmonthly.app/reset-password?resetToken=${token}`,
      support_url: "support@yourmonthly.app",
    },
    MessageStream: "outbound",
  });
}

// Helper: Send a group invitation email
export async function sendGroupInviteEmail(
  email: string,
  token: string,
  groupName: string,
  invitedByName: string,
): Promise<void> {
  await postmarkClient.sendEmailWithTemplate({
    From: "support@yourmonthly.app",
    To: email,
    TemplateAlias: "group-invite",
    TemplateModel: {
      product_name: "Monthly App",
      group_name: groupName,
      invited_by: invitedByName,
      action_url: `https://app.yourmonthly.app/accept-invite?token=${token}`,
      support_url: "support@yourmonthly.app",
    },
    MessageStream: "outbound",
  });
}

export async function sendWeeklyReminderEmail(
  user: PrismaUser,
  model: {
    week_range: string;
    total_spent: string;
    budget_left: string;
    total_budget_week: string;
  },
): Promise<void> {
  if (!user.email) return;

  await postmarkClient.sendEmailWithTemplate({
    From: "support@yourmonthly.app",
    To: user.email,
    TemplateAlias: "weekly-reminder",
    TemplateModel: {
      product_name: "Monthly App",
      action_url: "https://app.yourmonthly.app",
      settings_url: "https://app.yourmonthly.app/profile",
      ...model,
    },
    MessageStream: "outbound",
  });
}
