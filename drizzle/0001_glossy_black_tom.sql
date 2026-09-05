CREATE TABLE `agent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`job_id` text,
	`application_id` text,
	`action` text NOT NULL,
	`source` text,
	`result` text NOT NULL,
	`detail` text,
	`error` text,
	`user_confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_events_user_idx` ON `agent_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_events_session_idx` ON `agent_events` (`session_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `district` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `source_job_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `employment_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `job_type` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `posted_at` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `raw_data` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `fingerprint` text;--> statement-breakpoint
CREATE INDEX `jobs_user_fingerprint_idx` ON `jobs` (`user_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_source_uq` ON `jobs` (`user_id`,`source`,`source_job_id`);