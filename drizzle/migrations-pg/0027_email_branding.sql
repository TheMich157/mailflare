CREATE TABLE "domain_email_branding" (
	"domain_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"logo_url" text,
	"accent_color" text,
	"secondary_color" text,
	"background_color" text,
	"card_color" text,
	"wordmark" text,
	"footer_text" text,
	"footer_links" text,
	"legal_line" text,
	"disclosure_footer" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_email_branding" ADD CONSTRAINT "domain_email_branding_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "mailbox_email_branding" (
	"mailbox_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean,
	"logo_url" text,
	"accent_color" text,
	"secondary_color" text,
	"background_color" text,
	"card_color" text,
	"wordmark" text,
	"footer_text" text,
	"footer_links" text,
	"legal_line" text,
	"disclosure_footer" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailbox_email_branding" ADD CONSTRAINT "mailbox_email_branding_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_compose_preferences" ADD COLUMN "signature" text;
