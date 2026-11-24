CREATE TABLE "subject_exam_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"generated_by" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"bank" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_exam_banks_subject_user_key" UNIQUE("subject_id","generated_by"),
	CONSTRAINT "subject_exam_banks_prompt_version_check" CHECK (prompt_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][0-9]{1,3}$'),
	CONSTRAINT "subject_exam_banks_size_check" CHECK (pg_column_size(bank) <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "subject_exam_banks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subject_exam_banks" ADD CONSTRAINT "subject_exam_banks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_exam_banks" ADD CONSTRAINT "subject_exam_banks_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subject_exam_banks_generated_by_idx" ON "subject_exam_banks" USING btree ("generated_by");--> statement-breakpoint
CREATE POLICY "subject_exam_banks_select_own" ON "subject_exam_banks" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("subject_exam_banks"."generated_by" = (select auth.uid()) and exists (select 1 from subjects s where s.id = "subject_exam_banks"."subject_id"));