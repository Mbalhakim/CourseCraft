// CourseCraft: a local course player. No dependencies; run with `node server.js`
// (or double-click "Start CourseCraft.bat"). Only listens on 127.0.0.1.
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 4321;
const HOST = '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const DATA = process.env.CC_DATA || path.join(__dirname, 'data');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.ogv']);
const SUB_EXT = new Set(['.vtt', '.srt']);
const ARCHIVE_EXT = new Set(['.zip', '.rar', '.7z']);
const CODE_EXT = new Set([
  '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.rb', '.php', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cc', '.cs', '.swift', '.dart',
  '.html', '.htm', '.css', '.scss', '.less', '.xml', '.json', '.yml', '.yaml', '.toml', '.ini',
  '.properties', '.sql', '.sh', '.bat', '.ps1', '.md', '.txt', '.csv', '.iml', '.vue', '.svelte', '.env', '.cfg'
]);
const IGNORE = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.idea', '.vscode', '__pycache__', '__macosx']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.ogv': 'video/ogg', '.vtt': 'text/vtt; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4'
};

// ---------- JSON storage ----------

fs.mkdirSync(DATA, { recursive: true });
function loadJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return fallback; }
}
const store = {
  library: loadJson('library.json', { courses: [] }),
  progress: loadJson('progress.json', {}),
  notes: loadJson('notes.json', {})
};
const dirty = new Set();
let saveTimer = null;
function save(key) {
  dirty.add(key);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
function flush() {
  for (const key of dirty) {
    const file = path.join(DATA, key + '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(store[key], null, 1));
    fs.renameSync(file + '.tmp', file);
  }
  dirty.clear();
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { flush(); process.exit(0); });

// ---------- Scanning a course folder ----------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name);

function stripExt(name) { return name.slice(0, name.length - path.extname(name).length); }

// "1- Setting Up - coursedownloader.net.mp4" -> { num: "1", title: "Setting Up" }
function parseName(name, isFile) {
  let base = isFile ? stripExt(name) : name;
  base = base.replace(/\s*[-–|]\s*(www\.)?[\w-]+\.(net|com|org|io|ir|me|co|info|xyz|to|cc)\s*$/i, '');
  base = base.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = base.match(/^(\d+(?:\.\d+)*)(?:\s*[-.)_:]\s*|\s+)(.+)$/);
  return m ? { num: m[1], title: m[2] } : { num: null, title: base };
}

function resourceKind(ext) {
  if (ARCHIVE_EXT.has(ext)) return 'archive';
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  if (['.mp3', '.m4a', '.wav'].includes(ext)) return 'audio';
  if (CODE_EXT.has(ext)) return 'code';
  return 'file';
}

function scanDir(abs, rel, depth = 0) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return null; }
  const name = path.basename(abs);
  const node = { rel, name, ...parseName(name, false), sections: [], lessons: [], resources: [], videoCount: 0, fileCount: 0 };
  const files = [];
  for (const e of entries) {
    const lower = e.name.toLowerCase();
    if (e.name.startsWith('.') || IGNORE.has(lower)) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(lower) || depth > 12) continue;
      const child = scanDir(path.join(abs, e.name), r, depth + 1);
      if (!child) continue;
      node.fileCount += child.fileCount;
      if (child.videoCount > 0) node.sections.push(child);
      else if (child.fileCount > 0) node.resources.push({ type: 'folder', rel: r, name: e.name, title: child.title, fileCount: child.fileCount });
    } else if (e.isFile()) {
      files.push(e.name);
    }
  }
  node.fileCount += files.length;

  const videoByBase = new Map();
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    const lesson = { rel: rel ? rel + '/' + f : f, name: f, ...parseName(f, true), ext, size: safeSize(path.join(abs, f)), subs: [] };
    node.lessons.push(lesson);
    videoByBase.set(stripExt(f).toLowerCase(), lesson);
  }
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (VIDEO_EXT.has(ext)) continue;
    const r = rel ? rel + '/' + f : f;
    if (SUB_EXT.has(ext)) {
      const base = stripExt(f);
      let lesson = videoByBase.get(base.toLowerCase());
      let label = 'Subtitles';
      if (!lesson) {
        const m = base.match(/^(.*)\.([a-z]{2,3}(?:[-_][a-z]{2,4})?)$/i); // "lesson.en.vtt"
        if (m) { lesson = videoByBase.get(m[1].toLowerCase()); label = m[2]; }
      }
      if (lesson) { lesson.subs.push({ rel: r, label }); continue; }
    }
    const res = { type: resourceKind(ext), rel: r, name: f, ext, size: safeSize(path.join(abs, f)) };
    if (res.type === 'archive') res.extracted = fs.existsSync(path.join(abs, stripExt(f).trim()));
    node.resources.push(res);
  }
  node.sections.sort(byName);
  node.lessons.sort(byName);
  node.resources.sort(byName);
  node.videoCount = node.lessons.length + node.sections.reduce((n, s) => n + s.videoCount, 0);
  return node;
}

function safeSize(abs) { try { return fs.statSync(abs).size; } catch { return 0; } }

function walkLessons(node, out = []) {
  for (const l of node.lessons) out.push(l);
  for (const s of node.sections) walkLessons(s, out);
  return out;
}
function walkArchives(node, out = []) {
  for (const r of node.resources) if (r.type === 'archive' && !r.extracted && path.extname(r.name).toLowerCase() === '.zip') out.push(r);
  for (const s of node.sections) walkArchives(s, out);
  return out;
}

// ---------- Library ----------

function findCourse(id) { return store.library.courses.find(c => c.id === id); }
function courseExists(c) { try { return fs.statSync(c.path).isDirectory(); } catch { return false; } }
function newId() { return crypto.randomBytes(5).toString('hex'); }

function resolveIn(course, rel) {
  const base = path.resolve(course.path);
  const abs = path.resolve(base, rel || '.');
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}

function courseSummary(c) {
  const exists = courseExists(c);
  const tree = exists ? scanDir(c.path, '') : null;
  const lessons = tree ? walkLessons(tree) : [];
  const prog = store.progress[c.id] || { lessons: {} };
  let done = 0, total = 0, watched = 0;
  for (const l of lessons) {
    const p = prog.lessons[l.rel];
    if (!p) continue;
    if (p.done) done++;
    if (p.dur) total += p.dur;
    if (p.done && p.dur) watched += p.dur;
  }
  const last = prog.last && lessons.find(l => l.rel === prog.last);
  return {
    id: c.id, name: c.name, path: c.path, exists, addedAt: c.addedAt,
    lessonCount: lessons.length, doneCount: done, knownDuration: total, watchedDuration: watched,
    pendingArchives: tree ? walkArchives(tree).length : 0,
    last: last ? { rel: last.rel, title: last.title, num: last.num, pos: prog.lessons[last.rel]?.pos || 0, dur: prog.lessons[last.rel]?.dur || 0 } : null,
    lastAt: prog.lastAt || 0
  };
}

function addCourse(dir, name) {
  const resolved = path.resolve(dir);
  const existing = store.library.courses.find(c => path.resolve(c.path).toLowerCase() === resolved.toLowerCase());
  if (existing) return existing;
  const course = { id: newId(), name: name || path.basename(resolved), path: resolved, addedAt: Date.now() };
  store.library.courses.push(course);
  save('library');
  return course;
}

// ---------- Zip extraction (uses Windows' built-in bsdtar, which reads zip files) ----------

const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const jobs = new Map();

function runTar(zipAbs, outDir) {
  return new Promise((resolve, reject) => {
    const p = spawn(TAR, ['-xf', zipAbs, '-C', outDir], { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || 'tar exited with code ' + code)));
  });
}

const activeTmp = new Set();

// A ".extracting-*" folder that no running job owns was left by an unpack that was
// interrupted (e.g. the CourseCraft window was closed). It can always be rebuilt from the zip.
async function removeStaleTmp(dir) {
  for (const name of await fsp.readdir(dir).catch(() => [])) {
    const abs = path.join(dir, name);
    if (name.startsWith('.extracting-') && !activeTmp.has(abs)) await fsp.rm(abs, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractZip(zipAbs) {
  const dir = path.dirname(zipAbs);
  const dest = path.join(dir, stripExt(path.basename(zipAbs)).trim());
  if (fs.existsSync(dest)) throw new Error('A folder with this name already exists');
  await removeStaleTmp(dir);
  const tmp = path.join(dir, '.extracting-' + crypto.randomBytes(4).toString('hex'));
  activeTmp.add(tmp);
  await fsp.mkdir(tmp);
  try {
    await runTar(zipAbs, tmp);
    const entries = (await fsp.readdir(tmp)).filter(n => !IGNORE.has(n.toLowerCase()) && n.toLowerCase() !== '__macosx');
    // Most course zips wrap everything in one top folder; unwrap it so we don't get "X/X/...".
    let src = tmp;
    if (entries.length === 1 && (await fsp.stat(path.join(tmp, entries[0]))).isDirectory()) src = path.join(tmp, entries[0]);
    await fsp.rename(src, dest);
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
    activeTmp.delete(tmp);
  }
}

function startExtractJob(course, rels) {
  const job = { id: newId(), courseId: course.id, status: 'running', items: rels.map(rel => ({ rel, status: 'pending' })) };
  jobs.set(job.id, job);
  (async () => {
    for (const item of job.items) {
      item.status = 'running';
      try {
        const abs = resolveIn(course, item.rel);
        if (!abs) throw new Error('Invalid path');
        await extractZip(abs);
        item.status = 'done';
      } catch (e) {
        item.status = 'error';
        item.error = e.message;
      }
    }
    job.status = 'done';
  })();
  return job;
}

// ---------- HTTP helpers ----------

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (res, status, error) => json(res, status, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 2e6) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function srtToVtt(text) {
  return 'WEBVTT\n\n' + text.replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

async function sendFile(req, res, abs, { download = false, cache = false } = {}) {
  let st;
  try { st = await fsp.stat(abs); } catch { return fail(res, 404, 'Not found'); }
  if (!st.isFile()) return fail(res, 404, 'Not found');
  const ext = path.extname(abs).toLowerCase();

  if (ext === '.srt' && !download) {
    const vtt = srtToVtt(await fsp.readFile(abs, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8' });
    return res.end(vtt);
  }

  const headers = {
    'Content-Type': MIME[ext] || (CODE_EXT.has(ext) ? 'text/plain; charset=utf-8' : 'application/octet-stream'),
    'Accept-Ranges': 'bytes',
    'Last-Modified': st.mtime.toUTCString(),
    'Cache-Control': cache ? 'max-age=3600' : 'no-cache'
  };
  if (download) headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(abs))}`;

  const size = st.size;
  let start = 0, end = size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && size > 0) {
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), size - 1); }
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  const stream = fs.createReadStream(abs, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function listTree(abs, rel, budget) {
  const node = { name: path.basename(abs), rel, dirs: [], files: [] };
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return node; }
  for (const e of entries.sort((a, b) => collator.compare(a.name, b.name))) {
    if (budget.left <= 0) break;
    const lower = e.name.toLowerCase();
    if (IGNORE.has(lower) || e.name === '.git') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(lower)) continue;
      node.dirs.push(listTree(path.join(abs, e.name), r, budget));
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (VIDEO_EXT.has(ext)) continue;
      budget.left--;
      node.files.push({ name: e.name, rel: r, ext, size: safeSize(path.join(abs, e.name)), kind: resourceKind(ext) });
    }
  }
  return node;
}

function pickFolder() {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    '$owner = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Choose a course folder'",
    '$d.ShowNewFolderButton = $false',
    "if ($d.ShowDialog($owner) -eq 'OK') { $d.SelectedPath }"
  ].join('; ');
  return new Promise(resolve => {
    const p = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => resolve(out.trim() || null));
  });
}

function reveal(abs, isFile) {
  if (process.platform !== 'win32') return;
  const args = isFile ? ['/select,', abs] : [abs];
  spawn('explorer.exe', args, { detached: true, stdio: 'ignore' }).unref();
}

// ---------- Routes ----------

async function handleApi(req, res, url, parts) {
  const method = req.method;
  const [, resource, id] = parts; // ['api', resource, id]

  if (resource === 'courses' && !id) {
    if (method === 'GET') return json(res, 200, store.library.courses.map(courseSummary));
    if (method === 'POST') {
      const body = await readBody(req);
      const dir = String(body.path || '').trim().replace(/^"(.*)"$/, '$1');
      if (!dir) return fail(res, 400, 'Enter a folder path');
      let st;
      try { st = fs.statSync(dir); } catch { return fail(res, 400, `Folder not found: ${dir}`); }
      if (!st.isDirectory()) return fail(res, 400, 'That path is a file, not a folder');
      const added = [];
      if (body.multiple) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => collator.compare(a.name, b.name))) {
          if (!e.isDirectory() || e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue;
          const sub = path.join(dir, e.name);
          const tree = scanDir(sub, '');
          if (tree && (tree.videoCount > 0 || walkArchives(tree).length > 0)) added.push(addCourse(sub));
        }
        if (!added.length) return fail(res, 400, 'No subfolders with videos or zip files were found');
      } else {
        added.push(addCourse(dir, String(body.name || '').trim() || undefined));
      }
      return json(res, 200, { added: added.map(c => c.id) });
    }
  }

  if (resource === 'courses' && id) {
    const course = findCourse(id);
    if (!course) return fail(res, 404, 'Course not found');
    if (method === 'PATCH') {
      const body = await readBody(req);
      if (body.name !== undefined) course.name = String(body.name).trim() || course.name;
      if (body.path !== undefined) {
        const dir = String(body.path).trim().replace(/^"(.*)"$/, '$1');
        try { if (!fs.statSync(dir).isDirectory()) throw 0; } catch { return fail(res, 400, `Folder not found: ${dir}`); }
        course.path = path.resolve(dir);
      }
      save('library');
      return json(res, 200, courseSummary(course));
    }
    if (method === 'DELETE') {
      store.library.courses = store.library.courses.filter(c => c.id !== id);
      save('library');
      return json(res, 200, { ok: true });
    }
  }

  if (resource === 'course' && id && method === 'GET') {
    const course = findCourse(id);
    if (!course) return fail(res, 404, 'Course not found');
    if (!courseExists(course)) return json(res, 200, { course: courseSummary(course), tree: null, progress: {}, notes: {} });
    return json(res, 200, {
      course: courseSummary(course),
      tree: scanDir(course.path, ''),
      progress: store.progress[id] || { lessons: {} },
      notes: store.notes[id] || {}
    });
  }

  if (resource === 'progress' && method === 'POST') {
    const body = await readBody(req);
    if (!findCourse(body.course) || typeof body.rel !== 'string') return fail(res, 400, 'Bad request');
    const prog = store.progress[body.course] ||= { lessons: {} };
    const entry = prog.lessons[body.rel] ||= {};
    if (typeof body.pos === 'number') { entry.pos = Math.max(0, body.pos); prog.last = body.rel; prog.lastAt = Date.now(); }
    if (typeof body.dur === 'number' && body.dur > 0) entry.dur = body.dur;
    if (typeof body.done === 'boolean') { entry.done = body.done; if (body.done) entry.doneAt = Date.now(); }
    entry.t = Date.now();
    save('progress');
    return json(res, 200, entry);
  }

  if (resource === 'progress-reset' && method === 'POST') {
    const body = await readBody(req);
    delete store.progress[body.course];
    save('progress');
    return json(res, 200, { ok: true });
  }

  if (resource === 'notes' && method === 'POST') {
    const body = await readBody(req);
    if (!findCourse(body.course) || typeof body.rel !== 'string') return fail(res, 400, 'Bad request');
    const notes = store.notes[body.course] ||= {};
    const text = String(body.text || '');
    if (text.trim()) notes[body.rel] = { text, t: Date.now() }; else delete notes[body.rel];
    save('notes');
    return json(res, 200, { ok: true });
  }

  if ((resource === 'text' || resource === 'tree' || resource === 'reveal' || resource === 'extract') && id) {
    const course = findCourse(id);
    if (!course) return fail(res, 404, 'Course not found');

    if (resource === 'extract' && method === 'POST') {
      const body = await readBody(req);
      let rels = Array.isArray(body.paths) ? body.paths.map(String) : null;
      if (!rels) rels = walkArchives(scanDir(course.path, '')).map(r => r.rel);
      if (!rels.length) return fail(res, 400, 'Nothing to unpack');
      return json(res, 200, startExtractJob(course, rels));
    }

    const abs = resolveIn(course, url.searchParams.get('path') || '');
    if (!abs) return fail(res, 400, 'Invalid path');

    if (resource === 'text') {
      let st;
      try { st = await fsp.stat(abs); } catch { return fail(res, 404, 'Not found'); }
      if (st.size > 3e6) return json(res, 200, { tooLarge: true, size: st.size });
      const buf = await fsp.readFile(abs);
      if (buf.subarray(0, 8000).includes(0)) return json(res, 200, { binary: true, size: st.size });
      return json(res, 200, { text: buf.toString('utf8').replace(/^\uFEFF/, ''), size: st.size });
    }
    if (resource === 'tree') {
      let st;
      try { st = await fsp.stat(abs); } catch { return fail(res, 404, 'Not found'); }
      const rel = url.searchParams.get('path') || '';
      if (st.isFile()) {
        const ext = path.extname(abs).toLowerCase();
        return json(res, 200, { name: path.basename(abs), rel, single: true, dirs: [], files: [{ name: path.basename(abs), rel, ext, size: st.size, kind: resourceKind(ext) }] });
      }
      return json(res, 200, listTree(abs, rel, { left: 5000 }));
    }
    if (resource === 'reveal' && method === 'POST') {
      let isFile = false;
      try { isFile = fs.statSync(abs).isFile(); } catch { return fail(res, 404, 'Not found'); }
      reveal(abs, isFile);
      return json(res, 200, { ok: true });
    }
  }

  if (resource === 'jobs' && id && method === 'GET') {
    const job = jobs.get(id);
    return job ? json(res, 200, job) : fail(res, 404, 'Job not found');
  }

  if (resource === 'pick-folder' && method === 'POST') {
    return json(res, 200, { path: await pickFolder() });
  }

  return fail(res, 404, 'Unknown endpoint');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] === 'api') return await handleApi(req, res, url, parts);

    if (parts[0] === 'media') {
      const course = findCourse(parts[1]);
      if (!course) return fail(res, 404, 'Course not found');
      const abs = resolveIn(course, parts.slice(2).join('/'));
      if (!abs) return fail(res, 400, 'Invalid path');
      return await sendFile(req, res, abs, { download: url.searchParams.has('download') });
    }

    const rel = parts.length ? parts.join('/') : 'index.html';
    const abs = path.resolve(PUBLIC, rel);
    if (!abs.startsWith(PUBLIC + path.sep)) return fail(res, 400, 'Invalid path');
    return await sendFile(req, res, abs);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, e.message);
    else res.destroy();
  }
});

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const appUrl = `http://localhost:${PORT}`;
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`CourseCraft is already running. Opening ${appUrl}`);
    openBrowser(appUrl);
    setTimeout(() => process.exit(0), 500);
  } else {
    throw e;
  }
});
server.listen(PORT, HOST, () => {
  console.log(`\n  CourseCraft is running at ${appUrl}`);
  console.log('  Keep this window open while you watch. Close it (or press Ctrl+C) to stop.\n');
  openBrowser(appUrl);
});
