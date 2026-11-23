import 'server-only';
import {
  DrizzleCatalogRepository,
  DrizzleGenerationRepository,
  DrizzleStudyFeedRepository,
  GenerateTokenService,
  GenerationRateLimiter,
  ImportRateLimiter,
  ImportTokenService,
  MyLessonsQuery,
  type Database,
} from '@study-feed/adapters';
import {
  ImportLesson,
  ImportLessonSlides,
  ListLessonsToGenerate,
  ListOwnedLessons,
  ListStudySubjects,
  PossessionProofVerifier,
  ReadLessonForGeneration,
  ReadSubjectFeed,
  RealignLessonFeeds,
  SaveLessonFeed,
  systemClock,
} from '@study-feed/core';
import * as schema from '@study-feed/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from './env';

/**
 * Composizione delle dipendenze (composition root): l'unico punto della web
 * app che conosce le implementazioni concrete delle porte del core.
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
  };
  return services;
}
