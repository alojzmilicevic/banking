CREATE TABLE `account_value_history` (
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`currency` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_value_history_pk` ON `account_value_history` (`account_id`,`date`);