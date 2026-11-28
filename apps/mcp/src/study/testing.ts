import type { SubjectFeed } from './library.js';

/**
 * Materia di prova per i test dell'assistente di studio: due lezioni di DSA,
 * una sugli alberi AVL (con il minuto del video) e una sugli heap con una
 * frase sbagliata da correggere. Solo per i test.
 */

export const SUBJECT_ID = '40000000-0000-4000-8000-000000000001';
export const AVL_LESSON = '10000000-0000-4000-8000-000000000001';
export const HEAP_LESSON = '10000000-0000-4000-8000-000000000002';
export const AVL_PART = '20000000-0000-4000-8000-000000000001';

const bi = <T>(it: T, en: T) => ({ it, en });
const hash = 'a'.repeat(64);
const portal = (id: number) => `https://learn.epicode.edu.mt/course/177/curriculum/${String(id)}`;

const meta = (lessonId: string) => ({
  lessonId,
  sourcesHash: hash,
  promptVersion: '2026-11-21.2',
  generatedAt: '2026-11-22T20:00:00.000Z',
});

/** Materia DSA con due lezioni generate e una ancora da generare. */
export function dsaFeed(): SubjectFeed {
  const avlMeta = meta(AVL_LESSON);
  const heapMeta = meta(HEAP_LESSON);
  return {
    subjectId: SUBJECT_ID,
    title: 'Data Structures & Algorithms',
    version: 'f'.repeat(64),
    chapters: [
      {
        chapterId: '50000000-0000-4000-8000-000000000001',
        title: '3. Trees',
        lessons: [
          {
            lessonId: AVL_LESSON,
            title: 'Binary trees & AVL trees',
            position: 1,
            portalUrl: portal(66863),
            parts: [
              {
                partId: AVL_PART,
                title: 'AVL rotations',
                kind: 'video',
                position: 0,
                portalUrl: portal(66864),
              },
            ],
            feed: {
              ...avlMeta,
              cards: [
                {
                  id: 'avl-rotation',
                  kind: 'concept',
                  title: bi('Rotazioni AVL', 'AVL rotations'),
                  keyPoint: bi(
                    'Dopo un inserimento l’albero si ribilancia con una rotazione.',
                    'After an insertion the tree rebalances with a rotation.',
                  ),
                  body: bi(
                    'Nel caso sinistra-destra servono due rotazioni.',
                    'The left-right case needs two rotations.',
                  ),
                  terms: ['AVL tree', 'rotation'],
                  conceptKeys: ['avl-rotation'],
                  sourcePartId: AVL_PART,
                  origin: 'summary',
                  video: {
                    startMs: 125_000,
                    endMs: 160_000,
                    confidence: 0.8,
                    language: 'it',
                    partId: AVL_PART,
                  },
                },
              ],
              quiz: [
                {
                  id: 'avl-case',
                  kind: 'multiple_choice',
                  question: bi(
                    'Quale rotazione serve per 10, 30, 20?',
                    'Which rotation for 10, 30, 20?',
                  ),
                  explanation: bi('È il caso destra-sinistra.', 'It is the right-left case.'),
                  options: bi(
                    ['Sinistra', 'Destra', 'Destra-sinistra'],
                    ['Left', 'Right', 'Right-left'],
                  ),
                  correctIndex: 0,
                  conceptKey: 'avl-rotation',
                  difficulty: 2,
                },
                {
                  id: 'avl-balanced',
                  kind: 'true_false',
                  question: bi('Un AVL è sempre bilanciato?', 'Is an AVL tree always balanced?'),
                  explanation: bi('Sì, per costruzione.', 'Yes, by construction.'),
                  answer: true,
                  conceptKey: 'avl-rotation',
                  difficulty: 1,
                },
              ],
              concepts: [
                {
                  key: 'avl-rotation',
                  name: bi('Rotazioni AVL', 'AVL rotations'),
                  description: bi('Come si ribilancia un AVL.', 'How an AVL rebalances.'),
                },
              ],
            },
          },
          {
            lessonId: HEAP_LESSON,
            title: 'Heaps',
            position: 2,
            portalUrl: portal(66870),
            parts: [],
            feed: {
              ...heapMeta,
              cards: [
                {
                  id: 'heap-sift',
                  kind: 'concept',
                  title: bi('Sift-down', 'Sift-down'),
                  keyPoint: bi('Il sift-down costa O(n).', 'Sift-down costs O(n).'),
                  body: bi('Scende lungo l’altezza dell’heap.', 'It walks down the heap height.'),
                  terms: ['heap', 'Big 0'],
                  conceptKeys: ['heap-sift'],
                  sourcePartId: AVL_PART,
                  origin: 'slides',
                  video: null,
                },
              ],
              quiz: [],
              concepts: [
                {
                  key: 'heap-sift',
                  name: bi('Sift-down', 'Sift-down'),
                  description: bi('Ripristina l’heap.', 'Restores the heap.'),
                },
              ],
            },
          },
          {
            lessonId: '10000000-0000-4000-8000-000000000003',
            title: 'Graphs',
            position: 3,
            portalUrl: portal(66880),
            parts: [],
            feed: null,
          },
        ],
      },
    ],
  } as SubjectFeed;
}
