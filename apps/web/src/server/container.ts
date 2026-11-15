import 'server-only';
import {
  DrizzleCatalogRepository,
  ImportRateLimiter,
  ImportTokenService,
  MyLessonsQuery,
  type Database,
} from '@study-feed/adapters';
import { ImportLesson, PossessionProofVerifier, systemClock } from '@study-feed/core';
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
  const client = postgres(serverEnv().DATABASE_URL, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    ssl: 'require',
  });
  const db = drizzle(client, { schema }) as unknown as Database;
  services = {
    importLesson: new ImportLesson({
      catalog: new DrizzleCatalogRepository(db),
      verifier: new PossessionProofVerifier(systemClock),
      clock: systemClock,
    }),
    tokens: new ImportTokenService(db),
    rateLimiter: new ImportRateLimiter(db),
    myLessons: new MyLessonsQuery(db),
  };
  return services;
}
