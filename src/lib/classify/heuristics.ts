import type { ContactKind } from "@/lib/types/database";

export type Classification = {
  kind: ContactKind;
  reason: string;
  isHidden: boolean;
};

export type ClassifyInput = {
  email: string;
  displayName: string | null;
  messageCount: number;
  // v2 signals — sync.ts populates these from Gmail headers + direction parsing.
  hasUnsubscribe?: boolean;
  userRepliedCount?: number;
  userSentCount?: number;
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

// Local-parts that almost always indicate retail / transactional bulk mail.
// Caught BEFORE the generic newsletter/automated rules so we can flag them
// `is_hidden=true`.
const TRANSACTIONAL_LOCAL_RE =
  /^(shop|deals?|offers?|sale|sales|orders?|tickets?|reservations?|bookings?|accounts?|statements?|receipts?|invoices?|delivery|shipping|tracking|rewards?|loyalty|promo|promotions?)([._+-].*)?$/;

// Brand retail subdomains (emails.macys.com, e.link.com, reply.ebay.com,
// emails.flyfrontier.com, mailer.brand.tld, etc.). Brand owns the apex,
// uses a subdomain for outbound marketing — strong B2C signal.
const RETAIL_SUBDOMAIN_RE =
  /^(emails?|e|em|mail|mailer|reply|news|notifications?|newsletter|message|messaging|info|update|updates|comms|hello|do-not-reply|donotreply|noreply|no-reply)\.[a-z0-9-]+\.[a-z]{2,}$/;

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

function nameLooksLikeNewsletter(name: string | null): boolean {
  if (!name) return false;
  return NEWSLETTER_NAME_PATTERNS.some((re) => re.test(name));
}

/**
 * Heuristic classifier. Returns null when no rule fires — those go to the
 * Claude fallback in `lib/classify/llm.ts`.
 *
 * v2 contract: returns { kind, reason, isHidden }. `isHidden=true` flags
 * contacts that should be soft-archived from the default contact list (the
 * "Hidden" tab still surfaces them, and the user can unhide).
 */
export function heuristicClassify(input: ClassifyInput): Classification | null {
  const email = input.email.toLowerCase();
  const local = localPart(email);
  const domain = domainPart(email);
  const name = input.displayName?.trim() ?? null;
  const replied = input.userRepliedCount ?? 0;
  const hasUnsub = input.hasUnsubscribe ?? false;

  // Rule 1: explicit noreply locals.
  if (NOREPLY_LOCAL.has(local)) {
    return {
      kind: "noreply",
      reason: `noreply local-part (${local})`,
      isHidden: replied === 0,
    };
  }
  for (const prefix of NOREPLY_PREFIXES) {
    if (local.startsWith(`${prefix}+`) || local.startsWith(`${prefix}-`)) {
      return {
        kind: "noreply",
        reason: `noreply prefix (${prefix})`,
        isHidden: replied === 0,
      };
    }
  }

  // Rule 2: List-Unsubscribe header → bulk mail. If it looks like a real
  // newsletter (display name or local part matches a newsletter pattern)
  // keep it visible so the digest can pick it up. Otherwise it's brand
  // marketing — auto-hide.
  if (hasUnsub && replied === 0) {
    const looksNewsletter =
      nameLooksLikeNewsletter(name) || NEWSLETTER_LOCALS.has(local);
    if (looksNewsletter) {
      return {
        kind: "newsletter",
        reason: "List-Unsubscribe + newsletter signal",
        isHidden: false,
      };
    }
    return {
      kind: "bulk_marketing",
      reason: "List-Unsubscribe header (bulk mail you've never replied to)",
      isHidden: true,
    };
  }

  // Rule 3: transactional local-parts (shop@, deals@, orders@, invoices@…).
  if (TRANSACTIONAL_LOCAL_RE.test(local) && replied === 0) {
    return {
      kind: "transactional",
      reason: `transactional local-part (${local})`,
      isHidden: true,
    };
  }

  // Rule 4: retail subdomain pattern (emails.brand.com, reply.brand.com,
  // e.brand.com, mailer.brand.tld). Almost always marketing.
  if (RETAIL_SUBDOMAIN_RE.test(domain) && replied === 0) {
    return {
      kind: "bulk_marketing",
      reason: `retail subdomain pattern (${domain})`,
      isHidden: true,
    };
  }

  // Rule 5: automated prefixes (notifications@, billing@, security@…).
  for (const prefix of AUTOMATED_PREFIXES) {
    if (local === prefix || local.startsWith(`${prefix}-`) || local.startsWith(`${prefix}.`)) {
      return {
        kind: "automated",
        reason: `automated prefix (${prefix})`,
        isHidden: replied === 0,
      };
    }
  }

  // Rule 6: newsletter-ish locals.
  if (NEWSLETTER_LOCALS.has(local)) {
    if (input.messageCount >= 2) {
      return {
        kind: "newsletter",
        reason: `newsletter local-part (${local})`,
        isHidden: false,
      };
    }
    return {
      kind: "automated",
      reason: `single-msg ${local}@ probably automated`,
      isHidden: true,
    };
  }

  // Rule 7: display-name gives it away.
  if (nameLooksLikeNewsletter(name)) {
    return {
      kind: "newsletter",
      reason: "display-name newsletter pattern",
      isHidden: false,
    };
  }

  // Rule 8: known transactional / marketing ESP domains.
  if (isLikelyAutomatedDomain(domain)) {
    return {
      kind: "automated",
      reason: `transactional domain ${domain}`,
      isHidden: replied === 0,
    };
  }

  // Rule 9: one-off, no display name — almost always automation noise.
  if (input.messageCount === 1 && !name) {
    return {
      kind: "automated",
      reason: "single message and no display name",
      isHidden: replied === 0,
    };
  }

  // Defer to LLM.
  return null;
}
