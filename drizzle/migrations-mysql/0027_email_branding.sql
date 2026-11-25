CREATE TABLE `domain_email_branding` (
	`domain_id` varchar(191) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`logo_url` longtext,
	`accent_color` longtext,
	`secondary_color` longtext,
	`background_color` longtext,
	`card_color` longtext,
	`wordmark` longtext,
	`footer_text` longtext,
	`footer_links` longtext,
	`legal_line` longtext,
	`disclosure_footer` longtext,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `domain_email_branding_domain_id` PRIMARY KEY(`domain_id`)
);
--> statement-breakpoint
ALTER TABLE `domain_email_branding` ADD CONSTRAINT `domain_email_branding_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE `mailbox_email_branding` (
	`mailbox_id` varchar(191) NOT NULL,
	`enabled` boolean,
	`logo_url` longtext,
	`accent_color` longtext,
	`secondary_color` longtext,
	`background_color` longtext,
	`card_color` longtext,
	`wordmark` longtext,
	`footer_text` longtext,
	`footer_links` longtext,
	`legal_line` longtext,
	`disclosure_footer` longtext,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `mailbox_email_branding_mailbox_id` PRIMARY KEY(`mailbox_id`)
);
--> statement-breakpoint
ALTER TABLE `mailbox_email_branding` ADD CONSTRAINT `mailbox_email_branding_mailbox_id_mailboxes_id_fk` FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `user_compose_preferences` ADD `signature` longtext;
