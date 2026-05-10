CREATE TABLE `account_daily_snapshots` (
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`kind` text,
	`holder_bucket` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_daily_snapshots_pk` ON `account_daily_snapshots` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `account_daily_snapshots_by_user_date` ON `account_daily_snapshots` (`user_id`,`date`);