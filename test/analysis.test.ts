import { describe, it, expect } from 'vitest';
import { parseAnalysis, validateInput, extractKeywords, keywordCoverage, escapeHtml, buildPrompt } from '../src/analysis';

const good = { score: 7, verdict: 'Dobar kandidat.', strengths: ['React'], gaps: ['Docker'], missingKeywords: ['Docker'], summary: 'Sažetak.', linkedinAbout: 'O meni.', tips: ['Savet'] };

describe('parseAnalysis', () => {
  it('čita JSON i kad je okružen tekstom ili ```', () => {
    expect(parseAnalysis('Evo:\n```json\n' + JSON.stringify(good) + '\n```').score).toBe(7);
  });
  it('ograničava ocenu na 0–10 i čisti liste', () => {
    const a = parseAnalysis(JSON.stringify({ ...good, score: 14, strengths: ['a', '', 3, '  b  '] }));
    expect(a.score).toBe(10);
    expect(a.strengths).toEqual(['a', 'b']);
  });
  it('odbija nepotpun odgovor', () => {
    expect(() => parseAnalysis('nema json-a')).toThrow();
    expect(() => parseAnalysis(JSON.stringify({ ...good, summary: '' }))).toThrow(/nepotpun/);
    expect(() => parseAnalysis(JSON.stringify({ ...good, score: 'x' }))).toThrow(/ocena/);
  });
});

describe('validacija i prompt', () => {
  it('traži dovoljno teksta', () => {
    expect(validateInput('kratko', 'x'.repeat(100))).toMatch(/CV/);
    expect(validateInput('x'.repeat(300), 'kratko')).toMatch(/Opis/);
    expect(validateInput('x'.repeat(300), 'y'.repeat(100))).toBeNull();
  });
  it('prompt sadrži CV i oglas u tagovima', () => {
    const p = buildPrompt('MOJ CV', 'OGLAS');
    expect(p).toContain('<cv>\nMOJ CV\n</cv>');
    expect(p).toContain('<oglas>\nOGLAS\n</oglas>');
  });
});

describe('ATS provera ključnih reči', () => {
  const job = 'Tražimo Junior Frontend developera. Uslovi: React, TypeScript, REST API, Git, Docker. Prednost: Next.js i CI/CD. Rad sa React komponentama.';
  it('izvlači tehničke pojmove, najčešći prvi', () => {
    const k = extractKeywords(job);
    expect(k[0]).toBe('React');
    expect(k).toEqual(expect.arrayContaining(['TypeScript', 'REST', 'API', 'Git', 'Docker', 'Next.js', 'CI/CD']));
    expect(k).not.toContain('Tražimo');
  });
  it('tačka na kraju rečenice ne kvari poređenje, a Next.js ostaje ceo', () => {
    const r = keywordCoverage('Radio sam sa REST API. Koristim Next.js.', 'Uslovi: REST API i Next.js');
    expect(r.missing).toEqual([]);
  });
  it('računa pokrivenost i šta fali', () => {
    const r = keywordCoverage('Iskustvo: React, TypeScript, Git, REST API. Projekti na GitHubu.', job);
    expect(r.missing).toEqual(expect.arrayContaining(['Docker', 'Next.js']));
    expect(r.found).toEqual(expect.arrayContaining(['React', 'Git']));
    expect(r.percent).toBeGreaterThan(40);
    expect(r.percent).toBeLessThan(100);
  });
});

it('escapeHtml sprečava ubacivanje HTML-a iz AI odgovora', () => {
  expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
});
