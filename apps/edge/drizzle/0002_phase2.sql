CREATE TABLE `eventor_clubs` (
	`club_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`media_name` text,
	`parent_id` integer,
	`modify_date_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `eventor_competitors` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`family_name` text NOT NULL,
	`given_name` text NOT NULL,
	`birth_year` integer,
	`sex` text,
	`club_id` integer,
	`si_card` integer,
	`emit_card` integer,
	`modify_date_ms` integer NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `eventor_clubs`(`club_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_eventor_si_card` ON `eventor_competitors` (`si_card`) WHERE "eventor_competitors"."si_card" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_eventor_name` ON `eventor_competitors` (`family_name`,`given_name`);--> statement-breakpoint
CREATE TABLE `hired_cards` (
	`competition_id` text NOT NULL,
	`card_number` integer NOT NULL,
	`marked_at_ms` integer NOT NULL,
	`returned_at_ms` integer,
	`contact_name` text,
	`contact_phone` text,
	`contact_email` text,
	`note` text,
	PRIMARY KEY(`competition_id`, `card_number`),
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meos_classes` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ord` integer,
	`last_mop_update_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meos_clubs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`nat` text,
	`last_mop_update_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meos_competitors` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_id` integer,
	`org_id` integer,
	`status_code` integer DEFAULT 0 NOT NULL,
	`start_time_tenths` integer,
	`running_time_tenths` integer,
	`bib` text,
	`card_number` integer,
	`last_mop_update_ms` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `competitors` ADD `source` text DEFAULT 'walkup' NOT NULL;