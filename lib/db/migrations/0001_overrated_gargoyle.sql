CREATE TABLE `connection_credentials` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`auth_tag` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_snapshots` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`base_currency` text NOT NULL,
	`total_amount` real NOT NULL,
	`cash_amount` real NOT NULL,
	`investment_amount` real NOT NULL,
	`detail_json` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_pk` ON `daily_snapshots` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`ticker` text,
	`currency` text,
	`isin` text,
	`provider_id` text,
	`provider_instrument_id` text,
	`raw_json` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `ownership` text DEFAULT 'sole' NOT NULL;--> statement-breakpoint
DELETE FROM `auth_states`;--> statement-breakpoint
ALTER TABLE `auth_states` ADD `flow` text DEFAULT 'redirect' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_states` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `auth_states` ADD `result` text;--> statement-breakpoint
ALTER TABLE `auth_states` ADD `expires_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `transactions` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `instrument_id` text REFERENCES instruments(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `quantity` real;--> statement-breakpoint
CREATE INDEX `transactions_by_kind` ON `transactions` (`kind`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_positions` (
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`quantity` real NOT NULL,
	`avg_cost` real,
	`market_value` real,
	`currency` text NOT NULL,
	`raw_json` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_positions`("account_id", "instrument_id", "quantity", "avg_cost", "market_value", "currency", "raw_json", "fetched_at") SELECT "account_id", "instrument_id", "quantity", "avg_cost", "market_value", "currency", "raw_json", "fetched_at" FROM `positions`;--> statement-breakpoint
DROP TABLE `positions`;--> statement-breakpoint
ALTER TABLE `__new_positions` RENAME TO `positions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `positions_pk` ON `positions` (`account_id`,`instrument_id`);