/* ==========================================================================
   Smart Fashion  |  auth.js  |  Accounts, passwords, MFA and roles
   --------------------------------------------------------------------------
   Sign-in flow (matches section 3.7 of the project report):
     0. Choose a role (Master Tailor or Apprentice)
     1. Email + password            (password is stored only as a salted SHA-256 hash)
     2. Multi-factor authentication (6-digit code, valid for 5 minutes, 3 tries)
     3. Role-Based Access Control   (Master Tailor vs Apprentice)
   Extra protections: lockout after repeated wrong passwords, automatic
   sign-out after 15 minutes of inactivity, password rules, password reset.

   Anyone can create an account with any valid email, for either role.
   DEMO ONLY: there is no server, so accounts live in this browser and the
   MFA / reset codes are shown on screen instead of being sent by SMS or email.
   A production system would hash with bcrypt or Argon2 on the server, send
   the codes through an SMS/email service, and serve everything over HTTPS.
   ========================================================================== */

const Auth = (() => {
  'use strict';

  const USERS_KEY = 'smartfashion_users_v1';
  const SESSION_KEY = 'smartfashion_session_v1';
  const MAX_FAILED = 5;                 // wrong passwords before a temporary lock
  const LOCK_MS = 60 * 1000;            // demo: 1 minute (a real system would use 15+)
  const CODE_TTL = 5 * 60 * 1000;       // MFA / reset code lifetime
  const MAX_CODE_TRIES = 3;
  const IDLE_MS = 15 * 60 * 1000;       // auto sign-out after inactivity

  // What each role may do. The UI always asks Auth.can('...'), so permissions live here only.
  const ROLES = {
    master: { label: 'Master Tailor', perms: ['viewMoney', 'delete', 'backup', 'reset', 'editPrice', 'team'] },
    apprentice: { label: 'Apprentice', perms: [] }
  };

  let users = [];
  let pending = null;     // { user, code, expires, tries } between password step and MFA step
  let resetReq = null;    // { email, code, expires, tries }
  let memorySession = null;

  /* ---- helpers ------------------------------------------------------------ */

  const norm = e => String(e || '').trim().toLowerCase();
  const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));
  const randomSalt = () => Array.from(crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(12)) : [], b => b.toString(16).padStart(2, '0')).join('') || String(Math.random()).slice(2);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const isEmail = e => EMAIL_RE.test(String(e || '').trim());

  // Salted SHA-256 (browser built-in). Falls back to a simple hash if SubtleCrypto is unavailable.
  async function hashPassword(password, salt) {
    const bytes = new TextEncoder().encode(salt + ':' + password);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381; bytes.forEach(b => { h = ((h << 5) + h + b) >>> 0; });
    return 'f' + h.toString(16);
  }

  function saveUsers() { try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) { /* ignore */ } }

  // Password rules: 8+ characters with upper case, lower case and a number.
  function passwordProblem(pw) {
    pw = String(pw || '');
    if (pw.length < 8) return 'Use at least 8 characters.';
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return 'Mix upper and lower case letters.';
    if (!/[0-9]/.test(pw)) return 'Include at least one number.';
    return '';
  }

  const maskEmail = e => { const [n, d] = String(e).split('@'); return (n ? n[0] : '') + '***@' + (d || ''); };

  /* ---- start-up ------------------------------------------------------------ */

  async function init() {
    try { users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch (e) { users = []; }
    if (!Array.isArray(users)) users = [];
  }

  /* ---- step 1: email + password --------------------------------------------- */

  /**
   * Create a new account for the chosen role. The account is only saved once the
   * emailed (or demo) verification code is entered, which proves the email works.
   */
  async function register({ name, email, password, role }) {
    pending = null;
    if (!ROLES[role]) return { ok: false, error: 'Please choose a role first.' };
    if (!String(name || '').trim()) return { ok: false, field: 'name', error: 'Enter your full name.' };
    if (!isEmail(email)) return { ok: false, field: 'email', error: 'Enter a valid email address.' };
    if (users.some(x => x.email === norm(email))) return { ok: false, field: 'email', exists: true, error: 'An account with this email already exists. Use Sign in instead.' };
    const problem = passwordProblem(password); if (problem) return { ok: false, field: 'password', error: problem };
    const salt = randomSalt();
    const fresh = { name: String(name).trim(), email: norm(email), role, salt, hash: await hashPassword(password, salt),
                    created_at: new Date().toISOString(), failed: 0, lockedUntil: 0 };
    pending = { user: fresh, isNew: true, code: randomCode(), expires: Date.now() + CODE_TTL, tries: 0 };
    return { ok: true, isNew: true, code: pending.code, to: maskEmail(fresh.email), name: fresh.name };
  }

  /** Step 1 for an existing account. */
  async function signIn(email, password, role) {
    pending = null;
    if (!ROLES[role]) return { ok: false, error: 'Please choose a role first.' };
    const u = users.find(x => x.email === norm(email));
    if (!u) return { ok: false, field: 'email', noAccount: true, error: 'No account found for this email. Choose Create account to set one up.' };
    if (u.lockedUntil && u.lockedUntil > Date.now()) {
      const s = Math.ceil((u.lockedUntil - Date.now()) / 1000);
      return { ok: false, locked: true, error: `Too many attempts. This account is locked for ${s} more second${s === 1 ? '' : 's'}.` };
    }
    if (await hashPassword(password, u.salt) !== u.hash) {
      u.failed = (u.failed || 0) + 1;
      if (u.failed >= MAX_FAILED) { u.failed = 0; u.lockedUntil = Date.now() + LOCK_MS; saveUsers();
        return { ok: false, locked: true, error: 'Too many incorrect attempts. This account is locked for 1 minute.' }; }
      saveUsers();
      const left = MAX_FAILED - u.failed;
      return { ok: false, error: `Incorrect email or password. ${left} attempt${left === 1 ? '' : 's'} left before a temporary lock.` };
    }
    if (u.role !== role) {                                // right password, wrong role card
      return { ok: false, wrongRole: u.role, error: `This email belongs to ${/^[AEIOU]/.test(ROLES[u.role].label) ? 'an' : 'a'} ${ROLES[u.role].label}. Go back and choose ${ROLES[u.role].label}.` };
    }
    u.failed = 0; u.lockedUntil = 0; saveUsers();
    pending = { user: u, isNew: false, code: randomCode(), expires: Date.now() + CODE_TTL, tries: 0 };
    return { ok: true, isNew: false, code: pending.code, to: maskEmail(u.email), name: u.name };
  }

  /* ---- step 2: MFA code ------------------------------------------------------- */

  function verify(input) {
    if (!pending) return { ok: false, restart: true, error: 'Your sign-in expired. Please start again.' };
    if (Date.now() > pending.expires) { pending = null; return { ok: false, restart: true, error: 'That code has expired. Please sign in again.' }; }
    if (String(input).trim() === pending.code) {
      const u = pending.user; if (pending.isNew) { users.push(u); saveUsers(); } pending = null;
      startSession({ email: u.email, role: u.role, name: u.name, last: Date.now() });
      return { ok: true };
    }
    pending.tries += 1;
    if (pending.tries >= MAX_CODE_TRIES) { pending = null; return { ok: false, restart: true, error: 'Too many wrong codes. Please sign in again.' }; }
    const left = MAX_CODE_TRIES - pending.tries;
    return { ok: false, error: `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.` };
  }

  function resendCode() {
    if (!pending) return null;
    pending.code = randomCode(); pending.expires = Date.now() + CODE_TTL; pending.tries = 0;
    return pending.code;
  }
  const hasPending = () => !!pending;
  const cancel = () => { pending = null; resetReq = null; };

  /* ---- session + inactivity ---------------------------------------------------- */

  function startSession(s) {
    memorySession = s;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function readSession() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { /* ignore */ }
    return s || memorySession;
  }
  function session() {
    const s = readSession();
    if (!s || !ROLES[s.role]) return null;
    if (Date.now() - (s.last || 0) > IDLE_MS) { logout(); return null; }   // idle too long
    return s;
  }
  function touch() {                       // call on user activity
    const s = readSession(); if (!s) return;
    s.last = Date.now(); startSession(s);
  }
  const current = () => { const s = session(); return s ? s.role : null; };
  const user = () => session();
  const label = () => { const r = current(); return r ? ROLES[r].label : ''; };
  const can = perm => { const r = current(); return !!r && ROLES[r].perms.includes(perm); };
  function logout() {
    pending = null; resetReq = null; memorySession = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  /* ---- forgot / reset password -------------------------------------------------- */

  // Always answers the same way, so nobody can use this to discover which emails have accounts.
  function requestReset(email) {
    const u = users.find(x => x.email === norm(email));
    resetReq = u ? { email: u.email, code: randomCode(), expires: Date.now() + CODE_TTL, tries: 0 } : null;
    return { ok: true, code: resetReq ? resetReq.code : null, to: maskEmail(norm(email)) };
  }

  async function completeReset(email, code, newPassword) {
    if (!resetReq || resetReq.email !== norm(email)) return { ok: false, error: 'That reset code is not valid. Request a new one.' };
    if (Date.now() > resetReq.expires) { resetReq = null; return { ok: false, restart: true, error: 'That code has expired. Request a new one.' }; }
    if (String(code).trim() !== resetReq.code) {
      resetReq.tries += 1;
      if (resetReq.tries >= MAX_CODE_TRIES) { resetReq = null; return { ok: false, restart: true, error: 'Too many wrong codes. Request a new one.' }; }
      return { ok: false, error: 'That reset code is not correct.' };
    }
    const problem = passwordProblem(newPassword); if (problem) return { ok: false, field: 'password', error: problem };
    const u = users.find(x => x.email === resetReq.email);
    u.salt = randomSalt(); u.hash = await hashPassword(newPassword, u.salt); u.failed = 0; u.lockedUntil = 0;
    saveUsers(); resetReq = null;
    return { ok: true };
  }

  /* ---- account management (Master Tailor) ----------------------------------------- */

  async function changePassword(currentPw, newPw) {
    const s = session(); if (!s) return { ok: false, error: 'Please sign in again.' };
    const u = users.find(x => x.email === s.email);
    if (!u || await hashPassword(currentPw, u.salt) !== u.hash) return { ok: false, field: 'current', error: 'Your current password is not correct.' };
    const problem = passwordProblem(newPw); if (problem) return { ok: false, field: 'password', error: problem };
    u.salt = randomSalt(); u.hash = await hashPassword(newPw, u.salt); saveUsers();
    return { ok: true };
  }

  const listUsers = () => users.map(u => ({ name: u.name, email: u.email, role: u.role, created_at: u.created_at }));

  // Only the Master Tailor can create accounts, and only for apprentices (least privilege).
  async function addApprentice({ name, email, password }) {
    if (!can('team')) return { ok: false, error: 'Only the Master Tailor can add team members.' };
    if (!String(name || '').trim()) return { ok: false, field: 'name', error: 'Enter their full name.' };
    if (!isEmail(email)) return { ok: false, field: 'email', error: 'Enter a valid email address.' };
    if (users.some(u => u.email === norm(email))) return { ok: false, field: 'email', error: 'An account with this email already exists.' };
    const problem = passwordProblem(password); if (problem) return { ok: false, field: 'password', error: problem };
    const salt = randomSalt();
    users.push({ name: String(name).trim(), email: norm(email), role: 'apprentice', salt, hash: await hashPassword(password, salt),
                 created_at: new Date().toISOString(), failed: 0, lockedUntil: 0 });
    saveUsers(); return { ok: true };
  }

  function removeUser(email) {
    if (!can('team')) return false;
    const s = session(); if (s && s.email === norm(email)) return false;      // cannot remove yourself
    const before = users.length; users = users.filter(u => u.email !== norm(email));
    if (users.length !== before) saveUsers(); return users.length !== before;
  }

  return { ROLES, init, register, signIn, verify, resendCode, hasPending, cancel, current, user, label, can, logout, touch,
           requestReset, completeReset, changePassword, listUsers, addApprentice, removeUser, passwordProblem, isEmail,
           IDLE_MS };
})();
