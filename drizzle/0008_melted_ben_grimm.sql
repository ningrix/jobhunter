ALTER TABLE `job_matches` ADD `hybrid_scores` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `semantic_match_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `hybrid_weights` text;