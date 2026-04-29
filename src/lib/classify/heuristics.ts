import type { ContactKind } from "@/lib/types/database";

export type Classification = {
  kind: ContactKind;
  reason: string;
};

export type ClassifyInput = {
  email: string;
  displayName: string | null;
  messageCount: number;
};

const NOREPLY_LOCAL = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "bounce",
  "bounces",
  "postmaster",
  "noreply-comments",
]);

const NOREPLY_PREFIXES = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "bounce",
  "bounces",
];

const AUTOMATED_PREFIXES = [
  "notification",
  "notifications",
  "alert",
  "alerts",
  "auto",
  "automated",
  "system",
  "billing",
  "receipt",
  "receipts",
  "invoice",
  "invoices",
  "support",
  "security",
  "verify",
  "verification",
  "noreply-",
];

const NEWSLETTER_LOCALS = new Set([
  "marketing",
  "newsletter",
  "newsletters",
  "news",
  "digest",
  "digests",
  "updates",
  "weekly",
  "daily",
  "team",
  "info",
  "hello",
  "contact",
  "press",
  "media",
  "comms",
  "communications",
]);

// Display-name regexes — matched case-insensitively against the display
// name (if any).
const NEWSLETTER_NAME_PATTERNS = [
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bdaily\b/i,
  /\bweekly\b/i,
  /\bmonthly\b/i,
  /\balert(s)?\b/i,
  /\bupdate(s)?\b/i,
  /\bbulletin\b/i,
  /\b(via)\b/i, // "Author via Substack"
];

// Common transactional ESP / marketing-mail domains. Curated, not exhaustive.
const AUTOMATED_DOMAIN_SUFFIXES = [
  "amazonses.com",
  "sendgrid.net",
  "sendgrid.com",
  "mailgun.org",
  "mailgun.net",
  "sparkpostmail.com",
  "postmarkapp.com",
  "mandrillapp.com",
  "intercom-mail.com",
  "intercom-mail-2.com",
  "bounce.linkedin.com",
  "bnc.lt",
  "e.linkedin.com",
  "el.linkedin.com",
  "mailer.linkedin.com",
  "notify.spotify.com",
  "ml.spotify.com",
  "email.spotify.com",
  "noreply.youtube.com",
  "youtube-noreply.google.com",
  "facebookmail.com",
  "twittermail.com",
  "x.com.mail",
  "discordapp.com",
  "discord.com.notifications",
  "github.gh-mail.com",
  "noreply.github.com",
  "alerts.github.com",
  "notifications.github.com",
  "stripe.com.mail",
  "email.medium.com",
  "mail.notion.so",
  "notion.email",
  "email.airbnb.com",
  "doordash.com.mail",
  "ubermail.com",
  "uber.com.notif",
  "mailer-",
  "bounce-",
  "em-",
  "e-",
  "smtp.",
];

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? email : email.slice(0, at);
}

function domainPart(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? "" : email.slice(at + 1);
}

function isLikelyAutomatedDomain(domain: string): boolean {
  return AUTOMATED_DOMAIN_SUFFIXES.some(
    (suffix) =>
      domain === suffix ||
      domain.endsWith(`.${suffix}`) ||
      domain.startsWith(suffix),
  );
}

/**
 * Heuristic classifier. Returns null when no rule fires — those go to the
 * Claude fallback in `lib/classify/llm.ts`.
 */
export function heuristicClassify(input: ClassifyInput): Classification | null {
  const email = input.email.toLowerCase();
  const local = localPart(email);
  const domain = domainPart(email);
  const name = input.displayName?.trim() ?? null;

  // Rule 1: explicit noreply locals.
  if (NOREPLY_LOCAL.has(local)) {
    return { kind: "noreply", reason: `noreply local-part (${local})` };
  }
  for (const prefix of NOREPLY_PREFIXES) {
    if (local.startsWith(`${prefix}+`) || local.startsWith(`${prefix}-`)) {
      return { kind: "noreply", reason: `noreply prefix (${prefix})` };
    }
  }

  // Rule 2: automated prefixes.
  for (const prefix of AUTOMATED_PREFIXES) {
    if (local === prefix || local.startsWith(`${prefix}-`) || local.startsWith(`${prefix}.`)) {
      return { kind: "automated", reason: `automated prefix (${prefix})` };
    }
  }

  // Rule 3: newsletter-ish locals.
  if (NEWSLETTER_LOCALS.has(local)) {
    return input.messageCount >= 2
      ? { kind: "newsletter", reason: `newsletter local-part (${local})` }
      : { kind: "automated", reason: `single-msg ${local}@ probably automated` };
  }

  // Rule 4: display-name gives it away.
  if (name) {
    for (const re of NEWSLETTER_NAME_PATTERNS) {
      if (re.test(name)) {
        return { kind: "newsletter", reason: `display-name pattern ${re}` };
      }
    }
  }

  // Rule 5: known transactional / marketing domains.
  if (isLikelyAutomatedDomain(domain)) {
    return { kind: "automated", reason: `transactional domain ${domain}` };
  }

  // Rule 6: one-off, no display name — almost always automation noise.
  if (input.messageCount === 1 && !name) {
    return {
      kind: "automated",
      reason: "single message and no display name",
    };
  }

  // Defer to LLM.
  return null;
}
