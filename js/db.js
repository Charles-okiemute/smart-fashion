/* ==========================================================================
   Smart Fashion  |  db.js  |  Data layer
   --------------------------------------------------------------------------
   The whole app talks to storage ONLY through this file. Today it uses the
   browser's localStorage (free, no server). To move to MySQL later, keep the
   same function names and replace the bodies with fetch() calls to an API.

   Tables mirror the report's 3NF schema:
     clients       client_id, client_name, client_email, phone_number, created_at
     measurements  measurement_id, client_id (FK), garment_category, metrics{}, updated_at
     orders        order_id, client_id (FK), garment_style, order_status, due_date,
                   total_price, deposit_paid, created_at
                   (+ optional: notes, fabric, group_id, group_name for Aso-Ebi)
     notifications id, order_id (FK), to, subject, body, type, sent_at, status
   All body measurements are stored in CENTIMETRES; the UI converts to inches.
   ========================================================================== */

const DB = (() => {
  'use strict';

  const KEY = 'asolink_db_v1';
  let data = null;

  /* ---- Reference data shared by the UI and the seed ---------------------- */

  const STATUSES = ['Received', 'Cutting', 'Sewing', 'Ready'];

  // Field dictionary: label + allowed range in cm (used for validation).
  const FIELDS = {
    neck:           { label: 'Neck',            min: 25, max: 60 },
    shoulder:       { label: 'Shoulder',        min: 30, max: 70 },
    chest:          { label: 'Chest',           min: 50, max: 200 },
    bust:           { label: 'Bust',            min: 50, max: 200 },
    waist:          { label: 'Waist',           min: 40, max: 200 },
    hip:            { label: 'Hip',             min: 50, max: 200 },
    sleeve_length:  { label: 'Sleeve length',   min: 30, max: 90 },
    agbada_length:  { label: 'Agbada length',   min: 80, max: 180 },
    buba_length:    { label: 'Buba length',     min: 40, max: 120 },
    kaftan_length:  { label: 'Kaftan length',   min: 60, max: 160 },
    top_length:     { label: 'Top length',      min: 50, max: 120 },
    jacket_length:  { label: 'Jacket length',   min: 50, max: 100 },
    trouser_waist:  { label: 'Trouser waist',   min: 40, max: 200 },
    trouser_length: { label: 'Trouser length',  min: 60, max: 140 },
    sokoto_waist:   { label: 'Sokoto waist',    min: 40, max: 200 },
    sokoto_length:  { label: 'Sokoto length',   min: 60, max: 140 },
    thigh:          { label: 'Thigh',           min: 30, max: 100 },
    ankle:          { label: 'Ankle',           min: 15, max: 50 },
    inseam:         { label: 'Inseam',          min: 50, max: 110 }
  };

  // Which fields each garment category needs (exactly as in the project report).
  const GARMENTS = {
    'Agbada':         ['neck', 'shoulder', 'chest', 'sleeve_length', 'agbada_length', 'trouser_waist', 'trouser_length', 'thigh', 'ankle'],
    'Buba & Sokoto':  ['bust', 'waist', 'hip', 'shoulder', 'sleeve_length', 'buba_length', 'sokoto_waist', 'sokoto_length'],
    'Kaftan':         ['neck', 'shoulder', 'chest', 'sleeve_length', 'kaftan_length', 'hip'],
    'Senator Set':    ['neck', 'shoulder', 'chest', 'waist', 'sleeve_length', 'top_length', 'trouser_waist', 'trouser_length', 'thigh'],
    'Corporate Suit': ['neck', 'shoulder', 'chest', 'waist', 'hip', 'sleeve_length', 'jacket_length', 'trouser_waist', 'trouser_length', 'inseam']
  };

  /* ---- Small helpers ------------------------------------------------------ */

  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const offsetISO = days => { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); };
  const nowStamp = () => new Date().toISOString();
  const stampDaysAgo = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString(); };

  /* ---- Persistence --------------------------------------------------------- */

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn('Smart Fashion: could not write to localStorage', e); }
  }

  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { data = JSON.parse(raw); return data; }
    } catch (e) { console.warn('Smart Fashion: could not read localStorage', e); }
    data = buildSeed();
    save();
    return data;
  }

  // Auto-increment ids, one counter per table (like AUTO_INCREMENT in MySQL).
  function nextId(table) {
    const d = load();
    d.seq[table] = (d.seq[table] || 0) + 1;
    return d.seq[table];
  }

  /* ---- Demo data ------------------------------------------------------------ */

  function buildSeed() {
    const d = {
      meta: { fresh: true, version: 1 },
      seq: { clients: 0, measurements: 0, orders: 0, notifications: 0, groups: 0 },
      clients: [], measurements: [], orders: [], notifications: []
    };

    const C = [
      ['Adaeze Okonkwo', 'adaeze.okonkwo@example.com', '0803 412 7788', 40],
      ['Tunde Bakare',   'tunde.bakare@example.com',   '0816 220 4531', 38],
      ['Ngozi Eze',      'ngozi.eze@example.com',      '0705 893 1126', 30],
      ['Ibrahim Musa',   'ibrahim.musa@example.com',   '0902 114 6670', 26],
      ['Folake Adeyemi', 'folake.adeyemi@example.com', '0810 557 3204', 21],
      ['Chinedu Nwosu',  'chinedu.nwosu@example.com',  '0807 669 0912', 14]
    ];
    C.forEach(c => d.clients.push({
      client_id: ++d.seq.clients, client_name: c[0], client_email: c[1],
      phone_number: c[2], created_at: stampDaysAgo(c[3])
    }));

    // [client, garment, ageDays, metrics in cm]
    const M = [
      [2, 'Agbada', 30, { neck: 40, shoulder: 49, chest: 110, sleeve_length: 64, agbada_length: 138, trouser_waist: 98, trouser_length: 106, thigh: 62, ankle: 24 }],
      [2, 'Agbada', 6,  { neck: 41, shoulder: 49, chest: 112, sleeve_length: 64, agbada_length: 138, trouser_waist: 100, trouser_length: 106, thigh: 63, ankle: 24 }],
      [2, 'Corporate Suit', 12, { neck: 41, shoulder: 49, chest: 112, waist: 100, hip: 108, sleeve_length: 65, jacket_length: 76, trouser_waist: 100, trouser_length: 108, inseam: 82 }],
      [1, 'Buba & Sokoto', 20, { bust: 94, waist: 78, hip: 104, shoulder: 38, sleeve_length: 56, buba_length: 74, sokoto_waist: 80, sokoto_length: 100 }],
      [3, 'Buba & Sokoto', 18, { bust: 98, waist: 82, hip: 108, shoulder: 39, sleeve_length: 57, buba_length: 76, sokoto_waist: 84, sokoto_length: 102 }],
      [5, 'Buba & Sokoto', 25, { bust: 90, waist: 72, hip: 100, shoulder: 37, sleeve_length: 55, buba_length: 72, sokoto_waist: 74, sokoto_length: 98 }],
      [4, 'Kaftan', 15, { neck: 39, shoulder: 47, chest: 104, sleeve_length: 62, kaftan_length: 120, hip: 102 }],
      [6, 'Senator Set', 10, { neck: 40, shoulder: 48, chest: 106, waist: 94, sleeve_length: 63, top_length: 84, trouser_waist: 96, trouser_length: 104, thigh: 60 }],
      [6, 'Corporate Suit', 9, { neck: 40, shoulder: 48, chest: 106, waist: 94, hip: 102, sleeve_length: 64, jacket_length: 74, trouser_waist: 96, trouser_length: 106, inseam: 80 }]
    ];
    M.forEach(m => d.measurements.push({
      measurement_id: ++d.seq.measurements, client_id: m[0], garment_category: m[1],
      metrics: m[3], updated_at: stampDaysAgo(m[2])
    }));

    // Aso-Ebi group (one event, three clients, same fabric)
    const g = ++d.seq.groups;
    const grp = { group_id: g, group_name: 'Okafor Wedding Aso-Ebi', fabric: 'Royal blue Ankara' };

    // [client, style, status, dueOffset, price, deposit, ageDays, extra]
    const O = [
      [2, 'Agbada',         'Sewing',   2,  65000, 30000, 12, { notes: 'Navy and silver embroidery on the chest panel.' }],
      [1, 'Buba & Sokoto',  'Cutting',  5,  18000,  9000, 10, grp],
      [3, 'Buba & Sokoto',  'Received', 5,  18000,  9000,  4, grp],
      [5, 'Buba & Sokoto',  'Sewing',   5,  18000, 18000,  9, grp],
      [4, 'Kaftan',         'Ready',   -1,  22000, 22000, 16, { notes: 'Plain cotton kaftan, light starch.' }],
      [6, 'Senator Set',    'Cutting', -3,  35000, 15000, 14, { notes: 'Wine-free, strictly blue and white fabric.' }],
      [2, 'Corporate Suit', 'Received', 9,  85000, 40000,  1, { notes: 'Two-button jacket, slim trouser.' }],
      [6, 'Corporate Suit', 'Received', 1,  72000, 30000,  3, { notes: 'Needed for a Friday meeting.' }]
    ];
    O.forEach(o => {
      const ex = o[7];
      d.orders.push({
        order_id: ++d.seq.orders, client_id: o[0], garment_style: o[1], order_status: o[2],
        due_date: offsetISO(o[3]), total_price: o[4], deposit_paid: o[5], created_at: stampDaysAgo(o[6]),
        notes: ex.notes || '', fabric: ex.fabric || '', group_id: ex.group_id || null, group_name: ex.group_name || ''
      });
    });
    return d;
  }

  /* ---- Clients -------------------------------------------------------------- */

  const getClients = () => load().clients.slice().sort((a, b) => a.client_name.localeCompare(b.client_name));
  const getClient = id => load().clients.find(c => c.client_id === Number(id)) || null;

  function addClient({ client_name, client_email, phone_number }) {
    const c = { client_id: nextId('clients'), client_name: client_name.trim(), client_email: client_email.trim(),
                phone_number: (phone_number || '').trim(), created_at: nowStamp() };
    load().clients.push(c); save(); return c;
  }
  function updateClient(id, fields) {
    const c = getClient(id); if (!c) return null;
    ['client_name', 'client_email', 'phone_number'].forEach(k => { if (k in fields) c[k] = String(fields[k]).trim(); });
    save(); return c;
  }
  // Deleting a client also deletes their measurements, orders and emails (cascade).
  function deleteClient(id) {
    const d = load(); id = Number(id);
    const orderIds = d.orders.filter(o => o.client_id === id).map(o => o.order_id);
    d.clients = d.clients.filter(c => c.client_id !== id);
    d.measurements = d.measurements.filter(m => m.client_id !== id);
    d.orders = d.orders.filter(o => o.client_id !== id);
    d.notifications = d.notifications.filter(n => !orderIds.includes(n.order_id));
    save();
  }

  /* ---- Measurements (history is kept: every save is a new version) ----------- */

  const getMeasurements = clientId => load().measurements
    .filter(m => m.client_id === Number(clientId))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  // Newest record for a category = the "Current" one.
  const getLatestMeasurement = (clientId, category) =>
    getMeasurements(clientId).find(m => m.garment_category === category) || null;

  function addMeasurement({ client_id, garment_category, metrics }) {
    const m = { measurement_id: nextId('measurements'), client_id: Number(client_id),
                garment_category, metrics, updated_at: nowStamp() };
    load().measurements.push(m); save(); return m;
  }
  function deleteMeasurement(id) {
    const d = load(); d.measurements = d.measurements.filter(m => m.measurement_id !== Number(id)); save();
  }

  /* ---- Orders ----------------------------------------------------------------- */

  const getOrders = () => load().orders.slice().sort((a, b) => a.due_date.localeCompare(b.due_date));
  const getOrder = id => load().orders.find(o => o.order_id === Number(id)) || null;
  const getOrdersByClient = cid => getOrders().filter(o => o.client_id === Number(cid));
  const getOrdersByGroup = gid => getOrders().filter(o => o.group_id === Number(gid));
  const newGroupId = () => nextId('groups');

  function addOrder(o) {
    const order = {
      order_id: nextId('orders'), client_id: Number(o.client_id), garment_style: o.garment_style,
      order_status: 'Received',                       // every order always starts as Received
      due_date: o.due_date, total_price: Number(o.total_price) || 0, deposit_paid: Number(o.deposit_paid) || 0,
      created_at: nowStamp(), notes: o.notes || '', fabric: o.fabric || '',
      group_id: o.group_id || null, group_name: o.group_name || ''
    };
    load().orders.push(order); save(); return order;
  }
  function updateOrder(id, fields) {
    const o = getOrder(id); if (!o) return null;
    if ('order_status' in fields && !STATUSES.includes(fields.order_status)) throw new Error('Invalid status');
    Object.assign(o, fields); save(); return o;
  }
  function deleteOrder(id) {
    const d = load(); id = Number(id);
    d.orders = d.orders.filter(o => o.order_id !== id);
    d.notifications = d.notifications.filter(n => n.order_id !== id);
    save();
  }

  /* ---- Notifications (the email outbox log) ------------------------------------ */

  const getNotifications = () => load().notifications.slice().sort((a, b) => b.sent_at.localeCompare(a.sent_at) || b.id - a.id);
  const getNotificationsByOrder = oid => getNotifications().filter(n => n.order_id === Number(oid));
  const getNotification = id => load().notifications.find(n => n.id === Number(id)) || null;
  // status: 'sending' | 'sent' | 'failed' | 'demo' (saved here only, not delivered)
  function addNotification({ order_id, to, subject, body, type, sent_at, status }) {
    const n = { id: nextId('notifications'), order_id, to, subject, body, type, sent_at: sent_at || nowStamp(), status: status || 'demo', error: '' };
    load().notifications.push(n); save(); return n;
  }
  function updateNotification(id, fields) {
    const n = getNotification(id); if (!n) return null; Object.assign(n, fields); save(); return n;
  }

  /* ---- Backup / restore / reset --------------------------------------------------- */

  const exportAll = () => JSON.stringify({ app: 'Smart Fashion', exported_at: nowStamp(), data: load() }, null, 2);

  function importAll(jsonText) {
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch (e) { throw new Error('That file is not valid JSON.'); }
    const d = parsed && parsed.data ? parsed.data : parsed;
    const ok = d && ['clients', 'measurements', 'orders', 'notifications'].every(k => Array.isArray(d[k])) && d.seq;
    if (!ok) throw new Error('This does not look like a Smart Fashion backup file.');
    d.meta = Object.assign({ fresh: false, version: 1 }, d.meta, { fresh: false });
    data = d; save();
  }

  function resetDemo() { data = buildSeed(); save(); }
  const isFresh = () => !!load().meta.fresh;
  function markSeeded() { load().meta.fresh = false; save(); }

  return {
    STATUSES, FIELDS, GARMENTS, todayISO, offsetISO, isoDate,
    getClients, getClient, addClient, updateClient, deleteClient,
    getMeasurements, getLatestMeasurement, addMeasurement, deleteMeasurement,
    getOrders, getOrder, getOrdersByClient, getOrdersByGroup, newGroupId, addOrder, updateOrder, deleteOrder,
    getNotifications, getNotification, getNotificationsByOrder, addNotification, updateNotification,
    exportAll, importAll, resetDemo, isFresh, markSeeded, load
  };
})();
