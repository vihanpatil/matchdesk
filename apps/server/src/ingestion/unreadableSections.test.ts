import { describe, expect, it } from 'vitest';

import { extractAttributes } from '@matchdesk/core';

import { unreadableSectionAttributes } from './unreadableSections.js';

const REF = { year: 2026, month: 8 };
const attrsFor = (text: string) => {
  const base = extractAttributes(text, { referenceDate: REF });
  return unreadableSectionAttributes(text, base);
};

/** A realistic English CV with a swappable Education line. */
const cvWithDegree = (degree: string): string =>
  [
    'Marisol Okonkwo',
    '',
    'Experience',
    '',
    'Senior Data Engineer, Northwind Freight, Jan 2023 - Dec 2025',
    'Built streaming pipelines in Python for shipment tracking.',
    '',
    'Education',
    '',
    degree,
  ].join('\n');

describe('unreadableSectionAttributes (H-041)', () => {
  it.each([
    ['German, 4 words', 'Diplom Wirtschaftsinformatik, Universitaet Mannheim'],
    ['German, 3 words', 'Kenntnisse: Lagerverwaltung, Bedarfsplanung'],
    ['Dutch, 5 words', 'Werkervaring in softwareontwikkeling en gegevensbeheer'],
    ['Turkish, 5 words', 'Bilgisayar Muhendisligi Lisans Derecesi, Bogazici'],
  ])('records an unread Education section: %s', (_label, degree) => {
    // Each of these is BELOW the document-wide veto's floor of 6 bearing words,
    // which is why H-041 survived every attempt to close it there. The section
    // gate is what makes a floor of 2 safe here.
    const found = attrsFor(cvWithDegree(degree));
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('unreadable_section');
    expect(found[0]).toHaveProperty('section', 'education');
  });

  it('records nothing when the degree is readable', () => {
    expect(attrsFor(cvWithDegree('BSc Computer Science, University of Manchester'))).toEqual([]);
  });

  it('records nothing for a name, because a name is not in any section', () => {
    // THE REASON THE SECTION GATE EXISTS. A person's name is foreign text —
    // "Nguyen Thi Minh Anh" scores Vietnamese 0.834 with English 0.000, a
    // stronger foreign signal than any real foreign line measured (H-112).
    // Every floor low enough to catch a short foreign degree line also refuses
    // candidates by the origin of their name, which is H-028 D3's shape. Names
    // sit above the first section header, so they are never considered.
    for (const name of ['Nguyen Thi Minh Anh', 'Giovanni Esposito', 'Bjørn Sørensen']) {
      const cv = [name, '', 'Experience', '', 'Engineer, Acme, Jan 2020 - Present'].join('\n');
      expect(attrsFor(cv)).toEqual([]);
    }
  });

  it('records nothing for a technology list, because the dimension HAS evidence', () => {
    // The second gate. A list of technology names reads as foreign to any
    // classifier — measured, "Java, Spring Boot, PostgreSQL, Docker, AWS" reads
    // as Swedish — but it produces skill attributes, so the engine is not
    // asserting anything from silence and there is nothing to record.
    const cv = ['Ravi Subramanian', '', 'Skills', '', 'Java, Spring Boot, PostgreSQL, Docker'].join(
      '\n',
    );
    expect(attrsFor(cv)).toEqual([]);
  });

  it('carries a span pointing at the exact unread line', () => {
    const cv = cvWithDegree('Diplom Wirtschaftsinformatik, Universitaet Mannheim');
    const found = attrsFor(cv);
    const span = found[0]?.sourceSpan;
    expect(span).toBeDefined();
    if (span === undefined) return;
    expect(cv.slice(span.start, span.end)).toBe(
      'Diplom Wirtschaftsinformatik, Universitaet Mannheim',
    );
  });

  // Written the way people actually write them. The corpus elsewhere avoids
  // non-ASCII because `pdf-lib`'s StandardFonts are WinAnsi-encoded (H-067),
  // and that constraint made the first adversarial set for this fix
  // TRANSLITERATED — Hungarian and Greek with the diacritics stripped. Those
  // were missed, and it would have been easy to record "eld cannot do
  // Hungarian" as the residual. Measured against native orthography, it can.
  it.each([
    ['Hungarian', 'Tanulmányok: Mérnökinformatikus, Budapesti Műszaki Egyetem'],
    ['Greek', 'Εκπαίδευση: Πληροφορική, Πανεπιστήμιο Αθηνών'],
    ['Vietnamese', 'Học vấn: Kỹ thuật phần mềm, Đại học Bách khoa'],
    ['Russian', 'Образование: Информатика, МГУ'],
    ['Japanese', '学歴：情報工学、東京大学'],
    ['Arabic', 'التعليم: علوم الحاسوب، جامعة القاهرة'],
    ['German', 'Diplom Wirtschaftsinformatik, Universität Mannheim'],
  ])('records an unread Education section in native orthography: %s', (_label, degree) => {
    expect(attrsFor(cvWithDegree(degree))).toHaveLength(1);
  });

  it('DOCUMENTED GAP: bare-ASCII transliteration is still missed', () => {
    // Asserts the WRONG behaviour on purpose (H-085's lesson). Strip a
    // language of its own alphabet and `eld` has far less to go on. This is a
    // real residual and it is also not a CV format — it is what a test author
    // produces when working around a font constraint. Recorded so the next
    // reader knows which of the two it is.
    expect(attrsFor(cvWithDegree('Ekpaideusi: Pliroforiki, Panepistimio Athinon'))).toEqual([]);
  });
});
