// MatchDesk UI (ADR-036). Vanilla ES modules, hash routing, zero
// dependencies. All rendering goes through the DOM API (createElement /
// textContent), so nothing is ever concatenated into HTML — the CSP forbids
// it and the code cannot do it by construction.

import { startAmbient } from './lib/ambient.mjs';
import { highlightSegments } from './lib/highlight.mjs';
import { rankResults } from './lib/rank.mjs';

/* ── tiny DOM + fetch helpers ─────────────────────────────────────────── */

/**
 * @param {string} tag
 * @param {string} [className]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
function el(tag, className, children = []) {
  const node = document.createElement(tag);
  if (className !== undefined && className !== '') node.className = className;
  for (const child of children) node.append(child);
  return node;
}

/** @param {string} message */
function toast(message) {
  const box = document.getElementById('toast');
  if (box === null) return;
  box.textContent = message;
  box.hidden = false;
  box.classList.add('show');
  window.setTimeout(() => {
    box.classList.remove('show');
  }, 3200);
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function api(path, init) {
  const response = await fetch(path, init);
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    const message =
      typeof body.error === 'string' ? body.error : `request failed (${String(response.status)})`;
    throw new Error(message);
  }
  return body;
}

/**
 * Staggered entrance: each card fades up slightly after the one before it.
 * @param {HTMLElement} node @param {number} index
 */
function stagger(node, index) {
  node.classList.add('enter');
  node.style.setProperty('--stagger', `${String(Math.min(index * 60, 480))}ms`);
  return node;
}

/**
 * The animated score ring. SVG stroke offset + a count-up number.
 * @param {number} score @param {boolean} eligible @param {boolean} [large]
 */
function scoreRing(score, eligible, large = false) {
  const size = large ? 96 : 54;
  const stroke = large ? 7 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const wrap = el('div', `ring ${eligible ? 'good' : 'warn'}${large ? ' large' : ''}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  for (const kind of ['track', 'fill']) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', kind);
    circle.setAttribute('cx', String(size / 2));
    circle.setAttribute('cy', String(size / 2));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', String(stroke));
    if (kind === 'fill') {
      circle.setAttribute('stroke-dasharray', String(c));
      circle.setAttribute('stroke-dashoffset', String(c));
      circle.setAttribute('stroke', 'currentColor');
    }
    svg.append(circle);
  }
  // The NUMBER is authoritative and renders correct immediately — this app's
  // whole ethos is that a displayed score is never wrong, and a count-up
  // animation driven by rAF can freeze mid-count in a throttled tab, leaving
  // "8" on screen for a candidate who scored 78. Only the decorative arc
  // animates; if rAF stalls, the arc is merely undrawn, never false.
  const num = el('div', 'num', [String(score)]);
  wrap.append(svg, num);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fill = svg.querySelector('.fill');
      if (fill !== null) fill.setAttribute('stroke-dashoffset', String(c * (1 - score / 100)));
    });
  });
  return wrap;
}

/**
 * Typed button helper — `el()` returns HTMLElement, and `.disabled` lives on
 * the concrete type.
 * @param {string} className @param {string} text
 */
function btn(className, text) {
  const b = document.createElement('button');
  if (className !== '') b.className = className;
  b.textContent = text;
  return b;
}

/**
 * @param {'good' | 'warn' | 'bad' | 'neutral'} tone @param {string} text
 */
function pill(tone, text) {
  return el('span', `pill ${tone}`, [text]);
}

/**
 * A drag-and-drop + click upload zone.
 * @param {string} prompt
 * @param {(file: File) => Promise<void>} onFile
 */
function dropzone(prompt, onFile) {
  const zone = el('div', 'dropzone card', [el('span', 'arrow', ['⇪']), prompt]);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.docx';
  input.hidden = true;
  zone.append(input);
  zone.addEventListener('click', () => {
    input.click();
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file !== undefined)
      void onFile(file).catch((e) => {
        toast(String(e.message ?? e));
      });
    input.value = '';
  });
  for (const evt of ['dragenter', 'dragover']) {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('over');
    });
  }
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    const file = e.dataTransfer?.files[0];
    if (file !== undefined)
      void onFile(file).catch((err) => {
        toast(String(err.message ?? err));
      });
  });
  return zone;
}

/* ── state ────────────────────────────────────────────────────────────── */

// Score results are returned transiently and match rows are what persists
// (ADR-024); the UI keeps the last run per job in memory and re-scores on
// demand — measured cheap.
/** @type {Map<string, { scored: any[], skipped: any[] }>} */
const lastRun = new Map();

/* ── views ────────────────────────────────────────────────────────────── */

/** @param {HTMLElement} view */
async function jobsView(view) {
  const { jobs } = await api('/api/jobs');
  view.append(
    el('h1', '', ['Jobs']),
    el('p', 'subtitle', ['Pick a job to rank its candidates, or add a new one.']),
  );

  const zone = dropzone('Drop a job description here — PDF or DOCX', async (file) => {
    const title = window.prompt('Job title?', file.name.replace(/\.(pdf|docx)$/i, ''));
    if (title === null || title.trim() === '') return;
    const q = new URLSearchParams({ filename: file.name, title });
    const out = await api(`/api/jobs?${q.toString()}`, { method: 'POST', body: file });
    toast(out.outcome === 'scoreable' ? 'Job added' : 'Added — needs attention');
    render();
  });
  view.append(stagger(zone, 0));

  // ADR-037: most postings are links, not files. The fetch happens on this
  // explicit action only, to this URL only; the page's own <title> becomes
  // the job title unless one is given at the prompt.
  const linkInput = document.createElement('input');
  linkInput.type = 'url';
  linkInput.placeholder = '…or paste a job posting link — https://';
  linkInput.className = 'grow';
  const linkBtn = btn('ghost', 'Add from link');
  const addFromLink = () => {
    const url = linkInput.value.trim();
    if (url === '') {
      toast('Paste a link first');
      return;
    }
    const title = window.prompt('Job title? Leave blank to use the page’s own title.', '');
    if (title === null) return;
    linkBtn.disabled = true;
    linkBtn.textContent = 'Fetching…';
    api('/api/jobs/from-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(title.trim() === '' ? { url } : { url, title: title.trim() }),
    })
      .then((out) => {
        toast(out.outcome === 'scoreable' ? 'Job added from link' : 'Added — needs attention');
        render();
      })
      .catch((e) => {
        // H-120: a pre-ADR-037 server routes this POST into the job-by-id
        // handler and answers "unknown job" — the one error this endpoint
        // can only produce when the UI has outrun the server process.
        const message = String(e.message ?? e);
        toast(
          message === 'unknown job'
            ? 'The server is running an older build — stop and restart `pnpm serve`, then retry.'
            : message,
        );
      })
      .finally(() => {
        linkBtn.disabled = false;
        linkBtn.textContent = 'Add from link';
      });
  };
  linkBtn.addEventListener('click', addFromLink);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addFromLink();
  });
  view.append(stagger(el('div', 'card row-actions', [linkInput, linkBtn]), 1));

  const grid = el('div', 'grid');
  jobs.forEach((/** @type {any} */ job, /** @type {number} */ i) => {
    const card = el('div', 'card tappable', [
      el('div', 'row-actions', [
        el('div', '', [el('div', '', [el('strong', '', [job.title])])]),
        job.parseStatus !== 'ok' || job.language !== 'en'
          ? pill('warn', 'needs attention')
          : job.configured
            ? pill('good', 'ready')
            : pill('neutral', 'review requirements'),
      ]),
      // A link job's synthesized filename means nothing to the recruiter;
      // the URL it came from does (ADR-037 provenance).
      el('div', 'hint', [job.sourceUrl ?? job.originalFilename]),
    ]);
    card.addEventListener('click', () => {
      location.hash = `#/jobs/${String(job.id)}`;
    });
    grid.append(stagger(card, i + 1));
  });
  if (jobs.length === 0) view.append(el('div', 'empty', ['No jobs yet — drop one above.']));
  else view.append(el('h2', '', ['Your jobs']), grid);
}

/**
 * The job's delete control (H-117): same confirm guard as candidate delete,
 * then back to the list. Present on EVERY branch of the job page — the
 * needs-attention page is where deletion is most wanted, because an
 * unreadable document's only next steps are "replace the file" or "remove
 * it", and until this button existed the page offered neither.
 * @param {string} jobId @param {string} title
 */
function jobDeleteButton(jobId, title) {
  const remove = btn('danger', 'Delete job');
  remove.addEventListener('click', () => {
    if (!window.confirm(`Delete ${String(title)} and its file?`)) return;
    api(`/api/jobs/${jobId}`, { method: 'DELETE' })
      .then(() => {
        toast('Deleted');
        location.hash = '#/jobs';
      })
      .catch((e) => {
        toast(String(e.message ?? e));
      });
  });
  return remove;
}

/** @param {HTMLElement} view @param {string} jobId */
async function jobView(view, jobId) {
  const { job } = await api(`/api/jobs/${jobId}`);
  const back = el('a', 'crumb', ['← Jobs']);
  back.setAttribute('href', '#/jobs');
  view.append(back, el('h1', '', [job.title]));
  if (job.sourceUrl) {
    const source = el('a', 'hint', [String(job.sourceUrl)]);
    source.setAttribute('href', String(job.sourceUrl));
    source.setAttribute('target', '_blank');
    source.setAttribute('rel', 'noopener noreferrer');
    view.append(el('p', '', [source]));
  }

  if (job.parseStatus !== 'ok' || job.language !== 'en') {
    // Guidance, not a dead end (NEXT_PHASE/H-117): say what can be done
    // about an unreadable document, and offer the one-click way out.
    view.append(
      el('p', 'subtitle', [
        'This document could not be read, so it cannot be scored. Replace the file with a cleaner export, or delete it.',
      ]),
      el('div', 'reservation', [String(job.warnings.join(' ') || 'Unreadable document.')]),
      stagger(el('div', 'row-actions', [jobDeleteButton(jobId, job.title)]), 0),
    );
    return;
  }

  const configured = await api(`/api/jobs/${jobId}/config`).catch(() => null);
  if (configured === null) {
    await configEditor(view, jobId);
    view.append(stagger(el('div', 'row-actions', [jobDeleteButton(jobId, job.title)]), 4));
    return;
  }

  view.append(el('p', 'subtitle', ['Requirements confirmed. Score the pool, or adjust below.']));
  const actions = el('div', 'row-actions');
  const scoreBtn = btn('big', 'Score all candidates');
  const editBtn = btn('ghost', 'Edit requirements');
  const deleteBtn = jobDeleteButton(jobId, job.title);
  actions.append(scoreBtn, editBtn, deleteBtn);
  view.append(stagger(el('div', '', [actions]), 0));
  editBtn.addEventListener('click', () => {
    view.textContent = '';
    view.append(back.cloneNode(true), el('h1', '', [job.title]));
    void configEditor(view, jobId, /** @type {any} */ (configured).config);
  });

  const results = el('div');
  view.append(results);
  const cached = lastRun.get(jobId);
  if (cached !== undefined) void renderResults(results, jobId, cached);

  scoreBtn.addEventListener('click', () => {
    scoreBtn.disabled = true;
    scoreBtn.textContent = 'Scoring…';
    api(`/api/jobs/${jobId}/score`, { method: 'POST' })
      .then((run) => {
        lastRun.set(jobId, run);
        results.textContent = '';
        return renderResults(results, jobId, run);
      })
      .catch((e) => {
        toast(String(e.message ?? e));
      })
      .finally(() => {
        scoreBtn.disabled = false;
        scoreBtn.textContent = 'Score all candidates';
      });
  });
}

/**
 * The recruiter's confirmation step (PRODUCT_DECISIONS): proposals arrive as
 * preferred-only suggestions with evidence; only a person may mark must-have.
 * @param {HTMLElement} view @param {string} jobId @param {any} [existing]
 */
async function configEditor(view, jobId, existing) {
  const { proposal } = await api(`/api/jobs/${jobId}/proposal`);
  view.append(
    el('p', 'subtitle', [
      'Review what the job description supports. Tap a skill to include it; tap again for must-have.',
    ]),
  );

  /** @type {Map<string, 'off' | 'on' | 'must'>} */
  const skillState = new Map();
  const existingSkills = new Map(
    (existing?.skills?.requirements ?? []).map((/** @type {any} */ r) => [
      r.canonicalSkillId,
      r.mustHave,
    ]),
  );
  const chips = el('div', 'chips');
  proposal.skills.forEach((/** @type {any} */ skill) => {
    const prior = existingSkills.get(skill.canonicalSkillId);
    skillState.set(
      skill.canonicalSkillId,
      prior === true ? 'must' : prior === false ? 'on' : existing === undefined ? 'on' : 'off',
    );
    const chip = el('span', 'chip', [skill.label, el('span', 'must', ['must-have'])]);
    const paint = () => {
      const s = skillState.get(skill.canonicalSkillId);
      chip.classList.toggle('on', s !== 'off');
      chip.classList.toggle('musthave', s === 'must');
    };
    paint();
    chip.addEventListener('click', () => {
      const s = skillState.get(skill.canonicalSkillId);
      skillState.set(skill.canonicalSkillId, s === 'off' ? 'on' : s === 'on' ? 'must' : 'off');
      paint();
    });
    chip.title = 'Evidence: appears in the job description';
    chips.append(chip);
  });

  const years = document.createElement('input');
  years.type = 'number';
  years.min = '0';
  years.step = '0.5';
  years.value = String(
    existing?.experience?.requirement.minYears ?? proposal.minYears?.years ?? '',
  );
  const yearsMust = document.createElement('input');
  yearsMust.type = 'checkbox';
  yearsMust.checked = existing?.experience?.requirement.mustHave === true;

  const degree = document.createElement('select');
  for (const [value, label] of [
    ['', 'Not required'],
    ['high_school', 'High school'],
    ['associate', 'Associate'],
    ['bachelor', "Bachelor's"],
    ['master', "Master's"],
    ['doctorate', 'Doctorate'],
    ['professional', 'Professional'],
  ]) {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(label);
    degree.append(opt);
  }
  degree.value =
    existing?.educationCerts?.requirement.minDegreeLevel ?? proposal.minDegreeLevel?.level ?? '';
  const degreeMust = document.createElement('input');
  degreeMust.type = 'checkbox';
  degreeMust.checked = existing?.educationCerts?.requirement.mustHave === true;

  /** @type {Record<string, HTMLInputElement>} */
  const weights = {};
  const weightRows = el('div', 'stack');
  for (const [key, label] of [
    ['skills', 'Skills'],
    ['experience', 'Experience'],
    ['educationCerts', 'Education'],
  ]) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(
      Math.round((existing?.[String(key)]?.weight ?? proposal.defaultWeights[String(key)]) * 100),
    );
    weights[String(key)] = slider;
    const val = el('span', 'hint', [`${slider.value}%`]);
    slider.addEventListener('input', () => (val.textContent = `${slider.value}%`));
    weightRows.append(el('label', 'field', [`${String(label)} weight`, slider, val]));
  }

  const confirm = btn('big', existing === undefined ? 'Confirm requirements' : 'Save changes');
  confirm.addEventListener('click', () => {
    /** @type {any} */
    const config = {};
    const requirements = [...skillState.entries()]
      .filter(([, s]) => s !== 'off')
      .map(([id, s], i) => ({
        id: `r${String(i)}`,
        canonicalSkillId: id,
        label:
          proposal.skills.find((/** @type {any} */ p) => p.canonicalSkillId === id)?.label ?? id,
        mustHave: s === 'must',
      }));
    if (requirements.length > 0)
      config.skills = { weight: Number(weights['skills']?.value) / 100, requirements };
    if (years.value !== '' && Number(years.value) > 0)
      config.experience = {
        weight: Number(weights['experience']?.value) / 100,
        requirement: { minYears: Number(years.value), mustHave: yearsMust.checked },
      };
    if (degree.value !== '')
      config.educationCerts = {
        weight: Number(weights['educationCerts']?.value) / 100,
        requirement: { minDegreeLevel: degree.value, mustHave: degreeMust.checked },
      };
    if (Object.keys(config).length === 0) {
      toast('Pick at least one requirement');
      return;
    }
    api(`/api/jobs/${jobId}/config`, { method: 'PUT', body: JSON.stringify(config) })
      .then(() => {
        toast('Requirements confirmed');
        render();
      })
      .catch((e) => {
        toast(String(e.message ?? e));
      });
  });

  view.append(
    stagger(
      el('div', 'card', [
        el('h2', '', ['Skills ', el('small', '', ['found in the description'])]),
        chips,
      ]),
      0,
    ),
    stagger(
      el('div', 'card', [
        el('h2', '', ['Experience & education']),
        el('div', 'row-actions', [
          el('label', 'field', ['Minimum years', years]),
          el('label', 'field', ['Must-have', yearsMust]),
          el('label', 'field', ['Minimum degree', degree]),
          el('label', 'field', ['Must-have', degreeMust]),
        ]),
        el('p', 'hint', [
          proposal.minYears !== null
            ? `The description states ${String(proposal.minYears.years)}+ years.`
            : 'No explicit years requirement found in the description.',
        ]),
      ]),
      1,
    ),
    stagger(el('div', 'card', [el('h2', '', ['Relative importance']), weightRows]), 2),
    stagger(el('div', '', [confirm]), 3),
  );
}

/**
 * @param {HTMLElement} mount @param {string} jobId
 * @param {{ scored: any[], skipped: any[] }} run
 */
async function renderResults(mount, jobId, run) {
  // PRODUCT_DECISIONS: display the original filename, never a guessed name.
  const { candidates } = await api('/api/candidates');
  /** @type {Map<string, string>} */
  const names = new Map(candidates.map((/** @type {any} */ c) => [c.id, c.originalFilename]));
  const { eligible, ineligible } = rankResults(run.scored);

  /** @param {any[]} group @param {number} offset */
  const list = (group, offset) => {
    const stack = el('div', 'stack');
    group.forEach((entry, i) => {
      const row = el('div', 'card tappable result-row', [
        el('span', 'rank', [String(i + 1)]),
        el('div', 'who', [
          el('div', 'name', [names.get(entry.candidateId) ?? entry.candidateId]),
          el('div', 'meta', [
            entry.result.explanation.strengths
              .slice(0, 3)
              .map((/** @type {any} */ s) => s.label)
              .join(' · ') || '—',
          ]),
        ]),
        scoreRing(entry.result.score, entry.result.eligibility.eligible),
      ]);
      row.addEventListener('click', () => {
        location.hash = `#/jobs/${jobId}/c/${String(entry.candidateId)}`;
      });
      stack.append(stagger(row, offset + i));
    });
    return stack;
  };

  mount.append(el('h2', '', ['Eligible ', el('small', '', [`${String(eligible.length)}`])]));
  mount.append(
    eligible.length > 0 ? list(eligible, 0) : el('div', 'empty', ['No eligible candidates.']),
  );
  if (ineligible.length > 0) {
    mount.append(
      el('h2', '', ['Ineligible ', el('small', '', ['missed a must-have'])]),
      list(ineligible, eligible.length),
    );
  }
  if (run.skipped.length > 0) {
    mount.append(el('h2', '', ['Needs attention ', el('small', '', ['not scored — here is why'])]));
    const stack = el('div', 'stack');
    run.skipped.forEach((/** @type {any} */ skip, /** @type {number} */ i) => {
      stack.append(
        stagger(
          el('div', 'card', [
            el('div', 'row-actions', [
              el('strong', '', [names.get(skip.candidateId) ?? skip.candidateId]),
              pill(
                'warn',
                skip.reason === 'not_scoreable' ? 'unreadable document' : 'engine declined',
              ),
            ]),
            ...(skip.details.length > 0
              ? [el('div', 'reservation', [skip.details.join(' ')])]
              : []),
          ]),
          eligible.length + ineligible.length + i,
        ),
      );
    });
    mount.append(stack);
  }
}

/** @param {HTMLElement} view */
async function candidatesView(view) {
  const { candidates } = await api('/api/candidates');
  view.append(
    el('h1', '', ['Candidates']),
    el('p', 'subtitle', ['Everything stays on this machine. Deleting removes the file too.']),
  );
  view.append(
    stagger(
      dropzone('Drop CVs here — PDF or DOCX', async (file) => {
        const q = new URLSearchParams({ filename: file.name });
        const out = await api(`/api/candidates?${q.toString()}`, { method: 'POST', body: file });
        toast(
          out.alreadyExisted
            ? 'Already uploaded'
            : out.outcome === 'scoreable'
              ? 'Candidate added'
              : 'Added — needs attention',
        );
        render();
      }),
      0,
    ),
  );

  const grid = el('div', 'grid');
  candidates.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
    const remove = btn('danger', 'Delete');
    remove.addEventListener('click', (e) => {
      // The card navigates on click (ADR-038); deleting must not also open
      // the page being deleted.
      e.stopPropagation();
      if (!window.confirm(`Delete ${String(c.originalFilename)} and its file?`)) return;
      api(`/api/candidates/${String(c.id)}`, { method: 'DELETE' })
        .then(() => {
          toast('Deleted');
          render();
        })
        .catch((e2) => {
          toast(String(e2.message ?? e2));
        });
    });
    const card = el('div', 'card tappable', [
      el('div', 'row-actions', [
        el('strong', '', [c.originalFilename]),
        c.parseStatus === 'ok' && c.language === 'en'
          ? pill('good', 'readable')
          : pill('warn', 'needs attention'),
      ]),
      ...(c.warnings.length > 0 ? [el('p', 'hint', [c.warnings.join(' ')])] : []),
      el('div', 'row-actions', [remove]),
    ]);
    card.addEventListener('click', () => {
      location.hash = `#/candidates/${String(c.id)}`;
    });
    grid.append(stagger(card, i + 1));
  });
  if (candidates.length === 0) view.append(el('div', 'empty', ['No candidates yet.']));
  else view.append(grid);
}

/**
 * The CV inspect view (ADR-038): what the engine extracted — THE SAME
 * attribute list scoring reads — with every claim highlighted in the
 * document, plus "evaluate against jobs", the reverse of the job page's
 * score button.
 * @param {HTMLElement} view @param {string} candidateId
 */
async function candidateInspectView(view, candidateId) {
  const { candidate } = await api(`/api/candidates/${candidateId}`);
  const back = el('a', 'crumb', ['← Candidates']);
  back.setAttribute('href', '#/candidates');
  view.append(back, el('h1', '', [candidate.originalFilename]));

  const remove = btn('danger', 'Delete candidate');
  remove.addEventListener('click', () => {
    if (!window.confirm(`Delete ${String(candidate.originalFilename)} and its file?`)) return;
    api(`/api/candidates/${candidateId}`, { method: 'DELETE' })
      .then(() => {
        toast('Deleted');
        location.hash = '#/candidates';
      })
      .catch((e) => {
        toast(String(e.message ?? e));
      });
  });

  if (candidate.parseStatus !== 'ok' || candidate.language !== 'en') {
    view.append(
      el('p', 'subtitle', [
        'This document could not be read, so it cannot be evaluated. Replace the file with a cleaner export, or delete it.',
      ]),
      el('div', 'reservation', [String(candidate.warnings.join(' ') || 'Unreadable document.')]),
      stagger(el('div', 'row-actions', [remove]), 0),
    );
    return;
  }

  const { attributes, totalYearsExperience } = await api(
    `/api/candidates/${candidateId}/attributes`,
  );
  view.append(
    el('p', 'subtitle', [
      'Everything below is exactly what evaluation reads — nothing more, nothing less.',
    ]),
  );

  /** @param {string} kind */
  const ofKind = (kind) => attributes.filter((/** @type {any} */ a) => a.kind === kind);
  const skills = ofKind('skill');
  const experience = ofKind('years_experience');
  const education = ofKind('education');
  const certifications = ofKind('certification');
  const unreadableRanges = ofKind('unreadable_date_range');
  const unreadableSections = ofKind('unreadable_section');

  const left = el('div', 'stack');

  const skillChips = el('div', 'chips');
  const seenSkills = new Set();
  for (const skill of skills) {
    if (seenSkills.has(skill.canonicalId)) continue;
    seenSkills.add(skill.canonicalId);
    const chip = el('span', 'chip on', [skill.value]);
    chip.title = `Evidence: "${String(skill.value)}" in the document`;
    skillChips.append(chip);
  }
  left.append(
    el('div', 'card', [
      el('h2', '', ['Skills ', el('small', '', [`${String(seenSkills.size)} recognised`])]),
      seenSkills.size > 0 ? skillChips : el('div', 'empty', ['No skills recognised.']),
    ]),
  );

  left.append(
    el('div', 'card', [
      el('h2', '', [
        'Experience ',
        el('small', '', [`${String(totalYearsExperience)} years counted`]),
      ]),
      experience.length > 0 || unreadableRanges.length > 0
        ? el('ul', 'plain', [
            ...experience.map((/** @type {any} */ x) =>
              el('li', '', [
                pill('good', x.isExplicitStatement ? 'stated' : 'dated role'),
                `${String(x.value)} — ${String(x.years)} years`,
              ]),
            ),
            ...unreadableRanges.map((/** @type {any} */ x) =>
              el('li', '', [
                pill('warn', 'ambiguous dates'),
                `${String(x.value)} — at least ${String(x.minPossibleYears)} years, not counted (the notation is ambiguous between day-first and month-first)`,
              ]),
            ),
          ])
        : el('div', 'empty', [
            'No dated employment ranges or explicit "N years" statements found. Tenure written in words ("five years") is not parsed — only digits.',
          ]),
    ]),
  );

  left.append(
    el('div', 'card', [
      el('h2', '', ['Education & certifications']),
      education.length + certifications.length > 0
        ? el('ul', 'plain', [
            ...education.map((/** @type {any} */ x) =>
              el('li', '', [
                pill('good', String(x.degreeLevel)),
                `${String(x.value)}${x.field ? ` — ${String(x.field)}` : ''}`,
              ]),
            ),
            ...certifications.map((/** @type {any} */ x) =>
              el('li', '', [pill('good', 'certification'), String(x.value)]),
            ),
          ])
        : el('div', 'empty', ['No degrees or certifications recognised.']),
    ]),
  );

  if (unreadableSections.length > 0) {
    left.append(
      el('div', 'card', [
        el('h2', '', ['Sections the engine could not read']),
        el(
          'div',
          'stack',
          unreadableSections.map((/** @type {any} */ x) =>
            el('div', 'reservation', [
              `The ${String(x.section)} section contains text the engine could not read ("${String(x.value)}"). Nothing is asserted about this dimension from silence.`,
            ]),
          ),
        ),
      ]),
    );
  }

  // ── evaluate against jobs (the reverse of the job page's score button) ──
  const { jobs } = await api('/api/jobs');
  const evalCard = el('div', 'card');
  evalCard.append(el('h2', '', ['Evaluate against jobs']));
  /** @type {Map<string, HTMLInputElement>} */
  const checks = new Map();
  const jobList = el('div', 'stack');
  for (const job of jobs) {
    const scoreable = job.parseStatus === 'ok' && job.language === 'en' && job.configured;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = scoreable;
    box.disabled = !scoreable;
    if (scoreable) checks.set(job.id, box);
    const why = scoreable
      ? ''
      : job.parseStatus !== 'ok' || job.language !== 'en'
        ? ' — unreadable, cannot be scored'
        : ' — review requirements first';
    jobList.append(el('label', 'field', [box, `${String(job.title)}${why}`]));
  }
  const runBtn = btn('big', 'Score selected jobs');
  const results = el('div');
  runBtn.addEventListener('click', () => {
    const jobIds = [...checks.entries()].filter(([, box]) => box.checked).map(([id]) => id);
    if (jobIds.length === 0) {
      toast('Tick at least one job');
      return;
    }
    runBtn.disabled = true;
    runBtn.textContent = 'Scoring…';
    api(`/api/candidates/${candidateId}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    })
      .then((run) => {
        results.textContent = '';
        const titles = new Map(jobs.map((/** @type {any} */ j) => [j.id, j.title]));
        const ranked = [...run.scored].sort(
          (/** @type {any} */ a, /** @type {any} */ b) => b.result.score - a.result.score,
        );
        results.append(el('h2', '', ['Results ', el('small', '', ['best match first'])]));
        const stack = el('div', 'stack');
        ranked.forEach((/** @type {any} */ entry, /** @type {number} */ i) => {
          const row = el('div', 'card tappable result-row', [
            el('span', 'rank', [String(i + 1)]),
            el('div', 'who', [
              el('div', 'name', [titles.get(entry.jobId) ?? entry.jobId]),
              el('div', 'meta', [
                entry.result.eligibility.eligible
                  ? 'Eligible'
                  : 'Ineligible — a must-have is unmet',
              ]),
            ]),
            scoreRing(entry.result.score, entry.result.eligibility.eligible),
          ]);
          row.addEventListener('click', () => {
            location.hash = `#/jobs/${String(entry.jobId)}`;
          });
          stack.append(stagger(row, i));
        });
        results.append(stack);
        for (const skip of run.skipped) {
          results.append(
            el('div', 'reservation', [
              `${String(titles.get(skip.jobId) ?? skip.jobId)}: ${String(skip.details.join(' ') || 'not scored')}`,
            ]),
          );
        }
      })
      .catch((e) => {
        toast(String(e.message ?? e));
      })
      .finally(() => {
        runBtn.disabled = false;
        runBtn.textContent = 'Score selected jobs';
      });
  });
  evalCard.append(
    jobList,
    el('p', 'hint', [
      'Only jobs with confirmed requirements can be scored — the others say why they are unavailable.',
    ]),
    el('div', 'row-actions', [runBtn]),
  );
  left.append(evalCard, el('div', 'row-actions', [remove]));

  // The document, with every extracted claim highlighted (Section 6.2).
  const spans = attributes
    .map((/** @type {any} */ a) => a.sourceSpan)
    .filter((/** @type {any} */ x) => x !== null && x !== undefined);
  const doc = el('div', 'card docpane');
  for (const segment of highlightSegments(candidate.rawText, spans)) {
    doc.append(
      segment.marked ? el('mark', '', [segment.text]) : document.createTextNode(segment.text),
    );
  }

  view.append(
    el('div', 'split', [
      stagger(left, 0),
      stagger(
        el('div', '', [
          el('h2', '', ['Document ', el('small', '', ['every extracted claim highlighted'])]),
          doc,
        ]),
        1,
      ),
    ]),
  );
  view.append(results);
}

/** @param {HTMLElement} view @param {string} jobId @param {string} candidateId */
async function detailView(view, jobId, candidateId) {
  const back = el('a', 'crumb', ['← Results']);
  back.setAttribute('href', `#/jobs/${jobId}`);
  view.append(back);

  const run = lastRun.get(jobId);
  const entry = run?.scored.find((s) => s.candidateId === candidateId);
  if (entry === undefined) {
    view.append(el('div', 'empty', ['Run scoring first, then open a candidate from the list.']));
    return;
  }
  const { candidate } = await api(`/api/candidates/${candidateId}`);
  const result = entry.result;

  view.append(
    el('h1', '', [candidate.originalFilename]),
    el('p', 'subtitle', [
      result.eligibility.eligible ? 'Eligible' : 'Ineligible — a must-have is unmet',
    ]),
  );

  const left = el('div', 'stack');
  left.append(
    el('div', 'card', [
      el('div', 'row-actions', [
        scoreRing(result.score, result.eligibility.eligible, true),
        el('div', 'grow', [
          el('h2', '', ['Score composition']),
          ...result.explanation.composition.dimensions.map((/** @type {any} */ d) => {
            // Same rule as the ring: the bar states a proportion, so it is
            // set to its true width at build time rather than animated from
            // zero by a scheduler that may never run.
            const bar = el('div', 'bar', [el('i', '')]);
            const fill = bar.querySelector('i');
            if (fill instanceof HTMLElement)
              fill.style.width = `${String(Math.round(d.subscore * 100))}%`;
            return el('div', 'dim-row', [
              el('span', '', [d.dimension.replace('_', ' ')]),
              bar,
              el('span', 'val', [`${String(Math.round(d.weight * 100))}%`]),
            ]);
          }),
        ]),
      ]),
    ]),
  );

  if (result.eligibility.unmet.length > 0) {
    left.append(
      el('div', 'card', [
        el('h2', '', ['Unmet must-haves']),
        el(
          'ul',
          'plain',
          result.eligibility.unmet.map((/** @type {any} */ u) =>
            el('li', '', [pill('bad', 'unmet'), u.reason]),
          ),
        ),
      ]),
    );
  }
  if (result.explanation.strengths.length > 0) {
    left.append(
      el('div', 'card', [
        el('h2', '', ['Strengths']),
        el(
          'ul',
          'plain',
          result.explanation.strengths.map((/** @type {any} */ s) =>
            el('li', '', [pill('good', s.matchType === 'exact' ? 'exact' : 'match'), s.label]),
          ),
        ),
      ]),
    );
  }
  const gaps = [...result.explanation.gaps.mustHave, ...result.explanation.gaps.preferred];
  if (gaps.length > 0) {
    left.append(
      el('div', 'card', [
        el('h2', '', ['Gaps']),
        el(
          'ul',
          'plain',
          gaps.map((/** @type {any} */ g) => el('li', '', [pill('neutral', 'gap'), g.label])),
        ),
      ]),
    );
  }
  if (result.reservations.length > 0) {
    left.append(
      el('div', 'card', [
        el('h2', '', ['Engine reservations']),
        el(
          'div',
          'stack',
          result.reservations.map((/** @type {any} */ r) => el('div', 'reservation', [r.detail])),
        ),
      ]),
    );
  }

  // The document, with every evidence span highlighted (Section 6.2: every
  // number traceable to highlighted source evidence).
  const spans = result.explanation.strengths
    .map((/** @type {any} */ s) => s.evidence)
    .filter((/** @type {any} */ e) => e !== null);
  const doc = el('div', 'card docpane');
  for (const segment of highlightSegments(candidate.rawText, spans)) {
    doc.append(
      segment.marked ? el('mark', '', [segment.text]) : document.createTextNode(segment.text),
    );
  }

  view.append(
    el('div', 'split', [
      stagger(left, 0),
      stagger(
        el('div', '', [
          el('h2', '', ['Document ', el('small', '', ['evidence highlighted'])]),
          doc,
        ]),
        1,
      ),
    ]),
  );
}

/* ── router ───────────────────────────────────────────────────────────── */

function render() {
  const view = document.getElementById('view');
  if (view === null) return;
  view.textContent = '';
  const hash = location.hash || '#/jobs';
  const parts = hash.slice(2).split('/');

  for (const link of document.querySelectorAll('[data-nav]')) {
    link.classList.toggle('active', link.getAttribute('data-nav') === parts[0]);
  }

  /** @type {Promise<void>} */
  let painted;
  if (parts[0] === 'candidates' && parts[1] !== undefined)
    painted = candidateInspectView(view, parts[1]);
  else if (parts[0] === 'candidates') painted = candidatesView(view);
  else if (
    parts[0] === 'jobs' &&
    parts[1] !== undefined &&
    parts[2] === 'c' &&
    parts[3] !== undefined
  )
    painted = detailView(view, parts[1], parts[3]);
  else if (parts[0] === 'jobs' && parts[1] !== undefined) painted = jobView(view, parts[1]);
  else painted = jobsView(view);
  painted.catch((e) => {
    view.append(el('div', 'empty', ['Something went wrong.']));
    toast(String(e.message ?? e));
  });
}

window.addEventListener('hashchange', render);
startAmbient();
render();
