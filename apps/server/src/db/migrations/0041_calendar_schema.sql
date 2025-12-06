CREATE TABLE "mail0_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_visible" boolean DEFAULT true,
	"source" text DEFAULT 'local',
	"source_calendar_id" text,
	"sync_token" text,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_calendar_ai_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"color" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"timezone" text DEFAULT 'UTC',
	"is_all_day" boolean DEFAULT false,
	"is_recurring" boolean DEFAULT false,
	"recurrence_rule" jsonb,
	"is_recurring_instance" boolean DEFAULT false,
	"original_event_id" text,
	"original_start_time" timestamp,
	"recurrence_status" text,
	"source" text DEFAULT 'local',
	"source_event_id" text,
	"status" text DEFAULT 'confirmed',
	"conference_url" text,
	"conference_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_calendar_event_attendee" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"response_status" text DEFAULT 'needsAction',
	"is_organizer" boolean DEFAULT false,
	"is_optional" boolean DEFAULT false,
	"user_id" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_attendee_unique" UNIQUE("event_id","email")
);
--> statement-breakpoint
CREATE TABLE "mail0_calendar_event_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"minutes_before" integer NOT NULL,
	"method" text DEFAULT 'push',
	"is_sent" boolean DEFAULT false,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail0_calendar_share" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"shared_with_user_id" text,
	"shared_with_email" text,
	"access_level" text DEFAULT 'read',
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_share_unique" UNIQUE("calendar_id","shared_with_user_id")
);
--> statement-breakpoint
CREATE TABLE "mail0_drive_share" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_id" text,
	"folder_id" text,
	"shared_with_user_id" text,
	"shared_with_username" text,
	"shared_with_email" text,
	"access_level" text DEFAULT 'view' NOT NULL,
	"share_type" text NOT NULL,
	"share_token" text,
	"password" text,
	"expires_at" timestamp,
	"message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail0_drive_share_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "mail0_drive_share_access" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"accessed_by_user_id" text,
	"accessed_by_email" text,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "mail0_push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"device_name" text,
	"notify_new_emails" boolean DEFAULT true,
	"notify_mentions" boolean DEFAULT true,
	"notify_important" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "mail0_email" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
ALTER TABLE "mail0_user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "mail0_calendar" ADD CONSTRAINT "mail0_calendar_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_ai_chat" ADD CONSTRAINT "mail0_calendar_ai_chat_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_event" ADD CONSTRAINT "mail0_calendar_event_calendar_id_mail0_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."mail0_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_event" ADD CONSTRAINT "mail0_calendar_event_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_event_attendee" ADD CONSTRAINT "mail0_calendar_event_attendee_event_id_mail0_calendar_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."mail0_calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_event_attendee" ADD CONSTRAINT "mail0_calendar_event_attendee_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_event_reminder" ADD CONSTRAINT "mail0_calendar_event_reminder_event_id_mail0_calendar_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."mail0_calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_share" ADD CONSTRAINT "mail0_calendar_share_calendar_id_mail0_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."mail0_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_calendar_share" ADD CONSTRAINT "mail0_calendar_share_shared_with_user_id_mail0_user_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share" ADD CONSTRAINT "mail0_drive_share_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share" ADD CONSTRAINT "mail0_drive_share_file_id_mail0_drive_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."mail0_drive_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share" ADD CONSTRAINT "mail0_drive_share_folder_id_mail0_drive_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."mail0_drive_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share" ADD CONSTRAINT "mail0_drive_share_shared_with_user_id_mail0_user_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share_access" ADD CONSTRAINT "mail0_drive_share_access_share_id_mail0_drive_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."mail0_drive_share"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_drive_share_access" ADD CONSTRAINT "mail0_drive_share_access_accessed_by_user_id_mail0_user_id_fk" FOREIGN KEY ("accessed_by_user_id") REFERENCES "public"."mail0_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail0_push_subscription" ADD CONSTRAINT "mail0_push_subscription_user_id_mail0_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mail0_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_user_id_idx" ON "mail0_calendar" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_source_idx" ON "mail0_calendar" USING btree ("source");--> statement-breakpoint
CREATE INDEX "calendar_is_default_idx" ON "mail0_calendar" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "calendar_ai_chat_user_id_idx" ON "mail0_calendar_ai_chat" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_ai_chat_conversation_id_idx" ON "mail0_calendar_ai_chat" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "calendar_ai_chat_user_conversation_idx" ON "mail0_calendar_ai_chat" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "calendar_event_calendar_id_idx" ON "mail0_calendar_event" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_event_user_id_idx" ON "mail0_calendar_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_event_start_time_idx" ON "mail0_calendar_event" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "calendar_event_end_time_idx" ON "mail0_calendar_event" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "calendar_event_time_range_idx" ON "mail0_calendar_event" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "calendar_event_recurring_idx" ON "mail0_calendar_event" USING btree ("is_recurring");--> statement-breakpoint
CREATE INDEX "calendar_event_original_event_idx" ON "mail0_calendar_event" USING btree ("original_event_id");--> statement-breakpoint
CREATE INDEX "calendar_event_source_idx" ON "mail0_calendar_event" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE INDEX "calendar_event_attendee_event_id_idx" ON "mail0_calendar_event_attendee" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "calendar_event_attendee_email_idx" ON "mail0_calendar_event_attendee" USING btree ("email");--> statement-breakpoint
CREATE INDEX "calendar_event_attendee_user_id_idx" ON "mail0_calendar_event_attendee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_event_reminder_event_id_idx" ON "mail0_calendar_event_reminder" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "calendar_event_reminder_sent_idx" ON "mail0_calendar_event_reminder" USING btree ("is_sent");--> statement-breakpoint
CREATE INDEX "calendar_share_calendar_id_idx" ON "mail0_calendar_share" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_share_shared_with_user_idx" ON "mail0_calendar_share" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "calendar_share_status_idx" ON "mail0_calendar_share" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drive_share_user_id_idx" ON "mail0_drive_share" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drive_share_file_id_idx" ON "mail0_drive_share" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "drive_share_folder_id_idx" ON "mail0_drive_share" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "drive_share_shared_with_user_idx" ON "mail0_drive_share" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "drive_share_token_idx" ON "mail0_drive_share" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "drive_share_type_idx" ON "mail0_drive_share" USING btree ("share_type");--> statement-breakpoint
CREATE INDEX "drive_share_access_share_id_idx" ON "mail0_drive_share_access" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "drive_share_access_user_id_idx" ON "mail0_drive_share_access" USING btree ("accessed_by_user_id");--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "mail0_push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscription_endpoint_idx" ON "mail0_push_subscription" USING btree ("endpoint");--> statement-breakpoint
ALTER TABLE "mail0_user" ADD CONSTRAINT "mail0_user_username_unique" UNIQUE("username");