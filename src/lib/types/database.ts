/**
 * Hand-written database types. Keep in sync with supabase/migrations/.
 * Run `supabase gen types typescript` once the project is linked to autogen.
 */

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

export type ContactSource = "gmail" | "linkedin" | "manual";

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
  age_bracket?: string | null; // e.g. "20s", "30s", "40s"
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
      google_connections: {
        Row: {
          clerk_user_id: string;
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
          clerk_user_id: string;
          google_email: string;
          refresh_token_encrypted: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          scopes?: string[];
          last_sync_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["google_connections"]["Insert"]
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
          kind: ContactKind;
          kind_reason: string | null;
          kind_locked: boolean;
          is_pinned: boolean;
          ai_summary: string | null;
          ai_summary_at: string | null;
          source: ContactSource;
          is_hidden: boolean;
          hidden_reason: string | null;
          linkedin_url: string | null;
          company: string | null;
          job_title: string | null;
          industry: string | null;
          location: string | null;
          birthday: string | null;
          tags: string[];
          notes: string | null;
          user_sent_count: number;
          user_replied_count: number;
          score_closeness: number | null;
          score_keep_in_touch: number | null;
          score_industry_overlap: number | null;
          score_age_proximity: number | null;
          score_career_relevance: number | null;
          scores_rationale: ScoresRationale | null;
          scores_at: string | null;
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
          ai_summary?: string | null;
          ai_summary_at?: string | null;
          source?: ContactSource;
          is_hidden?: boolean;
          hidden_reason?: string | null;
          linkedin_url?: string | null;
          company?: string | null;
          job_title?: string | null;
          industry?: string | null;
          location?: string | null;
          birthday?: string | null;
          tags?: string[];
          notes?: string | null;
          user_sent_count?: number;
          user_replied_count?: number;
          score_closeness?: number | null;
          score_keep_in_touch?: number | null;
          score_industry_overlap?: number | null;
          score_age_proximity?: number | null;
          score_career_relevance?: number | null;
          scores_rationale?: ScoresRationale | null;
          scores_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [];
      };
      threads: {
        Row: {
          id: string;
          clerk_user_id: string;
          gmail_thread_id: string;
          subject: string | null;
          snippet: string | null;
          last_message_at: string | null;
          created_at: string;
          body_excerpt: string | null;
          has_unsubscribe: boolean;
          reply_to: string | null;
          user_participated: boolean;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          gmail_thread_id: string;
          subject?: string | null;
          snippet?: string | null;
          last_message_at?: string | null;
          body_excerpt?: string | null;
          has_unsubscribe?: boolean;
          reply_to?: string | null;
          user_participated?: boolean;
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
