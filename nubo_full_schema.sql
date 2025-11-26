-- Nubo (Zero) Email Full Database Schema for Neon.tech
-- Generated for production deployment
-- Run this on your Neon PostgreSQL database

-- ============================================
-- CORE USER & AUTHENTICATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "email_verified" boolean NOT NULL,
  "image" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "default_connection_id" text,
  "custom_prompt" text,
  "phone_number" text,
  "phone_number_verified" boolean,
  CONSTRAINT "mail0_user_email_unique" UNIQUE("email"),
  CONSTRAINT "mail0_user_phone_number_unique" UNIQUE("phone_number")
);

CREATE TABLE IF NOT EXISTS "mail0_session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  CONSTRAINT "mail0_session_token_unique" UNIQUE("token")
);

CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "mail0_session" ("user_id");
CREATE INDEX IF NOT EXISTS "session_expires_at_idx" ON "mail0_session" ("expires_at");

CREATE TABLE IF NOT EXISTS "mail0_account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "mail0_account" ("user_id");
CREATE INDEX IF NOT EXISTS "account_provider_user_id_idx" ON "mail0_account" ("provider_id", "user_id");
CREATE INDEX IF NOT EXISTS "account_expires_at_idx" ON "mail0_account" ("access_token_expires_at");

CREATE TABLE IF NOT EXISTS "mail0_verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp,
  "updated_at" timestamp
);

CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "mail0_verification" ("identifier");
CREATE INDEX IF NOT EXISTS "verification_expires_at_idx" ON "mail0_verification" ("expires_at");

-- ============================================
-- EMAIL CONNECTION & SYNC TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "name" text,
  "picture" text,
  "access_token" text,
  "refresh_token" text,
  "scope" text NOT NULL,
  "provider_id" text NOT NULL, -- 'google', 'microsoft', 'imap'
  "expires_at" timestamp,
  "config" jsonb, -- IMAP/SMTP config for IMAP connections
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "mail0_connection_user_id_email_unique" UNIQUE("user_id", "email")
);

CREATE INDEX IF NOT EXISTS "connection_user_id_idx" ON "mail0_connection" ("user_id");
CREATE INDEX IF NOT EXISTS "connection_expires_at_idx" ON "mail0_connection" ("expires_at");
CREATE INDEX IF NOT EXISTS "connection_provider_id_idx" ON "mail0_connection" ("provider_id");

-- Email metadata table (for IMAP synced emails)
CREATE TABLE IF NOT EXISTS "mail0_email" (
  "id" text PRIMARY KEY NOT NULL,
  "thread_id" text NOT NULL,
  "connection_id" text NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "message_id" text NOT NULL,
  "in_reply_to" text,
  "references" text,
  "subject" text,
  "from" jsonb NOT NULL, -- { name, address }
  "to" jsonb NOT NULL, -- [{ name, address }]
  "cc" jsonb,
  "bcc" jsonb,
  "reply_to" jsonb,
  "snippet" text,
  "body_r2_key" text,
  "body_html" text,
  "internal_date" timestamp NOT NULL,
  "is_read" boolean DEFAULT false,
  "is_starred" boolean DEFAULT false,
  "labels" jsonb,
  "attachments" jsonb, -- [{ id, filename, contentType, size, contentId, r2Key }]
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "email_connection_id_idx" ON "mail0_email" ("connection_id");
CREATE INDEX IF NOT EXISTS "email_thread_id_idx" ON "mail0_email" ("thread_id");
CREATE INDEX IF NOT EXISTS "email_message_id_idx" ON "mail0_email" ("message_id");
CREATE INDEX IF NOT EXISTS "email_internal_date_idx" ON "mail0_email" ("internal_date");

-- IMAP sync state tracking
CREATE TABLE IF NOT EXISTS "mail0_imap_sync_state" (
  "connection_id" text PRIMARY KEY NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "last_synced_uid" integer NOT NULL DEFAULT 0,
  "uid_validity" integer NOT NULL DEFAULT 0,
  "last_synced_at" timestamp NOT NULL DEFAULT NOW()
);

-- ============================================
-- USER SETTINGS & PREFERENCES
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_user_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "settings" jsonb NOT NULL DEFAULT '{"language":"en","timezone":"UTC","dynamicContent":false,"externalImages":true,"customPrompt":"","trustedSenders":[],"isOnboarded":false,"colorTheme":"system","zeroSignature":true,"autoRead":true,"defaultEmailAlias":"","categories":[],"imageCompression":"medium"}'::jsonb,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "mail0_user_settings_user_id_unique" UNIQUE("user_id")
);

CREATE INDEX IF NOT EXISTS "user_settings_settings_idx" ON "mail0_user_settings" ("settings");

CREATE TABLE IF NOT EXISTS "mail0_user_hotkeys" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "shortcuts" jsonb NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_hotkeys_shortcuts_idx" ON "mail0_user_hotkeys" ("shortcuts");

-- ============================================
-- EMAIL FEATURES
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_summary" (
  "message_id" text PRIMARY KEY NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "connection_id" text NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "saved" boolean NOT NULL DEFAULT false,
  "tags" text,
  "suggested_reply" text
);

CREATE INDEX IF NOT EXISTS "summary_connection_id_idx" ON "mail0_summary" ("connection_id");
CREATE INDEX IF NOT EXISTS "summary_connection_id_saved_idx" ON "mail0_summary" ("connection_id", "saved");
CREATE INDEX IF NOT EXISTS "summary_saved_idx" ON "mail0_summary" ("saved");

CREATE TABLE IF NOT EXISTS "mail0_note" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "content" text NOT NULL,
  "color" text NOT NULL DEFAULT 'default',
  "is_pinned" boolean DEFAULT false,
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "note_user_id_idx" ON "mail0_note" ("user_id");
CREATE INDEX IF NOT EXISTS "note_thread_id_idx" ON "mail0_note" ("thread_id");
CREATE INDEX IF NOT EXISTS "note_user_thread_idx" ON "mail0_note" ("user_id", "thread_id");
CREATE INDEX IF NOT EXISTS "note_is_pinned_idx" ON "mail0_note" ("is_pinned");

CREATE TABLE IF NOT EXISTS "mail0_writing_style_matrix" (
  "connectionId" text PRIMARY KEY NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "numMessages" integer NOT NULL,
  "style" jsonb NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "writing_style_matrix_style_idx" ON "mail0_writing_style_matrix" ("style");

CREATE TABLE IF NOT EXISTS "mail0_email_template" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "subject" text,
  "body" text,
  "to" jsonb,
  "cc" jsonb,
  "bcc" jsonb,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT "mail0_email_template_user_id_name_unique" UNIQUE("user_id", "name")
);

CREATE INDEX IF NOT EXISTS "idx_mail0_email_template_user_id" ON "mail0_email_template" ("user_id");

-- ============================================
-- KANBAN BOARD
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_kanban_board" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "connection_id" text NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "kanban_board_user_id_idx" ON "mail0_kanban_board" ("user_id");
CREATE INDEX IF NOT EXISTS "kanban_board_connection_id_idx" ON "mail0_kanban_board" ("connection_id");
CREATE INDEX IF NOT EXISTS "kanban_board_default_idx" ON "mail0_kanban_board" ("user_id", "is_default");

CREATE TABLE IF NOT EXISTS "mail0_kanban_column" (
  "id" text PRIMARY KEY NOT NULL,
  "board_id" text NOT NULL REFERENCES "mail0_kanban_board"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text,
  "position" integer NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "kanban_column_board_id_idx" ON "mail0_kanban_column" ("board_id");
CREATE INDEX IF NOT EXISTS "kanban_column_board_position_idx" ON "mail0_kanban_column" ("board_id", "position");

CREATE TABLE IF NOT EXISTS "mail0_kanban_email_mapping" (
  "id" text PRIMARY KEY NOT NULL,
  "column_id" text NOT NULL REFERENCES "mail0_kanban_column"("id") ON DELETE CASCADE,
  "thread_id" text NOT NULL,
  "connection_id" text NOT NULL REFERENCES "mail0_connection"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "mail0_kanban_email_mapping_thread_id_connection_id_unique" UNIQUE("thread_id", "connection_id")
);

CREATE INDEX IF NOT EXISTS "kanban_email_column_id_idx" ON "mail0_kanban_email_mapping" ("column_id");
CREATE INDEX IF NOT EXISTS "kanban_email_thread_id_idx" ON "mail0_kanban_email_mapping" ("thread_id");
CREATE INDEX IF NOT EXISTS "kanban_email_connection_id_idx" ON "mail0_kanban_email_mapping" ("connection_id");

-- ============================================
-- NUBO DRIVE (Cloud Storage)
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_drive_folder" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parent_id" text,
  "color" text,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "drive_folder_user_id_idx" ON "mail0_drive_folder" ("user_id");
CREATE INDEX IF NOT EXISTS "drive_folder_parent_id_idx" ON "mail0_drive_folder" ("parent_id");
CREATE INDEX IF NOT EXISTS "drive_folder_user_parent_idx" ON "mail0_drive_folder" ("user_id", "parent_id");

CREATE TABLE IF NOT EXISTS "mail0_drive_file" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "folder_id" text REFERENCES "mail0_drive_folder"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" integer NOT NULL,
  "r2_key" text NOT NULL,
  "thumbnail_r2_key" text,
  "import_source" text,
  "source_file_id" text,
  "is_starred" boolean DEFAULT false,
  "is_trashed" boolean DEFAULT false,
  "trashed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "drive_file_user_id_idx" ON "mail0_drive_file" ("user_id");
CREATE INDEX IF NOT EXISTS "drive_file_folder_id_idx" ON "mail0_drive_file" ("folder_id");
CREATE INDEX IF NOT EXISTS "drive_file_user_folder_idx" ON "mail0_drive_file" ("user_id", "folder_id");
CREATE INDEX IF NOT EXISTS "drive_file_mime_type_idx" ON "mail0_drive_file" ("mime_type");
CREATE INDEX IF NOT EXISTS "drive_file_is_trashed_idx" ON "mail0_drive_file" ("is_trashed");
CREATE INDEX IF NOT EXISTS "drive_file_is_starred_idx" ON "mail0_drive_file" ("is_starred");
CREATE INDEX IF NOT EXISTS "drive_file_import_source_idx" ON "mail0_drive_file" ("import_source", "source_file_id");

CREATE TABLE IF NOT EXISTS "mail0_drive_import_job" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "source" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "total_files" integer DEFAULT 0,
  "processed_files" integer DEFAULT 0,
  "failed_files" integer DEFAULT 0,
  "error_message" text,
  "source_file_ids" jsonb,
  "target_folder_id" text REFERENCES "mail0_drive_folder"("id") ON DELETE SET NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "drive_import_job_user_id_idx" ON "mail0_drive_import_job" ("user_id");
CREATE INDEX IF NOT EXISTS "drive_import_job_status_idx" ON "mail0_drive_import_job" ("status");
CREATE INDEX IF NOT EXISTS "drive_import_job_source_idx" ON "mail0_drive_import_job" ("source");

-- ============================================
-- LIVEKIT (Video Meetings)
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_livekit_meeting" (
  "id" text PRIMARY KEY NOT NULL,
  "room_name" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "host_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "scheduled_for" timestamp,
  "started_at" timestamp,
  "ended_at" timestamp,
  "duration" integer,
  "status" text NOT NULL DEFAULT 'scheduled',
  "max_participants" integer DEFAULT 50,
  "recording_enabled" boolean DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT NOW(),
  "updated_at" timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT "mail0_livekit_meeting_room_name_unique" UNIQUE("room_name")
);

CREATE INDEX IF NOT EXISTS "livekit_meeting_host_id_idx" ON "mail0_livekit_meeting" ("host_id");
CREATE INDEX IF NOT EXISTS "livekit_meeting_room_name_idx" ON "mail0_livekit_meeting" ("room_name");
CREATE INDEX IF NOT EXISTS "livekit_meeting_status_idx" ON "mail0_livekit_meeting" ("status");
CREATE INDEX IF NOT EXISTS "livekit_meeting_scheduled_for_idx" ON "mail0_livekit_meeting" ("scheduled_for");

CREATE TABLE IF NOT EXISTS "mail0_livekit_participant" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "mail0_livekit_meeting"("id") ON DELETE CASCADE,
  "user_id" text REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "identity" text NOT NULL,
  "name" text NOT NULL,
  "joined_at" timestamp NOT NULL DEFAULT NOW(),
  "left_at" timestamp,
  "duration" integer,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "livekit_participant_meeting_id_idx" ON "mail0_livekit_participant" ("meeting_id");
CREATE INDEX IF NOT EXISTS "livekit_participant_user_id_idx" ON "mail0_livekit_participant" ("user_id");
CREATE INDEX IF NOT EXISTS "livekit_participant_identity_idx" ON "mail0_livekit_participant" ("identity");

CREATE TABLE IF NOT EXISTS "mail0_livekit_recording" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "mail0_livekit_meeting"("id") ON DELETE CASCADE,
  "egress_id" text NOT NULL,
  "r2_key" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size" integer,
  "duration" integer,
  "format" text DEFAULT 'mp4',
  "status" text NOT NULL DEFAULT 'processing',
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "livekit_recording_meeting_id_idx" ON "mail0_livekit_recording" ("meeting_id");
CREATE INDEX IF NOT EXISTS "livekit_recording_egress_id_idx" ON "mail0_livekit_recording" ("egress_id");
CREATE INDEX IF NOT EXISTS "livekit_recording_status_idx" ON "mail0_livekit_recording" ("status");

-- ============================================
-- SUBSCRIPTIONS & BILLING
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_subscription" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "razorpay_subscription_id" text,
  "plan_id" text NOT NULL,
  "status" text NOT NULL,
  "current_period_start" timestamp,
  "current_period_end" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "mail0_subscription_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id")
);

CREATE INDEX IF NOT EXISTS "subscription_user_id_idx" ON "mail0_subscription" ("user_id");
CREATE INDEX IF NOT EXISTS "subscription_status_idx" ON "mail0_subscription" ("status");
CREATE INDEX IF NOT EXISTS "subscription_razorpay_id_idx" ON "mail0_subscription" ("razorpay_subscription_id");

CREATE TABLE IF NOT EXISTS "mail0_usage_tracking" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "mail0_user"("id") ON DELETE CASCADE,
  "feature" text NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "period_start" timestamp NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "usage_tracking_user_id_idx" ON "mail0_usage_tracking" ("user_id");
CREATE INDEX IF NOT EXISTS "usage_tracking_feature_idx" ON "mail0_usage_tracking" ("feature");
CREATE INDEX IF NOT EXISTS "usage_tracking_period_idx" ON "mail0_usage_tracking" ("period_start");
CREATE INDEX IF NOT EXISTS "usage_tracking_user_period_feature_idx" ON "mail0_usage_tracking" ("user_id", "period_start", "feature");

-- ============================================
-- OAUTH (API Access)
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_jwks" (
  "id" text PRIMARY KEY NOT NULL,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "jwks_created_at_idx" ON "mail0_jwks" ("created_at");

CREATE TABLE IF NOT EXISTS "mail0_oauth_application" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "icon" text,
  "metadata" text,
  "client_id" text,
  "client_secret" text,
  "redirect_u_r_ls" text,
  "type" text,
  "disabled" boolean,
  "user_id" text,
  "created_at" timestamp,
  "updated_at" timestamp,
  CONSTRAINT "mail0_oauth_application_client_id_unique" UNIQUE("client_id")
);

CREATE INDEX IF NOT EXISTS "oauth_application_user_id_idx" ON "mail0_oauth_application" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_application_disabled_idx" ON "mail0_oauth_application" ("disabled");

CREATE TABLE IF NOT EXISTS "mail0_oauth_access_token" (
  "id" text PRIMARY KEY NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "client_id" text,
  "user_id" text,
  "scopes" text,
  "created_at" timestamp,
  "updated_at" timestamp,
  CONSTRAINT "mail0_oauth_access_token_access_token_unique" UNIQUE("access_token"),
  CONSTRAINT "mail0_oauth_access_token_refresh_token_unique" UNIQUE("refresh_token")
);

CREATE INDEX IF NOT EXISTS "oauth_access_token_user_id_idx" ON "mail0_oauth_access_token" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_client_id_idx" ON "mail0_oauth_access_token" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_access_token_expires_at_idx" ON "mail0_oauth_access_token" ("access_token_expires_at");

CREATE TABLE IF NOT EXISTS "mail0_oauth_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "client_id" text,
  "user_id" text,
  "scopes" text,
  "created_at" timestamp,
  "updated_at" timestamp,
  "consent_given" boolean
);

CREATE INDEX IF NOT EXISTS "oauth_consent_user_id_idx" ON "mail0_oauth_consent" ("user_id");
CREATE INDEX IF NOT EXISTS "oauth_consent_client_id_idx" ON "mail0_oauth_consent" ("client_id");
CREATE INDEX IF NOT EXISTS "oauth_consent_given_idx" ON "mail0_oauth_consent" ("consent_given");

-- ============================================
-- EARLY ACCESS (Waitlist)
-- ============================================

CREATE TABLE IF NOT EXISTS "mail0_early_access" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  "is_early_access" boolean NOT NULL DEFAULT false,
  "has_used_ticket" text DEFAULT '',
  CONSTRAINT "mail0_early_access_email_unique" UNIQUE("email")
);

CREATE INDEX IF NOT EXISTS "early_access_is_early_access_idx" ON "mail0_early_access" ("is_early_access");

-- ============================================
-- END OF SCHEMA
-- ============================================
