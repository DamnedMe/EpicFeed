import 'server-only';
import { getServices } from '@/server/container';
import { generationAccessDeps } from '@/server/generation-deps';
import type { ExamGenerationDeps } from './generation-handler';

/**
 * Collega gli handler della generazione per l'esame ai servizi reali.
 *
 * @returns Le dipendenze degli handler.
 */
export function examGenerationDeps(): ExamGenerationDeps {
  const services = getServices();
  return {
    ...generationAccessDeps(),
    listExamLessons: (userId, limit) => services.listLessonsForExam.execute(userId, limit),
    readLessonForExam: (userId, lessonId) => services.readLessonForExam.execute(userId, lessonId),
    saveExamPack: (userId, input) => services.saveExamPack.execute(userId, input),
    listExamSubjects: (userId) => services.listSubjectsForExam.execute(userId),
    saveExamBank: (userId, input) => services.saveExamBank.execute(userId, input),
    listSubmissionsToCorrect: (userId) => services.listSubmissions.execute(userId, 'pending'),
    saveCorrection: (userId, id, correction) =>
      services.saveCorrection.execute(userId, id, correction),
  };
}
