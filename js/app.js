/* ==========================================================================
   Smart Fashion  |  app.js  |  User interface, routing and screens
   --------------------------------------------------------------------------
   How it works (useful for your defence):
   1. Routing: the URL hash (#/clients, #/orders/12 ...) decides which screen
      to draw. Each screen is a function that returns an HTML string.
   2. Buttons use data-action="..." and forms use data-form="...". One click
      listener and one submit listener (event delegation) handle all of them.
   3. Every read/write goes through DB (db.js). Permissions go through Auth.can().
   4. Emails go through Notify.send(), which enforces "only Received + Ready".
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const pad4 = n => String(n).padStart(4, '0');
  const money = n => '₦' + Number(n || 0).toLocaleString('en-NG');
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const canMoney = () => Auth.can('viewMoney');

  function daysUntil(iso) {
    const a = new Date(DB.todayISO() + 'T00:00:00'), b = new Date(iso + 'T00:00:00');
    return Math.round((b - a) / 864e5);
  }
  const fmtShort = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fmtDay = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtStamp = iso => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  /* ------------------------------------------------------------ unit (cm/in) */
  let unit = 'cm';
  try { unit = localStorage.getItem('asolink_unit') === 'in' ? 'in' : 'cm'; } catch (e) { /* ignore */ }
  const setUnit = u => { unit = u; try { localStorage.setItem('asolink_unit', u); } catch (e) { /* ignore */ } };
  const cmToUnit = v => (unit === 'in' ? Math.round(v / 2.54 * 10) / 10 : Math.round(v * 10) / 10);
  const unitToCm = v => (unit === 'in' ? Math.round(v * 2.54 * 10) / 10 : Math.round(v * 10) / 10);

  /* ------------------------------------------------------------------ toasts */
  function toast(msg, sub = '', kind = '') {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.innerHTML = `${ic(kind === 'mail' ? 'mail' : 'check')}<div>${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    const box = $('#toasts');
    while (box.children.length >= 2) box.firstChild.remove();   // keep at most 2 on screen
    el.addEventListener('click', () => el.remove());             // tap to dismiss
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === 'mail' ? 4500 : 3000);
  }

  /* ------------------------------------------------------------------ modal */
  let lastFocus = null, pendingConfirm = null;
  function openModal(title, body, opts = {}) {
    closeModal();
    lastFocus = document.activeElement;
    $('#modal-root').innerHTML = `
      <div class="modal-back" data-action="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal__head">
            <div class="row"><h2>${esc(title)}</h2>
              <button class="icon-btn" data-action="close-modal" aria-label="Close">${ic('x')}</button></div>
            <div class="ruler ruler--light"></div>
          </div>
          <div class="modal__body">${body}</div>
        </div>
      </div>`;
    const first = $('#modal-root input:not([type=hidden]), #modal-root select, #modal-root textarea');
    if (first && !opts.noFocus) first.focus();
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    pendingConfirm = null;
    if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
    lastFocus = null;
  }
  function confirmDialog({ title, message, confirmLabel = 'Confirm', onYes }) {
    openModal(title, `<p>${esc(message)}</p>
      <div class="modal__foot">
        <button class="btn btn--ghost" data-action="close-modal">Cancel</button>
        <button class="btn btn--dark" data-action="confirm-yes">${esc(confirmLabel)}</button>
      </div>`, { noFocus: true });
    pendingConfirm = onYes;
  }

  /* ------------------------------------------------------------------ form helpers */
  const setInvalid = (field, msg) => { if (!field) return; field.classList.add('is-invalid'); const e = $('.err', field); if (e) e.textContent = msg; };
  const clearErrors = form => $$('.field.is-invalid', form).forEach(f => f.classList.remove('is-invalid'));
  const fieldOf = (form, name) => { const el = form.elements[name]; return el ? el.closest('.field') : null; };
  const numOf = v => Number(String(v).replace(/[,\s₦]/g, ''));

  /* ------------------------------------------------------------------ small UI parts */
  function emptyState(title, text, btnHTML = '') {
    return `<div class="empty">
      <svg class="art" viewBox="0 0 110 70" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <rect x="6" y="22" width="98" height="20" rx="3"/><path d="M16 22v9M26 22v5M36 22v9M46 22v5M56 22v9M66 22v5M76 22v9M86 22v5M96 22v9"/>
        <path d="M8 58c20-12 30 8 50-2s30 4 42-6" stroke-dasharray="2 7"/></svg>
      <h3>${esc(title)}</h3><p>${esc(text)}</p>${btnHTML}</div>`;
  }

  function dueInfo(o) {
    if (o.order_status === 'Ready') return { cls: 'ready', icon: 'check', text: 'Ready for pickup' };
    const d = daysUntil(o.due_date);
    if (d < 0) return { cls: 'overdue', icon: 'alert', text: `Overdue by ${-d} day${-d === 1 ? '' : 's'}` };
    if (d === 0) return { cls: 'soon', icon: 'clock', text: 'Due today' };
    if (d <= 3) return { cls: 'soon', icon: 'clock', text: `Due in ${d} day${d === 1 ? '' : 's'}` };
    return { cls: 'normal', icon: 'clock', text: 'Due ' + fmtShort(o.due_date) };
  }
  const dueBadge = o => { const i = dueInfo(o); return `<span class="badge badge--${i.cls}">${ic(i.icon, 'ic--sm')}${i.text}</span>`; };

  function miniTape(status) {
    const idx = DB.STATUSES.indexOf(status);
    return `<div class="mini" aria-hidden="true">${DB.STATUSES.map((s, i) => `<i class="${i < idx ? 'on' : i === idx ? 'now' : ''}"></i>`).join('')}</div>`;
  }

  function orderCard(o) {
    const c = DB.getClient(o.client_id);
    const bal = Math.max(0, o.total_price - o.deposit_paid);
    return `<a class="row-card" href="#/orders/${o.order_id}">
      <div class="row-card__top">
        <div><div class="row-card__title">${esc(c ? c.client_name : 'Unknown client')}</div>
          <div class="muted small">${esc(o.garment_style)} &middot; #${pad4(o.order_id)}${o.group_name ? ' &middot; ' + esc(o.group_name) : ''}</div></div>
        ${dueBadge(o)}
      </div>
      ${miniTape(o.order_status)}
      <div class="row-card__meta"><span class="chip">${o.order_status}</span>
        <span class="small muted">${fmtShort(o.due_date)}</span>
        ${canMoney() ? `<span class="small muted">&middot; ${bal > 0 ? 'Balance ' + money(bal) : 'Paid in full'}</span>` : ''}
      </div></a>`;
  }

  /* ================================================================== SCREENS */

  /* ---------------------------------------------------------------- Dashboard */
  function viewDashboard() {
    const orders = DB.getOrders(), clients = DB.getClients();
    const active = orders.filter(o => o.order_status !== 'Ready');
    const counts = DB.STATUSES.map(s => orders.filter(o => o.order_status === s).length);
    const max = Math.max(1, ...counts);
    const overdue = active.filter(o => daysUntil(o.due_date) < 0);
    const soon = active.filter(o => { const d = daysUntil(o.due_date); return d >= 0 && d <= 3; });
    const week = active.filter(o => { const d = daysUntil(o.due_date); return d >= 0 && d <= 7; });
    const rush = week.length > 8;
    const outstanding = orders.reduce((s, o) => s + Math.max(0, o.total_price - o.deposit_paid), 0);
    const hr = new Date().getHours();
    const part = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';

    const attention = active.slice().sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);
    const ready = orders.filter(o => o.order_status === 'Ready');
    const meter = Math.min(100, Math.round(week.length / 8 * 100));

    return `<div class="stack view-enter">
      <section class="hero">
        <p class="eyebrow">${esc(Auth.label())}</p>
        <h1>Good ${part}.</h1>
        <p>${overdue.length || soon.length
          ? `<b>${overdue.length}</b> order${overdue.length === 1 ? ' is' : 's are'} overdue and <b>${soon.length}</b> ${soon.length === 1 ? 'is' : 'are'} due within 3 days.`
          : 'Nothing is overdue or due in the next 3 days. The workshop is in good shape.'}</p>
        <div class="rush">
          ${ic('flame')}
          <div class="rush__txt">${week.length} due in the next 7 days</div>
          <div class="rush__meter" role="img" aria-label="${week.length} of 8 festive load"><i style="width:${meter}%"></i></div>
          ${rush ? `<span class="badge">${ic('flame', 'ic--sm')}Festive season rush</span>` : `<span class="rush__txt" style="opacity:.8">Rush starts above 8</span>`}
        </div>
        <div class="hero__foot"><div class="ruler ruler--light"></div></div>
      </section>

      <section class="card" aria-label="Order pipeline">
        <div class="card__head"><h2>Order pipeline</h2><a class="btn btn--ghost btn--sm" href="#/orders">All orders ${ic('arrow', 'ic--sm')}</a></div>
        <div class="tape">
          ${DB.STATUSES.map((s, i) => `<a class="tape__seg" href="#/orders?status=${s}">
            <div class="tape__fill" data-w="${Math.round(counts[i] / max * 100)}%"></div>
            <div class="tape__stage">${String(i + 1).padStart(2, '0')} ${s}</div>
            <div class="tape__count">${counts[i]}</div>
            <div class="tape__ticks"></div><span class="tape__mark">${i * 10} cm</span></a>`).join('')}
        </div>
      </section>

      <section class="stats">
        <div class="stat"><div class="stat__label">${ic('scissors', 'ic--sm')}Active orders</div><div class="stat__value">${active.length}</div></div>
        <div class="stat stat--soon"><div class="stat__label">${ic('clock', 'ic--sm')}Due in 3 days</div><div class="stat__value">${soon.length}</div></div>
        <div class="stat stat--over"><div class="stat__label">${ic('alert', 'ic--sm')}Overdue</div><div class="stat__value">${overdue.length}</div></div>
        <div class="stat"><div class="stat__label">${ic('users', 'ic--sm')}Clients</div><div class="stat__value">${clients.length}</div></div>
        ${canMoney() ? `<div class="stat"><div class="stat__label">${ic('wallet', 'ic--sm')}Outstanding</div><div class="stat__value is-money">${money(outstanding)}</div></div>` : ''}
      </section>

      <div class="grid-2">
        <section class="card"><div class="ruler"></div>
          <div class="card__head"><h2>Needs attention</h2></div>
          <div class="list">${attention.length ? attention.map(orderCard).join('') : emptyState('All clear', 'No open orders right now.')}</div>
        </section>
        <section class="card"><div class="ruler"></div>
          <div class="card__head"><h2>Ready for pickup</h2></div>
          <div class="list">${ready.length ? ready.map(orderCard).join('') : emptyState('Nothing waiting', 'Finished orders will appear here for collection.')}</div>
        </section>
      </div>
    </div>`;
  }

  /* ------------------------------------------------------------------ Clients */
  function clientListHTML(term) {
    const t = term.trim().toLowerCase(), tNoSpace = t.replace(/\s+/g, '');
    const all = DB.getClients();
    const list = all.filter(c => !t ||
      c.client_name.toLowerCase().includes(t) ||
      c.client_email.toLowerCase().includes(t) ||
      (c.phone_number || '').replace(/\s+/g, '').includes(tNoSpace));
    if (!all.length) return emptyState('No clients yet', 'Add your first client to start keeping their measurements safe.',
      `<button class="btn btn--primary" data-action="new-client">${ic('plus')}Add client</button>`);
    if (!list.length) return emptyState('No match', `Nobody matches "${term}". Try part of a name, phone number or email.`);
    return `<div class="list list--cols">${list.map(c => {
      const open = DB.getOrdersByClient(c.client_id).filter(o => o.order_status !== 'Ready').length;
      return `<a class="row-card" href="#/clients/${c.client_id}"><div class="client-row">
        <div class="avatar">${esc(initials(c.client_name))}</div>
        <div><div class="t">${esc(c.client_name)}</div><div class="s">${esc(c.phone_number || c.client_email)}</div></div>
        ${open ? `<span class="chip chip--solid">${open} open</span>` : ''}
        ${ic('chev')}</div></a>`;
    }).join('')}</div>`;
  }

  function viewClients() {
    return `<div class="stack view-enter">
      <header class="page-head"><div><p class="eyebrow">Directory</p><h1>Clients</h1></div>
        <div class="actions"><button class="btn btn--primary" data-action="new-client">${ic('plus')}Add client</button></div></header>
      <div class="search">${ic('search')}<input class="input" id="client-search" data-input="client-search" type="search" placeholder="Search by name, phone or email" aria-label="Search clients" autocomplete="off"></div>
      <div id="client-list">${clientListHTML('')}</div></div>`;
  }

  function metricsHTML(m) {
    const keys = Object.keys(m.metrics);
    return `<div class="metrics">${keys.map(k => `<div class="metric"><span>${esc((DB.FIELDS[k] || { label: k }).label)}</span><b>${cmToUnit(m.metrics[k])} ${unit}</b></div>`).join('')}</div>`;
  }

  function viewClientDetail(id) {
    const c = DB.getClient(id);
    if (!c) return emptyState('Client not found', 'This client may have been deleted.', `<a class="btn btn--primary" href="#/clients">Back to clients</a>`);
    const ms = DB.getMeasurements(id), orders = DB.getOrdersByClient(id);
    const cats = Object.keys(DB.GARMENTS).filter(cat => ms.some(m => m.garment_category === cat));

    const history = cats.length ? cats.map(cat => {
      const recs = ms.filter(m => m.garment_category === cat);
      return `<div class="stack"><h3>${esc(cat)}</h3>${recs.map((m, i) => `
        <div class="card ${i === 0 ? 'mcard--current' : 'mcard--old'}">
          <div class="card__head" style="margin:0">
            <div><span class="small muted">Recorded ${fmtDate(m.updated_at)}</span></div>
            ${i === 0 ? `<span class="badge badge--current">${ic('check', 'ic--sm')}Current</span>` : `<span class="chip">Older version</span>`}
          </div>
          ${metricsHTML(m)}
          <div class="modal__foot" style="justify-content:flex-start;margin-top:14px">
            ${i === 0 ? `<a class="btn btn--primary btn--sm" href="#/orders/new?client=${c.client_id}&garment=${encodeURIComponent(cat)}">${ic('undo', 'ic--sm')}Reuse for a new order</a>` : ''}
            <button class="btn btn--ghost btn--sm" data-action="new-measure" data-client="${c.client_id}" data-cat="${esc(cat)}" data-from="${m.measurement_id}">${ic('edit', 'ic--sm')}Update from this</button>
            ${Auth.can('delete') ? `<button class="btn btn--danger btn--sm" data-action="delete-measure" data-id="${m.measurement_id}">${ic('trash', 'ic--sm')}Delete</button>` : ''}
          </div></div>`).join('')}</div>`;
    }).join('') : emptyState('No measurements yet', 'Record this client\'s measurements once and reuse them for every repeat order.',
      `<button class="btn btn--primary" data-action="new-measure" data-client="${c.client_id}">${ic('ruler')}Record measurements</button>`);

    return `<div class="stack view-enter">
      <a class="btn btn--ghost btn--sm" style="justify-self:start" href="#/clients">${ic('back', 'ic--sm')}Clients</a>
      <section class="card"><div class="ruler"></div>
        <div class="client-row" style="align-items:flex-start">
          <div class="avatar" style="width:56px;height:56px;font-size:1.2rem">${esc(initials(c.client_name))}</div>
          <div><h1 style="font-size:1.7rem">${esc(c.client_name)}</h1><p class="muted small">Client since ${fmtDate(c.created_at)}</p></div>
        </div>
        <dl class="kv" style="margin-top:16px">
          <div><dt>Email</dt><dd>${esc(c.client_email)}</dd></div>
          <div><dt>Phone</dt><dd>${esc(c.phone_number || 'Not recorded')}</dd></div>
          <div><dt>Orders</dt><dd>${orders.length}</dd></div>
          <div><dt>Measurement sets</dt><dd>${ms.length}</dd></div>
        </dl>
        <div class="modal__foot" style="justify-content:flex-start">
          <button class="btn btn--ghost btn--sm" data-action="edit-client" data-id="${c.client_id}">${ic('edit', 'ic--sm')}Edit</button>
          ${Auth.can('delete') ? `<button class="btn btn--danger btn--sm" data-action="delete-client" data-id="${c.client_id}">${ic('trash', 'ic--sm')}Delete client</button>` : ''}
        </div>
      </section>

      <section class="stack">
        <div class="page-head" style="margin:0"><h2>Measurements</h2>
          <div class="actions"><button class="btn btn--primary btn--sm" data-action="new-measure" data-client="${c.client_id}">${ic('plus', 'ic--sm')}Record</button></div></div>
        ${history}
      </section>

      <section class="stack">
        <div class="page-head" style="margin:0"><h2>Orders</h2>
          <div class="actions"><a class="btn btn--primary btn--sm" href="#/orders/new?client=${c.client_id}">${ic('plus', 'ic--sm')}New order</a></div></div>
        ${orders.length ? `<div class="list list--cols">${orders.map(orderCard).join('')}</div>` : emptyState('No orders yet', 'Create the first order for this client.')}
      </section></div>`;
  }

  /* --- account modals */
  function openPasswordModal() {
    openModal('Change password', `<form data-form="password" novalidate><div class="form-grid">
      ${pwField('p-cur', 'current', 'Current password')}
      ${pwField('p-new', 'password', 'New password')}
      <p class="hint muted small" style="margin:-6px 0 0">At least 8 characters, with upper and lower case letters and a number.</p>
      ${pwField('p-new2', 'confirm', 'Confirm new password')}
      </div><div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn--primary">Update password</button></div></form>`);
  }
  function openTeamModal() {
    openModal('Add an apprentice', `<form data-form="team" novalidate><div class="form-grid">
      <div class="field"><label for="t-name">Full name</label><input class="input" id="t-name" name="name" autocomplete="off"><small class="err"></small></div>
      <div class="field"><label for="t-email">Email address</label><input class="input" id="t-email" name="email" type="email" inputmode="email" autocomplete="off"><small class="err"></small></div>
      ${pwField('t-pw', 'password', 'Starting password')}
      <p class="hint muted small" style="margin:-6px 0 0">Apprentices can add clients, record measurements and move orders along. They cannot see prices or revenue, or delete records.</p>
      </div><div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button>
      <button class="btn btn--primary">${ic('userplus', 'ic--sm')}Create account</button></div></form>`);
  }

  /* --- client add/edit modal */
  function openClientModal(id) {
    const c = id ? DB.getClient(id) : null;
    openModal(c ? 'Edit client' : 'Add client', `
      <form data-form="client" novalidate>
        <input type="hidden" name="id" value="${c ? c.client_id : ''}">
        <div class="form-grid">
          <div class="field"><label for="f-name">Full name</label><input class="input" id="f-name" name="client_name" value="${esc(c ? c.client_name : '')}" autocomplete="off"><small class="err"></small></div>
          <div class="field"><label for="f-email">Email (order updates are sent here)</label><input class="input" id="f-email" name="client_email" type="email" inputmode="email" value="${esc(c ? c.client_email : '')}" autocomplete="off"><small class="err"></small></div>
          <div class="field"><label for="f-phone">Phone (optional)</label><input class="input" id="f-phone" name="phone_number" type="tel" inputmode="tel" value="${esc(c ? c.phone_number : '')}" autocomplete="off"><small class="err"></small></div>
        </div>
        <div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button>
          <button class="btn btn--primary">${c ? 'Save changes' : 'Add client'}</button></div>
      </form>`);
  }

  /* --- measurement modal (fields change with the garment category) */
  let mState = null;

  function measureFieldsHTML(cat, valuesCm) {
    return DB.GARMENTS[cat].map(k => {
      const f = DB.FIELDS[k], v = valuesCm[k] != null && valuesCm[k] !== '' ? cmToUnit(valuesCm[k]) : '';
      return `<div class="field"><label for="m-${k}">${esc(f.label)}</label>
        <div class="input-unit"><input class="input" id="m-${k}" name="${k}" inputmode="decimal" autocomplete="off" value="${v}" placeholder="${cmToUnit(f.min)} to ${cmToUnit(f.max)}"><em>${unit}</em></div>
        <small class="err"></small></div>`;
    }).join('');
  }

  // Read the typed numbers and convert to cm (using the unit that was on screen).
  function readMeasureCm(form) {
    const out = {};
    DB.GARMENTS[mState.cat].forEach(k => {
      const el = form.elements[k]; if (!el) return;
      const n = parseFloat(String(el.value).replace(',', '.'));
      if (!isNaN(n)) out[k] = mState.unit === 'in' ? n * 2.54 : n;
    });
    return out;
  }

  function openMeasureModal(clientId, cat, fromId) {
    const c = DB.getClient(clientId); if (!c) return;
    let from = null;
    if (fromId) from = DB.getMeasurements(clientId).find(m => m.measurement_id === Number(fromId)) || null;
    else if (cat) from = DB.getLatestMeasurement(clientId, cat);
    mState = { clientId: Number(clientId), cat: cat || Object.keys(DB.GARMENTS)[0], unit };
    const cats = Object.keys(DB.GARMENTS);
    openModal(`Measurements: ${c.client_name}`, `
      <form data-form="measure" novalidate>
        <div class="form-grid">
          <div class="field"><label for="m-cat">Garment category</label>
            <select class="select" id="m-cat" name="category" data-change="measure-cat">${cats.map(g => `<option ${g === mState.cat ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
            <div class="seg" role="group" aria-label="Unit">
              <button type="button" data-action="measure-unit" data-unit="cm" aria-pressed="${unit === 'cm'}">cm</button>
              <button type="button" data-action="measure-unit" data-unit="in" aria-pressed="${unit === 'in'}">inches</button></div>
            <button type="button" class="btn btn--ghost btn--sm" data-action="measure-copy" id="copy-last">${ic('undo', 'ic--sm')}Copy last set</button>
          </div>
          <div class="form-grid form-grid--m" id="measure-fields">${measureFieldsHTML(mState.cat, from && from.garment_category === mState.cat ? from.metrics : {})}</div>
        </div>
        <p class="muted small" style="margin-top:10px">Saving adds a new version. The newest version is marked Current and older ones stay in the history.</p>
        <div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button>
          <button class="btn btn--primary">Save measurements</button></div>
      </form>`);
    updateCopyButton();
  }
  function updateCopyButton() {
    const b = $('#copy-last'); if (!b || !mState) return;
    b.hidden = !DB.getLatestMeasurement(mState.clientId, mState.cat);
  }

  /* ------------------------------------------------------------------- Orders */
  let oFilter = { status: 'All', term: '', group: null };

  function orderListHTML() {
    let list = DB.getOrders();
    if (oFilter.group) list = list.filter(o => o.group_id === oFilter.group);
    if (oFilter.status !== 'All') list = list.filter(o => o.order_status === oFilter.status);
    const t = oFilter.term.trim().toLowerCase();
    if (t) list = list.filter(o => {
      const c = DB.getClient(o.client_id);
      return (c && c.client_name.toLowerCase().includes(t)) || o.garment_style.toLowerCase().includes(t) || (o.group_name || '').toLowerCase().includes(t);
    });
    if (!DB.getOrders().length) return emptyState('No orders yet', 'Create an order and it will move through Received, Cutting, Sewing and Ready.',
      `<a class="btn btn--primary" href="#/orders/new">${ic('plus')}New order</a>`);
    if (!list.length) return emptyState('No orders here', 'Nothing matches this filter. Try another stage or clear the search.');
    return `<div class="list list--cols">${list.map(orderCard).join('')}</div>`;
  }
  function filtersHTML() {
    const all = DB.getOrders();
    return ['All', ...DB.STATUSES].map(s => {
      const n = s === 'All' ? all.length : all.filter(o => o.order_status === s).length;
      return `<button class="filter" data-action="filter-status" data-status="${s}" aria-pressed="${oFilter.status === s}">${s} (${n})</button>`;
    }).join('');
  }

  function viewOrders(q) {
    oFilter = { status: DB.STATUSES.includes(q.get('status')) ? q.get('status') : 'All', term: '', group: q.get('group') ? Number(q.get('group')) : null };
    const grp = oFilter.group ? DB.getOrdersByGroup(oFilter.group)[0] : null;
    return `<div class="stack view-enter">
      <header class="page-head"><div><p class="eyebrow">Workshop</p><h1>Orders</h1></div>
        <div class="actions"><a class="btn btn--primary" href="#/orders/new">${ic('plus')}New order</a></div></header>
      ${grp ? `<div class="card" style="padding:12px 16px"><b>${esc(grp.group_name)}</b> <span class="muted small">&middot; Aso-Ebi group, ${esc(grp.fabric)}</span> <a class="small" href="#/orders" style="margin-left:8px">Show all orders</a></div>` : ''}
      <div class="search">${ic('search')}<input class="input" data-input="order-search" type="search" placeholder="Search by client, garment or event" aria-label="Search orders" autocomplete="off"></div>
      <div class="filters" id="order-filters">${filtersHTML()}</div>
      <div id="order-list">${orderListHTML()}</div></div>`;
  }

  /* --- new order (single or Aso-Ebi group) */
  function viewNewOrder(q) {
    const clients = DB.getClients();
    if (!clients.length) return emptyState('Add a client first', 'Orders belong to a client, so create one before taking an order.',
      `<button class="btn btn--primary" data-action="new-client">${ic('plus')}Add client</button>`);
    const preClient = Number(q.get('client')) || '';
    const preGarment = q.get('garment') || '';
    const garments = Object.keys(DB.GARMENTS);
    return `<div class="stack view-enter">
      <a class="btn btn--ghost btn--sm" style="justify-self:start" href="#/orders">${ic('back', 'ic--sm')}Orders</a>
      <header class="page-head"><div><p class="eyebrow">New</p><h1>Create order</h1></div></header>
      <form class="card" data-form="order" novalidate><div class="ruler"></div>
        <div class="form-grid">
          <label class="check-row"><input type="checkbox" name="group" data-change="order-mode">
            <span><b>Aso-Ebi group order</b><br><span class="muted small">One event, several clients, same fabric</span></span></label>

          <div class="field" id="single-client"><label for="o-client">Client</label>
            <select class="select" id="o-client" name="client_id" data-change="order-hint">
              <option value="">Choose a client</option>${clients.map(c => `<option value="${c.client_id}" ${c.client_id === preClient ? 'selected' : ''}>${esc(c.client_name)}</option>`).join('')}</select>
            <small class="err"></small></div>

          <div id="group-block" hidden class="form-grid">
            <div class="field"><label for="o-event">Event name</label><input class="input" id="o-event" name="group_name" placeholder="e.g. Okafor Wedding" autocomplete="off"><small class="err"></small></div>
            <div class="field" id="group-clients"><span>Clients in this group (choose at least 2)</span>
              <div class="form-grid" style="gap:8px">${clients.map(c => `<label class="check-row"><input type="checkbox" name="gclient" value="${c.client_id}" data-change="order-hint"><span>${esc(c.client_name)}</span></label>`).join('')}</div>
              <small class="err"></small></div>
          </div>

          <div class="form-grid form-grid--2">
            <div class="field"><label for="o-garment">Garment style</label>
              <select class="select" id="o-garment" name="garment_style" data-change="order-hint"><option value="">Choose a garment</option>
                ${garments.map(g => `<option ${g === preGarment ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select><small class="err"></small></div>
            <div class="field"><label for="o-due">Due date</label><input class="input" id="o-due" name="due_date" type="date" min="${DB.todayISO()}" value="${DB.offsetISO(14)}"><small class="err"></small></div>
          </div>

          <div class="field"><label for="o-fabric" id="fabric-label">Fabric (optional)</label><input class="input" id="o-fabric" name="fabric" placeholder="e.g. Royal blue Ankara" autocomplete="off"><small class="err"></small></div>

          <div id="measure-hint" class="card" style="padding:14px;box-shadow:none;background:var(--blue-50)" aria-live="polite"></div>

          ${canMoney() ? `<div class="form-grid form-grid--2">
            <div class="field"><label for="o-price" id="price-label">Total price</label><div class="input-unit"><input class="input" id="o-price" name="total_price" inputmode="numeric" placeholder="0" autocomplete="off"><em>₦</em></div><small class="err"></small></div>
            <div class="field"><label for="o-dep" id="dep-label">Deposit paid</label><div class="input-unit"><input class="input" id="o-dep" name="deposit_paid" inputmode="numeric" placeholder="0" autocomplete="off"><em>₦</em></div><small class="err"></small></div>
          </div>` : `<p class="muted small">${ic('lock', 'ic--sm')} Prices and deposits are entered by the Master Tailor.</p>`}

          <div class="field"><label for="o-notes">Style notes (optional)</label><textarea class="textarea" id="o-notes" name="notes" placeholder="Embroidery, fit preferences, special requests"></textarea></div>
        </div>
        <div class="modal__foot"><a class="btn btn--ghost" href="#/orders">Cancel</a>
          <button class="btn btn--primary">${ic('mail', 'ic--sm')}Create order and email confirmation</button></div>
      </form></div>`;
  }

  // Tells the tailor whether measurements already exist for this garment ("reuse last measurements").
  function updateMeasureHint() {
    const form = $('form[data-form="order"]'); const box = $('#measure-hint'); if (!form || !box) return;
    const garment = form.elements.garment_style.value, group = form.elements.group.checked;
    $('#single-client').hidden = group; $('#group-block').hidden = !group;
    $('#fabric-label').textContent = group ? 'Fabric (same for everyone)' : 'Fabric (optional)';
    const pl = $('#price-label'), dl = $('#dep-label');
    if (pl) pl.textContent = group ? 'Price per piece' : 'Total price';
    if (dl) dl.textContent = group ? 'Deposit per piece' : 'Deposit paid';
    if (!garment) { box.innerHTML = `<span class="muted small">${ic('ruler', 'ic--sm')} Pick a garment to see whether measurements are on file.</span>`; return; }

    if (!group) {
      const cid = form.elements.client_id.value; if (!cid) { box.innerHTML = `<span class="muted small">${ic('ruler', 'ic--sm')} Choose a client to check their ${esc(garment)} measurements.</span>`; return; }
      const m = DB.getLatestMeasurement(cid, garment), c = DB.getClient(cid);
      box.innerHTML = m
        ? `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>${ic('check', 'ic--sm')} <b>Reusing ${esc(c.client_name.split(' ')[0])}'s current ${esc(garment)} measurements</b><br><span class="small muted">Recorded ${fmtDate(m.updated_at)}. No need to measure again.</span></span>
           <button type="button" class="btn btn--ghost btn--sm" data-action="new-measure" data-client="${cid}" data-cat="${esc(garment)}">Update</button></div>`
        : `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>${ic('alert', 'ic--sm')} <b>No ${esc(garment)} measurements on file yet</b><br><span class="small muted">You can still create the order and measure later.</span></span>
           <button type="button" class="btn btn--primary btn--sm" data-action="new-measure" data-client="${cid}" data-cat="${esc(garment)}">Record now</button></div>`;
    } else {
      const ids = $$('input[name="gclient"]:checked', form).map(i => Number(i.value));
      if (!ids.length) { box.innerHTML = `<span class="muted small">${ic('ruler', 'ic--sm')} Tick the clients to check their measurements.</span>`; return; }
      const missing = ids.filter(id => !DB.getLatestMeasurement(id, garment)).map(id => DB.getClient(id).client_name);
      box.innerHTML = missing.length
        ? `${ic('alert', 'ic--sm')} <b>${ids.length - missing.length} of ${ids.length} have ${esc(garment)} measurements.</b><br><span class="small muted">Missing: ${esc(missing.join(', '))}</span>`
        : `${ic('check', 'ic--sm')} <b>All ${ids.length} clients have current ${esc(garment)} measurements on file.</b>`;
    }
  }

  /* --- order detail */
  function viewOrderDetail(id) {
    const o = DB.getOrder(id);
    if (!o) return emptyState('Order not found', 'It may have been deleted.', `<a class="btn btn--primary" href="#/orders">Back to orders</a>`);
    const c = DB.getClient(o.client_id);
    const idx = DB.STATUSES.indexOf(o.order_status), next = DB.STATUSES[idx + 1];
    const m = DB.getLatestMeasurement(o.client_id, o.garment_style);
    const mails = DB.getNotificationsByOrder(o.order_id);
    const bal = Math.max(0, o.total_price - o.deposit_paid);
    const pct = o.total_price > 0 ? Math.min(100, Math.round(o.deposit_paid / o.total_price * 100)) : 0;
    const group = o.group_id ? DB.getOrdersByGroup(o.group_id) : [];

    return `<div class="stack view-enter">
      <a class="btn btn--ghost btn--sm" style="justify-self:start" href="#/orders">${ic('back', 'ic--sm')}Orders</a>
      <header class="page-head"><div><p class="eyebrow">Order #${pad4(o.order_id)}</p><h1>${esc(o.garment_style)}</h1>
        <p class="muted">for <a href="#/clients/${c ? c.client_id : ''}">${esc(c ? c.client_name : 'Unknown')}</a></p></div>${dueBadge(o)}</header>

      <section class="card"><div class="ruler"></div>
        <div class="card__head"><h2>Progress</h2><span class="chip chip--solid">${o.order_status}</span></div>
        <div class="stepper" role="list" aria-label="Order stages">
          ${DB.STATUSES.map((s, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'now' : ''}" role="listitem" ${i === idx ? 'aria-current="step"' : ''}>
            <div class="step__n">${i < idx ? ic('check', 'ic--sm') : '0' + (i + 1)}</div><div class="step__t">${s}</div><div class="step__ticks"></div></div>`).join('')}
        </div>
        <div class="modal__foot" style="justify-content:flex-start;align-items:center">
          ${next ? `<button class="btn btn--primary" data-action="set-status" data-id="${o.order_id}" data-status="${next}">Move to ${next} ${ic('arrow', 'ic--sm')}</button>` : `<span class="badge badge--ready">${ic('check', 'ic--sm')}Final stage reached</span>`}
          ${idx > 0 ? `<button class="btn btn--ghost" data-action="step-back" data-id="${o.order_id}">${ic('undo', 'ic--sm')}Step back</button>` : ''}
        </div>
        <p class="small muted" style="margin-top:10px">${next
          ? (Notify.shouldEmail(next) ? `${ic('mail', 'ic--sm')} Moving to ${next} will email ${esc(c ? c.client_name.split(' ')[0] : 'the client')} a pickup alert.` : `${ic('mail', 'ic--sm')} No email is sent at the ${next} stage.`)
          : 'The pickup alert has been sent.'}</p>
      </section>

      <div class="grid-2">
        <section class="card"><div class="ruler"></div><div class="card__head"><h2>Details</h2>
          <button class="btn btn--ghost btn--sm" data-action="edit-order" data-id="${o.order_id}">${ic('edit', 'ic--sm')}Edit</button></div>
          <dl class="kv" style="grid-template-columns:repeat(2,1fr)">
            <div><dt>Due date</dt><dd>${fmtDay(o.due_date)}</dd></div>
            <div><dt>Created</dt><dd>${fmtDate(o.created_at)}</dd></div>
            <div><dt>Fabric</dt><dd>${esc(o.fabric || 'Not recorded')}</dd></div>
            <div><dt>Client email</dt><dd>${esc(c ? c.client_email : '')}</dd></div>
          </dl>
          ${o.notes ? `<p style="margin-top:14px"><span class="eyebrow">Style notes</span><br>${esc(o.notes)}</p>` : ''}
          ${o.group_id ? `<p style="margin-top:14px"><span class="chip">${ic('users', 'ic--sm')}${esc(o.group_name)}</span> <a class="small" href="#/orders?group=${o.group_id}">See all ${group.length} orders in this group</a></p>` : ''}
          <h3 style="margin-top:18px">Measurements</h3>
          ${m ? `<p class="small muted">Current ${esc(o.garment_style)} set, recorded ${fmtDate(m.updated_at)}</p>${metricsHTML(m)}`
              : `<p class="muted small" style="margin-top:6px">No ${esc(o.garment_style)} measurements on file.</p>
                 <button class="btn btn--primary btn--sm" style="margin-top:10px" data-action="new-measure" data-client="${o.client_id}" data-cat="${esc(o.garment_style)}">Record now</button>`}
        </section>

        <div class="stack">
          ${canMoney() ? `<section class="card"><div class="ruler"></div><div class="card__head"><h2>Payment</h2></div>
            <dl class="kv" style="grid-template-columns:repeat(3,1fr)">
              <div><dt>Total</dt><dd class="num">${o.total_price ? money(o.total_price) : 'Not set'}</dd></div>
              <div><dt>Paid</dt><dd class="num">${money(o.deposit_paid)}</dd></div>
              <div><dt>Balance</dt><dd class="num">${money(bal)}</dd></div></dl>
            <div class="mini" style="grid-template-columns:1fr;margin-top:14px" aria-label="${pct}% paid"><i style="height:12px;background:linear-gradient(90deg,var(--cobalt) ${pct}%,var(--blue-100) ${pct}%)"></i></div>
            <div class="modal__foot" style="justify-content:flex-start">
              <button class="btn btn--primary btn--sm" data-action="record-payment" data-id="${o.order_id}" ${bal <= 0 ? 'disabled' : ''}>${ic('wallet', 'ic--sm')}Record payment</button>
              <button class="btn btn--ghost btn--sm" data-action="receipt" data-id="${o.order_id}">${ic('print', 'ic--sm')}Receipt</button></div>
          </section>` : `<section class="card"><p class="muted small">${ic('lock', 'ic--sm')} Payment details are visible to the Master Tailor only.</p></section>`}

          <section class="card"><div class="ruler"></div><div class="card__head"><h2>Emails sent</h2><a class="small" href="#/outbox">Outbox</a></div>
            ${mails.length ? `<div class="list">${mails.map(n => `<div><span class="chip">${n.type === 'confirmation' ? 'Order confirmation' : 'Pickup alert'}</span> <span class="small muted">${fmtStamp(n.sent_at)}</span><div class="small" style="margin-top:4px">${esc(n.subject)}</div></div>`).join('')}</div>`
              : `<p class="muted small">No emails yet.</p>`}
          </section>

          ${Auth.can('delete') ? `<button class="btn btn--danger" data-action="delete-order" data-id="${o.order_id}">${ic('trash', 'ic--sm')}Delete this order</button>` : ''}
        </div>
      </div></div>`;
  }

  function receiptHTML(o) {
    const c = DB.getClient(o.client_id), bal = Math.max(0, o.total_price - o.deposit_paid);
    return `<div class="receipt">
      <div class="receipt__head">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding-bottom:12px">
          <span class="brand"><svg class="brand__mark" viewBox="0 0 48 48" style="width:34px;height:34px"><use href="#logo-mark"/></svg><span class="brand__name">Smart <b>Fashion</b></span></span>
          <span style="text-align:right"><b style="font-family:var(--font-display);font-size:1.2rem">Receipt</b><br><span class="small">No. R-${pad4(o.order_id)}</span></span></div>
        <div class="ruler ruler--light"></div></div>
      <div class="receipt__body">
        <p class="small muted">${fmtDate(new Date().toISOString())}</p>
        <h3 style="margin:6px 0 2px">${esc(c ? c.client_name : '')}</h3>
        <p class="small muted">${esc(o.garment_style)} &middot; Order #${pad4(o.order_id)} &middot; Due ${fmtDay(o.due_date)}</p>
        <table style="margin-top:12px"><tbody>
          <tr><td>Total price</td><td>${money(o.total_price)}</td></tr>
          <tr><td>Paid to date</td><td>${money(o.deposit_paid)}</td></tr>
          <tr class="total"><td><b>Balance due</b></td><td>${money(bal)}</td></tr></tbody></table>
        <p class="small muted" style="margin-top:14px">Thank you for choosing us. Please bring this receipt when you collect your garment.</p>
      </div></div>`;
  }

  /* ------------------------------------------------------------------- Outbox */
  const MAIL_STATUS = { sending: ['Sending…', 'clock'], sent: ['Delivered', 'check'], failed: ['Failed', 'alert'], demo: ['Saved only', 'mail'] };
  function mailStatus(n) { const [t, i] = MAIL_STATUS[n.status] || MAIL_STATUS.demo; return `<span class="chip mail-st mail-st--${n.status || 'demo'}">${ic(i, 'ic--sm')}${t}</span>`; }

  function viewOutbox() {
    const list = DB.getNotifications();
    return `<div class="stack view-enter">
      <header class="page-head"><div><p class="eyebrow">${Mailer.isLive() ? 'Live email' : 'Demo email'}</p><h1>Outbox</h1></div></header>
      <div class="card" style="padding:14px 16px"><p class="small">${ic('mail', 'ic--sm')} Emails are sent only when an order is <b>Received</b> and when it is <b>Ready</b>. Cutting and Sewing never send email. ${Mailer.isLive() ? 'Each one is delivered to the client\'s real address and logged here.' : 'Email is not connected, so they are saved here instead of being delivered.'}</p></div>
      ${list.length ? `<div class="list">${list.map(n => {
        const o = DB.getOrder(n.order_id);
        return `<details class="mail"><summary>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip ${n.type === 'pickup' ? 'chip--solid' : ''}">${n.type === 'confirmation' ? 'Order confirmation' : 'Pickup alert'}</span>${mailStatus(n)}<span class="small muted">${fmtStamp(n.sent_at)}</span></div>
          <div class="mail__subject">${esc(n.subject)}</div><div class="small muted">To ${esc(n.to)}</div></summary>
          <div class="mail__body"><div class="ruler"></div>${n.status === 'failed' ? `<div class="notice" style="margin:0 0 12px"><span>${ic('alert', 'ic--sm')} Not delivered: ${esc(n.error || 'unknown error')}</span><button class="btn btn--sm btn--primary" data-action="retry-mail" data-id="${n.id}">Retry</button></div>` : ''}${esc(n.body)}${o ? `\n\n<a href="#/orders/${o.order_id}">Open order #${pad4(o.order_id)}</a>` : ''}</div></details>`;
      }).join('')}</div>` : emptyState('Outbox is empty', 'Confirmation and pickup emails will appear here as orders are created and finished.')}
    </div>`;
  }

  /* ----------------------------------------------------------------- Settings */
  function viewSettings() {
    const master = Auth.can('backup');
    return `<div class="stack view-enter">
      <header class="page-head"><div><p class="eyebrow">Workshop</p><h1>Settings</h1></div></header>
      <section class="card"><div class="ruler"></div><h2 style="margin-bottom:6px">Your account</h2>
        <p style="margin-bottom:2px"><b>${esc(Auth.user().name)}</b> <span class="chip">${esc(Auth.label())}</span></p>
        <p class="muted small" style="margin-bottom:12px">${esc(Auth.user().email)}</p>
        <button class="btn btn--ghost" data-action="change-password">${ic('key', 'ic--sm')}Change password</button></section>

      ${Auth.can('team') ? `<section class="card"><div class="ruler"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><h2>Team access</h2>
          <button class="btn btn--primary btn--sm" data-action="team-add">${ic('userplus', 'ic--sm')}Add apprentice</button></div>
        <p class="muted small" style="margin-bottom:12px">You decide who can sign in and what they can see.</p>
        <div class="list">${Auth.listUsers().map(u => `<div class="row-card"><div class="client-row"><div class="avatar">${esc(initials(u.name))}</div>
          <div><div class="t">${esc(u.name)}</div><div class="s">${esc(u.email)} &middot; ${esc(Auth.ROLES[u.role].label)}</div></div>
          ${u.email !== Auth.user().email ? `<button class="btn btn--danger btn--sm" data-action="team-remove" data-email="${esc(u.email)}" data-name="${esc(u.name)}">${ic('trash', 'ic--sm')}Remove</button>` : '<span class="chip chip--solid">You</span>'}</div></div>`).join('')}</div></section>` : ''}

      ${Auth.can('team') ? `<section class="card"><div class="ruler"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px"><h2>Email delivery</h2>
          <span class="chip ${Mailer.isLive() ? 'chip--solid' : ''}">${Mailer.isLive() ? 'Live' : 'Demo mode'}</span></div>
        ${Mailer.isLive()
          ? `<p class="muted small" style="margin-bottom:12px">Order confirmations, pickup alerts and login codes are sent to real inboxes. Demo clients with made-up addresses are skipped.</p>
             <button class="btn btn--ghost" data-action="test-mail">${ic('mail', 'ic--sm')}Send a test email to ${esc(Auth.user().email)}</button>`
          : `<p class="muted small">Nothing is being sent yet. Login codes appear on screen and client emails are only saved in the Outbox. To switch on real email, add your free EmailJS keys to <b>js/config.js</b> (steps are in the README).</p>`}
      </section>` : ''}

      <section class="card"><div class="ruler"></div><h2 style="margin-bottom:6px">Measurement unit</h2>
        <p class="muted small" style="margin-bottom:12px">Measurements are stored in centimetres and shown in the unit you choose.</p>
        <div class="seg" role="group" aria-label="Unit"><button data-action="set-unit" data-unit="cm" aria-pressed="${unit === 'cm'}">Centimetres</button><button data-action="set-unit" data-unit="in" aria-pressed="${unit === 'in'}">Inches</button></div></section>

      ${master ? `<section class="card"><div class="ruler"></div><h2 style="margin-bottom:6px">Backup</h2>
        <p class="muted small" style="margin-bottom:12px">Everything lives in this browser. Export a file to keep a safe copy or to move to another device, then import it there.</p>
        <div class="modal__foot" style="justify-content:flex-start;margin:0">
          <button class="btn btn--primary" data-action="export">${ic('download', 'ic--sm')}Export backup</button>
          <button class="btn btn--ghost" data-action="import-click">${ic('upload', 'ic--sm')}Import backup</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden></div></section>
        <section class="card"><div class="ruler"></div><h2 style="margin-bottom:6px">Demo data</h2>
        <p class="muted small" style="margin-bottom:12px">Restore the 6 sample clients and 8 sample orders. This replaces everything currently stored.</p>
        <button class="btn btn--danger" data-action="reset-demo">${ic('reset', 'ic--sm')}Reset demo data</button></section>`
      : `<section class="card"><p class="muted small">${ic('lock', 'ic--sm')} Backup, import and reset are available to the Master Tailor.</p></section>`}

      <section class="card"><div class="ruler"></div><h2 style="margin-bottom:6px">About Smart Fashion</h2>
        <p class="muted small">A digital record system for small-scale tailors: client profiles, garment-specific measurements, a four-stage order pipeline, deposits, and automatic emails only at Received and Ready. Works offline once loaded.</p></section>
    </div>`;
  }

  /* ================================================================== LOGIN */
  // Steps: role -> creds (email + password) -> mfa (6-digit code). Side path: forgot -> reset.
  let loginStep = 'role', loginMode = 'signin', loginRole = '', loginCode = '', loginMail = '', loginEmail = '', loginName = '', loginNotice = '', loginNew = false, lastCodeAt = 0;

  const ROLE_UI = {
    master: { icon: 'scissors', pitch: 'Run the whole workshop', points: ['Prices, deposits and revenue', 'Receipts and backups', 'Add and remove team members', 'Delete records'] },
    apprentice: { icon: 'ruler', pitch: 'Do the daily work', points: ['Add clients and take measurements', 'Create orders and move them along', 'No prices or revenue shown', 'Cannot delete records'] }
  };

  const pwField = (id, name, label, extra = '') => `<div class="field"><label for="${id}">${label}</label>
    <div class="pw"><input class="input" id="${id}" name="${name}" type="password" autocomplete="${name === 'password' ? 'current-password' : 'new-password'}" ${extra}>
      <button type="button" class="pw__btn" data-action="toggle-pw" aria-label="Show password" aria-pressed="false">${ic('eye', 'ic--sm')}</button></div>
    <small class="err"></small></div>`;

  // Email the one-time code (real mail when configured). In demo mode the code is shown on screen instead.
  async function deliverCode(email, code, purpose, name) {
    if (!Mailer.isLive()) return { ok: true, live: false };
    const r = await Mailer.sendCode(email, code, purpose, name);
    lastCodeAt = Date.now();
    return Object.assign({ live: true }, r);
  }

  // Three-segment tape that shows how far through sign-in you are.
  function stepsHTML(n) {
    const labels = ['Role', 'Credentials', 'Verify'];
    return `<ol class="login-steps" aria-label="Sign-in progress">${labels.map((l, i) =>
      `<li class="${i + 1 < n ? 'is-done' : i + 1 === n ? 'is-now' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}><span>${i + 1}</span>${l}</li>`).join('')}</ol>`;
  }

  // Strength meter drawn as a 4-segment tape.
  function strengthOf(pw) {
    let n = 0; if (pw.length >= 8) n++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++; if (/\d/.test(pw)) n++; if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) n++;
    return pw ? Math.max(1, n) : 0;
  }
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  function renderLogin() {
    const body = $('#login-body');
    const notice = loginNotice ? `<div class="notice" role="status">${ic('check', 'ic--sm')}<span>${esc(loginNotice)}</span></div>` : '';
    loginNotice = '';
    const role = Auth.ROLES[loginRole], rui = ROLE_UI[loginRole];

    if (loginStep === 'role') {
      body.innerHTML = `${stepsHTML(1)}<h2>Who is signing in?</h2><p class="muted small">Pick your role. You will use your own email and password on the next screen.</p>${notice}
        ${Object.entries(Auth.ROLES).map(([k, r]) => `<button class="role-card ${k === 'apprentice' ? 'role-card--alt' : ''}" data-action="login-role" data-role="${k}">
          <span class="role-card__ic">${ic(ROLE_UI[k].icon, 'ic--lg')}</span>
          <span style="flex:1"><h3>${esc(r.label)}</h3><span class="muted small">${esc(ROLE_UI[k].pitch)}</span></span>${ic('chev')}</button>`).join('')}`;
    } else if (loginStep === 'creds') {
      const up = loginMode === 'signup';
      body.innerHTML = `${stepsHTML(2)}
        <div class="role-banner role-banner--${loginRole}"><span class="role-card__ic">${ic(rui.icon, 'ic--lg')}</span>
          <div><span class="eyebrow">${up ? 'Creating an account as' : 'Signing in as'}</span><h2>${esc(role.label)}</h2></div>
          <button type="button" class="link-btn" data-action="login-back">Change</button></div>
        <div class="seg seg--full" role="group" aria-label="Sign in or create account" style="margin-top:14px">
          <button type="button" data-action="login-mode" data-mode="signin" aria-pressed="${!up}">Sign in</button>
          <button type="button" data-action="login-mode" data-mode="signup" aria-pressed="${up}">Create account</button></div>${notice}
        <form data-form="login" novalidate>
          <div class="form-grid" style="margin-top:14px">
            ${up ? `<div class="field"><label for="l-name">Full name</label><input class="input" id="l-name" name="name" autocomplete="name" value="${esc(loginName)}" placeholder="e.g. Folasade Adebayo"><small class="err"></small></div>` : ''}
            <div class="field"><label for="l-email">Email address</label>
              <input class="input" id="l-email" name="email" type="email" inputmode="email" autocomplete="username" value="${esc(loginEmail)}" placeholder="you@example.com"><small class="err"></small></div>
            ${pwField('l-pw', 'password', up ? 'Create a password' : 'Password', up ? 'data-input="pw-strength"' : '')}
            ${up ? `<div class="strength" id="pw-meter" aria-live="polite"><i></i><i></i><i></i><i></i><span class="small muted" id="pw-meter-label">Use 8+ characters with upper and lower case letters and a number.</span></div>
            ${pwField('l-pw2', 'confirm', 'Confirm password')}` : ''}
          </div>
          <button class="btn btn--primary btn--block" style="margin-top:14px">${up ? ic('userplus', 'ic--sm') + 'Create account and verify email' : ic('arrow', 'ic--sm') + 'Continue'}</button>
        </form>
        ${up ? `<p class="muted small" style="text-align:center;margin-top:10px">We will send a 6-digit code to this email to confirm it is yours.</p>
          <p style="text-align:center">Already registered? <button type="button" class="link-btn" data-action="login-mode" data-mode="signin">Sign in</button></p>`
          : `<p style="text-align:center;margin-top:6px"><button type="button" class="link-btn" data-action="forgot">Forgot your password?</button></p>
          <p style="text-align:center" class="small muted">New to Smart Fashion? <button type="button" class="link-btn" data-action="login-mode" data-mode="signup">Create an account</button></p>`}`;
      const el = $(up ? (loginName ? '#l-email' : '#l-name') : (loginEmail ? '#l-pw' : '#l-email')); if (el) el.focus();
    } else if (loginStep === 'mfa') {
      const live = Mailer.isLive();
      body.innerHTML = `${stepsHTML(3)}<button class="btn btn--ghost btn--sm" data-action="login-back">${ic('back', 'ic--sm')}Back</button>
        <h2 style="margin-top:14px">${live ? 'Check your email' : 'Verify it is you'}</h2>
        <p class="muted small">${loginNew ? 'Almost done. Your ' + esc(role.label) + ' account is created once you verify. ' : ''}${live
          ? 'We emailed a 6-digit code to <b>' + esc(loginEmail) + '</b>. It is valid for 5 minutes. Check your spam folder if it does not arrive.'
          : 'Enter the 6-digit code for <b>' + esc(loginMail) + '</b>. It is valid for 5 minutes.'}</p>
        ${live ? '' : `<div class="mfa-code"><div><span class="eyebrow">Demo code</span><div class="small muted">Email is not connected yet, so the code is shown here</div></div><strong id="demo-code">${loginCode}</strong></div>`}
        <form data-form="mfa" novalidate><div class="field"><label for="code">6-digit code</label>
          <input class="input code-input" id="code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"><small class="err"></small></div>
          <button class="btn btn--primary btn--block" style="margin-top:14px">${ic('shield', 'ic--sm')}Verify and sign in</button></form>
        <p style="text-align:center;margin-top:12px"><button type="button" class="link-btn" data-action="resend-code">Send a new code</button></p>`;
      const input = $('#code'); if (input) input.focus();
    } else if (loginStep === 'forgot') {
      body.innerHTML = `<button class="btn btn--ghost btn--sm" data-action="login-back">${ic('back', 'ic--sm')}Back to sign in</button>
        <h2 style="margin-top:14px">Reset your password</h2>
        <p class="muted small">Enter your account email and we will send a reset code.</p>${notice}
        <form data-form="forgot" novalidate><div class="field" style="margin-top:12px"><label for="r-email">Email address</label>
          <input class="input" id="r-email" name="email" type="email" inputmode="email" autocomplete="username" value="${esc(loginEmail)}"><small class="err"></small></div>
          <button class="btn btn--primary btn--block" style="margin-top:14px">${ic('mail', 'ic--sm')}Send reset code</button></form>`;
      const el = $('#r-email'); if (el) el.focus();
    } else if (loginStep === 'reset') {
      body.innerHTML = `<button class="btn btn--ghost btn--sm" data-action="login-back">${ic('back', 'ic--sm')}Back to sign in</button>
        <h2 style="margin-top:14px">Choose a new password</h2>
        <p class="muted small">If an account exists for <b>${esc(loginMail)}</b>, a code has been sent to it.${Mailer.isLive() ? ' Check your inbox and spam folder.' : ''}</p>
        ${loginCode && !Mailer.isLive() ? `<div class="mfa-code"><div><span class="eyebrow">Demo reset code</span><div class="small muted">A live system emails this</div></div><strong id="demo-code">${loginCode}</strong></div>` : ''}
        <form data-form="reset" novalidate><div class="form-grid">
          <div class="field"><label for="r-code">Reset code</label><input class="input" id="r-code" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><small class="err"></small></div>
          ${pwField('r-pw', 'password', 'New password')}
          <p class="hint muted small" style="margin:-6px 0 0">At least 8 characters, with upper and lower case letters and a number.</p>
          ${pwField('r-pw2', 'confirm', 'Confirm new password')}
        </div><button class="btn btn--primary btn--block" style="margin-top:16px">${ic('key', 'ic--sm')}Update password</button></form>`;
      const el = $('#r-code'); if (el) el.focus();
    }
  }

  /* ================================================================== ROUTER */
  const NAV = [['dashboard', 'Home', 'home'], ['clients', 'Clients', 'users'], ['orders', 'Orders', 'scissors'], ['outbox', 'Outbox', 'mail'], ['settings', 'Settings', 'sliders']];

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, ''); const [path, qs] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
  }

  function drawNav(active) {
    const links = NAV.map(([k, label, icon]) => `<a class="nav-link" href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></a>`).join('');
    $('#nav-side').innerHTML = links;
    $('#nav-bottom').innerHTML = `<div class="ruler"></div>${links}`;
  }

  function render(keepScroll) {
    const y = window.scrollY;
    if (!Auth.current()) { $('#login').hidden = false; $('#app').hidden = true; renderLogin(); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    $$('[data-role-chip]').forEach(el => { el.textContent = Auth.label(); });

    const { parts, q } = parseHash();
    const section = parts[0] || 'dashboard';
    drawNav(section);
    let html = '';
    switch (section) {
      case 'dashboard': html = viewDashboard(); break;
      case 'clients': html = parts[1] ? viewClientDetail(parts[1]) : viewClients(); break;
      case 'orders':
        if (parts[1] === 'new') html = viewNewOrder(q);
        else html = parts[1] ? viewOrderDetail(parts[1]) : viewOrders(q);
        break;
      case 'outbox': html = viewOutbox(); break;
      case 'settings': html = viewSettings(); break;
      default: html = emptyState('Page not found', 'That page does not exist.', `<a class="btn btn--primary" href="#/dashboard">Go home</a>`);
    }
    $('#view').innerHTML = html;
    if (section === 'orders' && parts[1] === 'new') updateMeasureHint();
    window.scrollTo(0, keepScroll ? y : 0);
    // animate tape segments filling (set width after paint so the transition runs)
    requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-w]').forEach(el => { el.style.width = el.dataset.w; })));
  }

  /* ================================================================== ACTIONS */
  function sendMail(order, status) {
    const client = DB.getClient(order.client_id);
    const n = Notify.send(order, client, status);
    if (n) toast(n.status === 'sending' ? `Sending email to ${client.client_name}…` : `Email saved for ${client.client_name}`, n.subject, 'mail');
    return n;
  }

  function changeStatus(id, status) {
    const o = DB.getOrder(id); if (!o || o.order_status === status) return;
    const forward = DB.STATUSES.indexOf(status) > DB.STATUSES.indexOf(o.order_status);
    DB.updateOrder(id, { order_status: status });
    const fresh = DB.getOrder(id);
    const n = forward ? sendMail(fresh, status) : null;     // Notify decides: only Received/Ready send
    if (!n) toast(`Moved to ${status}`, forward ? 'No email is sent at this stage.' : 'Stepped back. No email sent.');
    render(true);
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  Notify.onUpdate = n => {          // called when a real email finishes sending
    const c = DB.getClients().find(x => x.client_email === n.to);
    toast(n.status === 'sent' ? `Email delivered to ${c ? c.client_name : n.to}` : 'Email not delivered', n.status === 'sent' ? n.subject : (n.error + ' Open the Outbox to retry.'), 'mail');
    if (location.hash.startsWith('#/outbox')) render(true);
  };

  function seedOutbox() {
    if (!DB.isFresh()) return;
    DB.getOrders().forEach(o => {
      const c = DB.getClient(o.client_id); if (!c) return;
      Notify.send(o, c, 'Received', { sentAt: o.created_at, noDeliver: true });
      if (o.order_status === 'Ready') Notify.send(o, c, 'Ready', { sentAt: new Date(Date.now() - 864e5).toISOString(), noDeliver: true });
    });
    DB.markSeeded();
  }

  const actions = {
    logout() { Auth.logout(); loginStep = 'role'; loginRole = ''; loginMode = 'signin'; loginEmail = ''; loginName = ''; location.hash = ''; render(); },
    'login-role'(el) { loginRole = el.dataset.role; loginStep = 'creds'; renderLogin(); },
    'login-back'() {
      Auth.cancel();
      if (loginStep === 'creds') { loginStep = 'role'; loginRole = ''; loginMode = 'signin'; } else loginStep = 'creds';   // mfa/forgot/reset -> credentials
      renderLogin();
    },
    'login-mode'(el) { loginMode = el.dataset.mode; loginNotice = ''; renderLogin(); },
    'retry-mail'(el) { Notify.retry(el.dataset.id); toast('Trying again…'); render(true); },
    async 'test-mail'(el) {
      el.disabled = true; const u = Auth.user();
      const r = await Mailer.send({ to: u.email, toName: u.name, subject: 'Smart Fashion test email', message: 'Great news: real email is working. Clients will now receive their order confirmations and pickup alerts.' });
      el.disabled = false; toast(r.ok ? 'Test email sent' : 'Test email failed', r.ok ? 'Check ' + u.email + ' (and spam).' : r.error);
    },
    forgot() { loginStep = 'forgot'; renderLogin(); },
    async 'resend-code'(el) {
      const wait = 30 - Math.floor((Date.now() - lastCodeAt) / 1000);
      if (Mailer.isLive() && wait > 0) return toast('Please wait ' + wait + 's', 'You can ask for a new code in a moment.');
      const c = Auth.resendCode();
      if (!c) { loginStep = 'creds'; loginNotice = 'Your sign-in expired. Please start again.'; renderLogin(); return; }
      el.disabled = true; const r = await deliverCode(loginEmail, c, 'login', loginName); el.disabled = false;
      if (!r.ok) return toast('Could not send the code', r.error);
      loginCode = c; renderLogin(); toast(r.live ? 'New code sent to ' + loginEmail : 'New demo code ready');
    },
    'toggle-pw'(el) {
      const input = el.parentElement.querySelector('input'); const show = input.type === 'password';
      input.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      el.innerHTML = ic(show ? 'eyeoff' : 'eye', 'ic--sm');
    },
    'change-password'() { openPasswordModal(); },
    'team-add'() { openTeamModal(); },
    'team-remove'(el) {
      confirmDialog({ title: 'Remove this team member?', message: `${el.dataset.name} will no longer be able to sign in.`, confirmLabel: 'Remove',
        onYes() { if (Auth.removeUser(el.dataset.email)) toast('Team member removed'); render(true); } });
    },
    'close-modal'() { closeModal(); },
    'modal-backdrop'(el, e) { if (e.target === el) closeModal(); },
    'confirm-yes'() { const fn = pendingConfirm; closeModal(); if (fn) fn(); },

    'new-client'() { openClientModal(); },
    'edit-client'(el) { openClientModal(el.dataset.id); },
    'delete-client'(el) {
      if (!Auth.can('delete')) return;
      const c = DB.getClient(el.dataset.id);
      confirmDialog({ title: 'Delete client?', message: `${c.client_name} and all their measurements and orders will be permanently removed.`, confirmLabel: 'Delete client',
        onYes() { DB.deleteClient(c.client_id); toast('Client deleted'); location.hash = '#/clients'; render(); } });
    },

    'new-measure'(el) { openMeasureModal(el.dataset.client, el.dataset.cat, el.dataset.from); },
    'delete-measure'(el) {
      if (!Auth.can('delete')) return;
      confirmDialog({ title: 'Delete this measurement set?', message: 'This version will be removed from the history.', confirmLabel: 'Delete',
        onYes() { DB.deleteMeasurement(el.dataset.id); toast('Measurement set deleted'); render(true); } });
    },
    'measure-unit'(el) {
      const form = el.closest('form'); const vals = readMeasureCm(form);
      setUnit(el.dataset.unit); mState.unit = unit;
      $$('[data-action="measure-unit"]', form).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === unit)));
      $('#measure-fields').innerHTML = measureFieldsHTML(mState.cat, vals);
    },
    'measure-copy'(el) {
      const m = DB.getLatestMeasurement(mState.clientId, mState.cat); if (!m) return;
      $('#measure-fields').innerHTML = measureFieldsHTML(mState.cat, m.metrics);
      toast('Copied your last ' + mState.cat + ' set', 'Adjust anything that changed, then save.');
    },

    'filter-status'(el) {
      oFilter.status = el.dataset.status;
      $('#order-filters').innerHTML = filtersHTML(); $('#order-list').innerHTML = orderListHTML();
    },
    'set-status'(el) { changeStatus(el.dataset.id, el.dataset.status); },
    'step-back'(el) {
      const o = DB.getOrder(el.dataset.id); const prev = DB.STATUSES[DB.STATUSES.indexOf(o.order_status) - 1];
      if (prev) changeStatus(o.order_id, prev);
    },
    'edit-order'(el) {
      const o = DB.getOrder(el.dataset.id);
      openModal('Edit order #' + pad4(o.order_id), `<form data-form="order-edit" novalidate>
        <input type="hidden" name="id" value="${o.order_id}">
        <div class="form-grid">
          <div class="field"><label for="e-due">Due date</label><input class="input" id="e-due" name="due_date" type="date" value="${o.due_date}"><small class="err"></small></div>
          <div class="field"><label for="e-fab">Fabric</label><input class="input" id="e-fab" name="fabric" value="${esc(o.fabric)}"></div>
          ${canMoney() ? `<div class="field"><label for="e-price">Total price</label><div class="input-unit"><input class="input" id="e-price" name="total_price" inputmode="numeric" value="${o.total_price}"><em>₦</em></div><small class="err"></small></div>` : ''}
          <div class="field"><label for="e-notes">Style notes</label><textarea class="textarea" id="e-notes" name="notes">${esc(o.notes)}</textarea></div>
        </div>
        <div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button><button class="btn btn--primary">Save changes</button></div></form>`);
    },
    'record-payment'(el) {
      if (!canMoney()) return;
      const o = DB.getOrder(el.dataset.id), bal = Math.max(0, o.total_price - o.deposit_paid);
      openModal('Record payment', `<form data-form="payment" novalidate>
        <input type="hidden" name="id" value="${o.order_id}">
        <p class="muted small" style="margin-bottom:12px">Balance outstanding: <b>${money(bal)}</b></p>
        <div class="field"><label for="p-amt">Amount received</label><div class="input-unit"><input class="input" id="p-amt" name="amount" inputmode="numeric" placeholder="0" value="${bal}"><em>₦</em></div><small class="err"></small></div>
        <div class="modal__foot"><button type="button" class="btn btn--ghost" data-action="close-modal">Cancel</button><button class="btn btn--primary">Save payment</button></div></form>`);
    },
    receipt(el) {
      if (!canMoney()) return;
      const o = DB.getOrder(el.dataset.id);
      openModal('Receipt', `${receiptHTML(o)}<div class="modal__foot"><button class="btn btn--ghost" data-action="close-modal">Close</button>
        <button class="btn btn--primary" data-action="print" data-id="${o.order_id}">${ic('print', 'ic--sm')}Print receipt</button></div>`, { noFocus: true });
    },
    print(el) { const o = DB.getOrder(el.dataset.id); $('#print-area').innerHTML = receiptHTML(o); window.print(); },
    'delete-order'(el) {
      if (!Auth.can('delete')) return;
      confirmDialog({ title: 'Delete this order?', message: 'The order and its email history will be permanently removed.', confirmLabel: 'Delete order',
        onYes() { DB.deleteOrder(el.dataset.id); toast('Order deleted'); location.hash = '#/orders'; render(); } });
    },

    'set-unit'(el) { setUnit(el.dataset.unit); render(true); toast('Unit set to ' + (unit === 'cm' ? 'centimetres' : 'inches')); },
    export() {
      if (!Auth.can('backup')) return;
      download(`asolink-backup-${DB.todayISO()}.json`, DB.exportAll(), 'application/json');
      toast('Backup downloaded', 'Keep the file somewhere safe.');
    },
    'import-click'() { if (Auth.can('backup')) $('#import-file').click(); },
    'reset-demo'() {
      if (!Auth.can('reset')) return;
      confirmDialog({ title: 'Reset demo data?', message: 'All current clients, measurements and orders will be replaced with the sample data.', confirmLabel: 'Reset',
        onYes() { DB.resetDemo(); seedOutbox(); toast('Demo data restored'); render(true); } });
    }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) { if (el.tagName === 'A') e.preventDefault(); actions[el.dataset.action](el, e); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal-root').firstChild) closeModal(); });

  /* ---- live inputs / selects */
  document.addEventListener('input', e => {
    const t = e.target.dataset.input;
    if (t === 'pw-strength') {
      const n = strengthOf(e.target.value), meter = $('#pw-meter');
      if (meter) { $$('i', meter).forEach((el, i) => el.classList.toggle('on', i < n)); meter.dataset.level = n;
        $('#pw-meter-label').textContent = n ? strengthLabels[n] : 'Use 8+ characters with upper and lower case letters and a number.'; }
    }
    if (t === 'client-search') $('#client-list').innerHTML = clientListHTML(e.target.value);
    if (t === 'order-search') { oFilter.term = e.target.value; $('#order-list').innerHTML = orderListHTML(); }
  });
  document.addEventListener('change', e => {
    const t = e.target.dataset.change;
    if (t === 'measure-cat') {
      const form = e.target.closest('form'); const vals = readMeasureCm(form);   // read BEFORE switching category
      mState.cat = e.target.value; $('#measure-fields').innerHTML = measureFieldsHTML(mState.cat, vals); updateCopyButton();
    }
    if (t === 'order-mode' || t === 'order-hint') updateMeasureHint();
    if (e.target.id === 'import-file') importFile(e.target);
  });

  function importFile(input) {
    const file = input.files && input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      confirmDialog({ title: 'Import this backup?', message: `"${file.name}" will replace all data currently stored on this device.`, confirmLabel: 'Import',
        onYes() { try { DB.importAll(String(reader.result)); toast('Backup imported'); render(true); } catch (err) { toast('Import failed', err.message); } } });
    };
    reader.readAsText(file); input.value = '';
  }

  /* ================================================================== FORMS */
  const forms = {
    async login(f) {
      clearErrors(f);
      const up = loginMode === 'signup', btn = $('button:not([type=button])', f); let ok = true;
      const name = up ? f.elements.name.value.trim() : '', email = f.elements.email.value.trim(), pw = f.elements.password.value;
      if (up && !name) { setInvalid(fieldOf(f, 'name'), 'Enter your full name.'); ok = false; }
      if (!Auth.isEmail(email)) { setInvalid(fieldOf(f, 'email'), 'Enter a valid email address, like name@example.com.'); ok = false; }
      if (!pw) { setInvalid(fieldOf(f, 'password'), up ? 'Create a password.' : 'Enter your password.'); ok = false; }
      else if (up) {
        const problem = Auth.passwordProblem(pw);
        if (problem) { setInvalid(fieldOf(f, 'password'), problem); ok = false; }
        else if (pw !== f.elements.confirm.value) { setInvalid(fieldOf(f, 'confirm'), 'The two passwords do not match.'); ok = false; }
      }
      if (!ok) return;
      btn.disabled = true;
      const r = up ? await Auth.register({ name, email, password: pw, role: loginRole }) : await Auth.signIn(email, pw, loginRole);
      if (!r.ok) { btn.disabled = false; return setInvalid(fieldOf(f, r.field || 'password'), r.error); }
      const d = await deliverCode(email, r.code, 'login', r.name); btn.disabled = false;
      if (!d.ok) { Auth.cancel(); return setInvalid(fieldOf(f, 'email'), 'We could not email your code: ' + d.error + ' Check the address and your connection, then try again.'); }
      loginEmail = email; loginName = name; loginCode = r.code; loginMail = r.to; loginNew = r.isNew; loginStep = 'mfa'; renderLogin();
    },
    mfa(f) {
      clearErrors(f);
      const r = Auth.verify(f.elements.code.value);
      if (r.ok) { loginStep = 'role'; loginRole = ''; loginMode = 'signin'; loginEmail = ''; loginName = ''; location.hash = '#/dashboard'; render(); toast(`Welcome, ${Auth.user().name.split(' ')[0]}`, Auth.label()); }
      else if (r.restart) { loginStep = 'creds'; loginNotice = r.error; renderLogin(); }
      else setInvalid(fieldOf(f, 'code'), r.error);
    },
    async forgot(f) {
      clearErrors(f); const email = f.elements.email.value.trim();
      if (!Auth.isEmail(email)) return setInvalid(fieldOf(f, 'email'), 'Enter a valid email address.');
      const r = Auth.requestReset(email);
      if (r.code) { const d = await deliverCode(email, r.code, 'reset'); if (!d.ok) return setInvalid(fieldOf(f, 'email'), 'We could not email the code: ' + d.error); }
      loginEmail = email; loginCode = r.code || ''; loginMail = r.to; loginStep = 'reset'; renderLogin();
    },
    async reset(f) {
      clearErrors(f); let ok = true;
      const code = f.elements.code.value.trim(), pw = f.elements.password.value, pw2 = f.elements.confirm.value;
      if (!/^\d{6}$/.test(code)) { setInvalid(fieldOf(f, 'code'), 'Enter the 6-digit code.'); ok = false; }
      const problem = Auth.passwordProblem(pw); if (problem) { setInvalid(fieldOf(f, 'password'), problem); ok = false; }
      else if (pw !== pw2) { setInvalid(fieldOf(f, 'confirm'), 'The two passwords do not match.'); ok = false; }
      if (!ok) return;
      const r = await Auth.completeReset(loginEmail, code, pw);
      if (r.ok) { loginStep = 'creds'; loginCode = ''; loginNotice = 'Password updated. Sign in with your new password.'; renderLogin(); }
      else if (r.restart) { loginStep = 'forgot'; loginNotice = r.error; renderLogin(); }
      else setInvalid(fieldOf(f, r.field === 'password' ? 'password' : 'code'), r.error);
    },
    async password(f) {
      clearErrors(f); let ok = true;
      const cur = f.elements.current.value, pw = f.elements.password.value, pw2 = f.elements.confirm.value;
      if (!cur) { setInvalid(fieldOf(f, 'current'), 'Enter your current password.'); ok = false; }
      const problem = Auth.passwordProblem(pw); if (problem) { setInvalid(fieldOf(f, 'password'), problem); ok = false; }
      else if (pw !== pw2) { setInvalid(fieldOf(f, 'confirm'), 'The two passwords do not match.'); ok = false; }
      if (!ok) return;
      const r = await Auth.changePassword(cur, pw);
      if (!r.ok) return setInvalid(fieldOf(f, r.field || 'current'), r.error);
      closeModal(); toast('Password updated');
    },
    async team(f) {
      clearErrors(f);
      const r = await Auth.addApprentice({ name: f.elements.name.value, email: f.elements.email.value, password: f.elements.password.value });
      if (!r.ok) return setInvalid(fieldOf(f, r.field || 'name'), r.error);
      closeModal(); toast('Apprentice account created', f.elements.email.value.trim()); render(true);
    },

    client(f) {
      clearErrors(f); let ok = true; const v = n => f.elements[n].value.trim();
      if (v('client_name').length < 2) { setInvalid(fieldOf(f, 'client_name'), 'Enter the client\'s full name.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('client_email'))) { setInvalid(fieldOf(f, 'client_email'), 'Enter a valid email, like name@example.com.'); ok = false; }
      if (v('phone_number') && !/^[+\d][\d\s-]{6,17}$/.test(v('phone_number'))) { setInvalid(fieldOf(f, 'phone_number'), 'Use digits only, for example 0803 123 4567.'); ok = false; }
      if (!ok) return;
      const data = { client_name: v('client_name'), client_email: v('client_email'), phone_number: v('phone_number') };
      if (v('id')) { DB.updateClient(v('id'), data); closeModal(); toast('Client updated'); render(true); }
      else { const c = DB.addClient(data); closeModal(); toast('Client added', c.client_name); location.hash = '#/clients/' + c.client_id; render(); }
    },

    measure(f) {
      clearErrors(f); let ok = true; const metrics = {};
      DB.GARMENTS[mState.cat].forEach(k => {
        const spec = DB.FIELDS[k], field = fieldOf(f, k), raw = f.elements[k].value.trim().replace(',', '.');
        if (raw === '') { setInvalid(field, 'Required.'); ok = false; return; }
        const n = Number(raw);
        if (isNaN(n)) { setInvalid(field, 'Enter a number.'); ok = false; return; }
        const cm = unit === 'in' ? n * 2.54 : n;
        if (cm < spec.min || cm > spec.max) { setInvalid(field, `Must be ${cmToUnit(spec.min)} to ${cmToUnit(spec.max)} ${unit}.`); ok = false; return; }
        metrics[k] = Math.round(cm * 10) / 10;
      });
      if (!ok) { const bad = $('.field.is-invalid input', f); if (bad) bad.focus(); return; }
      DB.addMeasurement({ client_id: mState.clientId, garment_category: mState.cat, metrics });
      closeModal(); toast('Measurements saved', `${mState.cat} set is now Current.`);
      if (location.hash.startsWith('#/orders/new')) updateMeasureHint(); else render(true);
    },

    order(f) {
      clearErrors(f); let ok = true; const v = n => (f.elements[n] ? f.elements[n].value.trim() : '');
      const group = f.elements.group.checked;
      const ids = group ? $$('input[name="gclient"]:checked', f).map(i => Number(i.value)) : [Number(v('client_id'))];
      if (!group && !v('client_id')) { setInvalid($('#single-client'), 'Choose a client.'); ok = false; }
      if (group) {
        if (!v('group_name')) { setInvalid(fieldOf(f, 'group_name'), 'Give the event a name.'); ok = false; }
        if (ids.length < 2) { setInvalid($('#group-clients'), 'Choose at least 2 clients for a group order.'); ok = false; }
        if (!v('fabric')) { setInvalid(fieldOf(f, 'fabric'), 'Enter the shared fabric.'); ok = false; }
      }
      if (!v('garment_style')) { setInvalid(fieldOf(f, 'garment_style'), 'Choose a garment.'); ok = false; }
      if (!v('due_date')) { setInvalid(fieldOf(f, 'due_date'), 'Choose a due date.'); ok = false; }
      else if (v('due_date') < DB.todayISO()) { setInvalid(fieldOf(f, 'due_date'), 'The due date cannot be in the past.'); ok = false; }
      let price = 0, dep = 0;
      if (canMoney()) {
        price = v('total_price') === '' ? 0 : numOf(v('total_price')); dep = v('deposit_paid') === '' ? 0 : numOf(v('deposit_paid'));
        if (isNaN(price) || price < 0) { setInvalid(fieldOf(f, 'total_price'), 'Enter a valid amount.'); ok = false; }
        else if (isNaN(dep) || dep < 0) { setInvalid(fieldOf(f, 'deposit_paid'), 'Enter a valid amount.'); ok = false; }
        else if (dep > price) { setInvalid(fieldOf(f, 'deposit_paid'), 'The deposit cannot be more than the price.'); ok = false; }
      }
      if (!ok) { const bad = $('.field.is-invalid', f); if (bad) bad.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

      const base = { garment_style: v('garment_style'), due_date: v('due_date'), total_price: price, deposit_paid: dep, notes: v('notes'), fabric: v('fabric') };
      if (!group) {
        const o = DB.addOrder(Object.assign({ client_id: ids[0] }, base));
        sendMail(o, 'Received');                       // rule: new order => confirmation email
        location.hash = '#/orders/' + o.order_id;
      } else {
        const gid = DB.newGroupId();
        ids.forEach(cid => { const o = DB.addOrder(Object.assign({ client_id: cid, group_id: gid, group_name: v('group_name') }, base)); sendMail(o, 'Received'); });
        toast(`${ids.length} group orders created`, v('group_name'));
        location.hash = '#/orders?group=' + gid;
      }
      render();
    },

    'order-edit'(f) {
      clearErrors(f); let ok = true; const v = n => (f.elements[n] ? f.elements[n].value.trim() : '');
      if (!v('due_date')) { setInvalid(fieldOf(f, 'due_date'), 'Choose a due date.'); ok = false; }
      const changes = { due_date: v('due_date'), fabric: v('fabric'), notes: v('notes') };
      if (canMoney() && f.elements.total_price) {
        const p = numOf(v('total_price') || 0); const o = DB.getOrder(v('id'));
        if (isNaN(p) || p < 0) { setInvalid(fieldOf(f, 'total_price'), 'Enter a valid amount.'); ok = false; }
        else if (p < o.deposit_paid) { setInvalid(fieldOf(f, 'total_price'), 'The price cannot be below what is already paid.'); ok = false; }
        else changes.total_price = p;
      }
      if (!ok) return;
      DB.updateOrder(v('id'), changes); closeModal(); toast('Order updated'); render(true);
    },

    payment(f) {
      if (!canMoney()) return;
      clearErrors(f); const o = DB.getOrder(f.elements.id.value), bal = Math.max(0, o.total_price - o.deposit_paid);
      const amt = numOf(f.elements.amount.value);
      if (!amt || isNaN(amt) || amt <= 0) return setInvalid(fieldOf(f, 'amount'), 'Enter an amount above zero.');
      if (amt > bal) return setInvalid(fieldOf(f, 'amount'), `That is more than the balance of ${money(bal)}.`);
      DB.updateOrder(o.order_id, { deposit_paid: o.deposit_paid + amt });
      closeModal(); toast('Payment recorded', money(amt)); render(true);
    }
  };

  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault(); if (forms[f.dataset.form]) forms[f.dataset.form](f);
  });

  /* ================================================================== START */
  function syncNet() { document.body.classList.toggle('is-offline', !navigator.onLine); }
  window.addEventListener('online', () => { syncNet(); toast('Back online'); });
  window.addEventListener('offline', () => { syncNet(); toast('You are offline', 'Changes are saved on this device.'); });
  window.addEventListener('hashchange', () => render());

  // Auto sign-out after 15 minutes without activity (RBAC + session security from the report).
  ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (Auth.current()) Auth.touch(); }, { passive: true }));
  setInterval(() => {
    if ($('#app') && !$('#app').hidden && !Auth.current()) {
      loginStep = 'role'; loginRole = ''; loginNotice = 'You were signed out after 15 minutes of inactivity.'; location.hash = ''; render();
    }
  }, 15000);

  DB.load(); seedOutbox(); syncNet();
  Auth.init().then(render);

  // Offline support: the service worker needs http(s), so it is skipped when opened as a plain file.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
  }
})();
