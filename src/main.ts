import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { escapeHtml as esc, keywordCoverage, validateInput, type Analysis } from './analysis';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const API = import.meta.env.VITE_API_URL || '/api/analyze';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let pdfText = '';
let currentTab: 'pdf' | 'text' = 'pdf';
let loadingTimer: ReturnType<typeof setInterval> | undefined;

function goToApp() { $('landing').style.display = 'none'; $('app').style.display = 'block'; scrollTo(0, 0); }
function goToLanding() { $('app').style.display = 'none'; $('landing').style.display = 'block'; scrollTo(0, 0); }
function toggleFaq(el: HTMLElement) { el.classList.toggle('open'); }

function switchTab(tab: 'pdf' | 'text') {
  currentTab = tab;
  $('cv-pdf-view').style.display = tab === 'pdf' ? 'block' : 'none';
  $('cv-text-view').style.display = tab === 'text' ? 'block' : 'none';
  $('tab-pdf').className = 'tab-btn' + (tab === 'pdf' ? ' active' : '');
  $('tab-text').className = 'tab-btn' + (tab === 'text' ? ' active' : '');
}

function dragOver(e: DragEvent) { e.preventDefault(); $('upload-area').classList.add('drag-over'); }
function dragLeave() { $('upload-area').classList.remove('drag-over'); }
function dropFile(e: DragEvent) {
  e.preventDefault();
  dragLeave();
  const file = e.dataTransfer?.files[0];
  if (file?.type === 'application/pdf') handlePDF(file);
}

async function handlePDF(file?: File) {
  if (!file) return;
  try {
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map(it => ('str' in it ? it.str : '')).join(' '));
    }
    pdfText = pages.join('\n').trim();
    if (pdfText.length < 50) throw new Error('scan');
    $('upload-success').classList.add('show');
    $('upload-filename').textContent = `${file.name} — učitan uspešno`;
    $('upload-area').style.display = 'none';
  } catch {
    showError('PDF nije moguće pročitati (možda je skeniran). Nalepi tekst CV-a u drugom tabu.');
  }
}

const cvText = () => (currentTab === 'pdf' ? pdfText : $<HTMLTextAreaElement>('cv-text').value.trim());

function showLoading() {
  const msgs = ['Analiziram CV…', 'Upoređujem sa oglasom…', 'Pišem predloge…', 'Skoro gotovo…'];
  $('form-view').style.display = 'none';
  $('loading-view').style.display = 'block';
  let i = 0;
  loadingTimer = setInterval(() => { $('loading-text').textContent = msgs[++i % msgs.length]; }, 1800);
}
function hideLoading() { clearInterval(loadingTimer); $('loading-view').style.display = 'none'; }
function showError(msg: string) {
  $('form-view').style.display = 'block';
  $('error-box').innerHTML = `<div class="error-msg">${esc(msg)}</div>`;
  $<HTMLButtonElement>('analyze-btn').disabled = false;
}

async function analyze() {
  const cv = cvText();
  const job = $<HTMLTextAreaElement>('job-text').value.trim();
  $('error-box').innerHTML = '';
  if (!cv) return showError('Dodaj CV — uploaduj PDF ili nalepi tekst.');
  const invalid = validateInput(cv, job);
  if (invalid) return showError(invalid);
  $<HTMLButtonElement>('analyze-btn').disabled = true;
  showLoading();
  const ats = keywordCoverage(cv, job);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cv, job }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška ${res.status}`);
    hideLoading();
    renderResult(data as Analysis, ats);
  } catch (e) {
    hideLoading();
    showError((e as Error).message);
  }
}

const bullets = (items: string[]) => items.length ? items.map(i => `<li>${esc(i)}</li>`).join('') : '<li style="color:#666">Nema podataka.</li>';
const para = (t: string) => t ? `<p>${esc(t).replace(/\n/g, '<br>')}</p>` : '<p style="color:#666">Nema podataka.</p>';
const copyBtn = (id: string) => `<button class="tab-btn" style="margin-top:8px" onclick="copyText('${id}')">Kopiraj</button>`;

function renderResult(a: Analysis, ats: ReturnType<typeof keywordCoverage>) {
  const chips = (list: string[], ok: boolean) => list.map(k => `<span style="display:inline-block;margin:3px;padding:3px 9px;border-radius:99px;font-size:12px;background:${ok ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'};color:${ok ? '#4ade80' : '#f87171'}">${esc(k)}</span>`).join('');
  $('result-view').innerHTML = `
    <div class="result-card">
      <div class="score-row">
        <div class="score-circle">${a.score}</div>
        <div class="score-info"><div class="score-label">Match score (AI) / 10</div><div class="score-verdict">${esc(a.verdict)}</div></div>
      </div>
      <div class="result-section"><div class="result-title">Prednosti</div><div class="result-body"><ul>${bullets(a.strengths)}</ul></div></div>
      <hr class="divider">
      <div class="result-section"><div class="result-title">Nedostaci</div><div class="result-body"><ul>${bullets(a.gaps)}</ul></div></div>
      <hr class="divider">
      <div class="result-section"><div class="result-title">Ključne reči koje AI predlaže</div><div class="result-body"><ul>${bullets(a.missingKeywords)}</ul></div></div>
    </div>
    <div class="result-card">
      <div class="result-section">
        <div class="result-title">ATS provera — ${ats.percent}% tehničkih pojmova iz oglasa je u CV-u</div>
        <div class="result-body">${ats.keywords.length ? chips(ats.found, true) + chips(ats.missing, false) : '<p style="color:#666">U oglasu nema prepoznatih tehničkih pojmova.</p>'}</div>
      </div>
    </div>
    <div class="result-card">
      <div class="result-section"><div class="result-title">Novi CV summary</div><div class="result-body" id="out-summary">${para(a.summary)}</div>${copyBtn('out-summary')}</div>
      <hr class="divider">
      <div class="result-section"><div class="result-title">LinkedIn About</div><div class="result-body" id="out-linkedin">${para(a.linkedinAbout)}</div>${copyBtn('out-linkedin')}</div>
      <hr class="divider">
      <div class="result-section"><div class="result-title">Top saveti</div><div class="result-body"><ol style="padding-left:18px">${bullets(a.tips)}</ol></div></div>
    </div>
    <button class="reset-btn" onclick="reset()">Nova analiza</button>`;
  $('result-view').style.display = 'block';
}

async function copyText(id: string) {
  await navigator.clipboard.writeText($(id).innerText);
}

function reset() {
  $('result-view').style.display = 'none';
  $('result-view').innerHTML = '';
  $('form-view').style.display = 'block';
  $<HTMLButtonElement>('analyze-btn').disabled = false;
  $('error-box').innerHTML = '';
  pdfText = '';
  $('upload-success').classList.remove('show');
  $('upload-area').style.display = 'block';
}

Object.assign(window, { goToApp, goToLanding, toggleFaq, switchTab, dragOver, dragLeave, dropFile, handlePDF, analyze, reset, copyText });
