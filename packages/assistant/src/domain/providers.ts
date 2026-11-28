/**
 * Fornitori dell'assistente nell'app (M6, ADR 0021, scelta 0): lo studente
 * usa una propria chiave API di Google Gemini, Anthropic Claude od OpenAI.
 * Qui stanno i dati che l'interfaccia mostra e la scelta del modello tra
 * quelli che la chiave può usare. I nomi dei modelli cambiano spesso: non si
 * scrivono nel codice, si sceglie tra quelli elencati dal fornitore.
 */

/** Fornitore della chiave. */
export type ProviderId = 'gemini' | 'anthropic' | 'openai';

/** Elenco dei fornitori, nell'ordine in cui l'app li propone. */
export const PROVIDER_IDS: readonly ProviderId[] = ['gemini', 'anthropic', 'openai'];

/** Come si presenta un fornitore nell'app. */
export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  /** Pagina del fornitore dove si crea la chiave. */
  readonly keyUrl: string;
  /** Testo del collegamento *Crea una chiave*. */
  readonly keyLinkLabel: string;
  /** Passi per creare la chiave, brevi. */
  readonly keySteps: readonly string[];
  /** Inizio tipico della chiave, per riconoscere un incolla sbagliato. */
  readonly keyPrefix: string;
  /** Costi e uso dei dati, detti chiaramente. */
  readonly costNote: string;
}

/** Dati dei fornitori. */
export const PROVIDERS: Readonly<Record<ProviderId, ProviderInfo>> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyLinkLabel: 'Crea una chiave gratuita su Google AI Studio',
    keySteps: [
      'Accedi con il tuo account Google.',
      'Tocca «Create API key» e accetta i termini.',
      'Copia la chiave (inizia con AIza) e incollala qui.',
    ],
    keyPrefix: 'AIza',
    costNote:
      'Gratis con limiti al minuto e al giorno, di solito sufficienti per studiare. Sul livello gratuito Google può usare le richieste per migliorare i suoi modelli: non scrivere dati personali nelle domande.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyLinkLabel: 'Crea una chiave nella console di Anthropic',
    keySteps: [
      'Accedi alla console di Anthropic e aggiungi un credito.',
      'Tocca «Create Key».',
      'Copia la chiave (inizia con sk-ant-) e incollala qui.',
    ],
    keyPrefix: 'sk-ant-',
    costNote:
      'A consumo: con il modello veloce una domanda costa una frazione di centesimo. Imposta un tetto di spesa nella console.',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyLinkLabel: 'Crea una chiave sulla piattaforma di OpenAI',
    keySteps: [
      'Accedi alla piattaforma di OpenAI e aggiungi un credito.',
      'Tocca «Create new secret key».',
      'Copia la chiave (inizia con sk-) e incollala qui.',
    ],
    keyPrefix: 'sk-',
    costNote:
      'A consumo: con un modello piccolo una domanda costa una frazione di centesimo. Imposta un tetto di spesa sulla piattaforma.',
  },
};

/**
 * Controllo leggero della chiave prima di provarla: niente spazi, lunghezza
 * plausibile. Il prefisso diverso non blocca (i fornitori lo cambiano), ma
 * l'app lo segnala.
 *
 * @param key - Chiave incollata.
 * @returns La chiave pulita, oppure `null` se non può essere una chiave.
 */
export function cleanApiKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed.length < 20 || trimmed.length > 300 || /\s/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Dice se la chiave ha l'inizio tipico del fornitore.
 *
 * @param provider - Fornitore scelto.
 * @param key - Chiave pulita.
 * @returns `false` se probabilmente è di un altro fornitore.
 */
export function looksLikeProviderKey(provider: ProviderId, key: string): boolean {
  if (provider === 'openai') return key.startsWith('sk-') && !key.startsWith('sk-ant-');
  return key.startsWith(PROVIDERS[provider].keyPrefix);
}

/** Parole che indicano modelli non adatti alla chat di testo. */
const NOT_CHAT =
  /(embed|tts|audio|image|imagen|vision-only|realtime|transcribe|search|moderation|whisper|dall-e|veo|live|robotics|computer-use|guard|aqa|codex|instruct|davinci|babbage)/;

/** Modelli adatti alla chat di testo, tra quelli che la chiave elenca. */
export function chatModels(provider: ProviderId, ids: readonly string[]): string[] {
  const prefix = provider === 'gemini' ? 'gemini-' : provider === 'anthropic' ? 'claude-' : 'gpt-';
  const unique = [...new Set(ids)];
  return unique
    .filter(
      (id) =>
        (id.startsWith(prefix) || (provider === 'openai' && /^o\d/.test(id))) && !NOT_CHAT.test(id),
    )
    .sort(compareModels);
}

/** Numeri di versione di un id (es. `gemini-3.8-flash` → [3, 8]). */
function versionOf(id: string): number[] {
  return (id.match(/\d+/g) ?? []).map(Number);
}

/** Ordine: versione più alta prima, poi alfabetico. */
function compareModels(a: string, b: string): number {
  const va = versionOf(a);
  const vb = versionOf(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i += 1) {
    const diff = (vb[i] ?? -1) - (va[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b);
}

/** Famiglie veloci ed economiche, in ordine di preferenza, per fornitore. */
const FAST_FAMILIES: Readonly<Record<ProviderId, readonly RegExp[]>> = {
  gemini: [/^gemini-flash-latest$/, /^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash-lite$/, /flash/],
  anthropic: [/haiku/, /sonnet/],
  openai: [/mini/, /nano/, /luna/, /^gpt-/],
};

/** Varianti da evitare se c'è una versione stabile. */
const UNSTABLE = /(preview|exp|experimental|latest-preview|\d{4}-\d{2}-\d{2}|-\d{8}$)/;

/**
 * Sceglie il modello predefinito: il più recente della famiglia veloce ed
 * economica (Gemini Flash, Claude Haiku, i modelli piccoli di OpenAI),
 * preferendo le versioni stabili alle anteprime.
 *
 * @param provider - Fornitore.
 * @param ids - Modelli che la chiave può usare.
 * @returns Il modello, oppure `null` se la chiave non ne elenca di adatti.
 */
export function pickDefaultModel(provider: ProviderId, ids: readonly string[]): string | null {
  const models = chatModels(provider, ids);
  for (const family of FAST_FAMILIES[provider]) {
    const matching = models.filter((id) => family.test(id));
    const stable = matching.find((id) => !UNSTABLE.test(id) || id === 'gemini-flash-latest');
    const choice = stable ?? matching[0];
    if (choice) return choice;
  }
  return models[0] ?? null;
}
