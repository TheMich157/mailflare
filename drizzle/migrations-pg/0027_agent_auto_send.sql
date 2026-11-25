ALTER TABLE "mailbox_agent_settings" ADD COLUMN "auto_send_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_agent_settings" ADD COLUMN "knowledge" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_agent_settings" ADD COLUMN "auto_send_footer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_agent_settings" ADD COLUMN "auto_send_signature" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_agent_settings" ADD COLUMN "auto_send_logo_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "mailbox_agent_settings" ADD COLUMN "auto_send_accent" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE "agent_auto_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"sent_message_id" text,
	"sender_address" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"message_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_auto_sends" ADD CONSTRAINT "agent_auto_sends_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_auto_sends" ADD CONSTRAINT "agent_auto_sends_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_auto_sends" ADD CONSTRAINT "agent_auto_sends_sent_message_id_messages_id_fk" FOREIGN KEY ("sent_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_escalations" ADD CONSTRAINT "agent_escalations_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_escalations" ADD CONSTRAINT "agent_escalations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_auto_sends_thread_idx" ON "agent_auto_sends" USING btree ("mailbox_id","thread_id");
--> statement-breakpoint
CREATE INDEX "agent_auto_sends_sender_idx" ON "agent_auto_sends" USING btree ("mailbox_id","sender_address","created_at");
--> statement-breakpoint
CREATE INDEX "agent_auto_sends_mailbox_idx" ON "agent_auto_sends" USING btree ("mailbox_id","created_at");
--> statement-breakpoint
CREATE INDEX "agent_auto_sends_message_idx" ON "agent_auto_sends" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "agent_auto_sends_sent_idx" ON "agent_auto_sends" USING btree ("sent_message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_escalations_message_idx" ON "agent_escalations" USING btree ("mailbox_id","message_id");
--> statement-breakpoint
CREATE INDEX "agent_escalations_thread_idx" ON "agent_escalations" USING btree ("mailbox_id","thread_id");
