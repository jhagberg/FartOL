CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_name_per_comp` ON `classes` (`competition_id`,`name`);--> statement-breakpoint
CREATE TABLE `clubs` (
	`name` text PRIMARY KEY NOT NULL,
	`last_seen_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competitions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`receipt_template` text DEFAULT 'classic' NOT NULL,
	`auto_print` integer DEFAULT false NOT NULL,
	`created_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`name` text NOT NULL,
	`club` text,
	`class_id` text NOT NULL,
	`card_number` integer,
	`consent_at_ms` integer,
	`consent_status` text DEFAULT 'explicit' NOT NULL,
	`scrubbed_at_ms` integer,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitors_card_per_comp` ON `competitors` (`competition_id`,`card_number`) WHERE "competitors"."card_number" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `controls` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`code` integer NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `controls_code_per_comp` ON `controls` (`competition_id`,`code`);--> statement-breakpoint
CREATE TABLE `course_controls` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`control_id` text NOT NULL,
	`order_idx` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`control_id`) REFERENCES `controls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_controls_order` ON `course_controls` (`course_id`,`order_idx`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`name` text NOT NULL,
	`class_id` text,
	`length_m` integer,
	`climb_m` integer,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`node_id` text NOT NULL,
	`local_seq` integer NOT NULL,
	`competition_id` text,
	`event_type` text NOT NULL,
	`event_time_ms` integer NOT NULL,
	`recorded_at_ms` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`node_id`, `local_seq`),
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_time` ON `events` (`event_time_ms`);--> statement-breakpoint
CREATE INDEX `idx_events_comp` ON `events` (`competition_id`);--> statement-breakpoint
CREATE INDEX `idx_events_comp_type` ON `events` (`competition_id`,`event_type`);