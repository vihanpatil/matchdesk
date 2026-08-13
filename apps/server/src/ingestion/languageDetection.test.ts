import { describe, expect, it } from 'vitest';

import { detectLanguageHeuristic, findNonEnglishSegments } from './languageDetection.js';

describe('detectLanguageHeuristic', () => {
  it('recognizes English CV-style prose as English', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience building backend systems in Python and Go. Jordan has led migrations to microservices, mentored junior engineers, and holds a Bachelor of Science in Computer Science from a public university.';
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(true);
    expect(result.wordCount).toBeGreaterThan(8);
  });

  it('does not classify French prose as English (accented)', () => {
    const text =
      'Alex Fontaine est développeuse chez Solmédia depuis quatre ans. Elle a construit des services back-end en Python et Go, et a participé à la migration vers une architecture de microservices.';
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(false);
  });

  it('does not classify French prose as English even with accents stripped (H-028 D6 regression)', () => {
    // This is the exact text of the `candidate-french.docx` fixture used by
    // extractText.test.ts. The previous stopword-ratio heuristic scored this
    // document as MORE English than a genuine English control (H-028 D6) —
    // "on"/"a"/"en" read as English stopwords. The n-gram profile approach
    // does not use a stopword list at all, so it is not exposed to that
    // specific failure mode.
    const text =
      "Jordan Rivera est ingenieur logiciel avec cinq ans d'experience dans la creation de systemes back-end en Python et Go. Jordan a dirige des migrations vers des microservices et encadre des ingenieurs juniors dans une equipe de dix personnes.";
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(false);
  });

  it('does not classify German prose as English', () => {
    const text =
      'Nadine Brandt arbeitet seit fünf Jahren als Softwareentwicklerin bei Kernwerk GmbH. Sie hat Backend-Dienste in Java und Kotlin entwickelt und den Übergang zu einer Microservice-Architektur begleitet.';
    const result = detectLanguageHeuristic(text);
    expect(result.isEnglish).toBe(false);
  });

  it('does not classify Scandinavian prose (Danish/Norwegian/Swedish) as English', () => {
    // These three share vocabulary with English function words far more
    // than French or German ("i", "for", "har", "og") — this is exactly the
    // class of input the old stopword-ratio heuristic could not separate
    // (H-028 D6: "DA Danish / NO Norwegian / SV Swedish all -> WILL BE
    // SCORED").
    const danish =
      'Mette Holm har arbejdet som softwareudvikler hos Nordbyg i fire år. Hun har bygget backend-tjenester i Python og Java.';
    const norwegian =
      'Kristoffer Aas har jobbet som programvareutvikler hos Fjellkode i fire år. Han har bygget backend-tjenester i Python og Java.';
    const swedish =
      'Elin Sjöberg har arbetat som mjukvaruutvecklare på Norrkod i fyra år. Hon har byggt backend-tjänster i Python och Java.';

    expect(detectLanguageHeuristic(danish).isEnglish).toBe(false);
    expect(detectLanguageHeuristic(norwegian).isEnglish).toBe(false);
    expect(detectLanguageHeuristic(swedish).isEnglish).toBe(false);
  });

  it('returns null (insufficient signal) rather than guessing on very short text', () => {
    const result = detectLanguageHeuristic('Jordan Rivera - Software Engineer');
    expect(result.isEnglish).toBeNull();
  });

  it('returns null for empty text rather than throwing', () => {
    const result = detectLanguageHeuristic('');
    expect(result.isEnglish).toBeNull();
    expect(result.wordCount).toBe(0);
    expect(result.distanceToEnglish).toBeNull();
    expect(result.distanceToNearestOther).toBeNull();
    expect(result.nearestOtherLanguage).toBeNull();
  });

  it('returns null for a handful of code-like tokens below the word floor (not a real sentence in any language)', () => {
    // Matches the codes-only.pdf fixture used by extractText.test.ts: seven
    // alphabetic tokens ("id", "ref", "code", "sku", "batch", "lot", "part"),
    // under the word floor.
    const result = detectLanguageHeuristic(
      'ID-00011122233 REF-33344455566 CODE-66677788899 SKU-99900011122 BATCH-22233344455 LOT-55566677788 PART-11122233344',
    );
    expect(result.isEnglish).toBeNull();
    expect(result.wordCount).toBe(7);
  });

  it('reports the distance to English as strictly lower than the distance to the nearest other language for a clear English document', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience building backend systems in Python and Go. Jordan has led migrations to microservices, mentored junior engineers, and holds a Bachelor of Science in Computer Science from a public university.';
    const { distanceToEnglish, distanceToNearestOther } = detectLanguageHeuristic(text);
    // Narrowed by throwing rather than by `!` or `as` — both are banned
    // (Section 0.2), and a thrown error fails the test with a clearer
    // message than a null-comparison would.
    if (distanceToEnglish === null || distanceToNearestOther === null) {
      throw new Error('Expected numeric distances for a document above the word floor.');
    }
    expect(distanceToEnglish).toBeLessThan(distanceToNearestOther);
  });

  it('is deterministic across repeated calls on the same input', () => {
    const text =
      'Jordan Rivera is a software engineer with five years of experience building backend systems in Python and Go, focused on distributed systems reliability.';
    const first = detectLanguageHeuristic(text);
    const second = detectLanguageHeuristic(text);
    expect(second).toEqual(first);
  });

  it('identifies which reference profile was nearest for a non-English document, as a diagnostic (not a language-ID guarantee)', () => {
    const german =
      'Nadine Brandt arbeitet seit fünf Jahren als Softwareentwicklerin bei Kernwerk GmbH. Sie hat Backend-Dienste in Java und Kotlin entwickelt und den Übergang zu einer Microservice-Architektur begleitet.';
    const result = detectLanguageHeuristic(german);
    expect(result.isEnglish).toBe(false);
    expect(result.nearestOtherLanguage).toBe('de');
  });
});

describe('findNonEnglishSegments (mixed-language veto, ADR-022)', () => {
  const ENGLISH_PARAGRAPH =
    'Bernadette Achebe is a registered nurse with eleven years of experience in acute cardiac care. She has worked night rotations on a thirty-bed ward, coordinating with consultants and allied health staff to manage post-operative recovery.';
  const FRENCH_PARAGRAPH =
    'Elle a travaillé pendant six ans dans un service de cardiologie où elle encadrait les infirmières nouvellement diplômées. Son expérience comprend la gestion des soins postopératoires et la coordination avec les médecins consultants du service.';

  it('finds nothing to veto in a wholly English document', () => {
    const result = findNonEnglishSegments(ENGLISH_PARAGRAPH);
    expect(result.hasNonEnglishSegment).toBe(false);
    expect(result.nonEnglishSegments).toEqual([]);
    expect(result.judgedSegmentCount).toBeGreaterThan(0);
  });

  it('flags the non-English passages of a code-switched document', () => {
    const result = findNonEnglishSegments(`${ENGLISH_PARAGRAPH}\n${FRENCH_PARAGRAPH}`);
    expect(result.hasNonEnglishSegment).toBe(true);
    expect(result.nonEnglishSegments.length).toBeGreaterThan(0);
    expect(result.nonEnglishSegments.every((s) => s.nearestLanguage === 'fr')).toBe(true);
  });

  it('reports source spans that actually locate the offending text in the original', () => {
    const document = `${ENGLISH_PARAGRAPH}\n${FRENCH_PARAGRAPH}`;
    const result = findNonEnglishSegments(document);

    // The span is what a recruiter would be shown as "this is the part we
    // could not read", so it has to index the real document, not a copy.
    for (const segment of result.nonEnglishSegments) {
      expect(document.slice(segment.sourceSpan.start, segment.sourceSpan.end)).toBe(segment.text);
      expect(segment.sourceSpan.start).toBeGreaterThanOrEqual(0);
      expect(segment.sourceSpan.end).toBeLessThanOrEqual(document.length);
    }
  });

  it('reports spans in document order', () => {
    const document = `${ENGLISH_PARAGRAPH}\n${FRENCH_PARAGRAPH}\nShe reports to the ward manager.\n${FRENCH_PARAGRAPH}`;
    const starts = findNonEnglishSegments(document).nonEnglishSegments.map(
      (s) => s.sourceSpan.start,
    );
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('does not vote on a skills line, which is technology names in no particular language', () => {
    // 8-12 language-neutral tokens. Judging these is a coin flip, and at an
    // 8-word floor this exact shape produced false refusals on real English
    // CVs — hence the higher segment floor.
    const result = findNonEnglishSegments(
      'Skills: Python, Docker, Kubernetes, AWS, React, Node.js, PostgreSQL, Git, CI/CD, Agile',
    );
    expect(result.judgedSegmentCount).toBe(0);
    expect(result.hasNonEnglishSegment).toBe(false);
  });

  it('KNOWN BLIND SPOT: says nothing at all about a terse bullet CV', () => {
    // No segment reaches the floor, so the veto abstains rather than
    // guessing. A terse BILINGUAL CV therefore still gets through — this
    // narrows the C7 gap, it does not close it (HONESTY_LOG H-041).
    const terse = `Kwabena Boateng - HGV Driver
Class 1 licence, clean record, twelve years
Long distance and multi-drop experience
Digital tachograph and drivers hours compliant`;
    const result = findNonEnglishSegments(terse);
    expect(result.judgedSegmentCount).toBe(0);
    expect(result.hasNonEnglishSegment).toBe(false);
  });

  it('returns an empty result for empty text rather than throwing', () => {
    const result = findNonEnglishSegments('');
    expect(result.hasNonEnglishSegment).toBe(false);
    expect(result.judgedSegmentCount).toBe(0);
  });

  it('is deterministic across repeated calls on the same input', () => {
    const document = `${ENGLISH_PARAGRAPH}\n${FRENCH_PARAGRAPH}`;
    expect(findNonEnglishSegments(document)).toEqual(findNonEnglishSegments(document));
  });
});
