ALTER TABLE `mailbox_agent_settings` ADD `auto_send_enabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `mailbox_agent_settings` ADD `knowledge` longtext NOT NULL DEFAULT ('');
--> statement-breakpoint
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_footer` longtext NOT NULL DEFAULT ('');
--> statement-breakpoint
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_signature` longtext NOT NULL DEFAULT ('');
--> statement-breakpoint
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_logo_url` longtext NOT NULL DEFAULT ('');
--> statement-breakpoint
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_accent` longtext NOT NULL DEFAULT ('');
--> statement-breakpoint
CREATE TABLE `agent_auto_sends` (
	`id` varchar(191) NOT NULL,
	`mailbox_id` varchar(191) NOT NULL,
	`thread_id` varchar(512) NOT NULL,
	`message_id` varchar(191) NOT NULL,
	`sent_message_id` varchar(191),
	`sender_address` varchar(191) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `agent_auto_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agent_escalations` (
	`id` varchar(191) NOT NULL,
	`mailbox_id` varchar(191) NOT NULL,
	`thread_id` varchar(512) NOT NULL,
	`message_id` varchar(191) NOT NULL,
	`reason` longtext NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `agent_escalations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agent_auto_sends` ADD CONSTRAINT `agent_auto_sends_mailbox_id_mailboxes_id_fk` FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `agent_auto_sends` ADD CONSTRAINT `agent_auto_sends_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `agent_auto_sends` ADD CONSTRAINT `agent_auto_sends_sent_message_id_messages_id_fk` FOREIGN KEY (`sent_message_id`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `agent_escalations` ADD CONSTRAINT `agent_escalations_mailbox_id_mailboxes_id_fk` FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `agent_escalations` ADD CONSTRAINT `agent_escalations_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_auto_sends_thread_idx` ON `agent_auto_sends` (`mailbox_id`,`thread_id`);
--> statement-breakpoint
CREATE INDEX `agent_auto_sends_sender_idx` ON `agent_auto_sends` (`mailbox_id`,`sender_address`,`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_auto_sends_mailbox_idx` ON `agent_auto_sends` (`mailbox_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `agent_auto_sends_message_idx` ON `agent_auto_sends` (`message_id`);
--> statement-breakpoint
CREATE INDEX `agent_auto_sends_sent_idx` ON `agent_auto_sends` (`sent_message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_escalations_message_idx` ON `agent_escalations` (`mailbox_id`,`message_id`);
--> statement-breakpoint
CREATE INDEX `agent_escalations_thread_idx` ON `agent_escalations` (`mailbox_id`,`thread_id`);
