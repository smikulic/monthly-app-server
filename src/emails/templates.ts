/**
 * What Postmark should be serving, declared here rather than in its dashboard.
 *
 * Until now the templates existed only in Postmark: no history, no review, no
 * way to tell from this repo what any email actually said. The bodies now live
 * in `emails/`, this file names them, and `yarn emails:push` syncs them up.
 *
 * Subjects belong here too — they are the half of the email most people read.
 */

export interface EmailTemplate {
  /** Must match the `TemplateAlias` used in `helpers/emails.ts`. */
  alias: string;
  /** Shown in Postmark's own list. */
  name: string;
  subject: string;
  /** Basename in `emails/`, expecting a `.html` and a `.txt`. */
  file: string;
  /**
   * Sample values for Postmark's preview. Not used when sending — the real
   * model comes from `helpers/emails.ts` — but a template previewed with empty
   * variables is a template nobody proofreads properly.
   */
  testModel: Record<string, unknown>;
}

export const LAYOUT_ALIAS = "monthly-layout";
export const LAYOUT_NAME = "Monthly";
export const LAYOUT_FILE = "layout";

const SUPPORT_URL = "mailto:support@yourmonthly.app";

export const emailTemplates: EmailTemplate[] = [
  {
    alias: "email-confirmation",
    name: "Confirm email",
    // No product name in the subject: the sender already says Monthly, and
    // repeating it costs characters in the ~40 an inbox shows on a phone.
    subject: "Confirm your email address",
    file: "email-confirmation",
    testModel: {
      name: "Ana",
      preheader: "One click and your budget is ready to set up.",
      action_url: "https://app.yourmonthly.app/confirm-email?token=sample",
      support_url: SUPPORT_URL,
    },
  },
  {
    alias: "password-reset",
    name: "Password reset",
    subject: "Reset your Monthly password",
    file: "password-reset",
    testModel: {
      preheader: "The link works for the next 24 hours.",
      action_url: "https://app.yourmonthly.app/reset-password?resetToken=sample",
      support_url: SUPPORT_URL,
    },
  },
  {
    alias: "group-invite",
    name: "Household invite",
    // The inviter's name is the whole reason this gets opened, so it leads.
    subject: "{{invited_by}} invited you to share a budget",
    file: "group-invite",
    testModel: {
      preheader: "One budget, both of you, same figures.",
      invited_by: "Ana",
      group_name: "Household",
      action_url: "https://app.yourmonthly.app/accept-invite?token=sample",
      support_url: SUPPORT_URL,
    },
  },
  {
    alias: "weekly-reminder",
    name: "Weekly recap",
    // The figure goes in the subject: it is the one thing worth knowing
    // without opening anything.
    subject: "You spent {{total_spent}} this week",
    file: "weekly-reminder",
    testModel: {
      preheader: "And where that leaves the rest of the week.",
      week_range: "9 Sep – 15 Sep, 2026",
      total_spent: "€412",
      budget_left: "€88",
      total_budget_week: "€500",
      over_budget: false,
      action_url: "https://app.yourmonthly.app",
      settings_url: "https://app.yourmonthly.app/settings",
    },
  },
];
