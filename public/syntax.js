// Small offline syntax highlighter. Good enough for reading course source code;
// it tokenizes comments, strings, numbers, keywords, types and function calls.
(function () {
  const words = s => new Set(s.split(/\s+/).filter(Boolean));

  const JAVA = words(`abstract assert boolean break byte case catch char class const continue default do double else enum
    extends final finally float for goto if implements import instanceof int interface long native new package private
    protected public return short static strictfp super switch synchronized this throw throws transient try void volatile
    while var record yield sealed permits non-sealed true false null`);
  const JS = words(`async await break case catch class const continue debugger default delete do else export extends
    finally for from function if import in instanceof let new of return static super switch this throw try typeof var
    void while with yield true false null undefined interface type enum implements private public protected readonly as`);
  const PY = words(`and as assert async await break class continue def del elif else except False finally for from global
    if import in is lambda None nonlocal not or pass raise return True try while with yield self match case`);
  const CLIKE = words(`auto break case char const continue default do double else enum extern float for goto if inline int
    long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public
    private protected virtual override new delete this namespace using template typename true false null nullptr bool
    string var let fun val func package import go defer chan map range type struct interface select fn mut impl pub use
    crate mod trait where match loop async await internal sealed readonly object is as in out`);
  const SQL = words(`select from where insert into values update set delete create table drop alter add primary key foreign
    references join left right inner outer on group by order having limit offset as and or not null is in like between
    distinct union all index view database if exists default unique count sum avg min max case when then else end asc desc`);
  const SH = words(`if then else elif fi for while do done case esac function in return export local echo set cd exit`);

  const LANGS = {
    java: { kw: JAVA, line: '//', block: true, triple: '"""', ann: true },
    js: { kw: JS, line: '//', block: true, backtick: true, ann: true },
    py: { kw: PY, line: '#', triple: true, ann: true },
    c: { kw: CLIKE, line: '//', block: true, ann: true },
    sql: { kw: SQL, line: '--', block: true, ci: true },
    sh: { kw: SH, line: '#' },
    css: { kw: new Set(), block: true, css: true },
    json: { kw: words('true false null') },
    xml: { markup: true }
  };
  const EXT = {
    java: 'java', kt: 'c', kts: 'c', scala: 'c', groovy: 'java', gradle: 'java', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
    ts: 'js', tsx: 'js', vue: 'xml', svelte: 'xml', py: 'py', rb: 'py', php: 'c', go: 'c', rs: 'c', c: 'c', h: 'c', cpp: 'c',
    hpp: 'c', cc: 'c', cs: 'c', swift: 'c', dart: 'c', html: 'xml', htm: 'xml', xml: 'xml', iml: 'xml', css: 'css', scss: 'css',
    less: 'css', json: 'json', sql: 'sql', sh: 'sh', bat: 'sh', ps1: 'sh', yml: 'sh', yaml: 'sh', toml: 'sh', ini: 'sh',
    properties: 'sh', env: 'sh', cfg: 'sh'
  };

  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const span = (cls, s) => `<span class="tk-${cls}">${esc(s)}</span>`;

  function buildRegex(lang) {
    const parts = [];
    if (lang.block) parts.push('\\/\\*[\\s\\S]*?(?:\\*\\/|$)');
    if (lang.line) parts.push(lang.line.replace(/[/]/g, '\\/') + '[^\\n]*');
    if (lang.triple) parts.push('"""[\\s\\S]*?(?:"""|$)', "'''[\\s\\S]*?(?:'''|$)");
    parts.push('"(?:[^"\\\\\\n]|\\\\.)*"?', "'(?:[^'\\\\\\n]|\\\\.)*'?");
    if (lang.backtick) parts.push('`(?:[^`\\\\]|\\\\.)*`?');
    if (lang.ann) parts.push('@[A-Za-z_][\\w.]*');
    parts.push('\\b0[xX][\\da-fA-F_]+[lL]?\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[fFdDlL]?\\b');
    if (lang.css) parts.push('#[\\da-fA-F]{3,8}\\b', '[.#][A-Za-z_-][\\w-]*');
    parts.push(lang.css ? '-?[A-Za-z_][\\w-]*' : '[A-Za-z_$][\\w$]*');
    return new RegExp(parts.join('|'), 'g');
  }

  function highlightCode(code, lang) {
    const re = buildRegex(lang);
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      const tok = m[0];
      if (!tok) { re.lastIndex++; continue; }
      out += esc(code.slice(last, m.index));
      last = m.index + tok.length;
      const c = tok[0];
      if ((lang.block && tok.startsWith('/*')) || (lang.line && tok.startsWith(lang.line))) out += span('com', tok);
      else if (c === '"' || c === "'" || c === '`') out += span('str', tok);
      else if (c === '@') out += span('ann', tok);
      else if (/\d/.test(c)) out += span('num', tok);
      else if (lang.css && (c === '#' || c === '.')) out += span(/^#[\da-fA-F]+$/.test(tok) ? 'num' : 'type', tok);
      else {
        const key = lang.ci ? tok.toLowerCase() : tok;
        const next = code.slice(last, last + 40);
        if (lang.kw.has(key)) out += span('kw', tok);
        else if (lang.css && /^\s*:/.test(next)) out += span('attr', tok);
        else if (/^\s*\(/.test(next)) out += span('fn', tok);
        else if (/^[A-Z][a-z]/.test(tok) || /^[A-Z]$/.test(tok)) out += span('type', tok);
        else if (/^[A-Z][A-Z0-9_]+$/.test(tok)) out += span('const', tok);
        else out += esc(tok);
      }
    }
    return out + esc(code.slice(last));
  }

  function highlightMarkup(code) {
    const re = /<!--[\s\S]*?(?:-->|$)|<\/?[\w:.-]+|\/?>|\s[\w:@.-]+(?==)|"[^"]*"|'[^']*'/g;
    let out = '', last = 0, m, inTag = false;
    while ((m = re.exec(code))) {
      const tok = m[0];
      out += esc(code.slice(last, m.index));
      last = m.index + tok.length;
      if (tok.startsWith('<!--')) out += span('com', tok);
      else if (tok[0] === '<') { inTag = true; out += span('kw', tok); }
      else if (tok === '>' || tok === '/>') { inTag = false; out += span('kw', tok); }
      else if (inTag && (tok[0] === '"' || tok[0] === "'")) out += span('str', tok);
      else if (inTag) out += span('attr', tok);
      else out += esc(tok);
    }
    return out + esc(code.slice(last));
  }

  window.Syntax = {
    languageFor(filename) {
      const ext = (filename.split('.').pop() || '').toLowerCase();
      return EXT[ext] || null;
    },
    highlight(code, filename) {
      const key = this.languageFor(filename);
      if (!key) return esc(code);
      const lang = LANGS[key];
      return lang.markup ? highlightMarkup(code) : highlightCode(code, lang);
    }
  };
})();
