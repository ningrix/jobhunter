DROP TABLE `application_events`;--> statement-breakpoint
DROP TABLE `applications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
DROP TABLE `reminders`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`job_id` text,
	`action` text NOT NULL,
	`source` text,
	`result` text NOT NULL,
	`detail` text,
	`error` text,
	`user_confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_agent_events`("id", "user_id", "session_id", "job_id", "action", "source", "result", "detail", "error", "user_confirmed", "created_at") SELECT "id", "user_id", "session_id", "job_id", "action", "source", "result", "detail", "error", "user_confirmed", "created_at" FROM `agent_events`;--> statement-breakpoint
DROP TABLE `agent_events`;--> statement-breakpoint
ALTER TABLE `__new_agent_events` RENAME TO `agent_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_events_user_idx` ON `agent_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `agent_events_session_idx` ON `agent_events` (`session_id`);