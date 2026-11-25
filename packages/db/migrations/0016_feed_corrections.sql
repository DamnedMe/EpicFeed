CREATE TABLE "feed_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"lesson_id" uuid,
	"kind" text NOT NULL,
	"correction" jsonb NOT NULL,
	"claude_status" text NOT NULL,
	"completion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "feed_corrections_kind_check" CHECK (kind in ('text', 'regenerate', 'answer', 'term')),
	CONSTRAINT "feed_corrections_claude_status_check" CHECK (claude_status in ('pending', 'done', 'disputed', 'not_needed')),
	CONSTRAINT "feed_corrections_lesson_check" CHECK ((kind = 'term') = (lesson_id is null)),
	CONSTRAINT "feed_corrections_size_check" CHECK (pg_column_size(correction) <= 65536),
	CONSTRAINT "feed_corrections_completion_size_check" CHECK (completion is null or pg_column_size(completion) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "feed_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feed_corrections" ADD CONSTRAINT "feed_corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_corrections" ADD CONSTRAINT "feed_corrections_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_corrections" ADD CONSTRAINT "feed_corrections_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_corrections_user_idx" ON "feed_corrections" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_corrections_subject_idx" ON "feed_corrections" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "feed_corrections_lesson_idx" ON "feed_corrections" USING btree ("lesson_id");--> statement-breakpoint
CREATE POLICY "feed_corrections_select_own" ON "feed_corrections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("feed_corrections"."user_id" = (select auth.uid()));