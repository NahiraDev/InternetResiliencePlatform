/** Static portal assets. No third-party resources, no browser storage, no values rendered. */
export const portalHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IRP Local Configuration</title>
<link rel="stylesheet" href="/portal.css">
</head>
<body>
<header>
  <div>
    <h1>IRP local configuration</h1>
    <p class="muted">Runs only on this computer. Saved values are never shown again.</p>
  </div>
  <button type="button" id="logout" class="secondary" hidden>Sign out</button>
</header>
<main>
  <p id="notice" role="status" aria-live="polite" hidden></p>
  <noscript><p>JavaScript is required.</p></noscript>
  <form id="login" class="card">
    <h2>Administrator sign-in</h2>
    <label for="password">Local administrator password</label>
    <input id="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
    <p class="muted">Forgot it? Run <code>pnpm config:portal reset-admin</code> in your terminal.</p>
  </form>
  <div id="app" hidden>
    <nav id="tabs" aria-label="Configuration sections"></nav>
    <div id="panels"></div>
  </div>
</main>
<script src="/portal.js" defer></script>
</body>
</html>`;

export const portalCss = `:root{color-scheme:light dark;--bg:#f5f7f9;--card:#fff;--text:#17202a;--muted:#5a6775;--line:#d6dde4;--accent:#0b6bcb;--ok:#157a45;--bad:#b3261e;--warn:#8a5a00}
@media (prefers-color-scheme:dark){:root{--bg:#10151b;--card:#18212a;--text:#e6edf3;--muted:#9aa8b6;--line:#2c3947;--accent:#5aa9f5;--ok:#5fd093;--bad:#ff8a80;--warn:#f0c060}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
header,main{max-width:820px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px}
h1{font-size:1.35rem;margin:0}h2{font-size:1.1rem;margin:0 0 8px}
.muted{color:var(--muted);margin:4px 0}
.card,.field{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:12px}
#login{max-width:420px}
label{display:block;font-weight:600}
input{width:100%;margin:8px 0;padding:10px;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:6px}
button{font:inherit;padding:9px 16px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:var(--card);cursor:pointer}
button.secondary{background:transparent;color:var(--accent)}
button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
nav button{background:transparent;color:var(--text);border-color:var(--line)}
nav button[aria-current="page"]{border-color:var(--accent);color:var(--accent);font-weight:700}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.badge{font-size:.78rem;border:1px solid currentColor;border-radius:99px;padding:1px 9px;color:var(--muted)}
.badge.configured{color:var(--ok)}.badge.invalid,.badge.blocking{color:var(--bad)}.badge.missing{color:var(--warn)}
.error{color:var(--bad);margin:4px 0}
code{font-size:.85em}.card,.field{overflow-wrap:anywhere;min-width:0}
#notice{border:1px solid var(--accent);border-radius:8px;padding:10px 14px}
#notice.bad{border-color:var(--bad);color:var(--bad)}
ul{padding-inline-start:20px}`;

export const portalScript = `'use strict';
const SECTIONS = [['overview','Overview'],['database','Database'],['authentication','Authentication'],['email','Email'],['application','Application']];
const $ = (id) => document.getElementById(id);
let csrf = '';
let state = null;
let current = 'overview';
const views = new Map();
// Unsaved input, in memory only, so an expired session does not discard typing.
const drafts = new Map();

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const notice = (text, bad) => {
  const box = $('notice');
  box.textContent = text;
  box.className = bad ? 'bad' : '';
  box.hidden = !text;
};
const signedOut = (keepDrafts) => {
  drafts.clear();
  if (keepDrafts) {
    for (const [name, view] of views) if (view.input.value !== '') drafts.set(name, view.input.value);
  }
  csrf = '';
  state = null;
  views.clear();
  $('panels').replaceChildren();
  $('app').hidden = true;
  $('logout').hidden = true;
  $('login').hidden = false;
};
const api = async (method, url, body) => {
  const headers = {};
  if (csrf) headers['x-csrf-token'] = csrf;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({ message: 'Unexpected response.' }));
  if (response.status === 401 && url !== '/api/login') signedOut(true);
  return { ok: response.ok, data };
};

const show = (id) => {
  current = id;
  for (const button of $('tabs').children) {
    if (button.dataset.id === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const panel of $('panels').children) panel.hidden = panel.dataset.id !== id;
};

const refresh = () => {
  for (const field of state.fields) {
    const view = views.get(field.name);
    view.status.textContent = field.status;
    view.status.className = 'badge ' + field.status;
    view.error.textContent = field.problem || '';
    view.remove.hidden = field.status === 'missing';
    view.input.placeholder = field.status === 'missing' ? 'Not set' : 'Saved. Type a new value to replace it';
  }
  const overview = $('panels').firstElementChild;
  const summary = el('div', { className: 'card' },
    el('h2', { textContent: state.complete ? 'Configuration is complete' : 'Configuration is incomplete' }),
    el('p', { className: 'muted', textContent: 'Storage: ' + state.storage }));
  if (state.complete) {
    summary.append(el('p', {}, 'Stop this portal if you no longer need it, then start the API with ', el('code', { textContent: 'pnpm start:secure' }), '.'),
      el('p', { className: 'muted', textContent: 'Values are checked for format only. No connection to the database or email relay has been tested.' }));
  } else {
    summary.append(el('p', { textContent: 'The API will not start until these settings are fixed:' }),
      el('ul', {}, ...state.fields.filter((f) => state.blocking.includes(f.name)).map((f) =>
        el('li', {}, el('code', { textContent: f.name }), ' (' + f.status + '): ' + (f.problem || f.purpose)))));
  }
  const table = el('div', { className: 'card' }, el('h2', { textContent: 'Sections' }));
  for (const [id, title] of SECTIONS.slice(1)) {
    const fields = state.fields.filter((f) => f.section === id);
    const bad = fields.filter((f) => state.blocking.includes(f.name)).length;
    const open = el('button', { type: 'button', className: 'secondary', textContent: title });
    open.addEventListener('click', () => show(id));
    table.append(el('p', { className: 'row' }, open,
      el('span', { textContent: fields.filter((f) => f.status === 'configured').length + ' of ' + fields.length + ' configured' }),
      el('span', { className: 'badge ' + (bad ? 'blocking' : 'configured'), textContent: bad ? bad + ' need attention' : 'ready' })));
  }
  overview.replaceChildren(summary, table);
};

const save = async (body, saved) => {
  const { ok, data } = await api('PUT', '/api/config', body);
  if (ok) {
    for (const name of saved) views.get(name).input.value = '';
    state = { ...state, fields: data.fields, complete: data.complete, blocking: data.blocking };
    refresh();
    notice('Saved.');
    return;
  }
  for (const [name, message] of Object.entries(data.errors || {})) views.get(name).error.textContent = message;
  notice(data.message || 'Saving failed.', true);
};

const fieldView = (field) => {
  const id = 'f-' + field.name;
  const status = el('span');
  const error = el('p', { className: 'error', id: id + '-error' });
  error.setAttribute('role', 'alert');
  // No name attribute: values can never be submitted by the browser itself.
  const input = el('input', { id, type: field.sensitive ? 'password' : 'text', autocomplete: 'off', spellcheck: false });
  input.setAttribute('aria-describedby', id + '-error');
  input.dataset.field = field.name;
  const remove = el('button', { type: 'button', className: 'secondary', textContent: 'Remove saved value' });
  remove.addEventListener('click', () => {
    if (confirm('Remove the saved value of ' + field.name + '?')) void save({ remove: [field.name] }, [field.name]);
  });
  for (const hint of ['data-1p-ignore', 'data-lpignore', 'data-bwignore']) input.setAttribute(hint, 'true');
  input.value = drafts.get(field.name) || '';
  views.set(field.name, { status, error, input, remove });
  return el('div', { className: 'field' },
    el('div', { className: 'row' }, el('label', { htmlFor: id, textContent: field.label }), status,
      el('span', { className: 'badge', textContent: field.required ? 'required' : 'optional' }),
      el('span', { className: 'badge', textContent: field.sensitive ? 'secret' : 'setting' })),
    el('code', { textContent: field.name }),
    el('p', { className: 'muted', textContent: field.purpose + ' Rule: ' + field.rule }),
    input, error, remove);
};

const render = () => {
  views.clear();
  $('tabs').replaceChildren(...SECTIONS.map(([id, title]) => {
    const button = el('button', { type: 'button', textContent: title });
    button.dataset.id = id;
    button.addEventListener('click', () => { notice(''); show(id); });
    return button;
  }));
  const panels = SECTIONS.map(([id, title], index) => {
    if (id === 'overview') { const section = el('section'); section.dataset.id = id; return section; }
    const fields = state.fields.filter((f) => f.section === id);
    const next = SECTIONS[(index + 1) % SECTIONS.length];
    const skip = el('button', { type: 'button', className: 'secondary', textContent: 'Next: ' + next[1] });
    skip.addEventListener('click', () => show(next[0]));
    const form = el('form', {}, el('h2', { textContent: title }), ...fields.map(fieldView),
      el('div', { className: 'row' }, el('button', { type: 'submit', textContent: 'Save ' + title.toLowerCase() }), skip));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      notice('');
      const values = {};
      for (const field of fields) {
        const view = views.get(field.name);
        view.error.textContent = '';
        if (view.input.value !== '') values[field.name] = view.input.value;
      }
      if (!Object.keys(values).length) return notice('Type at least one new value first.', true);
      void save({ values }, Object.keys(values));
    });
    form.dataset.id = id;
    return form;
  });
  $('panels').replaceChildren(...panels);
  drafts.clear();
  refresh();
  show(current);
};

$('login').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = $('password').value;
  $('password').value = '';
  const login = await api('POST', '/api/login', { password });
  if (!login.ok) return notice(login.data.message || 'Sign-in failed.', true);
  csrf = login.data.csrfToken;
  const config = await api('GET', '/api/config');
  if (!config.ok) return notice(config.data.message || 'Could not read the configuration.', true);
  state = config.data;
  notice('');
  $('login').hidden = true;
  $('app').hidden = false;
  $('logout').hidden = false;
  render();
});

$('logout').addEventListener('click', async () => {
  await api('POST', '/api/logout', {});
  signedOut(false);
  notice('Signed out.');
});
`;
