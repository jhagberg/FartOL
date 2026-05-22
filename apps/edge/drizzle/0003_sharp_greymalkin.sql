DROP INDEX `idx_eventor_si_card`;--> statement-breakpoint
CREATE INDEX `idx_eventor_si_card_lookup` ON `eventor_competitors` (`si_card`) WHERE "eventor_competitors"."si_card" IS NOT NULL;