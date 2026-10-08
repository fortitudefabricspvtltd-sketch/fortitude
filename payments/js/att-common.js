/* =========================================================
   Attendance & Stitching Log - shared helpers
   Load after common.js. Adds attendance calls to API and,
   in template mode, sample attendance data to Demo.
   ========================================================= */

const FREQUENCIES = ['Daily', 'Weekly'];   // the "Payment" column

/* ---------------- Formatting ---------------- */

// "09:30" -> "9:30 AM"
function formatTime12(t) {
  if (!t) return '';
  const p = t.split(':');
  const h = +p[0];
  return ((h % 12) || 12) + ':' + p[1] + ' ' + (h < 12 ? 'AM' : 'PM');
}

// Same rule as the log book's Hours formula: MOD(out - in, 1) * 24 (night shifts work)
function calcHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return '';
  const mins = function (t) { const p = t.split(':'); return +p[0] * 60 + +p[1]; };
  return Math.round(((mins(timeOut) - mins(timeIn) + 1440) % 1440) / 60 * 100) / 100;
}

function formatHours(h) {
  return h === '' || h == null ? '' : Number(h).toFixed(2);
}

function formatQty(n) {
  return n === '' || n == null ? '' : Number(n).toLocaleString('en-IN');
}

/* ---------------- Worker IDs (one per person, like a roll number) ---------------- */

const WORKER_ID_RE = /^W-\d{4,}$/i;

function isWorkerId(s) { return WORKER_ID_RE.test(String(s || '').trim()); }

// Find a worker by ID ("w-0001") or by name (case/space-insensitive)
function findWorker(workers, text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!t) return null;
  return (workers || []).find(function (w) {
    return w.id.toLowerCase() === t || w.name.replace(/\s+/g, ' ').toLowerCase() === t;
  }) || null;
}

/* ---------------- Validation (mirrors Attendance.gs) ---------------- */

function validateAttendance(e) {
  const errors = {};
  if (!dmyToISO(e.date)) errors.date = 'Enter a valid date as DD/MM/YYYY.';
  const person = String(e.person || '').trim();
  if (!person) errors.person = 'Person Name is required.';
  else if (person.length > 120) errors.person = 'Person Name is too long.';
  if (e.status !== 'P' && e.status !== 'A') errors.status = 'Select P or A.';

  if (e.status === 'P') {
    const re = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (e.timeIn && !re.test(e.timeIn)) errors.timeIn = 'Enter a valid time.';
    if (e.timeOut && !re.test(e.timeOut)) errors.timeOut = 'Enter a valid time.';
    if (!errors.timeIn && !errors.timeOut && !!e.timeIn !== !!e.timeOut) {
      errors[e.timeIn ? 'timeOut' : 'timeIn'] = 'Enter both Time In and Time Out, or neither.';
    }
    if (String(e.item || '').trim().length > 200) errors.item = 'Item Stitched is too long.';
    const q = String(e.qty == null ? '' : e.qty).trim();
    if (q !== '' && (!/^\d+$/.test(q) || Number(q) > 1000000)) errors.qty = 'Enter a whole number.';
  }
  if (e.paid !== 'Y' && e.paid !== 'N') errors.paid = 'Select Y or N.';
  if (FREQUENCIES.indexOf(e.frequency) === -1) errors.frequency = 'Select Daily or Weekly.';
  return errors;
}

/* ---------------- API calls ---------------- */

Object.assign(API, {
  getAttendance()                { return this.call('getAttendance'); },
  getWorkers()                   { return this.call('getWorkers'); },
  createAttendance(e)            { return this.call('createAttendance', { entry: e }); },
  importAttendance(list)         { return this.call('importAttendance', { entries: list }); },
  updateAttendance(id, e)        { return this.call('updateAttendance', { entryId: id, entry: e }); },
  deleteAttendance(id)           { return this.call('deleteAttendance', { entryId: id }); },
  markAttendancePaid(ids, paid)  { return this.call('markAttendancePaid', { entryIds: ids, paid: paid }); }
});

/* ---------------- Known names (for the Person Name suggestions) ---------------- */

const RecentPeople = {
  KEY: 'pts_recent_people',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  add(name) {
    name = String(name || '').trim();
    if (!name) return;
    const list = this.get().filter(function (x) { return x.toLowerCase() !== name.toLowerCase(); });
    list.unshift(name);
    try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 100))); } catch (e) {}
  }
};

function fillPeopleList(names) {
  const dl = document.getElementById('peopleList');
  if (!dl) return;
  const seen = {};
  dl.innerHTML = names.map(function (s) { return String(s || '').trim(); }).filter(function (s) {
    const k = s.toLowerCase();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
}

/* ---------------- Demo store (template mode only) ---------------- */

const SAMPLE_ATTENDANCE = [
  ['2026-09-28', 'Ravi Kumar', 'P', '09:30', '18:00', 'Cotton shirt', 40, 'Y', 'Weekly'],
  ['2026-09-28', 'Lakshmi Devi', 'P', '09:00', '17:30', 'Coverall (SMS)', 25, 'Y', 'Weekly'],
  ['2026-09-28', 'Suresh Babu', 'A', '', '', '', '', 'N', 'Daily'],
  ['2026-09-29', 'Ravi Kumar', 'P', '09:30', '18:30', 'Cotton shirt', 42, 'Y', 'Weekly'],
  ['2026-09-29', 'Lakshmi Devi', 'P', '09:00', '17:30', 'Coverall (SMS)', 28, 'Y', 'Weekly'],
  ['2026-09-29', 'Suresh Babu', 'P', '10:00', '18:00', 'Head cap', 120, 'Y', 'Daily'],
  ['2026-10-05', 'Ravi Kumar', 'P', '09:30', '18:00', 'Woven coverall', 18, 'N', 'Weekly'],
  ['2026-10-05', 'Lakshmi Devi', 'A', '', '', '', '', 'N', 'Weekly'],
  ['2026-10-06', 'Ravi Kumar', 'P', '09:30', '18:00', 'Woven coverall', 20, 'N', 'Weekly'],
  ['2026-10-06', 'Lakshmi Devi', 'P', '09:00', '17:30', 'Shoe cover', 150, 'N', 'Weekly'],
  ['2026-10-06', 'Suresh Babu', 'P', '10:00', '18:00', 'Head cap', 130, 'N', 'Daily']
];
const SAMPLE_WORKERS = [
  { id: 'W-0001', name: 'Ravi Kumar' }, { id: 'W-0002', name: 'Lakshmi Devi' }, { id: 'W-0003', name: 'Suresh Babu' }
];

const AttDemo = {
  KEY: 'pts_demo_attendance_v2',
  WKEY: 'pts_demo_workers_v1',

  load() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return SAMPLE_ATTENDANCE.map(function (r, i, all) {
      const n = all.slice(0, i).filter(function (x) { return x[0] === r[0]; }).length + 1;
      return { id: 'ATT-' + r[0].replace(/-/g, '') + '-' + String(n).padStart(4, '0'),
               workerId: findWorker(SAMPLE_WORKERS, r[1]).id, date: r[0], person: r[1], status: r[2],
               timeIn: r[3], timeOut: r[4], hours: calcHours(r[3], r[4]), item: r[5], qty: r[6],
               paid: r[7], frequency: r[8] };
    });
  },

  workers() {
    try {
      const s = localStorage.getItem(this.WKEY);
      if (s) return JSON.parse(s);
    } catch (e) {}
    return SAMPLE_WORKERS.map(function (w) { return Object.assign({}, w); });
  },

  save(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) {} },
  saveWorkers(ws) { try { localStorage.setItem(this.WKEY, JSON.stringify(ws)); } catch (e) {} },

  // Same rule as the server: same name -> same Worker ID; new name -> next ID
  worker(name) {
    const ws = this.workers();
    let w = findWorker(ws, name);
    if (!w) {
      const last = ws.reduce(function (m, x) { return Math.max(m, Number(x.id.slice(2))); }, 0);
      w = { id: 'W-' + String(last + 1).padStart(4, '0'), name: String(name).trim().replace(/\s+/g, ' ') };
      ws.push(w);
      this.saveWorkers(ws);
    }
    return w;
  },

  clean(e) {
    const present = e.status === 'P';
    const timeIn = present ? String(e.timeIn || '') : '';
    const timeOut = present ? String(e.timeOut || '') : '';
    const q = present ? String(e.qty == null ? '' : e.qty).trim() : '';
    const w = this.worker(e.person);
    return { workerId: w.id, date: dmyToISO(e.date), person: w.name, status: e.status, timeIn: timeIn,
             timeOut: timeOut, hours: calcHours(timeIn, timeOut), item: present ? String(e.item || '').trim() : '',
             qty: q === '' ? '' : Number(q), paid: e.paid, frequency: e.frequency };
  },

  add(list, e) {
    const rec = this.clean(e);
    const prefix = 'ATT-' + rec.date.replace(/-/g, '') + '-';
    const seq = list.reduce(function (max, x) {
      return x.id.indexOf(prefix) === 0 ? Math.max(max, Number(x.id.slice(prefix.length))) : max;
    }, 0) + 1;
    rec.id = prefix + String(seq).padStart(4, '0');
    list.push(rec);
    return rec;
  },

  firstError(e) {
    const errs = validateAttendance(e);
    const k = Object.keys(errs)[0];
    if (k) return errs[k];
    if (isWorkerId(e.person) && !findWorker(this.workers(), e.person)) {
      return 'No worker with ID ' + String(e.person).trim().toUpperCase();
    }
    return '';
  },

  handle(req, list) {
    const self = this;
    switch (req.action) {
      case 'getAttendance':
        return { success: true, entries: list, workers: this.workers(), frequencies: FREQUENCIES };

      case 'getWorkers':
        return { success: true, workers: this.workers() };

      case 'createAttendance': {
        const err = this.firstError(req.entry);
        if (err) return { success: false, message: err };
        const rec = this.add(list, req.entry);
        this.save(list);
        return { success: true, message: 'Attendance saved', entryId: rec.id, entry: rec };
      }

      case 'importAttendance': {
        const rows = Array.isArray(req.entries) ? req.entries : [];
        if (!rows.length) return { success: false, message: 'Nothing to import.' };
        for (let i = 0; i < rows.length; i++) {
          const err = this.firstError(rows[i]);
          if (err) return { success: false, message: 'Row ' + (i + 1) + ': ' + err };
        }
        const ids = rows.map(function (e) { return self.add(list, e).id; });
        this.save(list);
        return { success: true, message: ids.length + ' entries imported', count: ids.length, entryIds: ids };
      }

      case 'updateAttendance': {
        const err = this.firstError(req.entry);
        if (err) return { success: false, message: err };
        const rec = list.find(function (x) { return x.id === req.entryId; });
        if (!rec) return { success: false, message: 'Entry not found' };
        Object.assign(rec, this.clean(req.entry));
        this.save(list);
        return { success: true, message: 'Entry updated' };
      }

      case 'deleteAttendance': {
        const idx = list.findIndex(function (x) { return x.id === req.entryId; });
        if (idx === -1) return { success: false, message: 'Entry not found' };
        list.splice(idx, 1);
        this.save(list);
        return { success: true, message: 'Entry deleted' };
      }

      case 'markAttendancePaid': {
        const ids = Array.isArray(req.entryIds) ? req.entryIds : [];
        let n = 0;
        list.forEach(function (x) {
          if (ids.indexOf(x.id) > -1 && x.paid !== req.paid) { x.paid = req.paid; n++; }
        });
        this.save(list);
        return { success: true, message: n + ' entries updated', count: n };
      }
    }
    return null;
  }
};

// Route attendance actions to AttDemo; everything else keeps going to the payments Demo
(function () {
  const baseHandle = Demo.handle.bind(Demo);
  const baseReset = Demo.reset.bind(Demo);
  Demo.handle = async function (req) {
    if (/Attendance|Workers/.test(req.action || '')) {
      await this.delay(300);
      if (req.token !== 'demo-token') return { success: false, message: 'Not authorised' };
      return AttDemo.handle(req, AttDemo.load()) || { success: false, message: 'Unknown action' };
    }
    return baseHandle(req);
  };
  Demo.reset = function () {
    baseReset();
    try { localStorage.removeItem(AttDemo.KEY); localStorage.removeItem(AttDemo.WKEY); } catch (e) {}
  };
})();

/* ---------------- Page guard ---------------- */

// Attendance pages are admin-only: no login -> admin login, which sends you back
function requireAdmin(nextKey) {
  if (Session.get()) return true;
  location.replace('admin.html?next=' + nextKey);
  return false;
}
