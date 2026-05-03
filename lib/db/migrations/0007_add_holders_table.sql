CREATE TABLE `connection_holders` (
	`connection_id` text NOT NULL,
	`holder_id` text NOT NULL,
	PRIMARY KEY(`connection_id`, `holder_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`holder_id`) REFERENCES `holders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connection_holders_by_holder` ON `connection_holders` (`holder_id`);--> statement-breakpoint
CREATE TABLE `holders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`color` text NOT NULL,
	`initials` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `holders_by_user` ON `holders` (`user_id`);--> statement-breakpoint
-- Backfill: create the two existing household members ('Alojz' and 'Alma')
-- as holder rows for every user, using deterministic ids so the migration
-- is idempotent if it ever re-runs against a partially-migrated DB.
INSERT INTO `holders` (`id`, `user_id`, `label`, `color`, `initials`, `display_order`)
SELECT `id` || ':a', `id`, 'Alojz', 'oklch(70% 0.13 195)', 'AM', 0 FROM `users`
WHERE NOT EXISTS (SELECT 1 FROM `holders` h WHERE h.`id` = `users`.`id` || ':a');--> statement-breakpoint
INSERT INTO `holders` (`id`, `user_id`, `label`, `color`, `initials`, `display_order`)
SELECT `id` || ':b', `id`, 'Alma', 'oklch(70% 0.16 300)', 'AC', 1 FROM `users`
WHERE NOT EXISTS (SELECT 1 FROM `holders` h WHERE h.`id` = `users`.`id` || ':b');--> statement-breakpoint
-- Wire up the M:N from existing `connections.holder` text values.
-- 'alojz' / 'alma' map to one holder; 'joint' maps to BOTH (explicit shared).
INSERT OR IGNORE INTO `connection_holders` (`connection_id`, `holder_id`)
SELECT c.`id`, c.`user_id` || ':a' FROM `connections` c WHERE c.`holder` IN ('alojz', 'joint');--> statement-breakpoint
INSERT OR IGNORE INTO `connection_holders` (`connection_id`, `holder_id`)
SELECT c.`id`, c.`user_id` || ':b' FROM `connections` c WHERE c.`holder` IN ('alma', 'joint');