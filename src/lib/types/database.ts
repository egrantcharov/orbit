/**
 * Hand-written database types. Keep in sync with supabase/migrations/.
 * Run `supabase gen types typescript` once the project is linked to autogen.
 *
 * v3 (CSV-first): contacts are owned by the user; mailbox_connections are
 * pluggable per-provider. The v2 `kind`/`is_hidden` columns are deprecated
 * but still present in the schema until migration 0007 drops them.
 */

// `kind` is deprecated in v3 — kept for read-back of legacy rows only.
export type ContactKind =
  | "person"
  | "newsletter"
  | "automated"
  | "noreply"
  | "spam"
  | "bulk_marketing"
  | "transactional"
  | "unknown";

export const CONTACT_KINDS: ContactKind[] = [
  "person",
  "newsletter",
  "automated",
  "noreply",
  "spam",
  "bulk_marketing",
  "transactional",
  "unknown",
];

export type ContactSource =
  | "gmail"
  | "linkedin"
  | "manual"
  | "csv"
  | "enrichment_stub";

export type MailboxProvider = "gmail" | "outlook";

export type EnrichmentStatus =
  | "idle"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type InteractionKind =
  | "email_thread"
  | "calendar_event"
  | "note"
  | "voice_memo"
  | "phone"
  | "imessage";

export type BriefingKind = "today" | "meeting";

export type TodayBriefingCard = {
  id: string;
  kind:
    | "drifting"
    | "birthday"
    | "unanswered"
    | "upcoming_meeting"
    | "scheduled_followup"
    | "general";
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  headline: string;
  reason: string;
  action: {
    type: "email" | "schedule" | "open_brief" | "open_contact" | "external";
    label: string;
    href?: string;
    suggestedSubject?: string;
    intent?: string;
  };
};

export type TodayBriefingBody = {
  generatedAt: string;
  cards: TodayBriefingCard[];
};

export type MeetingBriefingBody = {
  eventId: string;
  eventSummary: string;
  startISO: string;
  attendees: Array<{ email: string; displayName: string | null; contactId?: string | null }>;
  brief: string; // markdown
  talkingPoints: string[];
};

export type BookmarkKind =
  | "github"
  | "newsletter"
  | "article"
  | "tool"
  | "other";

export const BOOKMARK_KINDS: BookmarkKind[] = [
  "github",
  "newsletter",
  "article",
  "tool",
  "other",
];

export type SelfProfile = {
  industry?: string | null;
  role?: string | null;
  age_bracket?: string | null;
  location?: string | null;
};

export type ScoresRationale = {
  closeness?: string;
  keep_in_touch?: string;
  industry_overlap?: string;
  age_proximity?: string;
  career_relevance?: string;
};

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          clerk_user_id: string;
          email: string | null;
          self_profile: SelfProfile;
          created_at: string;
        };
        Insert: {
          clerk_user_id: string;
          email?: string | null;
          self_profile?: SelfProfile;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_users"]["Insert"]>;
        Relationships: [];
      };
      mailbox_connections: {
        Row: {
          id: string;
          clerk_user_id: string;
          provider: MailboxProvider;
          account_email: string;
          // Legacy column from v1 — still populated, redundant with account_email.
          google_email: string;
          refresh_token_encrypted: string;
          access_token: string | null;
          access_token_expires_at: string | null;
          scopes: string[];
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          provider?: MailboxProvider;
          account_email: string;
          google_email: string;
          refresh_token_encrypted: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          scopes?: string[];
          last_sync_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["mailbox_connections"]["Insert"]
        >;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          clerk_user_id: string;
          email: string | null;
          display_name: string | null;
          last_interaction_at: string | null;
          message_count: number;
          created_at: string;
          // Deprecated v2 fields — present in schema, ignored by v3 code.
          kind: ContactKind;
          kind_reason: string | null;
          kind_locked: boolean;
          is_hidden: boolean;
          hidden_reason: string | null;
          // v2 fields kept by v3
          is_pinned: boolean;
          ai_summary: string | null;
          ai_summary_at: string | null;
          source: ContactSource;
          linkedin_url: string | null;
          company: string | null;
          job_title: string | null;
          industry: string | null;
          location: string | null;
          birthday: string | null;
          tags: string[];
          notes: string | null;
          met_at: string | null;
          met_on: string | null;
          met_via: string | null;
          interests: string | null;
          sector: string | null;
          team: string | null;
          school: string | null;
          user_sent_count: number;
          user_replied_count: number;
          score_closeness: number | null;
          score_keep_in_touch: number | null;
          score_industry_overlap: number | null;
          score_age_proximity: number | null;
          score_career_relevance: number | null;
          scores_rationale: ScoresRationale | null;
          scores_at: string | null;
          // v3 new
          is_archived: boolean;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          email?: string | null;
          display_name?: string | null;
          last_interaction_at?: string | null;
          message_count?: number;
          kind?: ContactKind;
          kind_reason?: string | null;
          kind_locked?: boolean;
          is_pinned?: boolean;
          is_hidden?: boolean;
          hidden_reason?: string | null;
          ai_summary?: string | null;
          ai_summary_at?: string | null;
          source?: ContactSource;
          linkedin_url?: string | null;
          company?: string | null;
          job_title?: string | null;
          industry?: string | null;
          location?: string | null;
          birthday?: string | null;
          tags?: string[];
          notes?: string | null;
          met_at?: string | null;
          met_on?: string | null;
          met_via?: string | null;
          interests?: string | null;
          sector?: string | null;
          team?: string | null;
          school?: string | null;
          user_sent_count?: number;
          user_replied_count?: number;
          score_closeness?: number | null;
          score_keep_in_touch?: number | null;
          score_industry_overlap?: number | null;
          score_age_proximity?: number | null;
          score_career_relevance?: number | null;
          scores_rationale?: ScoresRationale | null;
          scores_at?: string | null;
          is_archived?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      threads: {
        Row: {
          id: string;
          clerk_user_id: string;
          mailbox_id: string | null;
          provider_thread_id: string | null;
          // Legacy column — redundant with provider_thread_id.
          gmail_thread_id: string;
          subject: string | null;
          snippet: string | null;
          last_message_at: string | null;
          created_at: string;
          body_excerpt: string | null;
          has_unsubscribe: boolean;
          reply_to: string | null;
          user_participated: boolean;
          content_hash: string | null;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          mailbox_id?: string | null;
          provider_thread_id?: string | null;
          gmail_thread_id: string;
          subject?: string | null;
          snippet?: string | null;
          last_message_at?: string | null;
          body_excerpt?: string | null;
          has_unsubscribe?: boolean;
          reply_to?: string | null;
          user_participated?: boolean;
          content_hash?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["threads"]["Insert"]>;
        Relationships: [];
      };
      thread_participants: {
        Row: {
          thread_id: string;
          contact_id: string;
          role: "from" | "to" | "cc";
        };
        Insert: {
          thread_id: string;
          contact_id: string;
          role: "from" | "to" | "cc";
        };
        Update: Partial<
          Database["public"]["Tables"]["thread_participants"]["Insert"]
        >;
        Relationships: [];
      };
      enrichment_state: {
        Row: {
          clerk_user_id: string;
          mailbox_id: string;
          contact_id: string;
          status: EnrichmentStatus;
          threads_found: number;
          last_run_at: string | null;
          error_message: string | null;
        };
        Insert: {
          clerk_user_id: string;
          mailbox_id: string;
          contact_id: string;
          status?: EnrichmentStatus;
          threads_found?: number;
          last_run_at?: string | null;
          error_message?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["enrichment_state"]["Insert"]
        >;
        Relationships: [];
      };
      interactions: {
        Row: {
          id: string;
          clerk_user_id: string;
          contact_id: string;
          kind: InteractionKind;
          occurred_at: string;
          title: string | null;
          body: string | null;
          source_id: string | null;
          source_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          contact_id: string;
          kind: InteractionKind;
          occurred_at?: string;
          title?: string | null;
          body?: string | null;
          source_id?: string | null;
          source_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["interactions"]["Insert"]>;
        Relationships: [];
      };
      briefings: {
        Row: {
          id: string;
          clerk_user_id: string;
          kind: BriefingKind;
          ref_id: string | null;
          body: TodayBriefingBody | MeetingBriefingBody;
          generated_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          kind: BriefingKind;
          ref_id?: string | null;
          body: TodayBriefingBody | MeetingBriefingBody;
          generated_at?: string;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["briefings"]["Insert"]>;
        Relationships: [];
      };
      publications: {
        Row: {
          id: string;
          clerk_user_id: string;
          name: string;
          feed_url: string;
          site_url: string | null;
          description: string | null;
          favicon_url: string | null;
          last_polled_at: string | null;
          poll_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          name: string;
          feed_url: string;
          site_url?: string | null;
          description?: string | null;
          favicon_url?: string | null;
          last_polled_at?: string | null;
          poll_error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["publications"]["Insert"]>;
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          clerk_user_id: string;
          publication_id: string;
          guid: string | null;
          url: string;
          title: string | null;
          author: string | null;
          snippet: string | null;
          content_excerpt: string | null;
          published_at: string | null;
          fetched_at: string;
          is_read: boolean;
          is_starred: boolean;
          tldr: string | null;
          tldr_takeaways: string[] | null;
          tldr_at: string | null;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          publication_id: string;
          guid?: string | null;
          url: string;
          title?: string | null;
          author?: string | null;
          snippet?: string | null;
          content_excerpt?: string | null;
          published_at?: string | null;
          fetched_at?: string;
          is_read?: boolean;
          is_starred?: boolean;
          tldr?: string | null;
          tldr_takeaways?: string[] | null;
          tldr_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["articles"]["Insert"]>;
        Relationships: [];
      };
      bookmarks: {
        Row: {
          id: string;
          clerk_user_id: string;
          url: string;
          title: string | null;
          description: string | null;
          kind: BookmarkKind;
          tags: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          url: string;
          title?: string | null;
          description?: string | null;
          kind?: BookmarkKind;
          tags?: string[];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bookmarks"]["Insert"]>;
        Relationships: [];
      };
      digests: {
        Row: {
          clerk_user_id: string;
          week_start: string;
          body: string;
          contacts_in: number;
          threads_in: number;
          created_at: string;
        };
        Insert: {
          clerk_user_id: string;
          week_start: string;
          body: string;
          contacts_in?: number;
          threads_in?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["digests"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
