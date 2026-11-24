CREATE TABLE "lesson_exam_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_feed_id" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"pack" jsonb NOT NULL,
	"generated_by" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_exam_packs_feed_key" UNIQUE("lesson_feed_id"),
	CONSTRAINT "lesson_exam_packs_prompt_version_check" CHECK (prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'),
	CONSTRAINT "lesson_exam_packs_size_check" CHECK (pg_column_size(pack) <= 524288)
);
--> statement-breakpoint
ALTER TABLE "lesson_exam_packs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lesson_exam_packs" ADD CONSTRAINT "lesson_exam_packs_lesson_feed_id_lesson_feeds_id_fk" FOREIGN KEY ("lesson_feed_id") REFERENCES "public"."lesson_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_exam_packs" ADD CONSTRAINT "lesson_exam_packs_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_exam_packs_generated_by_idx" ON "lesson_exam_packs" USING btree ("generated_by");--> statement-breakpoint
CREATE POLICY "lesson_exam_packs_select_entitled" ON "lesson_exam_packs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from lesson_feeds lf where lf.id = "lesson_exam_packs"."lesson_feed_id"));