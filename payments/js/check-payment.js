/* check_payment.html - public "Check Your Payment" page.
   Answers only an exact Payment ID or an exact name (the server enforces this),
   rendered with the site's Tailwind styles. Needs payments/js/common.js. */
(function () {
  const form = document.getElementById('payCheckForm');
  if (!form) return;
  const input = document.getElementById('payCheckInput');
  const btn = document.getElementById('payCheckBtn');
  const out = document.getElementById('payCheckResult');
  let busy = false;

  function message(text, isError) {
    out.innerHTML = '<div class="flex items-center gap-2 p-4 rounded-xl text-sm font-bold ' +
      (isError ? 'bg-error/10 text-error' : 'bg-surface-container text-primary') + '">' +
      '<span class="material-symbols-outlined text-[18px]">' + (isError ? 'error' : 'info') + '</span>' +
      esc(text) + '</div>';
  }

  function field(label, value) {
    return '<div><div class="font-label-caps text-[11px] tracking-wider text-slate-muted">' + label + '</div>' +
      '<div class="text-primary font-bold mt-1 break-words">' + value + '</div></div>';
  }

  function renderSingle(p) {
    out.innerHTML =
      '<div class="bg-surface-container rounded-2xl p-6 border border-outline-variant/40">' +
        '<div class="flex flex-wrap items-center justify-between gap-3 mb-5">' +
          '<span class="font-mono text-sm text-primary">' + esc(p.id) + '</span>' +
          '<span class="px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">PAID</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">' +
          field('Amount', '<span class="text-2xl">' + formatINR(p.amount) + '</span>') +
          field('Date', esc(isoToDMY(p.date))) +
          field('Payment Mode', esc(p.mode)) +
          field('To', esc(p.toWhom)) +
          field('Purpose', esc(p.purpose)) +
        '</div>' +
      '</div>';
  }

  function renderVendor(r) {
    const rows = r.payments.slice().reverse().map(function (p) {
      return '<tr class="border-b border-outline-variant/40">' +
        '<td class="py-3 pr-4 whitespace-nowrap">' + esc(isoToDMY(p.date)) + '</td>' +
        '<td class="py-3 pr-4 font-mono text-xs whitespace-nowrap">' + esc(p.id) + '</td>' +
        '<td class="py-3 pr-4">' + esc(p.purpose) + '</td>' +
        '<td class="py-3 pr-4 whitespace-nowrap">' + esc(p.mode) + '</td>' +
        '<td class="py-3 text-right font-bold whitespace-nowrap">' + formatINR(p.amount) + '</td>' +
        '</tr>';
    }).join('');
    out.innerHTML =
      '<div class="bg-surface-container rounded-2xl p-6 border border-outline-variant/40">' +
        '<h3 class="text-xl font-extrabold text-primary mb-5">' + esc(r.name) + '</h3>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">' +
          field('Total Paid', '<span class="text-2xl">' + formatINR(r.total) + '</span>') +
          field('Payments', r.count) +
          field('Last Payment', esc(isoToDMY(r.lastDate))) +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-sm text-primary">' +
          '<thead><tr class="text-left font-label-caps text-[11px] tracking-wider text-slate-muted border-b-2 border-primary">' +
            '<th class="pb-2 pr-4">Date</th><th class="pb-2 pr-4">Payment ID</th><th class="pb-2 pr-4">Purpose</th>' +
            '<th class="pb-2 pr-4">Mode</th><th class="pb-2 text-right">Amount</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
      '</div>';
  }

  async function search(q) {
    if (busy) return;
    q = q.trim();
    if (!q) { message('Enter your Payment ID or name.', true); return; }

    busy = true;
    btn.disabled = true;
    btn.classList.add('opacity-70');
    out.innerHTML = '';
    message('Searching...', false);

    const res = await API.publicLookup(q);

    busy = false;
    btn.disabled = false;
    btn.classList.remove('opacity-70');

    if (!res.success) { message(res.message || 'No payment found.', true); return; }
    if (res.type === 'id') renderSingle(res.payment);
    else renderVendor(res);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    search(input.value);
  });

  // Links like check_payment.html?q=PAY-20261006-0001 (from the admin "View Payment" button)
  const pre = new URLSearchParams(location.search).get('q');
  if (pre) {
    input.value = pre;
    search(pre);
  }
})();
