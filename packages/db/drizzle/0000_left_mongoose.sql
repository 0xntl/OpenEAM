CREATE TYPE "public"."actor_involvement" AS ENUM('accountable', 'performs', 'consulted');--> statement-breakpoint
CREATE TYPE "public"."actor_kind" AS ENUM('role', 'team', 'individual', 'external');--> statement-breakpoint
CREATE TYPE "public"."instance_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."architecture_level" AS ENUM('strategic', 'segment', 'capability');--> statement-breakpoint
CREATE TYPE "public"."building_block_kind" AS ENUM('architecture', 'solution');--> statement-breakpoint
CREATE TYPE "public"."building_block_relationship_type" AS ENUM('depends_on', 'data_flow', 'hosted_on');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_phase" AS ENUM('planned', 'active', 'phasing_out', 'retired');--> statement-breakpoint
CREATE TYPE "public"."capability_direction" AS ENUM('invest', 'sustain', 'commodity', 'sunset');--> statement-breakpoint
CREATE TYPE "public"."information_usage" AS ENUM('owns', 'creates', 'uses');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"kind" "actor_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_organization_unit_only_for_team_check" CHECK ("actors"."organization_unit_id" IS NULL OR "actors"."kind" = 'team')
);
--> statement-breakpoint
CREATE TABLE "capability_actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"involvement" "actor_involvement" DEFAULT 'performs' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_actors_validity_check" CHECK ("capability_actors"."valid_from" IS NULL OR "capability_actors"."valid_to" IS NULL OR "capability_actors"."valid_from" < "capability_actors"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "architecture_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "architecture_domains_enterprise_id_name_unique" UNIQUE("enterprise_id","name")
);
--> statement-breakpoint
CREATE TABLE "enterprise_members" (
	"enterprise_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_members_enterprise_id_user_id_pk" PRIMARY KEY("enterprise_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"sign_up_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_singleton_check" CHECK ("instance_settings"."id" = 'instance')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"instance_role" "instance_role" DEFAULT 'user' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "building_block_architecture_domains" (
	"building_block_id" uuid NOT NULL,
	"architecture_domain_id" uuid NOT NULL,
	CONSTRAINT "building_block_architecture_domains_building_block_id_architecture_domain_id_pk" PRIMARY KEY("building_block_id","architecture_domain_id")
);
--> statement-breakpoint
CREATE TABLE "building_block_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_block_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_block_capabilities_validity_check" CHECK ("building_block_capabilities"."valid_from" IS NULL OR "building_block_capabilities"."valid_to" IS NULL OR "building_block_capabilities"."valid_from" < "building_block_capabilities"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "building_block_organization_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_block_id" uuid NOT NULL,
	"organization_unit_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_block_organization_units_validity_check" CHECK ("building_block_organization_units"."valid_from" IS NULL OR "building_block_organization_units"."valid_to" IS NULL OR "building_block_organization_units"."valid_from" < "building_block_organization_units"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "building_block_realizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"architecture_building_block_id" uuid NOT NULL,
	"solution_building_block_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_block_realizations_validity_check" CHECK ("building_block_realizations"."valid_from" IS NULL OR "building_block_realizations"."valid_to" IS NULL OR "building_block_realizations"."valid_from" < "building_block_realizations"."valid_to"),
	CONSTRAINT "building_block_realizations_distinct_ends_check" CHECK ("building_block_realizations"."architecture_building_block_id" <> "building_block_realizations"."solution_building_block_id")
);
--> statement-breakpoint
CREATE TABLE "building_block_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_building_block_id" uuid NOT NULL,
	"target_building_block_id" uuid NOT NULL,
	"type" "building_block_relationship_type" DEFAULT 'depends_on' NOT NULL,
	"description" text,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_block_relationships_validity_check" CHECK ("building_block_relationships"."valid_from" IS NULL OR "building_block_relationships"."valid_to" IS NULL OR "building_block_relationships"."valid_from" < "building_block_relationships"."valid_to"),
	CONSTRAINT "building_block_relationships_no_self_check" CHECK ("building_block_relationships"."source_building_block_id" <> "building_block_relationships"."target_building_block_id")
);
--> statement-breakpoint
CREATE TABLE "building_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"kind" "building_block_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"architecture_level" "architecture_level",
	"lifecycle_phase" "lifecycle_phase" DEFAULT 'planned' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "building_blocks_validity_check" CHECK ("building_blocks"."valid_from" IS NULL OR "building_blocks"."valid_to" IS NULL OR "building_blocks"."valid_from" < "building_blocks"."valid_to"),
	CONSTRAINT "building_blocks_level_only_for_architecture_check" CHECK ("building_blocks"."architecture_level" IS NULL OR "building_blocks"."kind" = 'architecture')
);
--> statement-breakpoint
CREATE TABLE "business_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"direction" "capability_direction",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_capabilities_id_enterprise_id_unique" UNIQUE("id","enterprise_id")
);
--> statement-breakpoint
CREATE TABLE "business_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_event" text,
	"outcome" text,
	"bpmn_xml" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "process_steps_process_id_position_unique" UNIQUE("process_id","position")
);
--> statement-breakpoint
CREATE TABLE "enterprises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goal" text,
	"avatar_bg_color" text,
	"avatar_text_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_information" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_id" uuid NOT NULL,
	"information_object_id" uuid NOT NULL,
	"usage" "information_usage" DEFAULT 'uses' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_information_validity_check" CHECK ("capability_information"."valid_from" IS NULL OR "capability_information"."valid_to" IS NULL OR "capability_information"."valid_from" < "capability_information"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "information_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_units_id_enterprise_id_unique" UNIQUE("id","enterprise_id"),
	CONSTRAINT "organization_units_not_own_parent_check" CHECK ("organization_units"."parent_id" IS DISTINCT FROM "organization_units"."id")
);
--> statement-breakpoint
CREATE TABLE "stage_capabilities" (
	"stage_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "stage_capabilities_stage_id_capability_id_pk" PRIMARY KEY("stage_id","capability_id"),
	CONSTRAINT "stage_capabilities_stage_id_position_unique" UNIQUE("stage_id","position")
);
--> statement-breakpoint
CREATE TABLE "value_stream_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"value_stream_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "value_stream_stages_value_stream_id_position_unique" UNIQUE("value_stream_id","position")
);
--> statement-breakpoint
CREATE TABLE "value_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enterprise_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_unit_id_organization_units_id_fk" FOREIGN KEY ("organization_unit_id") REFERENCES "public"."organization_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_organization_unit_same_enterprise_fk" FOREIGN KEY ("organization_unit_id","enterprise_id") REFERENCES "public"."organization_units"("id","enterprise_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_actors" ADD CONSTRAINT "capability_actors_capability_id_business_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."business_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_actors" ADD CONSTRAINT "capability_actors_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_domains" ADD CONSTRAINT "architecture_domains_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enterprise_members" ADD CONSTRAINT "enterprise_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_architecture_domains" ADD CONSTRAINT "building_block_architecture_domains_building_block_id_building_blocks_id_fk" FOREIGN KEY ("building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_architecture_domains" ADD CONSTRAINT "building_block_architecture_domains_architecture_domain_id_architecture_domains_id_fk" FOREIGN KEY ("architecture_domain_id") REFERENCES "public"."architecture_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_capabilities" ADD CONSTRAINT "building_block_capabilities_building_block_id_building_blocks_id_fk" FOREIGN KEY ("building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_capabilities" ADD CONSTRAINT "building_block_capabilities_capability_id_business_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."business_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_organization_units" ADD CONSTRAINT "building_block_organization_units_building_block_id_building_blocks_id_fk" FOREIGN KEY ("building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_organization_units" ADD CONSTRAINT "building_block_organization_units_organization_unit_id_organization_units_id_fk" FOREIGN KEY ("organization_unit_id") REFERENCES "public"."organization_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_realizations" ADD CONSTRAINT "building_block_realizations_architecture_building_block_id_building_blocks_id_fk" FOREIGN KEY ("architecture_building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_realizations" ADD CONSTRAINT "building_block_realizations_solution_building_block_id_building_blocks_id_fk" FOREIGN KEY ("solution_building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_relationships" ADD CONSTRAINT "building_block_relationships_source_building_block_id_building_blocks_id_fk" FOREIGN KEY ("source_building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_block_relationships" ADD CONSTRAINT "building_block_relationships_target_building_block_id_building_blocks_id_fk" FOREIGN KEY ("target_building_block_id") REFERENCES "public"."building_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "building_blocks" ADD CONSTRAINT "building_blocks_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_capabilities" ADD CONSTRAINT "business_capabilities_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_processes" ADD CONSTRAINT "business_processes_capability_fk" FOREIGN KEY ("capability_id","enterprise_id") REFERENCES "public"."business_capabilities"("id","enterprise_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_process_id_business_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."business_processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_information" ADD CONSTRAINT "capability_information_capability_id_business_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."business_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capability_information" ADD CONSTRAINT "capability_information_information_object_id_information_objects_id_fk" FOREIGN KEY ("information_object_id") REFERENCES "public"."information_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "information_objects" ADD CONSTRAINT "information_objects_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parent_fk" FOREIGN KEY ("parent_id","enterprise_id") REFERENCES "public"."organization_units"("id","enterprise_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_capabilities" ADD CONSTRAINT "stage_capabilities_stage_id_value_stream_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."value_stream_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_capabilities" ADD CONSTRAINT "stage_capabilities_capability_id_business_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."business_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_stream_stages" ADD CONSTRAINT "value_stream_stages_value_stream_id_value_streams_id_fk" FOREIGN KEY ("value_stream_id") REFERENCES "public"."value_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_streams" ADD CONSTRAINT "value_streams_enterprise_id_enterprises_id_fk" FOREIGN KEY ("enterprise_id") REFERENCES "public"."enterprises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actors_enterprise_id_idx" ON "actors" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "actors_organization_unit_id_idx" ON "actors" USING btree ("organization_unit_id");--> statement-breakpoint
CREATE INDEX "capability_actors_capability_id_idx" ON "capability_actors" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "capability_actors_actor_id_idx" ON "capability_actors" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_actors_one_open_per_pair_idx" ON "capability_actors" USING btree ("capability_id","actor_id") WHERE "capability_actors"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "architecture_domains_enterprise_id_idx" ON "architecture_domains" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "enterprise_members_user_id_idx" ON "enterprise_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "building_block_architecture_domains_domain_id_idx" ON "building_block_architecture_domains" USING btree ("architecture_domain_id");--> statement-breakpoint
CREATE INDEX "building_block_capabilities_building_block_id_idx" ON "building_block_capabilities" USING btree ("building_block_id");--> statement-breakpoint
CREATE INDEX "building_block_capabilities_capability_id_idx" ON "building_block_capabilities" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "building_block_organization_units_building_block_id_idx" ON "building_block_organization_units" USING btree ("building_block_id");--> statement-breakpoint
CREATE INDEX "building_block_organization_units_organization_unit_id_idx" ON "building_block_organization_units" USING btree ("organization_unit_id");--> statement-breakpoint
CREATE INDEX "building_block_realizations_architecture_id_idx" ON "building_block_realizations" USING btree ("architecture_building_block_id");--> statement-breakpoint
CREATE INDEX "building_block_realizations_solution_id_idx" ON "building_block_realizations" USING btree ("solution_building_block_id");--> statement-breakpoint
CREATE INDEX "building_block_relationships_source_id_idx" ON "building_block_relationships" USING btree ("source_building_block_id");--> statement-breakpoint
CREATE INDEX "building_block_relationships_target_id_idx" ON "building_block_relationships" USING btree ("target_building_block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "building_block_relationships_one_open_host_idx" ON "building_block_relationships" USING btree ("source_building_block_id") WHERE "building_block_relationships"."type" = 'hosted_on' AND "building_block_relationships"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "building_blocks_enterprise_id_idx" ON "building_blocks" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "business_capabilities_enterprise_id_idx" ON "business_capabilities" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "business_processes_capability_id_idx" ON "business_processes" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "business_processes_enterprise_id_idx" ON "business_processes" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "process_steps_process_id_idx" ON "process_steps" USING btree ("process_id");--> statement-breakpoint
CREATE INDEX "capability_information_capability_id_idx" ON "capability_information" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "capability_information_information_object_id_idx" ON "capability_information" USING btree ("information_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_information_one_open_per_pair_idx" ON "capability_information" USING btree ("capability_id","information_object_id") WHERE "capability_information"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "information_objects_enterprise_id_idx" ON "information_objects" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "organization_units_parent_id_idx" ON "organization_units" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "organization_units_enterprise_id_idx" ON "organization_units" USING btree ("enterprise_id");--> statement-breakpoint
CREATE INDEX "stage_capabilities_capability_id_idx" ON "stage_capabilities" USING btree ("capability_id");--> statement-breakpoint
CREATE INDEX "value_stream_stages_value_stream_id_idx" ON "value_stream_stages" USING btree ("value_stream_id");--> statement-breakpoint
CREATE INDEX "value_streams_enterprise_id_idx" ON "value_streams" USING btree ("enterprise_id");