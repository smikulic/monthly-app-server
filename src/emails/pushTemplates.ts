/**
 * Pushes `emails/` up to Postmark.
 *
 *   yarn emails:push          # upload
 *   yarn emails:push --dry    # show what would change, send nothing
 *
 * Deliberately **not** part of `yarn build`. Unlike the demo dataset, an email
 * template is worth looking at before it reaches anyone: Postmark's preview
 * renders it across real clients, and a layout that breaks in Outlook is not
 * something a deploy should discover on a customer's behalf.
 *
 * Creates what is missing and updates what exists, so it is safe to re-run and
 * safe on a fresh Postmark server.
 */
// Loaded here rather than relied on: the app picks `.env` up via
// `prismaClient.ts`, which this script has no reason to import.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import postmark from "postmark";
import { POSTMARK_API_KEY } from "../config/constants.js";
import {
  emailTemplates,
  LAYOUT_ALIAS,
  LAYOUT_FILE,
  LAYOUT_NAME,
} from "./templates.js";

const EMAILS_DIR = join(process.cwd(), "emails");

const read = (file: string, extension: "html" | "txt") =>
  readFileSync(join(EMAILS_DIR, `${file}.${extension}`), "utf8");

const dryRun = process.argv.includes("--dry");

/**
 * Built on demand. Postmark's constructor throws on a missing token, so
 * creating it eagerly meant `--dry` — the one mode that needs no credentials,
 * and the one you would run on a fresh clone or in CI — crashed before printing
 * anything.
 */
let client: postmark.ServerClient | null = null;
const postmarkClient = () =>
  (client ??= new postmark.ServerClient(POSTMARK_API_KEY));

/** Postmark throws rather than returning null for an unknown alias. */
const exists = async (alias: string) => {
  try {
    await postmarkClient().getTemplate(alias);
    return true;
  } catch {
    return false;
  }
};

const push = async (
  alias: string,
  body: {
    Name: string;
    Subject?: string;
    HtmlBody: string;
    TextBody: string;
    TemplateType: postmark.Models.TemplateTypes;
    LayoutTemplate?: string;
  },
) => {
  // Telling create from update needs a call, which needs a token. Without one
  // a dry run still reports what it would touch rather than failing.
  if (dryRun && !POSTMARK_API_KEY) {
    console.log(`[emails] would push ${alias} (no API key set)`);
    return;
  }

  const already = await exists(alias);
  const verb = already ? "update" : "create";

  if (dryRun) {
    console.log(`[emails] would ${verb} ${alias}`);
    return;
  }

  if (already) {
    await postmarkClient().editTemplate(alias, body);
  } else {
    await postmarkClient().createTemplate({ ...body, Alias: alias });
  }

  console.log(`[emails] ${verb}d ${alias}`);
};

try {
  // The layout first: a template referencing a layout that does not exist yet
  // is rejected outright.
  await push(LAYOUT_ALIAS, {
    Name: LAYOUT_NAME,
    HtmlBody: read(LAYOUT_FILE, "html"),
    TextBody: read(LAYOUT_FILE, "txt"),
    TemplateType: postmark.Models.TemplateTypes.Layout,
  });

  for (const template of emailTemplates) {
    await push(template.alias, {
      Name: template.name,
      Subject: template.subject,
      HtmlBody: read(template.file, "html"),
      TextBody: read(template.file, "txt"),
      TemplateType: postmark.Models.TemplateTypes.Standard,
      LayoutTemplate: LAYOUT_ALIAS,
    });
  }

  console.log(
    dryRun
      ? "[emails] dry run only — nothing was sent"
      : "[emails] done. Preview them in Postmark before the next send.",
  );
} catch (error) {
  console.error("[emails] push failed", error);
  process.exitCode = 1;
}
