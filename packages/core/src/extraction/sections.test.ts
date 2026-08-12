import { describe, expect, it } from 'vitest';

import { detectSections } from './sections.js';

describe('detectSections', () => {
  it('detects Skills, Experience and Education headers and covers the whole text with sections', () => {
    const text = [
      'Summary',
      'A backend engineer.',
      '',
      'Skills',
      'PostgreSQL, Python, Docker',
      '',
      'Experience',
      'Senior Engineer, Acme Corp, Jan 2019 - Present',
      '',
      'Education',
      "Bachelor's in Computer Science",
    ].join('\n');

    const sections = detectSections(text);
    const names = sections.map((s) => s.name);

    expect(names).toEqual(['summary', 'skills', 'experience', 'education']);

    // Every section's header text must actually be at its claimed span.
    for (const section of sections) {
      const headerText = text.slice(section.headerSpan.start, section.headerSpan.end);
      expect(headerText.trim().toLowerCase()).toContain(
        section.name === 'summary' ? 'summary' : section.name,
      );
    }

    // Sections must not overlap and must be given in text order.
    for (let i = 1; i < sections.length; i += 1) {
      const prevSection = sections[i - 1];
      const currSection = sections[i];
      expect(prevSection).toBeDefined();
      expect(currSection).toBeDefined();
      if (prevSection && currSection) {
        expect(currSection.start).toBeGreaterThanOrEqual(prevSection.end);
      }
    }

    // The final section runs to the end of the text.
    const last = sections[sections.length - 1];
    expect(last).toBeDefined();
    if (last) {
      expect(last.end).toBe(text.length);
    }
  });

  it('recognizes common header synonyms case-insensitively', () => {
    const text = ['WORK EXPERIENCE', 'Did stuff.', '', 'Certifications', 'PMP'].join('\n');
    const sections = detectSections(text);
    expect(sections.map((s) => s.name)).toEqual(['experience', 'certifications']);
  });

  it('returns a single unlabeled section for text with no recognizable headers', () => {
    const text = 'Just some plain prose with no headers at all.';
    const sections = detectSections(text);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.name).toBeNull();
    expect(sections[0]?.start).toBe(0);
    expect(sections[0]?.end).toBe(text.length);
  });

  it('returns an empty array for empty text', () => {
    expect(detectSections('')).toEqual([]);
  });

  it('forms an implicit leading section for prose that appears before the first recognized header', () => {
    const text = ['A short intro line with no header.', 'Skills', 'PostgreSQL'].join('\n');
    const sections = detectSections(text);
    expect(sections.map((s) => s.name)).toEqual([null, 'skills']);
    expect(sections[0]?.start).toBe(0);
    const skillsSection = sections[1];
    expect(skillsSection).toBeDefined();
    if (skillsSection) expect(sections[0]?.end).toBe(skillsSection.start);
  });

  it('does not treat an ordinary bullet line as a header', () => {
    const text = ['Skills', '- Experience with PostgreSQL'].join('\n');
    const sections = detectSections(text);
    expect(sections.map((s) => s.name)).toEqual(['skills']);
  });

  describe('realistic header synonyms (H-028 D1)', () => {
    it.each([
      'Experience',
      'Work Experience',
      'Professional Experience',
      'Employment History',
      'Work History',
      'Career History',
      'Employment',
      'Relevant Experience',
      'Experience:',
      'WORK EXPERIENCE',
      'Professional Background',
      'Career Summary',
    ])('recognizes "%s" as an experience header', (header) => {
      const text = [header, 'Senior Engineer, Acme Corp, Jan 2019 - Present'].join('\n');
      const sections = detectSections(text);
      expect(sections.map((s) => s.name)).toEqual(['experience']);
    });

    it.each([
      'Skills',
      'Technical Skills',
      'Key Skills',
      'Core Skills',
      'Skills & Tools',
      'Skills:',
      'TECHNICAL SKILLS',
    ])('recognizes "%s" as a skills header', (header) => {
      const text = [header, 'PostgreSQL, Python, Docker'].join('\n');
      const sections = detectSections(text);
      expect(sections.map((s) => s.name)).toEqual(['skills']);
    });

    it.each([
      'Education',
      'Education & Training',
      'Academic Background',
      'Education:',
      'EDUCATION',
    ])('recognizes "%s" as an education header', (header) => {
      const text = [header, "Bachelor's in Computer Science"].join('\n');
      const sections = detectSections(text);
      expect(sections.map((s) => s.name)).toEqual(['education']);
    });
  });
});
