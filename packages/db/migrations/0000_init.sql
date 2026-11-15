CREATE TYPE "public"."entitlement_basis" AS ENUM('possession_proof');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lesson_part_kind" AS ENUM('video', 'reading');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"epicode_id" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_subject_epicode_key" UNIQUE("subject_id","epicode_id"),
	CONSTRAINT "chapters_title_check" CHECK (char_length("title") between 1 and 300),
	CONSTRAINT "chapters_position_check" CHECK (position >= 0),
	CONSTRAINT "chapters_epicode_id_check" CHECK (epicode_id ~ '^[A-Za-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "chapters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_part_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_status" "generation_status" DEFAULT 'pending' NOT NULL,
	"generation_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_part_hash_key" UNIQUE("lesson_part_id","content_hash"),
	CONSTRAINT "content_versions_id_part_key" UNIQUE("id","lesson_part_id"),
	CONSTRAINT "content_versions_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_versions_size_check" CHECK (pg_column_size(content) <= 2097152)
);
--> statement-breakpoint
ALTER TABLE "content_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_program_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_program_label_key" UNIQUE("study_program_id","label"),
	CONSTRAINT "editions_label_check" CHECK (char_length(label) between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "editions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entitlements" (
	"user_id" uuid NOT NULL,
	"lesson_part_id" uuid NOT NULL,
	"content_version_id" uuid NOT NULL,
	"basis" "entitlement_basis" DEFAULT 'possession_proof' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_pkey" PRIMARY KEY("user_id","content_version_id")
);
--> statement-breakpoint
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"epicode_id" text NOT NULL,
	"kind" "lesson_part_kind" NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_parts_lesson_epicode_key" UNIQUE("lesson_id","epicode_id"),
	CONSTRAINT "lesson_parts_title_check" CHECK (char_length("title") between 1 and 300),
	CONSTRAINT "lesson_parts_position_check" CHECK (position >= 0),
	CONSTRAINT "lesson_parts_epicode_id_check" CHECK (epicode_id ~ '^[A-Za-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "lesson_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"epicode_id" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_chapter_epicode_key" UNIQUE("chapter_id","epicode_id"),
	CONSTRAINT "lessons_title_check" CHECK (char_length("title") between 1 and 300),
	CONSTRAINT "lessons_position_check" CHECK (position >= 0),
	CONSTRAINT "lessons_epicode_id_check" CHECK (epicode_id ~ '^[A-Za-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"epicode_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_programs_epicode_id_key" UNIQUE("epicode_id"),
	CONSTRAINT "study_programs_title_check" CHECK (char_length("title") between 1 and 300),
	CONSTRAINT "study_programs_epicode_id_check" CHECK (epicode_id ~ '^[A-Za-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "study_programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"epicode_id" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_edition_epicode_key" UNIQUE("edition_id","epicode_id"),
	CONSTRAINT "subjects_title_check" CHECK (char_length("title") between 1 and 300),
	CONSTRAINT "subjects_position_check" CHECK (position >= 0),
	CONSTRAINT "subjects_epicode_id_check" CHECK (epicode_id ~ '^[A-Za-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_lesson_part_id_lesson_parts_id_fk" FOREIGN KEY ("lesson_part_id") REFERENCES "public"."lesson_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_study_program_id_study_programs_id_fk" FOREIGN KEY ("study_program_id") REFERENCES "public"."study_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_version_part_fkey" FOREIGN KEY ("content_version_id","lesson_part_id") REFERENCES "public"."content_versions"("id","lesson_part_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_parts" ADD CONSTRAINT "lesson_parts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_versions_pending_idx" ON "content_versions" USING btree ("first_seen_at") WHERE generation_status in ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "entitlements_user_part_idx" ON "entitlements" USING btree ("user_id","lesson_part_id");--> statement-breakpoint
CREATE INDEX "entitlements_version_idx" ON "entitlements" USING btree ("content_version_id");--> statement-breakpoint
CREATE POLICY "chapters_select_entitled" ON "chapters" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from lessons l where l.chapter_id = "chapters"."id"));--> statement-breakpoint
CREATE POLICY "content_versions_select_entitled" ON "content_versions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from entitlements en
        where en.content_version_id = "content_versions"."id" and en.user_id = (select auth.uid())
      ));--> statement-breakpoint
CREATE POLICY "editions_select_entitled" ON "editions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from subjects s where s.edition_id = "editions"."id"));--> statement-breakpoint
CREATE POLICY "entitlements_select_own" ON "entitlements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("entitlements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "lesson_parts_select_entitled" ON "lesson_parts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
        select 1 from entitlements en
        where en.lesson_part_id = "lesson_parts"."id" and en.user_id = (select auth.uid())
      ));--> statement-breakpoint
CREATE POLICY "lessons_select_entitled" ON "lessons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from lesson_parts p where p.lesson_id = "lessons"."id"));--> statement-breakpoint
CREATE POLICY "study_programs_select_entitled" ON "study_programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from editions e where e.study_program_id = "study_programs"."id"));--> statement-breakpoint
CREATE POLICY "subjects_select_entitled" ON "subjects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from chapters c where c.subject_id = "subjects"."id"));