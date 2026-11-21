CREATE TYPE "public"."generation_action" AS ENUM('read', 'save');--> statement-breakpoint
ALTER TYPE "public"."api_token_scope" ADD VALUE 'generate';--> statement-breakpoint
CREATE TABLE "generation_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "generation_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"action" "generation_action" NOT NULL,
	"lesson_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"term" text NOT NULL,
	"term_key" text NOT NULL,
	"translation" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glossary_terms_subject_term_key" UNIQUE("subject_id","term_key"),
	CONSTRAINT "glossary_terms_term_check" CHECK (char_length(term) between 1 and 80),
	CONSTRAINT "glossary_terms_translation_check" CHECK (char_length(translation) between 1 and 120),
	CONSTRAINT "glossary_terms_size_check" CHECK (pg_column_size(definition) <= 4096)
);
--> statement-breakpoint
ALTER TABLE "glossary_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"sources_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"feed" jsonb NOT NULL,
	"source_version_ids" uuid[] NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_feeds_lesson_sources_key" UNIQUE("lesson_id","sources_hash"),
	CONSTRAINT "lesson_feeds_hash_check" CHECK (sources_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "lesson_feeds_prompt_version_check" CHECK (prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'),
	CONSTRAINT "lesson_feeds_size_check" CHECK (pg_column_size(feed) <= 1048576),
	CONSTRAINT "lesson_feeds_sources_check" CHECK (cardinality(source_version_ids) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "lesson_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feeds" ADD CONSTRAINT "lesson_feeds_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_feeds" ADD CONSTRAINT "lesson_feeds_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_events_user_created_idx" ON "generation_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_events_lesson_idx" ON "generation_events" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_feeds_generated_by_idx" ON "lesson_feeds" USING btree ("generated_by");--> statement-breakpoint
CREATE POLICY "generation_events_select_own" ON "generation_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("generation_events"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "glossary_terms_select_entitled" ON "glossary_terms" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from subjects s where s.id = "glossary_terms"."subject_id"));--> statement-breakpoint
CREATE POLICY "lesson_feeds_select_entitled" ON "lesson_feeds" AS PERMISSIVE FOR SELECT TO "authenticated" USING (not exists (
        select 1 from unnest("lesson_feeds"."source_version_ids") as v(id)
        where not exists (
          select 1 from entitlements en
          where en.content_version_id = v.id and en.user_id = (select auth.uid())
        )
      ));