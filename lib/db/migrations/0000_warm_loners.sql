CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`name` text,
	`details` text,
	`product` text,
	`account_type` text,
	`currency` text,
	`iban` text,
	`bban` text,
	`bic` text,
	`raw_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_by_connection` ON `accounts` (`connection_id`);--> statement-breakpoint
CREATE TABLE `auth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `balances` (
	`account_id` text NOT NULL,
	`balance_type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`reference_date` text,
	`raw_json` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `balances_pk` ON `balances` (`account_id`,`balance_type`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`external_id` text NOT NULL,
	`label` text,
	`status` text DEFAULT 'active' NOT NULL,
	`valid_until` integer,
	`initial_synced_at` integer,
	`last_synced_at` integer,
	`raw_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connections_by_user` ON `connections` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `connections_provider_external` ON `connections` (`provider_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`instrument_name` text,
	`instrument_type` text,
	`quantity` real NOT NULL,
	`avg_cost` real,
	`market_value` real,
	`currency` text NOT NULL,
	`raw_json` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_pk` ON `positions` (`account_id`,`instrument_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`account_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`status` text,
	`description` text,
	`counterparty` text,
	`raw_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_pk` ON `transactions` (`account_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `transactions_by_account_date` ON `transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
