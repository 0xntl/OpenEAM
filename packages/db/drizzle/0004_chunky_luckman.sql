CREATE TYPE "public"."instance_asset_kind" AS ENUM('logo', 'logo_dark', 'icon');--> statement-breakpoint
CREATE TABLE "instance_assets" (
	"kind" "instance_asset_kind" PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "name" text;