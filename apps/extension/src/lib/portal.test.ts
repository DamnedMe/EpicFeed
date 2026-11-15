import { describe, expect, it } from 'vitest';
import { academicYear, parsePortalUrl } from './portal';

describe('parsePortalUrl', () => {
  it('riconosce la pagina di un contenuto del curriculum', () => {
    expect(parsePortalUrl('https://learn.epicode.edu.mt/course/177/curriculum/66427')).toEqual({
      courseId: '177',
      contentId: '66427',
    });
    expect(parsePortalUrl('https://learn.epicode.edu.mt/course/177/curriculum/66427/?x=1')).toEqual(
      {
        courseId: '177',
        contentId: '66427',
      },
    );
  });

  it.each([
    'https://learn.epicode.edu.mt/dashboard',
    'https://learn.epicode.edu.mt.evil.test/course/1/curriculum/2',
    'http://learn.epicode.edu.mt/course/1/curriculum/2',
    'non un url',
  ])('rifiuta %s', (href) => {
    expect(parsePortalUrl(href)).toBeNull();
  });
});

describe('academicYear', () => {
  it('calcola l’anno accademico da settembre ad agosto', () => {
    expect(academicYear('2025-02-27T15:09:03.000Z')).toBe('2024/25');
    expect(academicYear('2025-09-08T14:08:55.500Z')).toBe('2025/26');
    expect(academicYear('2099-12-01T00:00:00Z')).toBe('2099/00');
    expect(academicYear(null)).toBe('Senza data');
    expect(academicYear('boh')).toBe('Senza data');
  });
});
