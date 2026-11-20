/**
 * CVBoost — domenska logika: prompt, validacija AI odgovora i brza ATS provera ključnih reči (bez AI-ja).
 * Sve funkcije su čiste i pokrivene testovima.
 */

export interface Analysis {
  score: number;               // 0–10
  verdict: string;
  strengths: string[];
  gaps: string[];
  missingKeywords: string[];
  summary: string;
  linkedinAbout: string;
  tips: string[];
}

export const LIMITS = { cv: 15_000, job: 10_000, minCv: 200, minJob: 80 } as const;

export function validateInput(cv: string, job: string): string | null {
  if (cv.trim().length < LIMITS.minCv) return 'CV je prekratak — dodaj ceo tekst CV-a.';
  if (job.trim().length < LIMITS.minJob) return 'Opis posla je prekratak — nalepi ceo oglas.';
  if (cv.length > LIMITS.cv) return 'CV je predugačak (max 15.000 znakova).';
  if (job.length > LIMITS.job) return 'Oglas je predugačak (max 10.000 znakova).';
  return null;
}

export function buildPrompt(cv: string, job: string): string {
  return `Ti si iskusan HR i karijerni savetnik. Analiziraj CV kandidata u odnosu na oglas za posao.
Budi konkretan i iskren. Ne izmišljaj iskustvo koje kandidat nema.

<cv>
${cv.trim()}
</cv>

<oglas>
${job.trim()}
</oglas>

Vrati ISKLJUČIVO JSON ovog oblika, na srpskom (latinica):
{
  "score": broj 0-10 (koliko CV odgovara oglasu),
  "verdict": "jedna rečenica procene",
  "strengths": ["3-5 konkretnih prednosti u odnosu na oglas"],
  "gaps": ["3-5 konkretnih nedostataka"],
  "missingKeywords": ["5-8 ključnih reči iz oglasa koje fale u CV-u"],
  "summary": "novi profesionalni sažetak za CV, 3-4 rečenice, prilagođen oglasu, samo na osnovu stvarnog iskustva",
  "linkedinAbout": "LinkedIn About, 4-5 rečenica",
  "tips": ["3 konkretna saveta za ovaj oglas"]
}`;
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, maxItems = 8) => (Array.isArray(v) ? v.map(x => str(x, 400)).filter(Boolean).slice(0, maxItems) : []);

/** Izvuci i proveri JSON iz odgovora modela. Baca grešku ako ključna polja fale. */
export function parseAnalysis(raw: string): Analysis {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI nije vratio ispravan odgovor');
  const data = JSON.parse(raw.slice(start, end + 1));
  const score = Math.round(Number(data.score));
  if (!Number.isFinite(score)) throw new Error('Nedostaje ocena');
  const a: Analysis = {
    score: Math.min(10, Math.max(0, score)),
    verdict: str(data.verdict, 300),
    strengths: list(data.strengths),
    gaps: list(data.gaps),
    missingKeywords: list(data.missingKeywords, 12),
    summary: str(data.summary),
    linkedinAbout: str(data.linkedinAbout),
    tips: list(data.tips, 5)
  };
  if (!a.verdict || !a.summary) throw new Error('AI odgovor je nepotpun');
  return a;
}

// ---------- brza ATS provera (lokalno, bez AI) ----------

const STOP = new Set(('i u na za sa se je da od do po ili kao što koji koja koje biti će smo ste su ovo to the and or of to in for with on at by an a is are be as we you our your will from this that who have has ' +
  'ter in na za z s se je da od do po ali kot ki bo so smo ste tudi pri iz').split(' '));

/** Tehnički i stručni termini iz oglasa: tokeni sa velikim slovom/brojem/tačkom ili poznati pojmovi, bez stop-reči. */
export function extractKeywords(job: string, limit = 25): string[] {
  const counts = new Map<string, { term: string; n: number }>();
  const tokens = job.match(/[A-Za-zÀ-žČĆŠŽĐčćšžđ][A-Za-z0-9À-žČĆŠŽĐčćšžđ+#.\-/]{1,}/g) || [];
  for (const raw of tokens) {
    const term = raw.replace(/[.\-/]+$/, '');
    const key = term.toLowerCase();
    if (key.length < 2 || STOP.has(key)) continue;
    const technical = /[A-Z].*[A-Z]|[0-9+#.]|^[A-Z][a-z]+[A-Z]/.test(term) || /^(react|node|python|java|sql|docker|git|api|aws|azure|figma|excel|linux|typescript|javascript)/i.test(term);
    if (!technical) continue;
    const c = counts.get(key) || { term, n: 0 };
    c.n++;
    counts.set(key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.term.localeCompare(b.term)).slice(0, limit).map(c => c.term);
}

export function keywordCoverage(cv: string, job: string) {
  const keywords = extractKeywords(job);
  const hay = ` ${cv.toLowerCase().replace(/[^a-z0-9À-žčćšžđ+#./]+/g, ' ').replace(/[./]+(?=\s|$)/g, '')} `;
  const found: string[] = [], missing: string[] = [];
  for (const k of keywords) (hay.includes(` ${k.toLowerCase()} `) ? found : missing).push(k);
  const percent = keywords.length ? Math.round((found.length / keywords.length) * 100) : 0;
  return { keywords, found, missing, percent };
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
