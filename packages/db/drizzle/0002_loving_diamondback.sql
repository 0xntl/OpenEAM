CREATE TYPE "public"."enterprise_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
ALTER TABLE "enterprise_members" ADD COLUMN "role" "enterprise_role" DEFAULT 'editor' NOT NULL;--> statement-breakpoint
-- Everyone who had access before roles existed could do everything; owner is
-- the role that keeps that true.
UPDATE "enterprise_members" SET "role" = 'owner';
