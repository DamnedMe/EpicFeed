CREATE TYPE "public"."api_token_scope" AS ENUM('import');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "api_token_scope" NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "api_tokens_hash_check" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_tokens_label_check" CHECK (char_length(label) between 1 and 100),
	CONSTRAINT "api_tokens_expiry_check" CHECK (expires_at > created_at)
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"lesson_id" uuid,
	"part_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_events_part_count_check" CHECK (part_count >= 0)
);
--> statement-breakpoint
ALTER TABLE "import_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subtitle_access" (
	"user_id" uuid NOT NULL,
	"subtitle_track_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtitle_access_pkey" PRIMARY KEY("user_id","subtitle_track_id")
);
--> statement-breakpoint
ALTER TABLE "subtitle_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subtitle_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_part_id" uuid NOT NULL,
	"language" text NOT NULL,
	"auto_generated" boolean NOT NULL,
	"content_hash" text NOT NULL,
	"cues" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subtitle_tracks_part_hash_key" UNIQUE("lesson_part_id","content_hash"),
	CONSTRAINT "subtitle_tracks_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "subtitle_tracks_language_check" CHECK (language ~ '^[a-z]{2,3}(-[a-z0-9]{1,8}){0,3}$'),
	CONSTRAINT "subtitle_tracks_size_check" CHECK (pg_column_size(cues) <= 2097152)
);
--> statement-breakpoint
ALTER TABLE "subtitle_tracks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_parts" ADD COLUMN "video_id" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_events" ADD CONSTRAINT "import_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_events" ADD CONSTRAINT "import_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_access" ADD CONSTRAINT "subtitle_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_access" ADD CONSTRAINT "subtitle_access_subtitle_track_id_subtitle_tracks_id_fk" FOREIGN KEY ("subtitle_track_id") REFERENCES "public"."subtitle_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_lesson_part_id_lesson_parts_id_fk" FOREIGN KEY ("lesson_part_id") REFERENCES "public"."lesson_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_events_user_created_idx" ON "import_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "import_events_lesson_idx" ON "import_events" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "subtitle_access_track_idx" ON "subtitle_access" USING btree ("subtitle_track_id");--> statement-breakpoint
ALTER TABLE "lesson_parts" ADD CONSTRAINT "lesson_parts_video_id_check" CHECK (video_id is null or (kind = 'video' and video_id ~ '^[0-9]{1,20}$'));--> statement-breakpoint
CREATE POLICY "api_tokens_select_own" ON "api_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("api_tokens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "import_events_select_own" ON "import_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("import_events"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subtitle_access_select_own" ON "subtitle_access" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("subtitle_access"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "subtitle_tracks_select_entitled" ON "subtitle_tracks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from subtitle_access sa
        where sa.subtitle_track_id = "subtitle_tracks"."id" and sa.user_id = (select auth.uid())
      ));