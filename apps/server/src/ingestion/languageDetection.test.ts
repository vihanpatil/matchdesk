import { describe, expect, it } from 'vitest';

import { detectLanguageHeuristic } from './languageDetection.js';

describe('detectLanguageHeuristic', () => {
  it('recognizes English CV-style prose as English', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience building backend systems in Python and Go. Jordan has led migrations to microservices, mentored junior engineers, and holds a Bachelor of Science in Computer Science from a public university.';
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(true);
    expect(result.wordCount).toBeGreaterThan(8);
  });

  it('does not classify French prose as English', () => {
    const text =
      "Jordan Rivera est ingenieur logiciel avec cinq ans d'experience dans la creation de systemes back-end en Python et Go. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe de dix personnes.";
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(false);
  });

  it('returns null (insufficient signal) rather than guessing on very short text', () => {
    const result = detectLanguageHeuristic('Jordan Rivera - Software Engineer');
    expect(result.isEnglish).toBeNull();
  });

  it('returns null for empty text rather than throwing', () => {
    const result = detectLanguageHeuristic('');
    expect(result.isEnglish).toBeNull();
    expect(result.wordCount).toBe(0);
  });

  it('reports a stopword ratio that clearly separates the English and French fixtures', () => {
    const english = detectLanguageHeuristic(
      'Jordan Rivera is a software engineer with five years of experience building backend systems in Python and Go. Jordan has led migrations to microservices, mentored junior engineers, and holds a Bachelor of Science in Computer Science from a public university.',
    );
    const french = detectLanguageHeuristic(
      "Jordan Rivera est ingenieur logiciel avec cinq ans d'experience dans la creation de systemes back-end en Python et Go. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe de dix personnes.",
    );
    expect(english.ratio).toBeGreaterThan(french.ratio * 3);
  });
});
