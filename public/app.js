'use strict';
// CourseCraft front end: home (library), course overview, lesson player, code viewer.

const app = document.getElementById('app');
const crumbsEl = document.getElementById('crumbs');
const modalRoot = document.getElementById('modalRoot');

// ---------- Small helpers ----------

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const attrSel = (name, value) => `[${name}="${CSS.escape(value)}"]`;

const pref = {
  get(key, fallback) {
    try { const v = localStorage.getItem('cc.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem('cc.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
};

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtLong(sec) {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtSize(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b < 10 && i ? b.toFixed(1) : Math.round(b)} ${u[i]}`;
}
function hue(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function initials(name) {
  const w = name.replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?';
}
const lessonLabel = l => (l.num ? `${l.num}. ` : '') + l.title;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg class="chev" width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/></svg>',
  theater: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  cc: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6"/></svg>',
  auto: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M4 12h12m-4-5 5 5-5 5M20 6v12"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>'
};

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const post = (url, body, method = 'POST') => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setCrumbs(items) {
  crumbsEl.innerHTML = items.map((c, i) =>
    (i ? '<span class="sep">/</span>' : '') + (c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`)
  ).join('');
}

// ---------- Modals & menus ----------

function openModal(html, onMount, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  modalRoot.appendChild(wrap);
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  $$('[data-close]', wrap).forEach(b => b.addEventListener('click', close));
  onMount?.(wrap.firstElementChild, close);
  $('input, textarea, button.primary', wrap)?.focus();
  return close;
}

function confirmModal(title, text, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    let answer = false;
    openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><div class="muted">${text}</div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok ${danger ? 'style="background:var(--danger);border-color:var(--danger)"' : ''}>${esc(okLabel)}</button></div>`,
    (m, close) => { $('[data-ok]', m).addEventListener('click', () => { answer = true; close(); }); },
    () => resolve(answer));
  });
}

function folderModal({ title, okLabel, path = '', name, showName = false, showMultiple = false, onSubmit }) {
  openModal(`
    <form>
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body">
        <label class="field"><span>Folder</span>
          <div class="row">
            <input class="input mono" name="path" value="${esc(path)}" placeholder="D:\\Java-course" autocomplete="off" spellcheck="false">
            <button type="button" class="btn" data-browse>Browse…</button>
          </div>
        </label>
        ${showName ? `<label class="field"><span>Name <span class="faint">(optional, defaults to the folder name)</span></span>
          <input class="input" name="name" value="${esc(name || '')}" autocomplete="off"></label>` : ''}
        ${showMultiple ? `<label class="check"><input type="checkbox" name="multiple">
          <span>This folder holds several courses. Add each subfolder as its own course.</span></label>` : ''}
        <div class="form-error" hidden></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${esc(okLabel)}</button></div>
    </form>`,
  (m, close) => {
    const form = $('form', m);
    const err = $('.form-error', m);
    const input = form.elements.path;
    input.select();
    $('[data-browse]', m).addEventListener('click', async e => {
      e.target.disabled = true;
      try { const r = await post('/api/pick-folder'); if (r.path) input.value = r.path; } catch (x) { toast(x.message); }
      e.target.disabled = false;
      input.focus();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const btn = $('button.primary', m);
      btn.disabled = true;
      try {
        await onSubmit({ path: input.value.trim(), name: form.elements.name?.value.trim(), multiple: form.elements.multiple?.checked });
        close();
      } catch (x) {
        err.textContent = x.message;
        err.hidden = false;
      }
      btn.disabled = false;
    });
  });
}

function textModal({ title, label, value = '', okLabel = 'Save', onSubmit }) {
  openModal(`
    <form>
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><label class="field"><span>${esc(label)}</span><input class="input" name="v" value="${esc(value)}" autocomplete="off"></label>
        <div class="form-error" hidden></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${esc(okLabel)}</button></div>
    </form>`,
  (m, close) => {
    const form = $('form', m);
    form.elements.v.select();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try { await onSubmit(form.elements.v.value.trim()); close(); } catch (x) { const er = $('.form-error', m); er.textContent = x.message; er.hidden = false; }
    });
  });
}

let menuEl = null;
function closeMenu() { menuEl?.remove(); menuEl = null; }
function openMenu(anchor, items) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}</button>`).join('');
  document.body.appendChild(menuEl);
  const r = anchor.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  menuEl.style.top = `${r.bottom + 6}px`;
  menuEl.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menuEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.action();
  });
}
document.addEventListener('mousedown', e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
addEventListener('scroll', closeMenu, true);
addEventListener('resize', closeMenu);

// ---------- Theme & shortcuts ----------

$('#themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('cc.theme', root.dataset.theme); } catch { /* ignore */ }
});

function showShortcuts() {
  const rows = [
    ['Play / pause', 'Space', 'K'], ['Back 10s / forward 10s', 'J', 'L'], ['Back 5s / forward 5s', '←', '→'],
    ['Volume', '↑', '↓'], ['Slower / faster', '<', '>'], ['Jump to 0–90%', '0', '9'], ['Previous / next lesson', 'P', 'N'],
    ['Mark lesson complete', 'D'], ['Captions on/off', 'C'], ['Theater mode', 'T'], ['Fullscreen', 'F'], ['Mute', 'M'], ['This help', '?']
  ];
  openModal(`
    <div class="modal-head"><h3>Keyboard shortcuts</h3></div>
    <div class="modal-body"><table class="kbd-table">${rows.map(([l, ...k]) => `<tr><td>${l}</td><td>${k.map(x => `<kbd>${x}</kbd>`).join(' ')}</td></tr>`).join('')}</table></div>
    <div class="modal-foot"><button class="btn primary" data-close>Got it</button></div>`);
}
$('#shortcutsBtn').addEventListener('click', showShortcuts);
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (e.key === '?' && !modalRoot.children.length && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); showShortcuts(); }
});

// ---------- Course state ----------

let current = null; // { id, course, tree, progress, notes, flat, byRel, sections }
let view = null;    // { kind, courseId, teardown?, update? }

async function loadCourse(id, force) {
  if (!force && current?.id === id) return;
  const data = await api('/api/course/' + id);
  const flat = [];
  const sections = new Map();
  const walk = (node, chain) => {
    sections.set(node.rel, node);
    const here = [...chain, node];
    for (const l of node.lessons) flat.push({ lesson: l, sec: node, chain: here });
    for (const s of node.sections) walk(s, here);
  };
  if (data.tree) walk(data.tree, []);
  flat.forEach((e, i) => { e.index = i; });
  current = {
    id, course: data.course, tree: data.tree, progress: data.progress || { lessons: {} }, notes: data.notes || {},
    flat, byRel: new Map(flat.map(e => [e.lesson.rel, e])), sections, probed: false
  };
}

const prog = rel => current.progress.lessons[rel] || {};
function setLocal(rel, patch) {
  const entry = current.progress.lessons[rel] ||= {};
  Object.assign(entry, patch);
  if (patch.pos !== undefined) { current.progress.last = rel; current.progress.lastAt = Date.now(); }
}
const mediaUrl = (rel, courseId = current.id) => `/media/${courseId}/` + rel.split('/').map(enc).join('/');
const lessonHref = (rel, courseId = current.id) => `#/c/${courseId}/l?p=${enc(rel)}`;
const codeHref = (root, file) => `#/c/${current.id}/code?root=${enc(root)}${file ? '&f=' + enc(file) : ''}`;

function lessonsUnder(node, out = []) {
  out.push(...node.lessons);
  node.sections.forEach(s => lessonsUnder(s, out));
  return out;
}
function stats(node) {
  let total = 0, done = 0, dur = 0;
  for (const l of lessonsUnder(node)) {
    total++;
    const p = prog(l.rel);
    if (p.done) done++;
    dur += p.dur || 0;
  }
  return { total, done, dur, pct: total ? Math.round(done / total * 100) : 0 };
}
function nextUp() {
  const last = current.progress.last && current.byRel.get(current.progress.last);
  if (last && !prog(last.lesson.rel).done) return last;
  const start = last ? last.index + 1 : 0;
  return current.flat.slice(start).find(e => !prog(e.lesson.rel).done) || current.flat.find(e => !prog(e.lesson.rel).done) || last || current.flat[0];
}

function secMeta(node) {
  const s = stats(node);
  return `${s.done}/${s.total} done${s.dur ? ' · ' + fmtLong(s.dur) : ''}`;
}
function refreshCounters() {
  $$('[data-sec-meta]').forEach(el => { const n = current.sections.get(el.dataset.secMeta); if (n) el.textContent = secMeta(n); });
  $$('[data-sec-bar]').forEach(el => { const n = current.sections.get(el.dataset.secBar); if (n) el.style.width = stats(n).pct + '%'; });
}
function refreshDots(rel) {
  const p = prog(rel);
  $$(attrSel('data-toggle-done', rel)).forEach(el => {
    el.classList.toggle('done', !!p.done);
    el.classList.toggle('partial', !p.done && p.pos > 5);
    el.title = p.done ? 'Completed. Click to mark as not done' : 'Mark as complete';
  });
  $$(attrSel('data-dur', rel)).forEach(el => { el.textContent = p.dur ? fmtTime(p.dur) : ''; });
}
async function setDone(rel, done) {
  setLocal(rel, { done });
  refreshDots(rel);
  refreshCounters();
  view?.onDone?.(rel);
  try { await post('/api/progress', { course: current.id, rel, done }); } catch (e) { toast('Could not save: ' + e.message); }
}

function probeDurations() {
  if (current.probed) return;
  current.probed = true;
  const courseId = current.id;
  const queue = current.flat.map(e => e.lesson).filter(l => !prog(l.rel).dur);
  const run = () => {
    if (current?.id !== courseId) return;
    const l = queue.shift();
    if (!l) return;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const finish = () => { v.removeAttribute('src'); v.load(); run(); };
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && current?.id === courseId) {
        setLocal(l.rel, { dur: v.duration });
        refreshDots(l.rel);
        refreshCounters();
        post('/api/progress', { course: courseId, rel: l.rel, dur: v.duration }).catch(() => {});
      }
      finish();
    };
    v.onerror = finish;
    v.src = mediaUrl(l.rel, courseId);
  };
  run(); run();
}

document.addEventListener('click', e => {
  const dot = e.target.closest('[data-toggle-done]');
  if (dot && current) {
    e.preventDefault();
    e.stopPropagation();
    const rel = dot.dataset.toggleDone;
    setDone(rel, !prog(rel).done);
  }
});

function checkDot(rel) {
  const p = prog(rel);
  return `<button class="check-dot ${p.done ? 'done' : p.pos > 5 ? 'partial' : ''}" data-toggle-done="${esc(rel)}"
    title="${p.done ? 'Completed. Click to mark as not done' : 'Mark as complete'}" aria-label="Toggle complete">${ICON.check}</button>`;
}

// ---------- Resources (code, zips, pdfs…) ----------

const RES_LABEL = { folder: 'DIR', code: '</>', archive: 'ZIP', pdf: 'PDF', image: 'IMG', audio: 'AUD', file: 'FILE' };

function resourceActions(r) {
  const acts = [];
  if (r.type === 'folder' || r.type === 'code') acts.push(`<a class="btn small primary" href="${codeHref(r.rel)}">View code</a>`);
  if (r.type === 'pdf' || r.type === 'image') acts.push(`<a class="btn small primary" href="${mediaUrl(r.rel)}" target="_blank" rel="noopener">Open</a>`);
  if (r.type === 'archive' && !r.extracted && /\.zip$/i.test(r.name)) acts.push(`<button class="btn small primary" data-unpack="${esc(r.rel)}">Unpack</button>`);
  if (r.type === 'archive' && r.extracted) acts.push('<span class="badge good">Unpacked</span>');
  if (r.type !== 'folder') acts.push(`<a class="btn small" href="${mediaUrl(r.rel)}?download" title="Download">${ICON.download}</a>`);
  acts.push(`<button class="btn small" data-reveal="${esc(r.rel)}" title="Show in File Explorer">${ICON.folder}</button>`);
  return acts.join('');
}
function resourceRow(r) {
  const sub = r.type === 'folder' ? `${r.fileCount} files` : fmtSize(r.size);
  return `<div class="res-row"><div class="ic ${r.type}">${RES_LABEL[r.type] || 'FILE'}</div>
    <div class="nm"><div title="${esc(r.name)}">${esc(r.name)}</div><div>${esc(sub)}</div></div>
    <div class="acts">${resourceActions(r)}</div></div>`;
}
function resourceChip(r) {
  const href = r.type === 'folder' || r.type === 'code' ? codeHref(r.rel)
    : r.type === 'pdf' || r.type === 'image' ? mediaUrl(r.rel) : null;
  const label = `<b class="faint">${RES_LABEL[r.type]}</b><span>${esc(r.name)}</span>`;
  if (href) return `<a class="chip" href="${href}" ${href.startsWith('/') ? 'target="_blank" rel="noopener"' : ''} title="${esc(r.name)}">${label}</a>`;
  if (r.type === 'archive' && !r.extracted && /\.zip$/i.test(r.name)) return `<button class="chip" data-unpack="${esc(r.rel)}" title="Unpack ${esc(r.name)}">${label}</button>`;
  return `<a class="chip" href="${mediaUrl(r.rel)}?download" title="Download ${esc(r.name)}">${label}</a>`;
}

document.addEventListener('click', e => {
  const rev = e.target.closest('[data-reveal]');
  if (rev && current) {
    e.preventDefault();
    post(`/api/reveal/${current.id}?path=${enc(rev.dataset.reveal)}`).catch(x => toast(x.message));
  }
  const un = e.target.closest('[data-unpack]');
  if (un && current) {
    e.preventDefault();
    unpack([un.dataset.unpack]);
  }
});

let unpacking = false;
async function unpack(paths) {
  if (unpacking) return toast('Already unpacking. Please wait.');
  const courseId = current.id;
  let job;
  try { job = await post(`/api/extract/${courseId}`, paths ? { paths } : {}); } catch (e) { return toast(e.message); }
  unpacking = true;
  const box = $('#unpackStatus');
  const draw = () => {
    if (!box) return;
    const n = job.items.filter(i => i.status === 'done' || i.status === 'error').length;
    box.innerHTML = `<b>Unpacking ${n}/${job.items.length}…</b>${job.status !== 'done' ? ' <span class="muted">Keep the CourseCraft window open until this finishes.</span>' : ''}<ul class="job-list">${job.items.map(i =>
      `<li><span>${{ pending: '○', running: '◐', done: '✓', error: '✕' }[i.status]}</span><span>${esc(i.rel.split('/').pop())}${i.error ? ` <span class="faint">(${esc(i.error)})</span>` : ''}</span></li>`).join('')}</ul>`;
  };
  if (!box) toast('Unpacking…');
  draw();
  while (job.status !== 'done') {
    await new Promise(r => setTimeout(r, 700));
    try { job = await api('/api/jobs/' + job.id); } catch { break; }
    draw();
  }
  unpacking = false;
  const errors = job.items.filter(i => i.status === 'error');
  toast(errors.length ? `Finished with ${errors.length} error(s)` : 'Unpacked. Lessons are ready.');
  if (current?.id === courseId) { await loadCourse(courseId, true); route(); }
}

// ---------- Router ----------

async function route() {
  closeMenu();
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, qs] = raw.split('?');
  const parts = p.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  const kind = parts[0] === 'c' && parts[1] ? (parts[2] === 'l' ? 'lesson' : parts[2] === 'code' ? 'code' : 'course') : 'home';

  if (kind === 'lesson' && view?.kind === 'lesson' && view.courseId === parts[1] && current?.id === parts[1]) {
    return view.update(q.get('p'));
  }
  if (view?.teardown) { try { view.teardown(); } catch { /* ignore */ } }
  view = null;
  window.scrollTo(0, 0);

  try {
    if (kind === 'home') return await renderHome();
    await loadCourse(parts[1], kind === 'course');
    if (kind === 'lesson') return renderLesson(q.get('p'));
    if (kind === 'code') return await renderCode(q.get('root') || '', q.get('f'));
    return renderCourse();
  } catch (e) {
    app.innerHTML = `<div class="page"><div class="empty"><h1>Something went wrong</h1><p class="muted">${esc(e.message)}</p>
      <a class="btn primary" href="#/">Back to courses</a></div></div>`;
  }
}
addEventListener('hashchange', route);

// ---------- Home ----------

async function renderHome() {
  setCrumbs([]);
  document.title = 'CourseCraft';
  view = { kind: 'home' };
  const courses = await api('/api/courses');
  const recent = courses.filter(c => c.exists && c.last).sort((a, b) => b.lastAt - a.lastAt)[0];

  if (!courses.length) {
    app.innerHTML = `<div class="page"><div class="empty">
      <h1>Welcome to CourseCraft</h1>
      <p class="muted">Add a folder that holds a course: videos, subtitles, source code, or zip files.<br>
      For example <span class="mono">D:\\Java-course</span>. CourseCraft keeps your files where they are.</p>
      <button class="btn primary" data-add>Add your first course</button></div></div>`;
  } else {
    app.innerHTML = `<div class="page">
      <h1>Your courses</h1>
      <div class="muted">${courses.length} course${courses.length > 1 ? 's' : ''} in your library</div>
      ${recent ? continueCard(recent) : ''}
      <h2>Library</h2>
      <div class="grid">${courses.map(courseCard).join('')}
        <button class="add-card" data-add><span class="plus">+</span><b>Add a course</b><span class="faint">Point to any folder</span></button>
      </div></div>`;
  }

  $$('[data-add]').forEach(b => b.addEventListener('click', () => folderModal({
    title: 'Add a course', okLabel: 'Add course', path: courses.length ? '' : 'D:\\Java-course', showName: true, showMultiple: true,
    onSubmit: async v => {
      const r = await post('/api/courses', v);
      toast(r.added.length > 1 ? `Added ${r.added.length} courses` : 'Course added');
      if (r.added.length === 1) location.hash = `#/c/${r.added[0]}`; else route();
    }
  })));

  $$('[data-menu]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const c = courses.find(x => x.id === b.dataset.menu);
    openMenu(b, courseMenuItems(c, () => route()));
  }));
}

function courseMenuItems(c, after) {
  return [
    { label: 'Rename…', action: () => textModal({ title: 'Rename course', label: 'Name', value: c.name, onSubmit: async name => { await post('/api/courses/' + c.id, { name }, 'PATCH'); after(); } }) },
    { label: 'Change folder location…', action: () => folderModal({ title: 'Change folder location', okLabel: 'Save', path: c.path, onSubmit: async v => { await post('/api/courses/' + c.id, { path: v.path }, 'PATCH'); current = null; after(); toast('Folder updated. Your progress is kept.'); } }) },
    { label: 'Show in File Explorer', action: () => post(`/api/reveal/${c.id}?path=`).catch(x => toast(x.message)) },
    { label: 'Reset progress…', danger: true, action: async () => { if (await confirmModal('Reset progress?', `This clears watched positions and completed lessons for <b>${esc(c.name)}</b>. Notes are kept.`, 'Reset')) { await post('/api/progress-reset', { course: c.id }); current = null; after(); toast('Progress reset'); } } },
    { label: 'Remove from library…', danger: true, action: async () => { if (await confirmModal('Remove course?', `<b>${esc(c.name)}</b> will be removed from CourseCraft. Your files on disk are <b>not</b> deleted.`, 'Remove')) { await api('/api/courses/' + c.id, { method: 'DELETE' }); current = null; location.hash = '#/'; route(); } } }
  ];
}

function continueCard(c) {
  const pct = c.last.dur ? Math.min(100, Math.round(c.last.pos / c.last.dur * 100)) : 0;
  return `<div class="continue-card">
    <a class="play-big" href="${lessonHref(c.last.rel, c.id)}" aria-label="Continue">${ICON.play}</a>
    <div class="info"><div class="eyebrow">Continue watching</div>
      <div class="title">${esc(lessonLabel(c.last))}</div>
      <div class="muted">${esc(c.name)}${c.last.dur ? ` · ${fmtTime(c.last.pos)} of ${fmtTime(c.last.dur)}` : ''}</div>
      ${pct ? `<div class="progress" style="margin-top:8px;max-width:360px"><i style="width:${pct}%"></i></div>` : ''}
    </div>
    <a class="btn primary" href="${lessonHref(c.last.rel, c.id)}">Resume</a></div>`;
}

function courseCard(c) {
  const h = hue(c.name);
  const pct = c.lessonCount ? Math.round(c.doneCount / c.lessonCount * 100) : 0;
  let badge = '';
  if (!c.exists) badge = '<span class="badge warn">Folder not found</span>';
  else if (c.pendingArchives) badge = `<span class="badge warn">${c.pendingArchives} zip${c.pendingArchives > 1 ? 's' : ''} to unpack</span>`;
  else if (c.lessonCount && c.doneCount === c.lessonCount) badge = '<span class="badge good">Completed</span>';
  return `<a class="course-card" href="#/c/${c.id}">
    <div class="course-cover" style="background:linear-gradient(135deg,hsl(${h} 70% 52%),hsl(${(h + 50) % 360} 75% 42%))">
      ${esc(initials(c.name))}<button class="menu-btn" data-menu="${c.id}" aria-label="Course options">⋯</button></div>
    <div class="course-body">
      <div><div class="name">${esc(c.name)}</div><div class="path" title="${esc(c.path)}">${esc(c.path)}</div></div>
      ${badge ? `<div>${badge}</div>` : ''}
      <div style="margin-top:auto"><div class="progress"><i style="width:${pct}%"></i></div></div>
      <div class="stats"><span>${c.doneCount}/${c.lessonCount} lessons</span><span>${c.knownDuration ? fmtLong(c.knownDuration) : ''}${pct ? ` · ${pct}%` : ''}</span></div>
    </div></a>`;
}

// ---------- Course overview ----------

function renderCourse() {
  const { course, tree } = current;
  setCrumbs([{ label: 'Courses', href: '#/' }, { label: course.name }]);
  document.title = `${course.name} · CourseCraft`;
  view = { kind: 'course', courseId: current.id };

  if (!tree) {
    app.innerHTML = `<div class="page"><div class="empty"><h1>${esc(course.name)}</h1>
      <p class="muted">CourseCraft can't find this course's folder:<br><span class="mono">${esc(course.path)}</span><br>
      If you moved it, point CourseCraft to the new location. Your progress will be kept.</p>
      <button class="btn primary" data-relocate>Change folder location</button></div></div>`;
    $('[data-relocate]').addEventListener('click', () => folderModal({
      title: 'Change folder location', okLabel: 'Save', path: course.path,
      onSubmit: async v => { await post('/api/courses/' + current.id, { path: v.path }, 'PATCH'); await loadCourse(current.id, true); route(); }
    }));
    return;
  }

  const s = stats(tree);
  const up = current.flat.length ? nextUp() : null;
  const started = current.flat.some(e => prog(e.lesson.rel).pos || prog(e.lesson.rel).done);
  const pending = course.pendingArchives;
  const manySections = tree.sections.length > 8;
  const upChain = new Set(up ? up.chain.map(n => n.rel) : []);

  const sectionCard = (node) => {
    const open = !manySections || upChain.has(node.rel);
    return `<details class="section-card" ${open ? 'open' : ''}>
      <summary>${ICON.chev}<span class="sec-title">${esc(node.num ? node.num + '. ' : '')}${esc(node.title)}</span>
        <span class="sec-meta" data-sec-meta="${esc(node.rel)}">${secMeta(node)}</span>
        <span class="sec-progress progress"><i data-sec-bar="${esc(node.rel)}" style="width:${stats(node).pct}%"></i></span></summary>
      ${node.lessons.map(lessonRow).join('')}
      ${node.resources.length ? `<div class="res-chips">${node.resources.map(resourceChip).join('')}</div>` : ''}
      ${node.sections.map(sectionCard).join('')}
    </details>`;
  };

  app.innerHTML = `<div class="page">
    <div class="course-hero"><div class="main">
      <h1>${esc(course.name)}</h1>
      <div class="faint mono" style="font-size:12px">${esc(course.path)}</div>
      <div class="statline">
        <span><b>${s.total}</b> lessons</span>
        <span><b data-sec-meta="">${secMeta(tree)}</b></span>
        ${tree.sections.length ? `<span><b>${tree.sections.length}</b> section${tree.sections.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="progress" style="max-width:520px"><i data-sec-bar="" style="width:${s.pct}%"></i></div>
    </div>
    <div class="actions">
      ${up ? `<a class="btn primary" href="${lessonHref(up.lesson.rel)}">${ICON.play}${started ? 'Continue' : 'Start course'}</a>` : ''}
      <button class="btn" data-rescan title="Look for new or changed files">${ICON.refresh}Rescan</button>
      <button class="btn" data-reveal="" title="Show in File Explorer">${ICON.folder}Open folder</button>
      <button class="btn ghost" data-course-menu aria-label="More options">⋯</button>
    </div></div>
    ${pending ? `<div class="banner"><div class="text"><b>${pending} zip file${pending > 1 ? 's' : ''} haven't been unpacked yet.</b>
      <div class="muted">Unpack them to watch the lessons inside. The original zip files are kept.</div>
      <div id="unpackStatus"></div></div><button class="btn primary" data-unpack-all>Unpack all</button></div>` : ''}
    ${up && up !== current.flat[0] || started ? `<div class="banner info"><div class="text"><div class="faint" style="font-size:12px">UP NEXT</div>
      <b>${esc(lessonLabel(up.lesson))}</b> <span class="muted">· ${esc(up.sec.title)}</span></div>
      <a class="btn primary" href="${lessonHref(up.lesson.rel)}">${ICON.play}Play</a></div>` : ''}
    ${!s.total && !pending ? '<div class="banner info"><div class="text">No videos found in this folder yet. Add files and press <b>Rescan</b>.</div></div>' : ''}
    <h2>Course content</h2>
    ${tree.lessons.length ? `<div class="section-card">${tree.lessons.map(lessonRow).join('')}</div>` : ''}
    ${tree.sections.map(sectionCard).join('')}
    ${tree.resources.length ? `<h2>Course files</h2><div class="res-list">${tree.resources.map(resourceRow).join('')}</div>` : ''}
  </div>`;

  $('[data-rescan]').addEventListener('click', async () => { await loadCourse(current.id, true); renderCourse(); toast('Rescanned'); });
  $('[data-unpack-all]')?.addEventListener('click', e => { e.target.disabled = true; unpack(null); });
  $('[data-course-menu]').addEventListener('click', e => openMenu(e.currentTarget, courseMenuItems(course, async () => {
    await loadCourse(course.id, true);
    renderCourse();
  })));
  probeDurations();
}

function lessonRow(l) {
  const p = prog(l.rel);
  return `<a class="lesson-row" href="${lessonHref(l.rel)}">${checkDot(l.rel)}<span class="num">${esc(l.num || '')}</span>
    <span class="t">${esc(l.title)}${l.subs.length ? ' <span class="faint" title="Has subtitles">CC</span>' : ''}${current.notes[l.rel] ? ' <span class="faint" title="Has notes">✎</span>' : ''}</span>
    <span class="d" data-dur="${esc(l.rel)}">${p.dur ? fmtTime(p.dur) : ''}</span></a>`;
}

// ---------- Lesson player ----------

function parseVtt(text) {
  const toSec = t => { const p = t.trim().replace(',', '.').split(':').map(Number); return p.reduce((a, b) => a * 60 + b, 0); };
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const txt = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (txt) cues.push({ start: toSec(a), end: toSec(b.trim().split(/\s+/)[0]), text: txt });
  }
  return cues;
}

function renderLesson(rel) {
  if (!current.tree || !current.byRel.has(rel)) {
    app.innerHTML = `<div class="page"><div class="empty"><h1>Lesson not found</h1><p class="muted">It may have been moved or renamed.</p>
      <a class="btn primary" href="#/c/${current.id}">Back to course</a></div></div>`;
    return;
  }
  const courseId = current.id;
  const collapsed = pref.get('collapsed.' + courseId, {});
  const manySections = current.tree.sections.length > 6;
  let theater = pref.get('theater', false);
  let speed = pref.get('speed', 1);
  let captions = pref.get('captions', true);
  let autoplay = pref.get('autoplay', true);
  let tab = pref.get('tab', 'notes');
  let entry = null;
  let lastSave = 0;
  let cues = [];
  let cueIdx = -1;
  let nextTimer = null;
  let notesTimer = null;

  setCrumbs([{ label: 'Courses', href: '#/' }, { label: current.course.name, href: `#/c/${courseId}` }]);

  const sideNode = (node, isRoot) => {
    const items = node.lessons.map(l => `<a class="side-lesson" href="${lessonHref(l.rel)}" data-lesson="${esc(l.rel)}">${checkDot(l.rel)}
      <span class="t">${esc(lessonLabel(l))}</span><span class="d" data-dur="${esc(l.rel)}">${prog(l.rel).dur ? fmtTime(prog(l.rel).dur) : ''}</span></a>`).join('')
      + node.sections.map(s => sideNode(s, false)).join('');
    if (isRoot) return items;
    return `<div class="side-section" data-sec="${esc(node.rel)}"><button class="side-sec-title">${ICON.chev}
      <span>${esc(node.num ? node.num + '. ' : '')}${esc(node.title)}</span><span class="count" data-sec-meta="${esc(node.rel)}">${secMeta(node)}</span></button>
      <div class="side-items">${items}</div></div>`;
  };

  app.innerHTML = `<div class="player-layout ${theater ? 'theater' : ''}">
    <aside class="sidebar">
      <div class="sidebar-head">
        <a class="ct" href="#/c/${courseId}">${esc(current.course.name)}</a>
        <div class="progress"><i data-sec-bar="" style="width:${stats(current.tree).pct}%"></i></div>
        <div class="meta"><span data-sec-meta="">${secMeta(current.tree)}</span></div>
        <input class="input" id="sideSearch" placeholder="Search lessons…" autocomplete="off">
      </div>
      <nav class="sidebar-list" id="sideList">${sideNode(current.tree, true)}</nav>
    </aside>
    <section class="stage" id="stage">
      <div class="video-wrap" id="videoWrap">
        <video id="vid" controls preload="metadata" playsinline></video>
        <div class="flash" id="flash"></div>
        <div class="overlay hidden" id="nextOverlay"></div>
      </div>
      <div class="controls">
        <button class="btn small" id="prevBtn" title="Previous lesson (P)">${ICON.prev}</button>
        <button class="btn small" id="nextBtn" title="Next lesson (N)">${ICON.next}</button>
        <div class="now"><div class="t" id="nowTitle"></div><div class="s" id="nowSec"></div></div>
        <select class="input" id="speedSel" title="Playback speed">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map(v => `<option value="${v}">${v}×</option>`).join('')}</select>
        <button class="btn small toggle" id="ccBtn" title="Captions (C)">${ICON.cc}</button>
        <button class="btn small toggle" id="autoBtn" title="Autoplay next lesson">${ICON.auto}</button>
        <button class="btn small toggle" id="theaterBtn" title="Theater mode (T)">${ICON.theater}</button>
        <button class="btn small done-btn" id="doneBtn" title="Mark complete (D)">${ICON.check}<span>Complete</span></button>
      </div>
      <div class="tabs" id="tabs"></div>
      <div class="tab-body" id="tabBody"></div>
    </section></div>`;

  const video = $('#vid');
  const sideList = $('#sideList');
  const layout = $('.player-layout');

  // sidebar sections
  // The current lesson's sections always open; others follow what the user last chose.
  const applyCollapse = () => {
    $$('.side-section', sideList).forEach(el => {
      const r = el.dataset.sec;
      const hasActive = entry && entry.chain.some(n => n.rel === r);
      el.classList.toggle('collapsed', hasActive ? false : (r in collapsed ? collapsed[r] : manySections));
    });
  };
  sideList.addEventListener('click', e => {
    const t = e.target.closest('.side-sec-title');
    if (!t) return;
    const el = t.parentElement;
    const nowCollapsed = !el.classList.contains('collapsed');
    el.classList.toggle('collapsed', nowCollapsed);
    collapsed[el.dataset.sec] = nowCollapsed;
    pref.set('collapsed.' + courseId, collapsed);
  });
  $('#sideSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $$('.side-lesson', sideList).forEach(a => { a.classList.toggle('hidden', !!q && !a.textContent.toLowerCase().includes(q)); });
    $$('.side-section', sideList).forEach(s => {
      if (q) { s.classList.remove('collapsed'); s.classList.toggle('hidden', !$$('.side-lesson:not(.hidden)', s).length); }
      else s.classList.remove('hidden');
    });
    if (!q) applyCollapse();
  });

  // controls
  const flash = msg => {
    const f = $('#flash');
    f.textContent = msg;
    f.classList.add('show');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => f.classList.remove('show'), 900);
  };
  const setToggle = (id, on) => $(id).classList.toggle('on', on);
  const applyCaptions = () => {
    for (const t of video.textTracks) t.mode = 'hidden';
    if (captions && video.textTracks[0]) video.textTracks[0].mode = 'showing';
    setToggle('#ccBtn', captions);
  };
  $('#speedSel').value = String(speed);
  $('#speedSel').addEventListener('change', e => { video.playbackRate = Number(e.target.value); });
  $('#ccBtn').addEventListener('click', () => { captions = !captions; pref.set('captions', captions); applyCaptions(); });
  $('#autoBtn').addEventListener('click', () => { autoplay = !autoplay; pref.set('autoplay', autoplay); setToggle('#autoBtn', autoplay); flash(autoplay ? 'Autoplay on' : 'Autoplay off'); });
  $('#theaterBtn').addEventListener('click', () => toggleTheater());
  $('#doneBtn').addEventListener('click', () => setDone(entry.lesson.rel, !prog(entry.lesson.rel).done));
  $('#prevBtn').addEventListener('click', () => go(-1));
  $('#nextBtn').addEventListener('click', () => go(1));
  setToggle('#autoBtn', autoplay);
  setToggle('#theaterBtn', theater);

  function toggleTheater() {
    theater = !theater;
    pref.set('theater', theater);
    layout.classList.toggle('theater', theater);
    setToggle('#theaterBtn', theater);
  }
  function go(delta) {
    const target = current.flat[entry.index + delta];
    if (target) location.hash = lessonHref(target.lesson.rel);
  }
  const refreshDoneBtn = () => { $('#doneBtn').classList.toggle('on', !!prog(entry.lesson.rel).done); $('#doneBtn span').textContent = prog(entry.lesson.rel).done ? 'Completed' : 'Complete'; };

  // progress saving
  function save(force) {
    if (!entry || !video.duration || video.seeking) return;
    const now = Date.now();
    if (!force && now - lastSave < 4000) return;
    lastSave = now;
    const body = { course: courseId, rel: entry.lesson.rel, pos: video.ended ? 0 : video.currentTime, dur: video.duration };
    setLocal(body.rel, { pos: body.pos, dur: body.dur });
    post('/api/progress', body).catch(() => {});
  }
  const beacon = () => {
    if (!entry || !video.duration) return;
    navigator.sendBeacon('/api/progress', new Blob([JSON.stringify({ course: courseId, rel: entry.lesson.rel, pos: video.currentTime, dur: video.duration })], { type: 'application/json' }));
  };
  addEventListener('beforeunload', beacon);

  video.addEventListener('loadedmetadata', () => {
    const p = prog(entry.lesson.rel);
    if (video.duration && Math.abs((p.dur || 0) - video.duration) > 1) {
      setLocal(entry.lesson.rel, { dur: video.duration });
      refreshDots(entry.lesson.rel);
      refreshCounters();
    }
    if (p.pos > 5 && p.pos < video.duration - 15) {
      video.currentTime = p.pos;
      flash(`Resumed at ${fmtTime(p.pos)}`);
    }
    video.playbackRate = speed;
    applyCaptions();
  });
  video.addEventListener('timeupdate', () => {
    save(false);
    if (video.duration && video.currentTime / video.duration > 0.92 && !prog(entry.lesson.rel).done) setDone(entry.lesson.rel, true);
    syncCue();
  });
  video.addEventListener('pause', () => save(true));
  video.addEventListener('ratechange', () => {
    speed = video.playbackRate;
    pref.set('speed', speed);
    $('#speedSel').value = String(speed);
  });
  video.addEventListener('volumechange', () => { pref.set('volume', video.volume); pref.set('muted', video.muted); });
  video.volume = pref.get('volume', 1);
  video.muted = pref.get('muted', false);
  video.addEventListener('ended', () => {
    save(true);
    if (!prog(entry.lesson.rel).done) setDone(entry.lesson.rel, true);
    const nxt = current.flat[entry.index + 1];
    if (autoplay && nxt) showNext(nxt);
  });

  function showNext(nxt) {
    const ov = $('#nextOverlay');
    let n = 5;
    ov.innerHTML = `<div><div class="ring">Up next in <b id="cd">${n}</b></div><div class="next-title">${esc(lessonLabel(nxt.lesson))}</div>
      <button class="btn primary" id="playNext">${ICON.play}Play now</button> <button class="btn" id="cancelNext" style="background:transparent;color:#fff">Cancel</button></div>`;
    ov.classList.remove('hidden');
    const goNext = () => { hideNext(); location.hash = lessonHref(nxt.lesson.rel); };
    $('#playNext').addEventListener('click', goNext);
    $('#cancelNext').addEventListener('click', hideNext);
    nextTimer = setInterval(() => {
      n--;
      const cd = $('#cd');
      if (cd) cd.textContent = n;
      if (n <= 0) goNext();
    }, 1000);
  }
  function hideNext() {
    clearInterval(nextTimer);
    nextTimer = null;
    $('#nextOverlay')?.classList.add('hidden');
  }

  // tabs
  function renderTabs() {
    const resCount = entry.chain.reduce((n, node) => n + node.resources.length, 0);
    const hasSubs = entry.lesson.subs.length > 0;
    if (tab === 'transcript' && !hasSubs) tab = 'notes';
    const tabs = [hasSubs && ['transcript', 'Transcript'], ['notes', 'Notes'], ['resources', `Files & code<span class="n">${resCount || ''}</span>`]].filter(Boolean);
    $('#tabs').innerHTML = tabs.map(([k, label]) => `<button class="tab ${tab === k ? 'active' : ''}" data-tab="${k}">${label}</button>`).join('');
    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; pref.set('tab', tab); renderTabs(); }));
    const body = $('#tabBody');
    if (tab === 'transcript') renderTranscript(body);
    else if (tab === 'notes') renderNotes(body);
    else renderResources(body);
  }

  function renderTranscript(body) {
    body.innerHTML = `<div class="transcript-tools"><input class="input" id="trSearch" placeholder="Search transcript…" style="max-width:320px">
      <label class="check"><input type="checkbox" id="trFollow" ${pref.get('follow', true) ? 'checked' : ''}><span>Follow along</span></label></div>
      <div class="transcript" id="transcript" style="max-height:440px;overflow:auto;position:relative">${cues.length ? '' : '<div class="faint">Loading…</div>'}</div>`;
    $('#trFollow').addEventListener('change', e => pref.set('follow', e.target.checked));
    $('#trSearch').addEventListener('input', e => drawCues(e.target.value.trim()));
    if (cues.length) drawCues('');
  }
  function drawCues(q) {
    const box = $('#transcript');
    if (!box) return;
    const ql = q.toLowerCase();
    const mark = t => {
      if (!q) return esc(t);
      return esc(t).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    };
    box.innerHTML = cues.map((c, i) => (!q || c.text.toLowerCase().includes(ql))
      ? `<button class="cue ${i === cueIdx ? 'active' : ''}" data-i="${i}"><span class="ts">${fmtTime(c.start)}</span><span>${mark(c.text)}</span></button>` : '').join('')
      || '<div class="faint">No matches.</div>';
    box.onclick = e => {
      const b = e.target.closest('.cue');
      if (b) { video.currentTime = cues[+b.dataset.i].start; video.play().catch(() => {}); }
    };
  }
  function syncCue() {
    if (!cues.length) return;
    const t = video.currentTime;
    let i = cueIdx >= 0 && cues[cueIdx] && t >= cues[cueIdx].start ? cueIdx : 0;
    while (i < cues.length - 1 && cues[i + 1].start <= t) i++;
    if (t < cues[i].start) i = -1;
    if (i === cueIdx) return;
    cueIdx = i;
    const box = $('#transcript');
    if (!box) return;
    box.querySelector('.cue.active')?.classList.remove('active');
    const el = box.querySelector(`.cue[data-i="${i}"]`);
    if (el) {
      el.classList.add('active');
      if ($('#trFollow')?.checked && !$('#trSearch').value) box.scrollTop = el.offsetTop - box.clientHeight / 2;
    }
  }

  function renderNotes(body) {
    const rel = entry.lesson.rel;
    body.innerHTML = `<div class="notes">
      <div class="notes-bar"><button class="btn small" id="stampBtn" title="Insert the current video time">+ Timestamp</button>
        <span class="faint" style="font-size:12px">Notes are saved automatically on this computer.</span><span class="status" id="noteStatus"></span></div>
      <textarea id="noteText" placeholder="Write notes for this lesson…  Use “+ Timestamp” to link a moment in the video.">${esc(current.notes[rel]?.text || '')}</textarea>
      <div class="stamps" id="stamps"></div></div>`;
    const ta = $('#noteText');
    const drawStamps = () => {
      const found = [...ta.value.matchAll(/\[(?:(\d+):)?(\d{1,2}):(\d\d)\]/g)];
      $('#stamps').innerHTML = found.map(m => {
        const sec = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
        return `<button class="chip" data-seek="${sec}">▶ ${esc(m[0].slice(1, -1))}</button>`;
      }).join('');
    };
    drawStamps();
    $('#stamps').addEventListener('click', e => { const b = e.target.closest('[data-seek]'); if (b) { video.currentTime = +b.dataset.seek; video.play().catch(() => {}); } });
    const persist = () => {
      clearTimeout(notesTimer);
      $('#noteStatus').textContent = 'Saving…';
      notesTimer = setTimeout(async () => {
        const text = ta.value;
        if (text.trim()) current.notes[rel] = { text, t: Date.now() }; else delete current.notes[rel];
        try { await post('/api/notes', { course: courseId, rel, text }); $('#noteStatus').textContent = 'Saved'; } catch { $('#noteStatus').textContent = 'Not saved'; }
      }, 500);
    };
    ta.addEventListener('input', () => { persist(); drawStamps(); });
    $('#stampBtn').addEventListener('click', () => {
      const stamp = `[${fmtTime(video.currentTime)}] `;
      const at = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, at);
      const prefix = before && !before.endsWith('\n') ? '\n' : '';
      ta.value = before + prefix + stamp + ta.value.slice(ta.selectionEnd ?? at);
      const pos = (before + prefix + stamp).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      persist();
      drawStamps();
    });
  }

  function renderResources(body) {
    const groups = [...entry.chain].reverse().filter(n => n.resources.length);
    if (!groups.length) {
      body.innerHTML = '<div class="faint">No source code or extra files in this section.</div>';
      return;
    }
    body.innerHTML = groups.map(n => `<div class="res-group-title">${n === current.tree ? 'Course files' : esc(n.title)}</div>
      <div class="res-list">${n.resources.map(resourceRow).join('')}</div>`).join('');
  }

  // load a lesson into the player
  async function update(rel) {
    const target = current.byRel.get(rel);
    if (!target) { location.hash = `#/c/${courseId}`; return; }
    hideNext();
    save(true);
    entry = target;
    lastSave = 0;
    cues = [];
    cueIdx = -1;
    const l = entry.lesson;
    document.title = `${l.title} · ${current.course.name}`;
    $('#nowTitle').textContent = lessonLabel(l);
    $('#nowSec').textContent = entry.chain.slice(1).map(n => n.title).join(' › ') || current.course.name;
    $('#prevBtn').disabled = entry.index === 0;
    $('#nextBtn').disabled = entry.index === current.flat.length - 1;
    refreshDoneBtn();

    $$('.side-lesson.active', sideList).forEach(a => a.classList.remove('active'));
    const active = sideList.querySelector(attrSel('data-lesson', rel));
    active?.classList.add('active');
    applyCollapse();
    active?.scrollIntoView({ block: 'nearest' });

    $$('track', video).forEach(t => t.remove());
    l.subs.forEach((s, i) => {
      const t = document.createElement('track');
      t.kind = 'subtitles';
      t.label = s.label;
      t.srclang = /^[a-z]{2,3}$/i.test(s.label) ? s.label : 'en';
      t.src = mediaUrl(s.rel);
      if (i === 0) t.default = captions;
      video.appendChild(t);
    });
    video.src = mediaUrl(l.rel);
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
    video.play().catch(() => { /* autoplay can be blocked until the user clicks */ });
    renderTabs();

    if (l.subs[0]) {
      try {
        const text = await (await fetch(mediaUrl(l.subs[0].rel))).text();
        if (entry !== target) return;
        cues = parseVtt(text);
        if (tab === 'transcript') drawCues($('#trSearch')?.value.trim() || '');
      } catch { /* transcript is optional */ }
    }
  }

  // keyboard shortcuts
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (modalRoot.children.length) return;
    const k = e.key;
    const seek = d => { video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + d)); flash(`${d > 0 ? '+' : ''}${d}s`); };
    const handled = {
      ' ': () => (video.paused ? video.play() : video.pause()),
      k: () => (video.paused ? video.play() : video.pause()),
      j: () => seek(-10), l: () => seek(10), ArrowLeft: () => seek(-5), ArrowRight: () => seek(5),
      ArrowUp: () => { video.volume = Math.min(1, video.volume + 0.1); flash(`Volume ${Math.round(video.volume * 100)}%`); },
      ArrowDown: () => { video.volume = Math.max(0, video.volume - 0.1); flash(`Volume ${Math.round(video.volume * 100)}%`); },
      '>': () => { video.playbackRate = Math.min(4, +(video.playbackRate + 0.25).toFixed(2)); flash(`${video.playbackRate}×`); },
      '<': () => { video.playbackRate = Math.max(0.25, +(video.playbackRate - 0.25).toFixed(2)); flash(`${video.playbackRate}×`); },
      m: () => { video.muted = !video.muted; flash(video.muted ? 'Muted' : 'Sound on'); },
      f: () => (document.fullscreenElement ? document.exitFullscreen() : $('#videoWrap').requestFullscreen()),
      c: () => { $('#ccBtn').click(); flash(captions ? 'Captions on' : 'Captions off'); },
      t: toggleTheater, n: () => go(1), p: () => go(-1),
      d: () => setDone(entry.lesson.rel, !prog(entry.lesson.rel).done)
    }[k.length === 1 ? k.toLowerCase() : k] || (/^[0-9]$/.test(k) && video.duration ? () => { video.currentTime = video.duration * (+k / 10); } : null);
    if (handled) {
      // Runs in the capture phase, so the focused <video> or button never sees the key:
      // otherwise the native player also toggles on Space and the two cancel out.
      e.preventDefault();
      e.stopPropagation();
      swallowed.add(k);
      if (e.repeat && !/^(Arrow|[jl<>]$)/.test(k)) return; // holding Space shouldn't flicker play/pause
      const r = handled();
      if (r && r.catch) r.catch(() => {});
    }
  }
  // Buttons are "clicked" by Space on keyup, so swallow the rest of a key we handled.
  const swallowed = new Set();
  function onKeyRest(e) {
    if (!swallowed.has(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'keyup') swallowed.delete(e.key);
  }
  addEventListener('keydown', onKey, true);
  addEventListener('keypress', onKeyRest, true);
  addEventListener('keyup', onKeyRest, true);

  view = {
    kind: 'lesson', courseId, update,
    onDone: rel => { if (entry && rel === entry.lesson.rel) refreshDoneBtn(); },
    teardown() {
      save(true);
      hideNext();
      clearTimeout(notesTimer);
      removeEventListener('keydown', onKey, true);
      removeEventListener('keypress', onKeyRest, true);
      removeEventListener('keyup', onKeyRest, true);
      removeEventListener('beforeunload', beacon);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  };
  update(rel);
  probeDurations();
}

// ---------- Code viewer ----------

async function renderCode(root, file) {
  const courseId = current.id;
  setCrumbs([{ label: 'Courses', href: '#/' }, { label: current.course.name, href: `#/c/${courseId}` }, { label: 'Source code' }]);
  view = { kind: 'code', courseId };
  const tree = await api(`/api/tree/${courseId}?path=${enc(root)}`);
  const rootName = root ? root.split('/').pop() : current.course.name;
  document.title = `${rootName} · CourseCraft`;

  const firstFile = node => {
    const pick = node.files.find(f => f.kind === 'code' && !/^readme/i.test(f.name)) || node.files.find(f => f.kind === 'code') || null;
    if (pick) return pick.rel;
    for (const d of node.dirs) { const r = firstFile(d); if (r) return r; }
    return node.files[0]?.rel || null;
  };
  file = file || firstFile(tree);
  const fileMeta = new Map();
  const walk = n => { n.files.forEach(f => fileMeta.set(f.rel, f)); n.dirs.forEach(walk); };
  walk(tree);

  const drawDir = (node, depth) => {
    const open = depth < 1 || (file && file.startsWith(node.rel + '/'));
    return `<div class="tree-dir ${open ? '' : 'collapsed'}"><button class="tree-label">${ICON.chev}<span class="fi">▤</span>${esc(node.name)}</button>
      <div class="tree-children">${node.dirs.map(d => drawDir(d, depth + 1)).join('')}${node.files.map(drawFile).join('')}</div></div>`;
  };
  const drawFile = f => `<button class="tree-file" data-file="${esc(f.rel)}" title="${esc(f.name)}"><span class="fi">${f.kind === 'code' ? '‹›' : f.kind === 'archive' ? 'Z' : '·'}</span>${esc(f.name)}</button>`;

  app.innerHTML = `<div class="code-layout">
    <aside class="file-tree" id="fileTree">
      <div class="tree-head"><a class="muted" id="codeBack" href="#/c/${courseId}" style="font-weight:500;font-size:12px">← Back</a><span>${esc(rootName)}</span></div>
      ${tree.dirs.map(d => drawDir(d, 0)).join('')}${tree.files.map(drawFile).join('')}
      ${!tree.dirs.length && !tree.files.length ? '<div class="faint" style="padding:10px 14px">This folder is empty.</div>' : ''}
    </aside>
    <section class="code-pane">
      <div class="code-head"><span class="p" id="codePath"></span>
        <button class="btn small" id="copyBtn">${ICON.copy}Copy</button>
        <a class="btn small" id="dlBtn">${ICON.download}Download</a>
        <button class="btn small" id="revealBtn" title="Show in File Explorer">${ICON.folder}</button></div>
      <div class="code-scroll" id="codeScroll"></div>
    </section></div>`;

  let text = '';
  const tr = $('#fileTree');
  $('#codeBack').addEventListener('click', e => { if (history.length > 1) { e.preventDefault(); history.back(); } });
  tr.addEventListener('click', e => {
    const lab = e.target.closest('.tree-label');
    if (lab) { lab.parentElement.classList.toggle('collapsed'); return; }
    const f = e.target.closest('[data-file]');
    if (f) {
      history.replaceState(null, '', codeHref(root, f.dataset.file));
      show(f.dataset.file);
    }
  });
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy failed'); }
  });
  $('#revealBtn').addEventListener('click', () => file && post(`/api/reveal/${courseId}?path=${enc(file)}`).catch(x => toast(x.message)));

  async function show(rel) {
    file = rel;
    text = '';
    $$('.tree-file.active', tr).forEach(b => b.classList.remove('active'));
    tr.querySelector(attrSel('data-file', rel))?.classList.add('active');
    const meta = fileMeta.get(rel) || { name: rel.split('/').pop(), kind: 'file' };
    $('#codePath').textContent = root && rel.startsWith(root + '/') ? rel.slice(root.length + 1) : rel;
    $('#dlBtn').href = mediaUrl(rel) + '?download';
    $('#copyBtn').disabled = true;
    const box = $('#codeScroll');
    box.scrollTop = 0;
    if (meta.kind === 'image') { box.innerHTML = `<div class="code-msg"><img src="${mediaUrl(rel)}" alt="${esc(meta.name)}"></div>`; return; }
    if (meta.kind === 'pdf') { box.innerHTML = `<iframe src="${mediaUrl(rel)}" style="width:100%;height:100%;border:0" title="${esc(meta.name)}"></iframe>`; return; }
    if (meta.kind === 'archive') {
      box.innerHTML = `<div class="code-msg"><p>This is a zip file.</p>${/\.zip$/i.test(meta.name) ? `<button class="btn primary" data-unpack="${esc(rel)}">Unpack it</button>` : ''}</div>`;
      return;
    }
    box.innerHTML = '<div class="code-msg">Loading…</div>';
    const r = await api(`/api/text/${courseId}?path=${enc(rel)}`).catch(e => ({ error: e.message }));
    if (file !== rel) return;
    if (r.error || r.binary || r.tooLarge) {
      box.innerHTML = `<div class="code-msg">${r.error ? esc(r.error) : r.binary ? "This file can't be shown as text." : `This file is too large to preview (${fmtSize(r.size)}).`}
        <p><a class="btn" href="${mediaUrl(rel)}?download">${ICON.download}Download</a></p></div>`;
      return;
    }
    text = r.text;
    $('#copyBtn').disabled = false;
    const lines = text.split('\n').length;
    box.innerHTML = `<div class="code-box"><div class="gutter">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</div>
      <pre><code>${window.Syntax.highlight(text, meta.name)}</code></pre></div>`;
  }
  if (file) show(file);
  else $('#codeScroll').innerHTML = '<div class="code-msg">No files to show.</div>';
}

route();
