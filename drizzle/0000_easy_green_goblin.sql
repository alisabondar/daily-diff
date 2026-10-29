CREATE TABLE `digest_entries` (
	`digest_id` integer NOT NULL,
	`story_id` integer NOT NULL,
	`tab` text NOT NULL,
	`section` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`digest_id`, `story_id`),
	FOREIGN KEY (`digest_id`) REFERENCES `digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `digests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`status` text NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`is_raw` integer DEFAULT false NOT NULL,
	`error_code` text,
	`error_message` text,
	`failed_source_ids` text DEFAULT '[]' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digests_date_unique` ON `digests` (`date`);--> statement-breakpoint
CREATE TABLE `favorite_tags` (
	`story_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`story_id`, `tag`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `favorites` (
	`story_id` integer PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`excerpt` text NOT NULL,
	`content` text NOT NULL,
	`media_url` text,
	`discussion_url` text,
	`hn_id` integer,
	`published_at` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_url_unique` ON `items` (`url`);--> statement-breakpoint
CREATE TABLE `learn_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`type` text NOT NULL,
	`concept_key` text,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`quiz` text,
	`related_story_id` integer,
	`source_ref` text NOT NULL,
	FOREIGN KEY (`digest_id`) REFERENCES `digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`feed_url` text NOT NULL,
	`hn_tags` text,
	`pack` text,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fetched_at` integer,
	`last_status` text,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_feed_url_unique` ON `sources` (`feed_url`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`digest_id` integer NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`score` integer,
	`summary` text,
	`stats` text,
	`pros` text,
	`cons` text,
	`community` text,
	FOREIGN KEY (`digest_id`) REFERENCES `digests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_items` (
	`story_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	PRIMARY KEY(`story_id`, `item_id`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
