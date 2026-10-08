/* Admin Dashboard page */
(function () {
  showDemoBanner();
  setFooterYear();

  const $ = function (id) { return document.getElementById(id); };
  let payments = [];      // all records from server
  let filtered = [];      // after filters/search
  let editingId = null;
  let deletingId = null;

  /* ---------------- Login ---------------- */

  if (API.isDemo()) $('loginHint').textContent = 'Template mode: any password works. The real check happens in Code.gs.';

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const pw = $('password').value;
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Checking...';
    const res = await API.adminLogin(pw);
    btn.disabled = false;
    btn.textContent = 'Log In';
    if (!res.success) {
      $('loginMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message || 'Login failed.') + '</div>';
      return;
    }
    Session.set(res.token);
    $('password').value = '';
    // Came here from another admin page -> go back to it (fixed list, never an arbitrary URL)
    const pages = { 'entry': 'entry.html', 'attendance': 'attendance.html', 'attendance-entry': 'attendance-entry.html' };
    const next = new URLSearchParams(location.search).get('next');
    if (next && Object.prototype.hasOwnProperty.call(pages, next)) {
      location.replace(pages[next]);
      return;
    }
    showDashboard();
  });

  $('logoutLink').addEventListener('click', async function (e) {
    e.preventDefault();
    await API.logout();
    Session.clear();
    location.reload();
  });

  function showDashboard() {
    $('loginView').hidden = true;
    $('dashView').hidden = false;
    $('logoutLink').hidden = false;
    loadPayments();
  }

  /* ---------------- Data ---------------- */

  async function loadPayments() {
    $('dashMsg').innerHTML = '<div class="msg msg-info">Loading payments...</div>';
    const res = await API.getPayments();
    if (!res.success) {
      if (/auth/i.test(res.message || '')) { Session.clear(); location.reload(); return; }
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    $('dashMsg').innerHTML = '';
    payments = res.payments.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;  // newest first
      return a.id < b.id ? 1 : -1;
    });
    fillYearOptions();
    fillSourceOptions();
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
    const current = sel.value;
    const years = Array.from(new Set(payments.map(function (p) { return p.date.slice(0, 4); }))).sort().reverse();
    sel.innerHTML = '<option value="">All</option>' +
      years.map(function (y) { return '<option value="' + y + '">' + y + '</option>'; }).join('');
    sel.value = years.indexOf(current) > -1 ? current : '';
  }

  function fillSourceOptions() {
    const sel = $('fSource');
    const current = sel.value;
    const sources = Array.from(new Set(payments.map(function (p) { return (p.source || '').trim(); })
      .filter(Boolean))).sort();
    sel.innerHTML = '<option value="">All</option>' + sources.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('') + '<option value="__none__">(Not given)</option>';
    sel.value = current && (sources.indexOf(current) > -1 || current === '__none__') ? current : '';
    fillSourceList(sources.concat(RecentSources.get()));
  }

  ['fDate', 'fFrom', 'fTo'].forEach(function (id) { attachDateMask($(id)); });

  ['fYear', 'fMonth', 'fMode', 'fSource'].forEach(function (id) { $(id).addEventListener('change', applyFilters); });
  ['fDate', 'fFrom', 'fTo', 'fSearch'].forEach(function (id) { $(id).addEventListener('input', applyFilters); });

  $('clearFilters').addEventListener('click', function () {
    ['fYear', 'fMonth', 'fMode', 'fSource', 'fDate', 'fFrom', 'fTo', 'fSearch'].forEach(function (id) { $(id).value = ''; });
    applyFilters();
  });

  // Only apply a typed date once it is a complete, valid DD/MM/YYYY
  function dateFilterValue(id) {
    const v = $(id).value.trim();
    $(id).closest('.form-row').classList.toggle('has-error', v.length === 10 && !dmyToISO(v));
    return v.length === 10 ? dmyToISO(v) : null;
  }

  function applyFilters() {
    const year = $('fYear').value;
    const month = $('fMonth').value;
    const mode = $('fMode').value;
    const source = $('fSource').value;
    const day = dateFilterValue('fDate');
    const from = dateFilterValue('fFrom');
    const to = dateFilterValue('fTo');
    const q = $('fSearch').value.trim().toLowerCase();

    filtered = payments.filter(function (p) {
      if (year && p.date.slice(0, 4) !== year) return false;
      if (month && p.date.slice(5, 7) !== month) return false;
      if (mode && p.mode !== mode) return false;
      if (source === '__none__' && (p.source || '').trim()) return false;
      if (source && source !== '__none__' && (p.source || '').trim() !== source) return false;
      if (day && p.date !== day) return false;
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      if (q) {
        const hay = [p.id, p.toWhom, p.fromWhom, p.purpose, p.source || '', isoToDMY(p.date)].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    renderSummary();
    renderTable();
    renderVendorSummary(q);
    renderScopeLabel(year, month, mode, day, from, to, q, source);
  }

  /* ---------------- Rendering ---------------- */

  function sum(list) { return list.reduce(function (s, p) { return s + Number(p.amount); }, 0); }

  function renderSummary() {
    $('stCount').textContent = filtered.length;
    $('stTotal').textContent = formatINR(sum(filtered));
    $('stUpi').textContent = formatINR(sum(filtered.filter(function (p) { return p.mode === 'UPI'; })));
    $('stCash').textContent = formatINR(sum(filtered.filter(function (p) { return p.mode === 'Cash'; })));
    $('stBank').textContent = formatINR(sum(filtered.filter(function (p) { return p.mode === 'Bank Transfer'; })));

    const groups = {};
    filtered.forEach(function (p) {
      const name = (p.source || '').trim() || '(Not given)';
      const k = name.toLowerCase();
      groups[k] = groups[k] || { name: name, count: 0, total: 0 };
      groups[k].count++;
      groups[k].total += Number(p.amount);
    });
    const list = Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    $('sourceRows').innerHTML = list.length ? list.map(function (g) {
      return '<tr><td>' + esc(g.name) + '</td><td class="num">' + g.count + '</td><td class="num">' + formatINR(g.total) + '</td></tr>';
    }).join('') : '<tr><td colspan="3" class="muted">No payments.</td></tr>';
  }

  function renderTable() {
    const body = $('rows');
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:18px">No payments match the selected filters.</td></tr>';
    } else {
      body.innerHTML = filtered.map(function (p, i) {
        return '<tr>' +
          '<td data-label="Sl. No.">' + (i + 1) + '</td>' +
          '<td data-label="Payment ID" class="mono">' + esc(p.id) + '</td>' +
          '<td data-label="Date">' + esc(isoToDMY(p.date)) + '</td>' +
          '<td data-label="To Whom">' + esc(p.toWhom) + '</td>' +
          '<td data-label="By Whom">' + esc(p.fromWhom) + '</td>' +
          '<td data-label="Purpose">' + esc(p.purpose) + '</td>' +
          '<td data-label="Source of Funds">' + esc(p.source || '') + '</td>' +
          '<td data-label="Amount" class="num">' + formatINR(p.amount) + '</td>' +
          '<td data-label="Mode"><span class="pill">' + esc(p.mode) + '</span></td>' +
          '<td data-label="Actions" class="actions">' +
            '<button type="button" class="btn btn-sm" data-edit="' + esc(p.id) + '">Edit</button> ' +
            '<button type="button" class="btn btn-sm btn-link-danger" data-del="' + esc(p.id) + '">Delete</button>' +
          '</td></tr>';
      }).join('');
    }
    $('footTotal').textContent = formatINR(sum(filtered));
    $('rowCount').textContent = 'Showing ' + filtered.length + ' of ' + payments.length + ' payments';
  }

  function renderVendorSummary(q) {
    const names = Array.from(new Set(filtered.map(function (p) { return p.toWhom.toLowerCase(); })));
    if (!q || names.length !== 1) { $('vendorPanel').hidden = true; return; }
    const last = filtered.reduce(function (m, p) { return p.date > m ? p.date : m; }, '');
    $('vName').textContent = filtered[0].toWhom;
    $('vCount').textContent = filtered.length;
    $('vTotal').textContent = formatINR(sum(filtered));
    $('vLast').textContent = isoToDMY(last);
    $('vendorPanel').hidden = false;
  }

  function renderScopeLabel(year, month, mode, day, from, to, q, source) {
    const parts = [];
    if (day) parts.push(isoToDMY(day));
    else {
      if (month) parts.push(MONTHS[+month - 1]);
      if (year) parts.push(year);
      if (from || to) parts.push((from ? isoToDMY(from) : '...') + ' to ' + (to ? isoToDMY(to) : '...'));
    }
    if (mode) parts.push(mode);
    if (source) parts.push(source === '__none__' ? 'No source' : source);
    if (q) parts.push('"' + $('fSearch').value.trim() + '"');
    $('scopeLabel').textContent = parts.length ? 'Showing: ' + parts.join(' · ') : 'All records';
    $('tableTitle').textContent = day ? 'Payments — ' + isoToDMY(day) : 'Payment Records';
  }

  /* ---------------- Toolbar ---------------- */

  $('refreshBtn').addEventListener('click', loadPayments);

  $('exportBtn').addEventListener('click', function () {
    const head = ['Payment ID', 'Date', 'To Whom', 'By Whom', 'Purpose', 'Source of Funds', 'Amount (INR)', 'Payment Mode'];
    const csvCell = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    const lines = [head.map(csvCell).join(',')].concat(filtered.map(function (p) {
      return [p.id, isoToDMY(p.date), p.toWhom, p.fromWhom, p.purpose, p.source || '', Number(p.amount).toFixed(2), p.mode]
        .map(csvCell).join(',');
    }));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payments-' + todayDMY().split('/').reverse().join('') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $('exportXlsxBtn').addEventListener('click', function () {
    if (!window.XLSX) {
      $('dashMsg').innerHTML = '<div class="msg msg-error">Excel library did not load. Check your internet connection and refresh.</div>';
      return;
    }
    const scope = $('scopeLabel').textContent.replace(/^Showing: /, '');
    PaymentExcel.exportLog(filtered, scope === 'All records' ? '' : scope);
  });

  /* ---------------- Excel import ---------------- */

  let importQueue = [];

  $('importBtn').addEventListener('click', function () {
    if (!window.XLSX) {
      $('dashMsg').innerHTML = '<div class="msg msg-error">Excel library did not load. Check your internet connection and refresh.</div>';
      return;
    }
    $('importFile').value = '';
    $('importFile').click();
  });

  // Same date + vendor + amount + purpose already in the system = probably already imported
  function dupKey(p) {
    const iso = p.date.indexOf('/') > -1 ? dmyToISO(p.date) : p.date;
    return [iso, p.toWhom.trim().toLowerCase(), Number(p.amount).toFixed(2), p.purpose.trim().toLowerCase()].join('|');
  }

  $('importFile').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    if (!file) return;
    let parsed;
    try {
      parsed = PaymentExcel.parse(await file.arrayBuffer());
    } catch (err) {
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(err.message || 'Could not read this file.') + '</div>';
      return;
    }

    const existingIds = {};
    const existingKeys = {};
    payments.forEach(function (p) { existingIds[p.id.toUpperCase()] = true; existingKeys[dupKey(p)] = true; });

    const skipped = [];
    importQueue = [];
    parsed.rows.forEach(function (r) {
      if ((r.id && existingIds[r.id.toUpperCase()]) || existingKeys[dupKey(r.payment)]) skipped.push(r);
      else importQueue.push(r);
    });

    let html = '<div class="msg msg-info">File <strong>' + esc(file.name) + '</strong>, sheet <strong>' +
      esc(parsed.sheetName) + '</strong>: ' + importQueue.length + ' new payment(s) ready, totalling ' +
      formatINR(importQueue.reduce(function (s, r) { return s + Number(r.payment.amount); }, 0)) + '.</div>';
    if (skipped.length) {
      html += '<div class="msg msg-info">' + skipped.length + ' row(s) skipped because they are already in the system (Excel rows ' +
        skipped.map(function (r) { return r.line; }).join(', ') + ').</div>';
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
      const p = r.payment;
      return '<tr><td>' + esc(r.sl) + '</td><td>' + esc(p.date) + '</td><td>' + esc(p.toWhom) + '</td><td>' +
        esc(p.fromWhom) + '</td><td>' + esc(p.purpose) + '</td><td>' + esc(p.source) + '</td><td class="num">' +
        formatINR(p.amount) + '</td><td>' + esc(p.mode) + '</td></tr>';
    }).join('');
    $('importPreviewWrap').hidden = !importQueue.length;
    $('confirmImportBtn').hidden = !importQueue.length;
    $('confirmImportBtn').textContent = 'Import ' + importQueue.length + ' payment(s)';
    openModal('importModal');
  });

  $('confirmImportBtn').addEventListener('click', async function () {
    if (!importQueue.length) return;
    const btn = this;
    btn.disabled = true;
    btn.textContent = 'Importing...';
    const res = await API.importPayments(importQueue.map(function (r) { return r.payment; }));
    btn.disabled = false;
    if (!res.success) {
      btn.textContent = 'Import ' + importQueue.length + ' payment(s)';
      $('importMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message || 'Import failed.') + ' Nothing was saved.</div>';
      return;
    }
    importQueue.forEach(function (r) { RecentSources.add(r.payment.source); });
    importQueue = [];
    closeModals();
    await loadPayments();
    $('dashMsg').innerHTML = '<div class="msg msg-success">' + esc(res.count) + ' payment(s) imported from Excel.</div>';
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

  $('rows').addEventListener('click', function (e) {
    const editId = e.target.getAttribute('data-edit');
    const delId = e.target.getAttribute('data-del');
    if (editId) openEdit(editId);
    if (delId) openDelete(delId);
  });

  function findPayment(id) { return payments.find(function (p) { return p.id === id; }); }

  function openEdit(id) {
    const p = findPayment(id);
    if (!p) return;
    editingId = id;
    $('dashMsg').innerHTML = '';
    $('editMsg').innerHTML = '';
    showFieldErrors($('editForm'), {});
    $('eId').value = p.id;
    $('eDate').value = isoToDMY(p.date);
    $('eMode').value = p.mode;
    $('eTo').value = p.toWhom;
    $('eFrom').value = p.fromWhom;
    $('ePurpose').value = p.purpose;
    $('eSource').value = p.source || '';
    $('eAmount').value = Number(p.amount).toFixed(2);
    openModal('editModal');
  }

  $('editForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!editingId) return;
    const data = {
      date: $('eDate').value.trim(),
      toWhom: $('eTo').value,
      fromWhom: $('eFrom').value,
      purpose: $('ePurpose').value,
      source: $('eSource').value,
      amount: $('eAmount').value.trim(),
      mode: $('eMode').value
    };
    const errors = validatePayment(data);
    showFieldErrors($('editForm'), errors);
    if (Object.keys(errors).length) return;

    const btn = $('saveEditBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const res = await API.updatePayment(editingId, data);
    btn.disabled = false;
    btn.textContent = 'Save Changes';

    if (!res.success) {
      $('editMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    const id = editingId;
    closeModals();
    await loadPayments();
    $('dashMsg').innerHTML = '<div class="msg msg-success">Payment ' + esc(id) + ' updated.</div>';
  });

  function openDelete(id) {
    const p = findPayment(id);
    if (!p) return;
    deletingId = id;
    $('dashMsg').innerHTML = '';
    $('dId').textContent = p.id;
    $('dAmount').textContent = formatINR(p.amount);
    $('dTo').textContent = p.toWhom;
    openModal('deleteModal');
  }

  $('confirmDeleteBtn').addEventListener('click', async function () {
    if (!deletingId) return;
    const btn = this;
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    const id = deletingId;
    const res = await API.deletePayment(id);
    btn.disabled = false;
    btn.textContent = 'Delete';
    closeModals();
    if (!res.success) {
      $('dashMsg').innerHTML = '<div class="msg msg-error">' + esc(res.message) + '</div>';
      return;
    }
    await loadPayments();
    $('dashMsg').innerHTML = '<div class="msg msg-success">Payment ' + esc(id) + ' deleted.</div>';
  });

  /* ---------------- Start ---------------- */

  if (Session.get()) showDashboard();
})();
