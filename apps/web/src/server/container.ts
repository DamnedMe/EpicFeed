import 'server-only';
import { DrizzleCatalogRepository, MyLessonsQuery } from '@epicfeed/catalog/infrastructure';
import {
  DrizzleExamPackRepository,
  DrizzleExamSubmissionRepository,
} from '@epicfeed/exam/infrastructure';
import { DrizzleProgressRepository } from '@epicfeed/review/infrastructure';
import { DrizzleQuestionRepository } from '@epicfeed/assistant/infrastructure';
import { AnswerQuestion, AskQuestion, DeleteQuestion, ListQuestions } from '@epicfeed/assistant';
import {
  DrizzleCorrectionRepository,
  DrizzleGenerationRepository,
  DrizzleStudyFeedRepository,
} from '@epicfeed/feed/infrastructure';
import {
  GenerateTokenService,
  GenerationRateLimiter,
  ImportRateLimiter,
  ImportTokenService,
} from '@epicfeed/access/infrastructure';
import {
  DeleteSubmission,
  ListSubmissions,
  SaveCorrection,
  SubmitForCorrection,
  ListLessonsForExam,
  ListSubjectsForExam,
  ReadLessonForExam,
  ReadExamContent,
  SaveExamBank,
  SaveExamPack,
} from '@epicfeed/exam';
import {
  CompleteCorrection,
  ImportLessonSlides,
  ListCorrections,
  ListLessonsToGenerate,
  ListOwnedLessons,
  ListStudySubjects,
  ReadLessonForGeneration,
  ReadSubjectFeed,
  RealignLessonFeeds,
  ReportError,
  SaveLessonFeed,
  WithdrawCorrection,
} from '@epicfeed/feed';
import { ImportLesson } from '@epicfeed/ingest';
import { PossessionProofVerifier } from '@epicfeed/catalog';
import { systemClock } from '@epicfeed/shared';
import * as schema from '@epicfeed/db';
import type { Database } from '@epicfeed/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from './env';

/**
 * Composizione delle dipendenze (composition root): l'unico punto della web
 * app che conosce le implementazioni concrete delle porte dei casi d'uso.
 */
export interface Services {
  readonly importLesson: ImportLesson;
  readonly tokens: ImportTokenService;
  readonly rateLimiter: ImportRateLimiter;
  readonly myLessons: MyLessonsQuery;
  readonly generateTokens: GenerateTokenService;
  readonly generationRateLimiter: GenerationRateLimiter;
  readonly listLessonsToGenerate: ListLessonsToGenerate;
  readonly readLessonForGeneration: ReadLessonForGeneration;
  readonly saveLessonFeed: SaveLessonFeed;
  readonly listOwnedLessons: ListOwnedLessons;
  readonly importLessonSlides: ImportLessonSlides;
  readonly listStudySubjects: ListStudySubjects;
  readonly readSubjectFeed: ReadSubjectFeed;
  readonly realignLessonFeeds: RealignLessonFeeds;
  /** Copie cifrate dei progressi (ADR 0018). */
  readonly progress: DrizzleProgressRepository;
  readonly listLessonsForExam: ListLessonsForExam;
  readonly readLessonForExam: ReadLessonForExam;
  readonly saveExamPack: SaveExamPack;
  readonly listSubjectsForExam: ListSubjectsForExam;
  readonly saveExamBank: SaveExamBank;
  readonly readExamContent: ReadExamContent;
  readonly submitForCorrection: SubmitForCorrection;
  readonly listSubmissions: ListSubmissions;
  readonly saveCorrection: SaveCorrection;
  readonly deleteSubmission: DeleteSubmission;
  /** Segnala errore (ADR 0020): correzioni personali al feed. */
  readonly reportError: ReportError;
  readonly listCorrections: ListCorrections;
  readonly withdrawCorrection: WithdrawCorrection;
  readonly completeCorrection: CompleteCorrection;
  /** Domande in coda per Claude Desktop (ADR 0021, scelta 1). */
  readonly askQuestion: AskQuestion;
  readonly listQuestions: ListQuestions;
  readonly deleteQuestion: DeleteQuestion;
  readonly answerQuestion: AnswerQuestion;
}

let services: Services | undefined;

/**
 * Crea (una volta per istanza del server) connessione e servizi.
 *
 * Connessione: pooler di Supabase in modalità transaction, quindi niente
 * prepared statement; poche connessioni, perché su Vercel ogni istanza è
 * piccola e di breve vita.
 *
 * @returns I servizi dell'applicazione.
 */
export function getServices(): Services {
  if (services) return services;
  const url = serverEnv().DATABASE_URL;
  // Verso Supabase sempre cifrato; in chiaro solo verso un database locale (sviluppo e prove).
  const local = ['localhost', '127.0.0.1'].includes(new URL(url).hostname);
  const client = postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    ssl: local ? false : 'require',
  });
  const db = drizzle(client, { schema }) as unknown as Database;
  const generation = new DrizzleGenerationRepository(db);
  const catalog = new DrizzleCatalogRepository(db);
  const studyFeed = new DrizzleStudyFeedRepository(db);
  const exams = new DrizzleExamPackRepository(db);
  const submissions = new DrizzleExamSubmissionRepository(db);
  const corrections = new DrizzleCorrectionRepository(db);
  const questions = new DrizzleQuestionRepository(db);
  const verifier = new PossessionProofVerifier(systemClock);
  services = {
    importLesson: new ImportLesson({ catalog, verifier, clock: systemClock }),
    tokens: new ImportTokenService(db),
    rateLimiter: new ImportRateLimiter(db),
    myLessons: new MyLessonsQuery(db),
    generateTokens: new GenerateTokenService(db),
    generationRateLimiter: new GenerationRateLimiter(db),
    listLessonsToGenerate: new ListLessonsToGenerate(generation),
    readLessonForGeneration: new ReadLessonForGeneration(generation),
    saveLessonFeed: new SaveLessonFeed({ repository: generation, clock: systemClock }),
    listOwnedLessons: new ListOwnedLessons(generation),
    importLessonSlides: new ImportLessonSlides({
      catalog,
      generation,
      verifier,
      clock: systemClock,
    }),
    listStudySubjects: new ListStudySubjects(studyFeed),
    readSubjectFeed: new ReadSubjectFeed(studyFeed),
    realignLessonFeeds: new RealignLessonFeeds(generation, studyFeed),
    progress: new DrizzleProgressRepository(db),
    listLessonsForExam: new ListLessonsForExam(exams),
    readLessonForExam: new ReadLessonForExam(exams),
    saveExamPack: new SaveExamPack({ repository: exams, clock: systemClock }),
    listSubjectsForExam: new ListSubjectsForExam(exams),
    saveExamBank: new SaveExamBank({ repository: exams, clock: systemClock }),
    readExamContent: new ReadExamContent(exams),
    submitForCorrection: new SubmitForCorrection(submissions),
    listSubmissions: new ListSubmissions(submissions, systemClock),
    saveCorrection: new SaveCorrection(submissions, systemClock),
    deleteSubmission: new DeleteSubmission(submissions),
    reportError: new ReportError(corrections),
    listCorrections: new ListCorrections(corrections),
    withdrawCorrection: new WithdrawCorrection(corrections),
    completeCorrection: new CompleteCorrection(corrections, systemClock),
    askQuestion: new AskQuestion(questions),
    listQuestions: new ListQuestions(questions),
    deleteQuestion: new DeleteQuestion(questions),
    answerQuestion: new AnswerQuestion(questions, systemClock),
  };
  return services;
}
