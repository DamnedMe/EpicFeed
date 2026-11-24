// @ts-check
/**
 * Confini dei pacchetti di funzione (ADR 0019).
 *
 * Ogni pacchetto `@epicfeed/<funzione>` ha quattro cartelle con regole fisse:
 * - `domain/`: regole pure, importano solo `@epicfeed/shared` e il proprio dominio;
 * - `application/`: casi d'uso e porte, importano il dominio;
 * - `contracts/`: schemi zod ai confini, importano il dominio e zod;
 * - `infrastructure/`: adattatori, possono usare database e librerie di I/O.
 *
 * Tra pacchetti si importa solo la porta pubblica (`@epicfeed/<nome>`) dei
 * pacchetti dichiarati in `dependsOn`: mai i loro file interni né la loro
 * infrastruttura.
 */

/** Framework e librerie di I/O vietati fuori dall'infrastruttura. */
const IO_LIBRARIES = [
  'react',
  'react-*',
  'next',
  'next/*',
  '@supabase/*',
  'drizzle-orm',
  'drizzle-orm/*',
  'postgres',
];

/**
 * Pacchetti del monorepo che un pacchetto di funzione non può importare.
 *
 * @param {string[]} allowed - Nomi dei pacchetti ammessi (senza scope).
 * @returns {{ group: string[], message: string }} Il pattern per `no-restricted-imports`.
 */
function otherPackages(allowed) {
  return {
    group: ['@epicfeed/*', '!@epicfeed/config', ...allowed.map((name) => `!@epicfeed/${name}`)],
    message: `Questo pacchetto dipende solo da: ${allowed.join(', ') || 'nessun pacchetto'} (ADR 0019).`,
  };
}

/** Import dei file interni o dell'infrastruttura di un altro pacchetto. */
const DEEP_IMPORTS = {
  group: ['@epicfeed/*/*', '!@epicfeed/config/*', '!@epicfeed/db/*'],
  message: 'Da un altro pacchetto si importa solo la sua porta pubblica (ADR 0019).',
};

/**
 * Pattern che vietano di salire verso altre cartelle dello stesso pacchetto.
 *
 * @param {string[]} layers - Cartelle vietate (es. `application`).
 * @returns {{ group: string[], message: string }} Il pattern.
 */
function sibling(layers) {
  return {
    group: layers.flatMap((layer) => [`../${layer}`, `../${layer}/*`]),
    message: `Da qui non si importa ${layers.join(', ')}: le dipendenze vanno verso il dominio.`,
  };
}

/**
 * Regola `no-restricted-imports` con i pattern dati.
 *
 * @param {object[]} patterns - I pattern vietati.
 * @returns {import('eslint').Linter.RulesRecord} Le regole.
 */
function restrict(patterns) {
  return { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] };
}

/**
 * Regole ESLint dei confini per un pacchetto di funzione.
 *
 * @param {object} options
 * @param {string[]} [options.dependsOn] - Altri pacchetti di funzione usati
 *   (oltre a `shared`, sempre ammesso).
 * @param {boolean} [options.flat] - `true` per un pacchetto senza cartelle di
 *   livello (solo `shared`): tutto `src/` segue le regole del dominio.
 * @returns {import('eslint').Linter.Config[]} Le voci da passare a `extra`.
 */
export function featureBoundaries({ dependsOn = [], flat = false } = {}) {
  const allowed = flat ? [] : ['shared', ...dependsOn];
  const packages = otherPackages(allowed);
  const pure = {
    group: [...IO_LIBRARIES, 'node:*'],
    message: 'Codice puro: niente framework, database o moduli node:* (ADR 0019).',
  };
  const noZod = { group: ['zod', 'zod/*'], message: 'zod si usa solo in contracts/.' };

  if (flat) {
    return [{ files: ['src/**/*.ts'], rules: restrict([packages, DEEP_IMPORTS, pure, noZod]) }];
  }
  return [
    { files: ['src/*.ts'], rules: restrict([packages, DEEP_IMPORTS, pure]) },
    {
      files: ['src/domain/**/*.ts'],
      rules: restrict([
        packages,
        DEEP_IMPORTS,
        pure,
        noZod,
        sibling(['application', 'contracts', 'infrastructure']),
      ]),
    },
    {
      files: ['src/application/**/*.ts'],
      rules: restrict([
        packages,
        DEEP_IMPORTS,
        pure,
        noZod,
        sibling(['contracts', 'infrastructure']),
      ]),
    },
    {
      files: ['src/contracts/**/*.ts'],
      rules: restrict([packages, DEEP_IMPORTS, pure, sibling(['application', 'infrastructure'])]),
    },
    {
      files: ['src/infrastructure/**/*.ts'],
      rules: restrict([
        otherPackages([...allowed, 'db']),
        DEEP_IMPORTS,
        {
          group: ['react', 'react-*', 'next', 'next/*'],
          message: "L'infrastruttura non dipende dalle app.",
        },
      ]),
    },
  ];
}
