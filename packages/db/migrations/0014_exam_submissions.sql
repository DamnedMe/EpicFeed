CREATE TABLE "exam_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"submission" jsonb NOT NULL,
	"correction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"corrected_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	CONSTRAINT "exam_submissions_kind_check" CHECK (kind in ('exercise', 'interview')),
	CONSTRAINT "exam_submissions_size_check" CHECK (pg_column_size(submission) <= 131072),
	CONSTRAINT "exam_submissions_correction_size_check" CHECK (correction is null or pg_column_size(correction) <= 131072)
);
--> statement-breakpoint
ALTER TABLE "exam_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_submissions_user_idx" ON "exam_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "exam_submissions_select_own" ON "exam_submissions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("exam_submissions"."user_id" = (select auth.uid()));