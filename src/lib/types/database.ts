/**
 * Hand-written database types. Keep in sync with supabase/migrations/.
 * Run `supabase gen types typescript` once the project is linked to autogen.
 */

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          clerk_user_id: string;
          email: string | null;
          created_at: string;
        };
        Insert: {
          clerk_user_id: string;
          email?: string | null;
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
          email: string;
          display_name: string | null;
          last_interaction_at: string | null;
          message_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          email: string;
          display_name?: string | null;
          last_interaction_at?: string | null;
          message_count?: number;
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
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          gmail_thread_id: string;
          subject?: string | null;
          snippet?: string | null;
          last_message_at?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
