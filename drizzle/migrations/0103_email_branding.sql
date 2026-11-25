CREATE TABLE `domain_email_branding` (
	`domain_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`logo_url` text,
	`accent_color` text,
	`secondary_color` text,
	`background_color` text,
	`card_color` text,
	`wordmark` text,
	`footer_text` text,
	`footer_links` text,
	`legal_line` text,
	`disclosure_footer` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mailbox_email_branding` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`enabled` integer,
	`logo_url` text,
	`accent_color` text,
	`secondary_color` text,
	`background_color` text,
	`card_color` text,
	`wordmark` text,
	`footer_text` text,
	`footer_links` text,
	`legal_line` text,
	`disclosure_footer` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_compose_preferences` ADD `signature` text;
