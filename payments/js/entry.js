/* Payment Entry page */
(function () {
  // Admin only: no login token -> go to the admin login, which sends you back here
  if (!Session.get()) {
    location.replace('admin.html?next=entry');
    return;
  }

  showDemoBanner();
  setFooterYear();

  const form = document.getElementById('paymentForm');
  const dateInput = document.getElementById('date');
  const amountInput = document.getElementById('amount');
  const amountPreview = document.getElementById('amountPreview');
  const submitBtn = document.getElementById('submitBtn');
  const msgBox = document.getElementById('formMsg');
  const entryPanel = document.getElementById('entryPanel');
  const successPanel = document.getElementById('successPanel');
  let busy = false;
  let lastId = '';

  attachDateMask(dateInput);
  dateInput.value = todayDMY();
  fillSourceList(RecentSources.get());

  // Amount: digits + one dot, max 2 decimals; live ₹ preview
  amountInput.addEventListener('input', function () {
    let v = amountInput.value.replace(/[^\d.]/g, '');
    const parts = v.split('.');
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    const p = v.split('.');
    if (p[1] && p[1].length > 2) v = p[0] + '.' + p[1].slice(0, 2);
    amountInput.value = v;
    amountPreview.textContent = v && Number(v) > 0 ? formatINR(v) : 'Up to 2 decimal places';
  });

  entryPanel.hidden = false;

  document.getElementById('logoutLink').addEventListener('click', async function (e) {
    e.preventDefault();
    await API.logout();
    Session.clear();
    location.replace('admin.html');
  });

  form.addEventListener('reset', function () {
    setTimeout(function () {
      dateInput.value = todayDMY();
      amountPreview.textContent = 'Up to 2 decimal places';
      showFieldErrors(form, {});
      msgBox.innerHTML = '';
    }, 0);
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return; // duplicate-submit guard

    const data = {
      date: dateInput.value.trim(),
      toWhom: form.toWhom.value,
      fromWhom: form.fromWhom.value,
      purpose: form.purpose.value,
      source: form.source.value,
      amount: amountInput.value.trim(),
      mode: form.mode.value
    };

    const errors = validatePayment(data);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      msgBox.innerHTML = '<div class="msg msg-error">Please correct the highlighted fields.</div>';
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    msgBox.innerHTML = '';

    const res = await API.createPayment(data);

    busy = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Payment';

    if (!res.success) {
      if (/not authori/i.test(res.message || '')) {
        Session.clear();
        msgBox.innerHTML = '<div class="msg msg-error">Your admin session has expired. Please <a href="admin.html?next=entry">log in again</a>, then add this payment again.</div>';
        return;
      }
      msgBox.innerHTML = '<div class="msg msg-error">' + esc(res.message || 'Could not save payment.') + '</div>';
      return;
    }

    lastId = res.paymentId;
    RecentSources.add(data.source);
    fillSourceList(RecentSources.get());
    document.getElementById('sId').textContent = res.paymentId;
    document.getElementById('sDate').textContent = data.date;
    document.getElementById('sTo').textContent = data.toWhom.trim();
    document.getElementById('sSource').textContent = data.source.trim() || '—';
    document.getElementById('sAmount').textContent = formatINR(data.amount);
    document.getElementById('sMode').textContent = data.mode;
    document.getElementById('viewBtn').href = '../check_payment.html?q=' + encodeURIComponent(res.paymentId);

    entryPanel.hidden = true;
    successPanel.hidden = false;
    window.scrollTo(0, 0);
  });

  document.getElementById('addAnotherBtn').addEventListener('click', function () {
    form.reset();
    successPanel.hidden = true;
    entryPanel.hidden = false;
    form.toWhom.focus();
  });

  document.getElementById('copyBtn').addEventListener('click', function () {
    const btn = this;
    const done = function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy Payment ID'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastId).then(done, function () { window.prompt('Copy this Payment ID:', lastId); });
    } else {
      window.prompt('Copy this Payment ID:', lastId);
    }
  });
})();
