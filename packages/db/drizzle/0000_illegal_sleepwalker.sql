CREATE TYPE "public"."candidate_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'MERGED');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('SUCCESS', 'NO_EVENTS', 'ACCESS_RESTRICTED', 'ERROR', 'RATE_LIMITED', 'AUTH_REQUIRED', 'NOT_FOUND', 'NO_RECENT_CONTENT');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('PUBLISHED', 'PENDING', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('facebook', 'instagram', 'website', 'tiktok', 'rss', 'manual');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USER', 'EDITOR', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."run_trigger" AS ENUM('CRON', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('venue', 'organizer', 'tour-operator', 'cultural', 'mall', 'institution', 'media');--> statement-breakpoint
CREATE TYPE "public"."url_kind" AS ENUM('EVENT_SOURCE_URL', 'PROFILE_URL');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"scope" text,
	"id_token" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "discovery_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" "run_trigger" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"sources_checked" integer DEFAULT 0 NOT NULL,
	"events_found" integer DEFAULT 0 NOT NULL,
	"new_events" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"status" "run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_by" text
);
--> statement-breakpoint
CREATE TABLE "event_source" (
	"event_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"platform" "platform" NOT NULL,
	"url_kind" "url_kind" NOT NULL,
	"original_post_url" text,
	"profile_url" text,
	CONSTRAINT "event_source_event_id_source_id_platform_pk" PRIMARY KEY("event_id","source_id","platform")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"venue_id" text,
	"venue_name" text NOT NULL,
	"organizer_id" text,
	"organizer_name" text,
	"organizer_url" text,
	"place_id" text NOT NULL,
	"country" text DEFAULT 'NI' NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"is_free" boolean DEFAULT false NOT NULL,
	"currency" text,
	"price_min" double precision,
	"price_max" double precision,
	"price_note" text,
	"image" jsonb,
	"confidence" "confidence" NOT NULL,
	"status" "event_status" DEFAULT 'PENDING' NOT NULL,
	"is_mock" boolean DEFAULT false NOT NULL,
	"dedupe_key" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "organizer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"profile_url" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_account" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"platform" "platform" NOT NULL,
	"external_id" text,
	"profile_url" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_candidate" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"category" text,
	"discovered_from" text,
	"urls" jsonb NOT NULL,
	"confidence" "confidence" DEFAULT 'LOW' NOT NULL,
	"status" "candidate_status" DEFAULT 'PENDING' NOT NULL,
	"merged_into_id" text,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "source_check" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"run_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "check_status" NOT NULL,
	"posts_reviewed" integer DEFAULT 0 NOT NULL,
	"events_found" integer DEFAULT 0 NOT NULL,
	"message" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"type" "source_type" NOT NULL,
	"country" text DEFAULT 'NI' NOT NULL,
	"city" text,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"urls" jsonb NOT NULL,
	"verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"owner_id" text,
	"last_reviewed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_source" (
	"user_id" text NOT NULL,
	"source_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_source_user_id_source_id_pk" PRIMARY KEY("user_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "role" DEFAULT 'USER' NOT NULL,
	"country" text DEFAULT 'NI' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country" text DEFAULT 'NI' NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_source" ADD CONSTRAINT "event_source_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_organizer_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_account" ADD CONSTRAINT "source_account_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidate" ADD CONSTRAINT "source_candidate_merged_into_id_source_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_check" ADD CONSTRAINT "source_check_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_check" ADD CONSTRAINT "source_check_run_id_discovery_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."discovery_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source" ADD CONSTRAINT "source_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source" ADD CONSTRAINT "user_source_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_source" ADD CONSTRAINT "user_source_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_starts_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "event_place_idx" ON "event" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "event_dedupe_idx" ON "event" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_account_unique" ON "source_account" USING btree ("source_id","platform");--> statement-breakpoint
CREATE INDEX "source_check_source_idx" ON "source_check" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "source_city_idx" ON "source" USING btree ("city");--> statement-breakpoint
CREATE INDEX "source_active_idx" ON "source" USING btree ("active");