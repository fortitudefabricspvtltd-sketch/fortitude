/* Attendance dashboard page */
(function () {
  if (!requireAdmin('attendance')) return;

  showDemoBanner();
  setFooterYear();

  const $ = function (id) { return document.getElementById(id); };
  let entries = [];       // all records from the server, newest first
  let workers = [];       // [{ id: 'W-0001', name }] — one permanent ID per person
  let filtered = [];      // after filters / search
  const selected = {};    // Entry ID -> true
  let editingId = null;
  let deletingId = null;

  $('dashView').hidden = false;

  $('logoutLink').addEventListener('click', async function (e) {
    e.preventDefault();
    await API.logout();
    Session.clear();
    location.replace('admin.html');
  });

  function authFailed(res) {
    if (/not authori/i.test(res.message || '')) {
      Session.clear();
      location.replace('admin.html?next=attendance');
      return true;
    }
    return false;
  }

  /* ---------------- Data ---------------- */

  async function load() {
    $('dashMsg').innerHTML = '<div class="msg msg-info">Loading attendance...</div>';
    const res = await API.getAttendance();
    if (!res.success) {
      if (authFailed(res)) return;
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    $('dashMsg').innerHTML = '';
    workers = res.workers || [];
    entries = res.entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    Object.keys(selected).forEach(function (k) { delete selected[k]; });
    fillYearOptions();
    fillPersonOptions();
    applyFilters();
  }

  /* ---------------- Filters ---------------- */

  MONTHS.forEach(function (m, i) {
    const o = document.createElement('option');
    o.value = String(i + 1).padStart(2, '0');
    o.textContent = m;
    $('fMonth').appendChild(o);
  });

  function fillYearOptions() {
    const sel = $('fYear');
    const cur = sel.value;
    const years = Array.from(new Set(entries.map(function (a) { return a.date.slice(0, 4); }))).sort().reverse();
    sel.innerHTML = '<option value="">All</option>' + years.map(function (y) {
      return '<option value="' + y + '">' + y + '</option>';
    }).join('');
    sel.value = years.indexOf(cur) > -1 ? cur : '';
  }

  function peopleNames() {
    const seen = {};
    return entries.map(function (a) { return a.person.trim(); }).filter(function (n) {
      const k = n.toLowerCase();
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    }).sort(function (x, y) { return x.toLowerCase() < y.toLowerCase() ? -1 : 1; });
  }

  function fillPersonOptions() {
    const sel = $('fPerson');
    const cur = sel.value;
    const names = peopleNames();
    sel.innerHTML = '<option value="">All</option>' + names.map(function (n) {
      const w = findWorker(workers, n);
      return '<option value="' + esc(n) + '">' + esc(n) + (w ? ' (' + esc(w.id) + ')' : '') + '</option>';
    }).join('');
    sel.value = names.indexOf(cur) > -1 ? cur : '';
    fillPeopleList(names.concat(RecentPeople.get()));
  }

  ['fDate', 'fFrom', 'fTo'].forEach(function (id) { attachDateMask($(id)); });
  ['fYear', 'fMonth', 'fPerson', 'fStatus', 'fPaid', 'fFreq'].forEach(function (id) { $(id).addEventListener('change', applyFilters); });
  ['fDate', 'fFrom', 'fTo', 'fSearch'].forEach(function (id) { $(id).addEventListener('input', applyFilters); });

  const ALL_FILTERS = ['fYear', 'fMonth', 'fDate', 'fFrom', 'fTo', 'fPerson', 'fStatus', 'fPaid', 'fFreq', 'fSearch'];
  $('clearFilters').addEventListener('click', function () {
    ALL_FILTERS.forEach(function (id) { $(id).value = ''; });
    applyFilters();
  });

  // Quick ranges; weeks run Monday to Sunday
  function toDMY(d) {
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }
  document.querySelectorAll('[data-range]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      let from, to;
      switch (btn.getAttribute('data-range')) {
        case 'today': from = to = today; break;
        case 'thisWeek': from = monday; to = new Date(monday); to.setDate(monday.getDate() + 6); break;
        case 'lastWeek': from = new Date(monday); from.setDate(monday.getDate() - 7);
                         to = new Date(monday); to.setDate(monday.getDate() - 1); break;
        case 'thisMonth': from = new Date(today.getFullYear(), today.getMonth(), 1);
                          to = new Date(today.getFullYear(), today.getMonth() + 1, 0); break;
      }
      ['fYear', 'fMonth', 'fDate'].forEach(function (id) { $(id).value = ''; });
      $('fFrom').value = toDMY(from);
      $('fTo').value = toDMY(to);
      applyFilters();
    });
  });

  function dateFilterValue(id) {
    const v = $(id).value.trim();
    $(id).closest('.form-row').classList.toggle('has-error', v.length === 10 && !dmyToISO(v));
    return v.length === 10 ? dmyToISO(v) : null;
  }

  function applyFilters() {
    const f = {
      year: $('fYear').value, month: $('fMonth').value, person: $('fPerson').value.toLowerCase(),
      status: $('fStatus').value, paid: $('fPaid').value, freq: $('fFreq').value,
      day: dateFilterValue('fDate'), from: dateFilterValue('fFrom'), to: dateFilterValue('fTo'),
      q: $('fSearch').value.trim().toLowerCase()
    };
    filtered = entries.filter(function (a) {
      if (f.year && a.date.slice(0, 4) !== f.year) return false;
      if (f.month && a.date.slice(5, 7) !== f.month) return false;
      if (f.day && a.date !== f.day) return false;
      if (f.from && a.date < f.from) return false;
      if (f.to && a.date > f.to) return false;
      if (f.person && a.person.trim().toLowerCase() !== f.person) return false;
      if (f.status && a.status !== f.status) return false;
      if (f.paid && a.paid !== f.paid) return false;
      if (f.freq && a.frequency !== f.freq) return false;
      if (f.q) {
        // An exact Worker ID matches only that worker (W-0001 must not also match W-00012)
        if (isWorkerId(f.q)) return (a.workerId || '').toLowerCase() === f.q;
        const hay = [a.id, a.workerId, a.person, a.item, isoToDMY(a.date)].join(' ').toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });
    // Selection only covers rows that are still visible
    const visible = {};
    filtered.forEach(function (a) { visible[a.id] = true; });
    Object.keys(selected).forEach(function (id) { if (!visible[id]) delete selected[id]; });

    renderSummary();
    renderPeople();
    renderWorker();
    renderTable();
    renderScope(f);
  }

  /* ---------------- Rendering ---------------- */

  function totals(list) {
    return list.reduce(function (t, a) {
      t.count++;
      if (a.status === 'P') t.present++; else t.absent++;
      t.hours += Number(a.hours) || 0;
      t.qty += Number(a.qty) || 0;
      if (a.paid === 'N') t.unpaid++;
      return t;
    }, { count: 0, present: 0, absent: 0, hours: 0, qty: 0, unpaid: 0 });
  }

  function renderSummary() {
    const t = totals(filtered);
    $('stCount').textContent = t.count;
    $('stPresent').textContent = t.present;
    $('stAbsent').textContent = t.absent;
    $('stHours').textContent = t.hours.toFixed(2);
    $('stQty').textContent = formatQty(t.qty) || '0';
    $('stUnpaid').textContent = t.unpaid;
  }

  function renderPeople() {
    const groups = {};
    filtered.forEach(function (a) {   // newest first, so the first frequency seen is the latest
      const k = a.person.trim().toLowerCase();
      if (!groups[k]) groups[k] = { name: a.person.trim(), workerId: a.workerId || '', list: [], frequency: a.frequency };
      groups[k].list.push(a);
    });
    const rows = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (x, y) { return x.name.toLowerCase() < y.name.toLowerCase() ? -1 : 1; });
    $('personRows').innerHTML = rows.length ? rows.map(function (g) {
      const t = totals(g.list);
      return '<tr>' +
        '<td data-label="Worker ID" class="mono">' + esc(g.workerId) + '</td>' +
        '<td data-label="Person"><strong>' + esc(g.name) + '</strong></td>' +
        '<td data-label="Days Present" class="num">' + t.present + '</td>' +
        '<td data-label="Absent" class="num">' + t.absent + '</td>' +
        '<td data-label="Hours" class="num">' + t.hours.toFixed(2) + '</td>' +
        '<td data-label="Total Qty" class="num">' + (formatQty(t.qty) || '0') + '</td>' +
        '<td data-label="Unpaid" class="num">' + (t.unpaid ? '<span class="pill pill-warn">' + t.unpaid + '</span>' : '0') + '</td>' +
        '<td data-label="Payment">' + esc(g.frequency) + '</td>' +
        '<td data-label="" class="actions"><button type="button" class="btn btn-sm" data-person="' + esc(g.name) + '">Show only</button></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="9" class="muted">No entries.</td></tr>';
  }

  // One worker's full summary when every shown entry belongs to the same person
  function renderWorker() {
    const ids = Array.from(new Set(filtered.map(function (a) { return a.workerId || a.person.trim().toLowerCase(); })));
    if (!filtered.length || ids.length !== 1 || (!$('fSearch').value.trim() && !$('fPerson').value)) {
      $('workerPanel').hidden = true;
      return;
    }
    const t = totals(filtered);
    const first = filtered[filtered.length - 1];   // newest first
    const items = {};
    filtered.forEach(function (a) {
      if (!a.item) return;
      items[a.item] = (items[a.item] || 0) + (Number(a.qty) || 0);
    });
    $('wName').textContent = filtered[0].person;
    $('wId').textContent = filtered[0].workerId || '';
    $('wPresent').textContent = t.present;
    $('wAbsent').textContent = t.absent;
    $('wHours').textContent = t.hours.toFixed(2);
    $('wQty').textContent = formatQty(t.qty) || '0';
    $('wUnpaid').textContent = t.unpaid;
    $('wFreq').textContent = filtered[0].frequency;
    $('wRange').textContent = isoToDMY(first.date) + ' → ' + isoToDMY(filtered[0].date) + ' (' + t.count + ' entries)';
    $('wItems').textContent = Object.keys(items).map(function (k) { return k + ': ' + formatQty(items[k]); }).join(', ') || '—';
    $('workerPanel').hidden = false;
  }

  function renderTable() {
    const body = $('rows');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="15" class="muted" style="text-align:center;padding:18px">No entries match the selected filters.</td></tr>';
    } else {
      body.innerHTML = filtered.map(function (a, i) {
        return '<tr>' +
          '<td data-label="Select" class="check"><input type="checkbox" data-sel="' + esc(a.id) + '"' + (selected[a.id] ? ' checked' : '') + '></td>' +
          '<td data-label="Sl. No.">' + (i + 1) + '</td>' +
          '<td data-label="Entry ID" class="mono">' + esc(a.id) + '</td>' +
          '<td data-label="Worker ID" class="mono"><a href="#" data-worker="' + esc(a.workerId || '') + '">' + esc(a.workerId || '') + '</a></td>' +
          '<td data-label="Date">' + esc(isoToDMY(a.date)) + '</td>' +
          '<td data-label="Person">' + esc(a.person) + '</td>' +
          '<td data-label="Att."><span class="pill ' + (a.status === 'P' ? 'pill-ok' : 'pill-bad') + '">' + esc(a.status) + '</span></td>' +
          '<td data-label="Time In">' + esc(formatTime12(a.timeIn)) + '</td>' +
          '<td data-label="Time Out">' + esc(formatTime12(a.timeOut)) + '</td>' +
          '<td data-label="Hours" class="num">' + formatHours(a.hours) + '</td>' +
          '<td data-label="Item">' + esc(a.item) + '</td>' +
          '<td data-label="Qty" class="num">' + formatQty(a.qty) + '</td>' +
          '<td data-label="Paid"><span class="pill ' + (a.paid === 'Y' ? 'pill-ok' : 'pill-warn') + '">' + esc(a.paid) + '</span></td>' +
          '<td data-label="Payment">' + esc(a.frequency) + '</td>' +
          '<td data-label="Actions" class="actions">' +
            '<button type="button" class="btn btn-sm" data-edit="' + esc(a.id) + '">Edit</button> ' +
            '<button type="button" class="btn btn-sm btn-link-danger" data-del="' + esc(a.id) + '">Delete</button>' +
          '</td></tr>';
      }).join('');
    }
    const t = totals(filtered);
    $('footHours').textContent = t.hours.toFixed(2);
    $('footQty').textContent = formatQty(t.qty) || '0';
    $('rowCount').textContent = 'Showing ' + filtered.length + ' of ' + entries.length + ' entries';
    renderSelection();
  }

  function renderScope(f) {
    const parts = [];
    if (f.day) parts.push(isoToDMY(f.day));
    else {
      if (f.month) parts.push(MONTHS[+f.month - 1]);
      if (f.year) parts.push(f.year);
      if (f.from || f.to) parts.push((f.from ? isoToDMY(f.from) : '...') + ' to ' + (f.to ? isoToDMY(f.to) : '...'));
    }
    if (f.person) parts.push($('fPerson').value);
    if (f.status) parts.push(f.status === 'P' ? 'Present' : 'Absent');
    if (f.paid) parts.push(f.paid === 'Y' ? 'Paid' : 'Unpaid');
    if (f.freq) parts.push(f.freq);
    if (f.q) parts.push('"' + $('fSearch').value.trim() + '"');
    $('scopeLabel').textContent = parts.length ? 'Showing: ' + parts.join(' · ') : 'All records';
    $('tableTitle').textContent = f.day ? 'Attendance — ' + isoToDMY(f.day) : 'Attendance Records';
  }

  /* ---------------- Selection + Mark Paid ---------------- */

  function selectedIds() { return Object.keys(selected); }

  function renderSelection() {
    const n = selectedIds().length;
    $('bulkBar').hidden = n === 0;
    $('bulkCount').textContent = n + ' selected';
    $('checkAll').checked = n > 0 && n === filtered.length;
    $('checkAll').indeterminate = n > 0 && n < filtered.length;
  }

  $('rows').addEventListener('change', function (e) {
    const id = e.target.getAttribute('data-sel');
    if (!id) return;
    if (e.target.checked) selected[id] = true; else delete selected[id];
    renderSelection();
  });

  $('checkAll').addEventListener('change', function () {
    const on = this.checked;
    filtered.forEach(function (a) { if (on) selected[a.id] = true; else delete selected[a.id]; });
    renderTable();
  });

  $('clearSelBtn').addEventListener('click', function () {
    Object.keys(selected).forEach(function (k) { delete selected[k]; });
    renderTable();
  });

  async function markPaid(paid) {
    const ids = selectedIds();
    if (!ids.length) return;
    const btns = [$('markPaidBtn'), $('markUnpaidBtn')];
    btns.forEach(function (b) { b.disabled = true; });
    const res = await API.markAttendancePaid(ids, paid);
    btns.forEach(function (b) { b.disabled = false; });
    if (!res.success) {
      if (authFailed(res)) return;
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    await load();
    $('dashMsg').innerHTML = '<div class="msg msg-success">' + esc(res.count) + ' entr' + (res.count === 1 ? 'y' : 'ies') +
      ' marked ' + (paid === 'Y' ? 'Paid (Y)' : 'Unpaid (N)') + '.</div>';
  }
  $('markPaidBtn').addEventListener('click', function () { markPaid('Y'); });
  $('markUnpaidBtn').addEventListener('click', function () { markPaid('N'); });

  // Click any Worker ID to see just that worker
  $('rows').addEventListener('click', function (e) {
    const w = e.target.getAttribute('data-worker');
    if (w === null) return;
    e.preventDefault();
    if (!w) return;
    ALL_FILTERS.forEach(function (id) { $(id).value = ''; });
    $('fSearch').value = w;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('personRows').addEventListener('click', function (e) {
    const name = e.target.getAttribute('data-person');
    if (!name) return;
    $('fPerson').value = name;
    applyFilters();
  });

  /* ---------------- Toolbar ---------------- */

  $('refreshBtn').addEventListener('click', load);

  $('exportBtn').addEventListener('click', function () {
    const head = ['Entry ID', 'Worker ID', 'Date', 'Person Name', 'Attendance (P / A)', 'Time In', 'Time Out', 'Hours',
      'Item Stitched', 'Item Quantity', 'Paid (Y / N)', 'Payment'];
    const cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    const lines = [head.map(cell).join(',')].concat(filtered.map(function (a) {
      return [a.id, a.workerId || '', isoToDMY(a.date), a.person, a.status, formatTime12(a.timeIn), formatTime12(a.timeOut),
        formatHours(a.hours), a.item, a.qty, a.paid, a.frequency].map(cell).join(',');
    }));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'attendance-' + todayDMY().split('/').reverse().join('') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  function needXlsx() {
    if (window.XLSX) return true;
    $('dashMsg').innerHTML = '<div class="msg msg-error">Excel library did not load. Check your internet connection and refresh.</div>';
    return false;
  }

  $('exportXlsxBtn').addEventListener('click', function () {
    if (!needXlsx()) return;
    const scope = $('scopeLabel').textContent.replace(/^Showing: /, '');
    AttendanceExcel.exportLog(filtered, scope === 'All records' ? '' : scope);
  });

  /* ---------------- Excel import ---------------- */

  let importQueue = [];

  $('importBtn').addEventListener('click', function () {
    if (!needXlsx()) return;
    $('importFile').value = '';
    $('importFile').click();
  });

  // Same date + person already in the system = probably already imported
  function dupKey(a) {
    const iso = a.date.indexOf('/') > -1 ? dmyToISO(a.date) : a.date;
    return iso + '|' + a.person.trim().toLowerCase();
  }

  $('importFile').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    if (!file) return;
    let parsed;
    try {
      parsed = AttendanceExcel.parse(await file.arrayBuffer());
    } catch (err) {
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(err.message || 'Could not read this file.') + '</div>';
      return;
    }

    const existingIds = {};
    const existingKeys = {};
    entries.forEach(function (a) { existingIds[a.id.toUpperCase()] = true; existingKeys[dupKey(a)] = true; });

    const skipped = [];
    importQueue = [];
    parsed.rows.forEach(function (r) {
      if ((r.id && existingIds[r.id.toUpperCase()]) || existingKeys[dupKey(r.entry)]) skipped.push(r);
      else importQueue.push(r);
    });

    let html = '<div class="msg msg-info">File <strong>' + esc(file.name) + '</strong>, sheet <strong>' +
      esc(parsed.sheetName) + '</strong>: ' + importQueue.length + ' new entr' + (importQueue.length === 1 ? 'y' : 'ies') + ' ready.</div>';
    if (skipped.length) {
      html += '<div class="msg msg-info">' + skipped.length + ' row(s) skipped because that person already has an entry for that date (Excel rows ' +
        skipped.map(function (r) { return r.line; }).join(', ') + ').</div>';
    }
    if (parsed.defaulted) {
      html += '<div class="msg msg-info">' + parsed.defaulted + ' row(s) had no Payment filled in, so they are set to Daily. You can change them after importing.</div>';
    }
    if (parsed.errors.length) {
      html += '<div class="msg msg-error">' + parsed.errors.length + ' row(s) have problems and will not be imported. Fix them in Excel and import again:<ul>' +
        parsed.errors.map(function (e) {
          return '<li>Excel row ' + e.line + (e.sl ? ' (Sl. No. ' + esc(e.sl) + ')' : '') + ': ' + esc(e.message) + '</li>';
        }).join('') + '</ul></div>';
    }
    if (!importQueue.length && !parsed.errors.length && !skipped.length) {
      html = '<div class="msg msg-info">No filled-in entries found in this file.</div>';
    }
    $('importMsg').innerHTML = html;
    $('importRows').innerHTML = importQueue.map(function (r) {
      const a = r.entry;
      return '<tr><td>' + esc(r.sl) + '</td><td>' + esc(a.date) + '</td><td>' + esc(a.person) + '</td><td>' + esc(a.status) +
        '</td><td>' + esc(formatTime12(a.timeIn)) + '</td><td>' + esc(formatTime12(a.timeOut)) + '</td><td>' + esc(a.item) +
        '</td><td class="num">' + esc(formatQty(a.qty)) + '</td><td>' + esc(a.paid) + '</td><td>' + esc(a.frequency) + '</td></tr>';
    }).join('');
    $('importPreviewWrap').hidden = !importQueue.length;
    $('confirmImportBtn').hidden = !importQueue.length;
    $('confirmImportBtn').textContent = 'Import ' + importQueue.length + ' entr' + (importQueue.length === 1 ? 'y' : 'ies');
    openModal('importModal');
  });

  $('confirmImportBtn').addEventListener('click', async function () {
    if (!importQueue.length) return;
    const btn = this;
    btn.disabled = true;
    btn.textContent = 'Importing...';
    const res = await API.importAttendance(importQueue.map(function (r) { return r.entry; }));
    btn.disabled = false;
    if (!res.success) {
      if (authFailed(res)) return;
      btn.textContent = 'Import ' + importQueue.length + ' entries';
      $('importMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message || 'Import failed.') + ' Nothing was saved.</div>';
      return;
    }
    importQueue.forEach(function (r) { RecentPeople.add(r.entry.person); });
    importQueue = [];
    closeModals();
    await load();
    $('dashMsg').innerHTML = '<div class="msg msg-success">' + esc(res.count) + ' entries imported from Excel.</div>';
  });

  /* ---------------- Modals ---------------- */

  function openModal(id) { $(id).classList.add('open'); }
  function closeModals() {
    document.querySelectorAll('.modal-backdrop').forEach(function (m) { m.classList.remove('open'); });
    editingId = deletingId = null;
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeModals); });
  document.querySelectorAll('.modal-backdrop').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) closeModals(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModals(); });

  attachDateMask($('eDate'));

  function syncEditPresent() {
    $('ePresent').disabled = $('eStatus').value !== 'P';
    const h = $('eStatus').value === 'P' ? calcHours($('eIn').value, $('eOut').value) : '';
    $('eHours').textContent = h === '' ? '—' : formatHours(h) + ' h';
  }
  ['eStatus', 'eIn', 'eOut'].forEach(function (id) { $(id).addEventListener('input', syncEditPresent); });
  $('eStatus').addEventListener('change', syncEditPresent);
  $('eQty').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });

  $('rows').addEventListener('click', function (e) {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-del');
    if (editId) openEdit(editId);
    if (delId) openDelete(delId);
  });

  function find(id) { return entries.find(function (a) { return a.id === id; }); }

  function openEdit(id) {
    const a = find(id);
    if (!a) return;
    editingId = id;
    $('dashMsg').innerHTML = '';
    $('editMsg').innerHTML = '';
    showFieldErrors($('editForm'), {});
    $('eId').value = a.id;
    $('eDate').value = isoToDMY(a.date);
    $('eStatus').value = a.status;
    $('ePerson').value = a.person;
    $('eIn').value = a.timeIn;
    $('eOut').value = a.timeOut;
    $('eItem').value = a.item;
    $('eQty').value = a.qty === '' || a.qty == null ? '' : a.qty;
    $('ePaid').value = a.paid;
    $('eFreq').value = a.frequency;
    syncEditPresent();
    openModal('editModal');
  }

  $('editForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!editingId) return;
    const data = {
      date: $('eDate').value.trim(), person: $('ePerson').value, status: $('eStatus').value,
      timeIn: $('eIn').value, timeOut: $('eOut').value, item: $('eItem').value, qty: $('eQty').value.trim(),
      paid: $('ePaid').value, frequency: $('eFreq').value
    };
    if (data.status !== 'P') { data.timeIn = data.timeOut = data.item = data.qty = ''; }
    const errors = validateAttendance(data);
    showFieldErrors($('editForm'), errors);
    if (Object.keys(errors).length) return;

    const btn = $('saveEditBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const res = await API.updateAttendance(editingId, data);
    btn.disabled = false;
    btn.textContent = 'Save Changes';
    if (!res.success) {
      if (authFailed(res)) return;
      $('editMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    const id = editingId;
    closeModals();
    await load();
    $('dashMsg').innerHTML = '<div class="msg msg-success">Entry ' + esc(id) + ' updated.</div>';
  });

  function openDelete(id) {
    const a = find(id);
    if (!a) return;
    deletingId = id;
    $('dashMsg').innerHTML = '';
    $('dId').textContent = a.id;
    $('dDate').textContent = isoToDMY(a.date);
    $('dPerson').textContent = a.person;
    openModal('deleteModal');
  }

  $('confirmDeleteBtn').addEventListener('click', async function () {
    if (!deletingId) return;
    const btn = this;
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    const id = deletingId;
    const res = await API.deleteAttendance(id);
    btn.disabled = false;
    btn.textContent = 'Delete';
    closeModals();
    if (!res.success) {
      if (authFailed(res)) return;
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    await load();
    $('dashMsg').innerHTML = '<div class="msg msg-success">Entry ' + esc(id) + ' deleted.</div>';
  });

  /* ---------------- Start ---------------- */

  load();
})();
