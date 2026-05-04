import type { MailboxAdapter } from "@/lib/mailbox/types";
import type { MailboxProvider } from "@/lib/types/database";
import { gmailAdapter } from "@/lib/mailbox/gmail";

export function getAdapter(provider: MailboxProvider): MailboxAdapter {
  switch (provider) {
    case "gmail":
      return gmailAdapter;
    case "outlook":
      throw new Error("Outlook adapter not yet implemented (v3.5)");
  }
}

export type { MailboxAdapter } from "@/lib/mailbox/types";
