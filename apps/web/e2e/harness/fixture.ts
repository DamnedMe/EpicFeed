import type { SubjectFeedResponse } from '@study-feed/contracts';

/**
 * Materia di prova per i test sul telefono: una lezione per tipo di scheda,
 * con le due domande. Testi brevi ma con la stessa forma di quelli generati.
 */
const bi = <T>(it: T, en: T) => ({ it, en });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const portal = (n: number) => `https://learn.epicode.edu.mt/course/177/curriculum/${n}`;
const VIDEO = id(101);
const SLIDES = id(102);

const base = {
  terms: ['linked list', 'head', 'node'],
  conceptKeys: ['linked-list'],
  sourcePartId: SLIDES,
  origin: 'slides' as const,
  video: {
    partId: VIDEO,
    language: 'it' as const,
    startMs: 134_000,
    endMs: 140_000,
    confidence: 0.9,
  },
};

export const fixture: SubjectFeedResponse = {
  subjectId: id(1),
  title: 'Data Structures and Algorithms',
  version: 'a'.repeat(64),
  chapters: [
    {
      chapterId: id(10),
      title: '1. Linked lists',
      lessons: [
        {
          lessonId: id(20),
          title: 'Linked Lists',
          position: 0,
          portalUrl: portal(66755),
          parts: [
            {
              partId: VIDEO,
              title: 'Terminology',
              kind: 'video',
              position: 0,
              portalUrl: portal(66756),
            },
            {
              partId: SLIDES,
              title: 'Slide 1',
              kind: 'slides',
              position: 10001,
              portalUrl: portal(66755),
            },
          ],
          feed: {
            lessonId: id(20),
            sourcesHash: 'b'.repeat(64),
            promptVersion: '2026-11-21.2',
            generatedAt: '2026-11-22T10:00:00.000Z',
            alignmentVersion: 2,
            cards: [
              {
                ...base,
                id: 'what',
                kind: 'concept',
                title: bi("Che cos'è una linked list", 'What a linked list is'),
                keyPoint: bi(
                  'La head è il primo nodo della lista collegata.',
                  'The head is the first node of the linked list.',
                ),
                body: bi(
                  'Ogni nodo contiene il dato e un puntatore al successivo. Per raggiungere un nodo si parte sempre dalla head.',
                  'Each node holds the data and a pointer to the next one. To reach a node you always start from the head.',
                ),
              },
              {
                ...base,
                id: 'insert',
                kind: 'steps',
                title: bi('Inserire in testa', 'Insert at the head'),
                keyPoint: bi('Il nuovo nodo diventa la head.', 'The new node becomes the head.'),
                body: bi('Esempio: lista 2 → 6.', 'Example: list 2 → 6.'),
                steps: bi(
                  ['Crea il nodo.', 'Collegalo alla head.', 'Aggiorna la head.'],
                  ['Create the node.', 'Link it to the head.', 'Update the head.'],
                ),
                video: null,
              },
              {
                ...base,
                id: 'vs',
                kind: 'comparison',
                title: bi('Array o linked list?', 'Array or linked list?'),
                keyPoint: bi(
                  "L'accesso per indice costa O(1) solo nell'array.",
                  'Access by index costs O(1) only in an array.',
                ),
                body: bi(
                  'La scelta dipende dalle operazioni più frequenti.',
                  'The choice depends on the most frequent operations.',
                ),
                comparison: {
                  left: bi('Array', 'Array'),
                  right: bi('Linked list', 'Linked list'),
                  rows: [
                    {
                      aspect: bi('Accesso', 'Access'),
                      left: bi('O(1)', 'O(1)'),
                      right: bi('O(N)', 'O(N)'),
                    },
                    {
                      aspect: bi('Inserire in testa', 'Insert at head'),
                      left: bi('O(N)', 'O(N)'),
                      right: bi('O(1)', 'O(1)'),
                    },
                  ],
                },
              },
              {
                ...base,
                id: 'code',
                kind: 'code',
                title: bi('Un nodo in Python', 'A node in Python'),
                keyPoint: bi(
                  'Ogni nodo nasce con next = None.',
                  'Each node starts with next = None.',
                ),
                body: bi(
                  'La classe Node salva data e next. Con new_node si collega un secondo nodo alla head.',
                  'The Node class stores data and next. With new_node a second node is linked to the head.',
                ),
                code: {
                  language: 'python',
                  source:
                    'class Node:\n    def __init__(self, data):\n        self.data = data\n        self.next = None\n\nhead = Node(3)\nnew_node = Node(4)\nhead.next = new_node',
                },
              },
              {
                ...base,
                id: 'tail',
                kind: 'concept',
                title: bi('La tail', 'The tail'),
                keyPoint: bi(
                  "La tail è l'ultimo nodo, utile per inserire in fondo.",
                  'The tail is the last node, useful to insert at the end.',
                ),
                body: bi(
                  'Senza tail bisogna scorrere tutta la lista.',
                  'Without a tail you have to walk the whole list.',
                ),
                video: null,
              },
            ],
            quiz: [
              {
                id: 'q-mc',
                kind: 'multiple_choice',
                question: bi(
                  'Qual è il primo nodo di una linked list?',
                  'Which is the first node of a linked list?',
                ),
                options: bi(
                  ['La tail', 'La head', 'Il cursor'],
                  ['The tail', 'The head', 'The cursor'],
                ),
                correctIndex: 1,
                explanation: bi(
                  'La head è il punto di partenza.',
                  'The head is the starting point.',
                ),
                conceptKey: 'linked-list',
                difficulty: 1,
              },
              {
                id: 'q-tf',
                kind: 'true_false',
                question: bi(
                  'In una linked list i nodi sono contigui in memoria.',
                  'In a linked list nodes are contiguous in memory.',
                ),
                answer: false,
                explanation: bi(
                  'I nodi sono collegati da puntatori.',
                  'Nodes are linked by pointers.',
                ),
                conceptKey: 'linked-list',
                difficulty: 1,
              },
            ],
            concepts: [],
          },
        },
      ],
    },
    {
      chapterId: id(11),
      title: '2. Trees',
      lessons: [
        {
          lessonId: id(21),
          title: 'Binary trees',
          position: 0,
          portalUrl: portal(66863),
          parts: [],
          feed: null,
        },
      ],
    },
  ],
} as SubjectFeedResponse;
