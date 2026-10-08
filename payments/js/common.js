/* =========================================================
   Payment Tracking System - Shared helpers + API layer
   ---------------------------------------------------------
   TEMPLATE MODE: while CONFIG.API_URL is empty, every call
   is answered by the in-browser demo store below (sample
   data, saved in localStorage). Paste your Apps Script Web
   App URL into CONFIG.API_URL later and the same pages will
   talk to the real backend instead.
   ========================================================= */

const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxaOAz5DmW13l2aAt1Fygzm7bqVkfty8xkzdh43HQVH8hZp3oaiWviW6t6gxFPBygg/exec',
  ORG_NAME: 'Fortitude Fabrics'
};

const MODES = ['Cash', 'UPI', 'Bank Transfer'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------------- Formatting ---------------- */

// 1250.5 -> "₹1,250.50"   100000 -> "₹1,00,000.00"
function formatINR(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// "2026-10-06" -> "06/10/2026"
function isoToDMY(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

// "06/10/2026" -> "2026-10-06"  (always DD/MM/YYYY, never MM/DD). Returns null if invalid.
function dmyToISO(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return m[3] + '-' + m[2] + '-' + m[1];
}

function todayDMY() {
  const t = new Date();
  return String(t.getDate()).padStart(2, '0') + '/' +
         String(t.getMonth() + 1).padStart(2, '0') + '/' + t.getFullYear();
}

function nowStamp() {
  const t = new Date();
  return todayDMY() + ' ' + String(t.getHours()).padStart(2, '0') + ':' +
         String(t.getMinutes()).padStart(2, '0');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Auto-insert slashes while typing a DD/MM/YYYY date
function attachDateMask(input) {
  input.addEventListener('input', function () {
    let v = input.value.replace(/[^\d]/g, '').slice(0, 8);
    if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
    input.value = v;
  });
}

/* ---------------- Validation (mirrors backend rules) ---------------- */

function validatePayment(p) {
  const errors = {};
  if (!dmyToISO(p.date)) errors.date = 'Enter a valid date as DD/MM/YYYY.';
  if (!String(p.toWhom || '').trim()) errors.toWhom = 'To Whom is required.';
  if (!String(p.fromWhom || '').trim()) errors.fromWhom = 'By Whom is required.';
  if (!String(p.purpose || '').trim()) errors.purpose = 'Purpose is required.';
  if (String(p.source || '').trim().length > 120) errors.source = 'Source of Funds is too long.';
  const amt = String(p.amount || '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(amt) || Number(amt) <= 0) {
    errors.amount = 'Enter an amount greater than 0 with at most 2 decimal places.';
  }
  if (MODES.indexOf(p.mode) === -1) errors.mode = 'Select a payment mode.';
  return errors;
}

function showFieldErrors(form, errors) {
  form.querySelectorAll('.form-row').forEach(function (row) { row.classList.remove('has-error'); });
  Object.keys(errors).forEach(function (field) {
    const input = form.querySelector('[name="' + field + '"]');
    if (!input) return;
    const row = input.closest('.form-row');
    row.classList.add('has-error');
    const el = row.querySelector('.field-error');
    if (el) el.textContent = errors[field];
  });
}

/* ---------------- Admin session (token only, never a password) ---------------- */

const Session = {
  get() { try { return sessionStorage.getItem('pts_admin_token'); } catch (e) { return null; } },
  set(t) { try { sessionStorage.setItem('pts_admin_token', t); } catch (e) {} },
  clear() { try { sessionStorage.removeItem('pts_admin_token'); } catch (e) {} }
};

/* ---------------- API layer ---------------- */

const API = {
  isDemo() { return !CONFIG.API_URL; },

  async call(action, data) {
    const body = Object.assign({ action: action, token: Session.get() }, data || {});
    if (this.isDemo()) return Demo.handle(body);
    try {
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: 'Could not reach the server. Please try again.' };
    }
  },

  adminLogin(password)   { return this.call('adminLogin', { password: password }); },
  logout()               { return this.call('logout'); },
  createPayment(p)       { return this.call('createPayment', { payment: p }); },
  getPayments()          { return this.call('getPayments'); },
  updatePayment(id, p)   { return this.call('updatePayment', { paymentId: id, payment: p }); },
  deletePayment(id)      { return this.call('deletePayment', { paymentId: id }); },
  importPayments(list)   { return this.call('importPayments', { payments: list }); },
  publicLookup(query)    { return this.call('publicLookup', { query: query }); }
};

/* ---------------- Demo store (template mode only) ---------------- */

const SAMPLE_PAYMENTS = [
  { id: 'PAY-20260801-0001', date: '2026-08-01', toWhom: 'ABC Dyes & Chemicals', fromWhom: 'Accounts Dept.', purpose: 'Dye purchase, Aug batch', source: 'Working capital', amount: 12500, mode: 'Bank Transfer' },
  { id: 'PAY-20260815-0001', date: '2026-08-15', toWhom: 'Sri Lakshmi Tailors', fromWhom: 'Production', purpose: 'Stitching charges, coveralls', source: 'Working capital', amount: 8200, mode: 'Cash' },
  { id: 'PAY-20260822-0001', date: '2026-08-22', toWhom: 'Khammam Non-Woven Mills', fromWhom: 'Accounts Dept.', purpose: 'SMS fabric rolls', source: 'Bank loan', amount: 46500, mode: 'Bank Transfer' },
  { id: 'PAY-20260901-0001', date: '2026-09-01', toWhom: 'ABC Dyes & Chemicals', fromWhom: 'Accounts Dept.', purpose: 'Dye purchase, Sep batch', source: 'Working capital', amount: 11800, mode: 'UPI' },
  { id: 'PAY-20260912-0001', date: '2026-09-12', toWhom: 'Wyra Transport Co.', fromWhom: 'Dispatch', purpose: 'Freight to Hyderabad', source: 'Petty cash', amount: 1450.75, mode: 'Cash' },
  { id: 'PAY-20260920-0001', date: '2026-09-20', toWhom: 'Elastic & Trims Co.', fromWhom: 'Production', purpose: 'Elastic for head caps', source: 'Working capital', amount: 3600, mode: 'UPI' },
  { id: 'PAY-20261001-0001', date: '2026-10-01', toWhom: 'Wyra Transport Co.', fromWhom: 'Dispatch', purpose: 'Freight to Vizag', source: 'Petty cash', amount: 850, mode: 'Cash' },
  { id: 'PAY-20261006-0001', date: '2026-10-06', toWhom: 'ABC Dyes & Chemicals', fromWhom: 'Accounts Dept.', purpose: 'Dye purchase, Oct batch', source: 'Working capital', amount: 12500, mode: 'Bank Transfer' },
  { id: 'PAY-20261006-0002', date: '2026-10-06', toWhom: 'Packwell Cartons', fromWhom: 'Dispatch', purpose: 'Packing material', source: 'Petty cash', amount: 500, mode: 'Cash' },
  { id: 'PAY-20261006-0003', date: '2026-10-06', toWhom: 'Sai Engineering Works', fromWhom: 'Maintenance', purpose: 'Sewing machine repair', source: 'Working capital', amount: 8500, mode: 'UPI' }
];

const Demo = {
  KEY: 'pts_demo_payments_v2',

  load() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return SAMPLE_PAYMENTS.map(function (p) { return Object.assign({}, p); });
  },

  save(list) {
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {}
  },

  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  },

  delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); },

  addRecord(list, p) {
    const iso = dmyToISO(p.date);
    const prefix = 'PAY-' + iso.replace(/-/g, '') + '-';
    const seq = list.reduce(function (max, x) {
      return x.id.indexOf(prefix) === 0 ? Math.max(max, Number(x.id.slice(prefix.length))) : max;
    }, 0) + 1;
    const rec = {
      id: prefix + String(seq).padStart(4, '0'),
      date: iso,
      toWhom: p.toWhom.trim(),
      fromWhom: p.fromWhom.trim(),
      purpose: p.purpose.trim(),
      source: String(p.source || '').trim(),
      amount: Math.round(Number(p.amount) * 100) / 100,
      mode: p.mode
    };
    list.push(rec);
    return rec;
  },

  toPublic(p) {
    return { id: p.id, date: p.date, toWhom: p.toWhom, fromWhom: p.fromWhom,
             purpose: p.purpose, amount: p.amount, mode: p.mode };
  },

  async handle(req) {
    await this.delay(350);
    const list = this.load();
    const isAdmin = req.token === 'demo-token';

    switch (req.action) {
      case 'adminLogin':
        // Demo only: any non-empty password works. The real check happens in Code.gs.
        if (!req.password) return { success: false, message: 'Enter the admin password.' };
        return { success: true, token: 'demo-token' };

      case 'createPayment': {
        if (!isAdmin) return { success: false, message: 'Not authorised' };
        const p = req.payment;
        const errs = validatePayment(p);
        if (Object.keys(errs).length) return { success: false, message: errs[Object.keys(errs)[0]] };
        const rec = this.addRecord(list, p);
        this.save(list);
        return { success: true, message: 'Payment added successfully', paymentId: rec.id, payment: rec };
      }

      case 'importPayments': {
        if (!isAdmin) return { success: false, message: 'Not authorised' };
        const rows = Array.isArray(req.payments) ? req.payments : [];
        if (!rows.length) return { success: false, message: 'Nothing to import.' };
        for (let i = 0; i < rows.length; i++) {
          const errs = validatePayment(rows[i]);
          if (Object.keys(errs).length) return { success: false, message: 'Row ' + (i + 1) + ': ' + errs[Object.keys(errs)[0]] };
        }
        const self = this;
        const ids = rows.map(function (p) { return self.addRecord(list, p).id; });
        this.save(list);
        return { success: true, message: ids.length + ' payments imported', count: ids.length, paymentIds: ids };
      }

      case 'logout':
        return { success: true };

      case 'getPayments':
        if (!isAdmin) return { success: false, message: 'Not authorised' };
        return { success: true, payments: list };

      case 'updatePayment': {
        if (!isAdmin) return { success: false, message: 'Not authorised' };
        const errs = validatePayment(req.payment);
        if (Object.keys(errs).length) return { success: false, message: errs[Object.keys(errs)[0]] };
        const rec = list.find(function (x) { return x.id === req.paymentId; });
        if (!rec) return { success: false, message: 'Payment not found' };
        Object.assign(rec, {
          date: dmyToISO(req.payment.date),
          toWhom: req.payment.toWhom.trim(),
          fromWhom: req.payment.fromWhom.trim(),
          purpose: req.payment.purpose.trim(),
          source: String(req.payment.source || '').trim(),
          amount: Math.round(Number(req.payment.amount) * 100) / 100,
          mode: req.payment.mode
        });
        this.save(list);
        return { success: true, message: 'Payment updated' };
      }

      case 'deletePayment': {
        if (!isAdmin) return { success: false, message: 'Not authorised' };
        const idx = list.findIndex(function (x) { return x.id === req.paymentId; });
        if (idx === -1) return { success: false, message: 'Payment not found' };
        list.splice(idx, 1);
        this.save(list);
        return { success: true, message: 'Payment deleted' };
      }

      case 'publicLookup': {
        // Public: exact Payment ID, or exact (case-insensitive) vendor name only.
        // No partial matching, so the database can't be browsed by guessing letters.
        const q = String(req.query || '').trim();
        if (!q) return { success: false, message: 'Enter a Payment ID or name.' };
        if (/^PAY-\d{8}-\d{4}$/i.test(q)) {
          const rec = list.find(function (x) { return x.id.toUpperCase() === q.toUpperCase(); });
          return rec ? { success: true, type: 'id', payment: this.toPublic(rec) }
                     : { success: false, message: 'No payment found for this ID.' };
        }
        const matches = list
          .filter(function (x) { return x.toWhom.toLowerCase() === q.toLowerCase(); })
          .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        if (!matches.length) return { success: false, message: 'No payments found. Check the exact name or use your Payment ID.' };
        return {
          success: true, type: 'name', name: matches[0].toWhom,
          count: matches.length,
          total: matches.reduce(function (s, x) { return s + Number(x.amount); }, 0),
          lastDate: matches[matches.length - 1].date,
          payments: matches.map(this.toPublic)
        };
      }
    }
    return { success: false, message: 'Unknown action' };
  }
};

/* ---------------- Shared page bits ---------------- */

function showDemoBanner() {
  if (!API.isDemo()) return;
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.innerHTML = 'Template mode &mdash; showing sample data stored in this browser. ' +
    'Set <span class="mono">API_URL</span> in payments/js/common.js to connect Google Apps Script. ' +
    '<a href="#" id="resetDemo">Reset sample data</a>';
  const top = document.querySelector('.topbar');
  top.parentNode.insertBefore(b, top.nextSibling);
  document.getElementById('resetDemo').addEventListener('click', function (e) {
    e.preventDefault();
    Demo.reset();
    location.reload();
  });
}

function setFooterYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ---------------- Source of Funds suggestions ---------------- */

// Fills the page's <datalist> so each source is spelled the same way every time
function fillSourceList(sources) {
  const dl = document.getElementById('sourceList');
  if (!dl) return;
  const seen = {};
  dl.innerHTML = sources.map(function (s) { return String(s || '').trim(); }).filter(function (s) {
    const k = s.toLowerCase();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
}

const RecentSources = {
  KEY: 'pts_recent_sources',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  add(s) {
    s = String(s || '').trim();
    if (!s) return;
    const list = this.get().filter(function (x) { return x.toLowerCase() !== s.toLowerCase(); });
    list.unshift(s);
    try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }
};
