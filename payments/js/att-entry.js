/* Add Attendance page */
(function () {
  if (!requireAdmin('attendance-entry')) return;

  showDemoBanner();
  setFooterYear();

  const $ = function (id) { return document.getElementById(id); };
  const form = $('attForm');
  const msgBox = $('formMsg');
  const submitBtn = $('submitBtn');
  let busy = false;

  // Each person's usual Payment (Daily / Weekly), remembered in this browser
  const FreqMemory = {
    KEY: 'pts_person_frequency',
    all() { try { return JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { return {}; } },
    get(name) { return this.all()[String(name || '').trim().toLowerCase()]; },
    set(name, f) {
      const m = this.all();
      m[String(name || '').trim().toLowerCase()] = f;
      try { localStorage.setItem(this.KEY, JSON.stringify(m)); } catch (e) {}
    }
  };
  const RecentItems = {
    KEY: 'pts_recent_items',
    get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
    add(s) {
      s = String(s || '').trim();
      if (!s) return;
      const list = this.get().filter(function (x) { return x.toLowerCase() !== s.toLowerCase(); });
      list.unshift(s);
      try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, 50))); } catch (e) {}
    }
  };

  function fillItemList() {
    $('itemList').innerHTML = RecentItems.get().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
  }

  let workers = [];   // [{ id: 'W-0001', name: 'Ravi Kumar' }] from the server

  // Suggest every known worker: pick by name, the Worker ID shows alongside
  function fillWorkerList() {
    const known = {};
    const opts = workers.map(function (w) {
      known[w.name.toLowerCase()] = true;
      return '<option value="' + esc(w.name) + '" label="' + esc(w.id) + '">';
    });
    RecentPeople.get().forEach(function (n) {
      if (!known[n.toLowerCase()]) opts.push('<option value="' + esc(n) + '">');
    });
    $('peopleList').innerHTML = opts.join('');
  }

  const HINT_DEFAULT = $('workerHint').textContent;
  function updateWorkerHint() {
    const v = $('person').value.trim();
    const hint = $('workerHint');
    hint.classList.remove('hint-warn');
    if (!v) { hint.textContent = HINT_DEFAULT; return; }
    const w = findWorker(workers, v);
    if (w) {
      hint.innerHTML = 'Worker ID <strong class="mono">' + esc(w.id) + '</strong> &middot; ' + esc(w.name);
    } else if (isWorkerId(v)) {
      hint.textContent = 'No worker has the ID ' + v.toUpperCase() + '.';
      hint.classList.add('hint-warn');
    } else {
      hint.textContent = 'New worker — a Worker ID will be given when you save.';
    }
  }

  attachDateMask($('date'));
  $('date').value = todayDMY();
  fillWorkerList();
  fillItemList();
  $('entryPanel').hidden = false;

  API.getWorkers().then(function (res) {
    if (res && res.success) {
      workers = res.workers || [];
      fillWorkerList();
      updateWorkerHint();
    }
  });

  $('logoutLink').addEventListener('click', async function (e) {
    e.preventDefault();
    await API.logout();
    Session.clear();
    location.replace('admin.html');
  });

  /* ---------------- Live form behaviour ---------------- */

  function syncPresent() {
    $('presentFields').disabled = $('status').value !== 'P';
    updateHours();
  }

  function updateHours() {
    const h = $('status').value === 'P' ? calcHours($('timeIn').value, $('timeOut').value) : '';
    $('hoursOut').textContent = h === '' ? '—' : formatHours(h) + ' h';
  }

  $('status').addEventListener('change', syncPresent);
  $('timeIn').addEventListener('input', updateHours);
  $('timeOut').addEventListener('input', updateHours);
  $('qty').addEventListener('input', function () { this.value = this.value.replace(/\D/g, ''); });

  // Known person (or their Worker ID) -> show the ID and pick their usual Payment frequency
  $('person').addEventListener('input', updateWorkerHint);
  $('person').addEventListener('change', function () {
    const w = findWorker(workers, this.value);
    const f = FreqMemory.get(w ? w.name : this.value);
    if (f) $('frequency').value = f;
    updateWorkerHint();
  });

  // Clear everything except the date
  $('clearBtn').addEventListener('click', function () {
    const date = $('date').value;
    form.reset();
    $('date').value = date;
    showFieldErrors(form, {});
    msgBox.innerHTML = '';
    syncPresent();
    updateWorkerHint();
  });

  /* ---------------- Save ---------------- */

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;

    const data = {
      date: $('date').value.trim(),
      person: $('person').value,
      status: $('status').value,
      timeIn: $('timeIn').value,
      timeOut: $('timeOut').value,
      item: $('item').value,
      qty: $('qty').value.trim(),
      paid: $('paid').value,
      frequency: $('frequency').value
    };
    if (data.status !== 'P') { data.timeIn = data.timeOut = data.item = data.qty = ''; }

    const errors = validateAttendance(data);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      msgBox.innerHTML = '<div class="msg msg-error">Please correct the highlighted fields.</div>';
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    msgBox.innerHTML = '';
    const res = await API.createAttendance(data);
    busy = false;
    submitBtn.disabled = false;

    if (!res.success) {
      if (/not authori/i.test(res.message || '')) {
        Session.clear();
        msgBox.innerHTML = '<div class="msg msg-error">Your admin session has expired. Please <a href="admin.html?next=attendance-entry">log in again</a>, then save this entry again.</div>';
        return;
      }
      msgBox.innerHTML = '<div class="msg msg-error">' + esc(res.message || 'Could not save the entry.') + '</div>';
      return;
    }

    // The server answers with the worker's registered name and Worker ID
    const saved = res.entry || {};
    const name = saved.person || data.person.trim();
    const workerId = saved.workerId || '';
    if (workerId && !workers.some(function (w) { return w.id === workerId; })) {
      workers.push({ id: workerId, name: name });
    }
    RecentPeople.add(name);
    RecentItems.add(data.item);
    FreqMemory.set(name, data.frequency);
    fillWorkerList();
    fillItemList();

    const hours = calcHours(data.timeIn, data.timeOut);
    $('savedRows').insertAdjacentHTML('afterbegin',
      '<tr>' +
        '<td data-label="Entry ID" class="mono">' + esc(res.entryId) + '</td>' +
        '<td data-label="Worker ID" class="mono">' + esc(workerId) + '</td>' +
        '<td data-label="Date">' + esc(data.date) + '</td>' +
        '<td data-label="Person">' + esc(name) + '</td>' +
        '<td data-label="Att."><span class="pill ' + (data.status === 'P' ? 'pill-ok' : 'pill-bad') + '">' + data.status + '</span></td>' +
        '<td data-label="Hours" class="num">' + formatHours(hours) + '</td>' +
        '<td data-label="Item">' + esc(data.item.trim()) + '</td>' +
        '<td data-label="Qty" class="num">' + formatQty(data.qty) + '</td>' +
        '<td data-label="Paid">' + data.paid + '</td>' +
      '</tr>');
    $('savedPanel').hidden = false;
    msgBox.innerHTML = '<div class="msg msg-success">&#10004; Saved ' + esc(name) +
      (workerId ? ' &middot; Worker ID <span class="mono">' + esc(workerId) + '</span>' : '') +
      ' (entry ' + esc(res.entryId) + '). Next person &mdash; the date and times are kept.</div>';

    // Ready for the next person on the same day
    $('person').value = '';
    $('item').value = '';
    $('qty').value = '';
    $('status').value = 'P';
    $('paid').value = 'N';
    syncPresent();
    updateWorkerHint();
    $('person').focus();
  });

  syncPresent();
})();
