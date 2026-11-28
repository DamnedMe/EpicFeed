CREATE TABLE "study_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"question" text NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "study_questions_item_type_check" CHECK (item_type in ('card', 'quiz')),
	CONSTRAINT "study_questions_item_id_check" CHECK (item_id ~ '^[a-z0-9-]{1,80}$'),
	CONSTRAINT "study_questions_language_check" CHECK (language in ('it', 'en')),
	CONSTRAINT "study_questions_status_check" CHECK (status in ('pending', 'answered')),
	CONSTRAINT "study_questions_question_check" CHECK (char_length(question) between 1 and 1000),
	CONSTRAINT "study_questions_answer_check" CHECK ((status = 'answered') = (answer is not null) and (answer is null or char_length(answer) <= 6000))
);
--> statement-breakpoint
ALTER TABLE "study_questions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_questions" ADD CONSTRAINT "study_questions_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_questions_user_idx" ON "study_questions" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "study_questions_subject_idx" ON "study_questions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "study_questions_lesson_idx" ON "study_questions" USING btree ("lesson_id");--> statement-breakpoint
CREATE POLICY "study_questions_select_own" ON "study_questions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("study_questions"."user_id" = (select auth.uid()));