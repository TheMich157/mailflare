ALTER TABLE `mailbox_agent_settings` ADD `auto_send_enabled` integer DEFAULT false NOT NULL;
ALTER TABLE `mailbox_agent_settings` ADD `knowledge` text DEFAULT '' NOT NULL;
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_footer` text DEFAULT '' NOT NULL;
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_signature` text DEFAULT '' NOT NULL;
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_logo_url` text DEFAULT '' NOT NULL;
ALTER TABLE `mailbox_agent_settings` ADD `auto_send_accent` text DEFAULT '' NOT NULL;
CREATE TABLE `agent_auto_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`sent_message_id` text,
	`sender_address` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE UNIQUE INDEX `agent_auto_sends_thread_idx` ON `agent_auto_sends` (`mailbox_id`, `thread_id`);
CREATE INDEX `agent_auto_sends_sender_idx` ON `agent_auto_sends` (`mailbox_id`, `sender_address`, `created_at`);
CREATE INDEX `agent_auto_sends_mailbox_idx` ON `agent_auto_sends` (`mailbox_id`, `created_at`);
CREATE INDEX `agent_auto_sends_message_idx` ON `agent_auto_sends` (`message_id`);
CREATE INDEX `agent_auto_sends_sent_idx` ON `agent_auto_sends` (`sent_message_id`);
CREATE TABLE `agent_escalations` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailboxes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX `agent_escalations_message_idx` ON `agent_escalations` (`mailbox_id`, `message_id`);
CREATE INDEX `agent_escalations_thread_idx` ON `agent_escalations` (`mailbox_id`, `thread_id`);
