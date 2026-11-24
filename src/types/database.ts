export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Theme = "light" | "dark" | "system";
export type ReportingCurrency = "PKR" | "USD";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high" | null;
export type GoalItemStatus =
  | "not_started"
  | "in_progress"
  | "practicing"
  | "done";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          timezone: string;
          display_name: string | null;
          theme: Theme;
          reporting_currency: ReportingCurrency;
          reminders_enabled: boolean;
          hide_amounts_on_lock_screen: boolean;
          saved_chats_enabled: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          timezone?: string;
          display_name?: string | null;
          theme?: Theme;
          reporting_currency?: ReportingCurrency;
          reminders_enabled?: boolean;
          hide_amounts_on_lock_screen?: boolean;
          saved_chats_enabled?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          timezone?: string;
          display_name?: string | null;
          theme?: Theme;
          reporting_currency?: ReportingCurrency;
          reminders_enabled?: boolean;
          hide_amounts_on_lock_screen?: boolean;
          saved_chats_enabled?: boolean;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      mutation_receipts: {
        Row: {
          id: string;
          owner_id: string;
          idempotency_key: string;
          request_hash: string;
          resource_id: string | null;
          response_body: Json;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          idempotency_key: string;
          request_hash: string;
          resource_id?: string | null;
          response_body?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          idempotency_key?: string;
          request_hash?: string;
          resource_id?: string | null;
          response_body?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      app_singleton: {
        Row: {
          id: number;
          allowed_owner_email: string;
        };
        Insert: {
          id?: number;
          allowed_owner_email: string;
        };
        Update: {
          id?: number;
          allowed_owner_email?: string;
        };
      };
      goals: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          notes: string | null;
          deadline_date: string | null;
          archived_at: string | null;
          position: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          notes?: string | null;
          deadline_date?: string | null;
          archived_at?: string | null;
          position: string;
          version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["goals"]["Insert"]>;
      };
      goal_items: {
        Row: {
          id: string;
          goal_id: string;
          owner_id: string;
          title: string;
          status: GoalItemStatus;
          position: string;
          status_changed_at: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          goal_id: string;
          owner_id: string;
          title: string;
          status?: GoalItemStatus;
          position: string;
          status_changed_at?: string;
          version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["goal_items"]["Insert"]>;
      };
      tasks: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          notes: string | null;
          status: TaskStatus;
          priority: TaskPriority;
          local_date: string | null;
          start_time: string | null;
          end_time: string | null;
          goal_item_id: string | null;
          position: string;
          completed_at: string | null;
          recurrence_template_id: string | null;
          recurrence_date: string | null;
          detached: boolean;
          client_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          notes?: string | null;
          status?: TaskStatus;
          priority?: TaskPriority;
          local_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          goal_item_id?: string | null;
          position: string;
          completed_at?: string | null;
          recurrence_template_id?: string | null;
          recurrence_date?: string | null;
          detached?: boolean;
          client_id?: string | null;
          version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
      };
      recurrence_templates: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          notes: string | null;
          priority: TaskPriority;
          cadence: "daily" | "weekly";
          weekdays: number[];
          start_date: string;
          end_date: string | null;
          position: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      recurrence_skips: {
        Row: {
          id: string;
          owner_id: string;
          template_id: string;
          local_date: string;
          created_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      accounts: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          currency: "PKR" | "USD";
          opening_balance_minor: string;
          archived_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      categories: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          kind: "expense" | "income";
          archived_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      fx_rates: {
        Row: {
          id: string;
          owner_id: string;
          effective_on: string;
          pkr_minor_per_usd: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      transfer_groups: {
        Row: {
          id: string;
          owner_id: string;
          occurred_on: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      ledger_entries: {
        Row: {
          id: string;
          owner_id: string;
          account_id: string;
          category_id: string | null;
          kind: "expense" | "income" | "transfer";
          amount_minor: string;
          currency: "PKR" | "USD";
          occurred_on: string;
          note: string | null;
          voided_at: string | null;
          transfer_group_id: string | null;
          transfer_leg: "out" | "in" | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      budgets: {
        Row: {
          id: string;
          owner_id: string;
          category_id: string;
          month: string;
          currency: "PKR" | "USD";
          amount_minor: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      savings_funds: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          kind: "purchase" | "general";
          currency: "PKR" | "USD";
          target_minor: string;
          start_month: string;
          deadline_month: string;
          opening_allocation_minor: string;
          purchased_at: string | null;
          purchase_expense_id: string | null;
          archived_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      savings_entries: {
        Row: {
          id: string;
          owner_id: string;
          fund_id: string;
          kind: "contribution" | "withdrawal" | "release";
          amount_minor: string;
          occurred_on: string;
          note: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      reminders: {
        Row: {
          id: string;
          owner_id: string;
          subject_type: "task" | "savings_fund";
          subject_id: string;
          fire_at: string;
          dedupe_key: string;
          enabled: boolean;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
      push_subscriptions: {
        Row: {
          id: string;
          owner_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      move_task: {
        Args: {
          p_task_id: string;
          p_to_status: string;
          p_position: string;
          p_base_version: number;
          p_idempotency_key?: string | null;
        };
        Returns: Database["public"]["Tables"]["tasks"]["Row"];
      };
      bulk_insert_goal_items: {
        Args: {
          p_goal_id: string;
          p_titles: string[];
          p_idempotency_key?: string | null;
        };
        Returns: Database["public"]["Tables"]["goal_items"]["Row"][];
      };
      apply_recurrence: {
        Args: { p_owner_timezone?: string };
        Returns: number;
      };
      skip_occurrence: {
        Args: { p_template_id: string; p_local_date: string };
        Returns: undefined;
      };
      split_recurrence_from: {
        Args: { p_template_id: string; p_from_date: string };
        Returns: string;
      };
      post_transfer: {
        Args: Record<string, unknown>;
        Returns: Json;
      };
      void_transfer_group: {
        Args: { p_group_id: string; p_base_version: number };
        Returns: undefined;
      };
      copy_budgets: {
        Args: { p_from_month: string; p_to_month: string };
        Returns: Json;
      };
      purchase_savings_fund: {
        Args: Record<string, unknown>;
        Returns: Json;
      };
      delete_owner_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
export type GoalItemRow = Database["public"]["Tables"]["goal_items"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];