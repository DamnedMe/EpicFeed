/**
 * Assistente di studio (M6, ADR 0021): domande in coda per Claude Desktop.
 */
import { sql } from 'drizzle-orm';
import { check, index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';
import { createdAt } from './columns.js';
import { lessons, subjects } from './catalog.js';

/**
 * Domanda dello studente su una scheda o una domanda del feed, fatta senza
 * chiave API (scelta 1): resta in attesa finché Claude Desktop non risponde
 * con gli strumenti MCP. Personale: la vede solo lo studente che l'ha fatta.
 */
export const studyQuestions = pgTable(
  'study_questions',
  {
    /** Scelto dall'app (UUID), così un reinvio non crea doppioni. */
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    /** Id della scheda o della domanda nel feed della lezione. */
    itemId: text('item_id').notNull(),
    question: text('question').notNull(),
    language: text('language').notNull(),
    status: text('status').notNull().default('pending'),
    answer: text('answer'),
    createdAt: createdAt(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [
    check('study_questions_item_type_check', sql`item_type in ('card', 'quiz')`),
    check('study_questions_item_id_check', sql`item_id ~ '^[a-z0-9-]{1,80}$'`),
    check('study_questions_language_check', sql`language in ('it', 'en')`),
    check('study_questions_status_check', sql`status in ('pending', 'answered')`),
    check('study_questions_question_check', sql`char_length(question) between 1 and 1000`),
    check(
      'study_questions_answer_check',
      sql`(status = 'answered') = (answer is not null) and (answer is null or char_length(answer) <= 6000)`,
    ),
    index('study_questions_user_idx').on(t.userId, t.status, t.createdAt),
    index('study_questions_subject_idx').on(t.subjectId),
    index('study_questions_lesson_idx').on(t.lessonId),
    pgPolicy('study_questions_select_own', {
      for: 'select',
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();
