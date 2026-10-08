/* =========================================================
   Excel import / export for the Fortitude "Payment & Expense
   Log Book" (Payment_Log_Digital.xlsx layout):

     Row 1  FORTITUDE FABRICS
     Row 2  PAYMENT & EXPENSE LOG BOOK
     Row 5  Sl. No. | Date | To Whom | By Whom | Purpose |
            Source of Funds | Amount (INR) | Payment Mode
     Row 7+ entries

   Import finds the header row by its titles, so the printed
   template, the digital template and our own export all work.
   Needs SheetJS (window.XLSX).
   ========================================================= */

const PaymentExcel = (function () {

  const HEADERS = ['Sl. No.', 'Date', 'To Whom', 'By Whom', 'Purpose', 'Source of Funds',
    'Amount (INR)', 'Payment Mode\n(Cash / UPI / Bank Transfer)', 'Payment ID'];

  // Header text (lower-case, spaces squashed) -> field
  const HEADER_MAP = {
    'sl. no.': 'sl', 'sl no': 'sl', 'sl.no.': 'sl', 's.no': 'sl', 's. no.': 'sl',
    'date': 'date',
    'to whom': 'toWhom',
    'by whom': 'fromWhom', 'from whom': 'fromWhom',
    'purpose': 'purpose',
    'source of funds': 'source', 'source': 'source',
    'amount (inr)': 'amount', 'amount': 'amount', 'amount (₹)': 'amount',
    'payment mode': 'mode', 'mode': 'mode',
    'payment id': 'id'
  };

  function norm(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function headerKey(v) {
    // "Payment Mode\n(Cash / UPI / Bank Transfer)" -> "payment mode"
    const k = norm(v).toLowerCase().replace(/\s*\(cash.*$/, '');
    return HEADER_MAP[k] || null;
  }

  /* ---------------- Cell converters ---------------- */

  // Excel serial number -> DD/MM/YYYY (read in UTC so no timezone drift)
  function serialToDMY(n) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    return String(d.getUTCDate()).padStart(2, '0') + '/' +
           String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
  }

  function toDMY(v) {
    if (typeof v === 'number' && v > 0) return serialToDMY(v);
    const s = norm(v);
    let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
    if (m) return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }

  // 12500 / "12,500.00" / "₹ 12,500" -> "12500.00"-style text the validator accepts
  function toAmount(v) {
    if (typeof v === 'number') {
      const r = Math.round(v * 100) / 100;
      return Math.abs(v - r) > 1e-9 ? String(v) : String(r);
    }
    return norm(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  }

  function toMode(v) {
    const k = norm(v).toLowerCase().replace(/\s+/g, '');
    if (k === 'cash') return 'Cash';
    if (k === 'upi') return 'UPI';
    if (k === 'banktransfer' || k === 'bank' || k === 'neft' || k === 'rtgs' || k === 'imps') return 'Bank Transfer';
    return norm(v);
  }

  /* ---------------- Import ---------------- */

  /**
   * Returns { sheetName, rows: [{ line, sl, id, payment }], errors: [{ line, sl, message }] }
   * `line` is the Excel row number so people can find it in their file.
   */
  function parse(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames.indexOf('Entry') > -1 ? 'Entry' : wb.SheetNames[0];
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });

    let headerRow = -1;
    let cols = {};
    for (let r = 0; r < Math.min(grid.length, 30); r++) {
      const found = {};
      grid[r].forEach(function (cell, c) {
        const key = headerKey(cell);
        if (key && found[key] === undefined) found[key] = c;
      });
      if (found.toWhom !== undefined && found.amount !== undefined) {
        headerRow = r;
        cols = found;
        break;
      }
    }
    if (headerRow === -1) {
      throw new Error('Could not find the header row (To Whom, Amount ...). Use the Payment Log template.');
    }

    const get = function (row, key) { return cols[key] === undefined ? '' : row[cols[key]]; };
    const rows = [];
    const errors = [];

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r];
      const payment = {
        date: toDMY(get(row, 'date')),
        toWhom: norm(get(row, 'toWhom')),
        fromWhom: norm(get(row, 'fromWhom')),
        purpose: norm(get(row, 'purpose')),
        source: norm(get(row, 'source')),
        amount: toAmount(get(row, 'amount')),
        mode: toMode(get(row, 'mode'))
      };
      // Pre-numbered blank lines and the totals line have no entry data
      const blank = !payment.toWhom && !payment.fromWhom && !payment.purpose && !norm(get(row, 'date'));
      if (blank) continue;

      const line = r + 1;
      const sl = norm(get(row, 'sl'));
      const errs = validatePayment(payment);
      const keys = Object.keys(errs);
      if (keys.length) {
        errors.push({ line: line, sl: sl, message: keys.map(function (k) { return errs[k]; }).join(' ') });
      } else {
        rows.push({ line: line, sl: sl, id: norm(get(row, 'id')), payment: payment });
      }
    }
    return { sheetName: sheetName, rows: rows, errors: errors };
  }

  /* ---------------- Export ---------------- */

  // "2026-10-06" -> Excel serial day number (UTC, so no timezone drift)
  function isoToSerial(iso) {
    const p = iso.split('-');
    return (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  // Write one cell object and grow the sheet's range to include it
  function setCell(ws, addr, cell) {
    ws[addr] = cell;
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const at = XLSX.utils.decode_cell(addr);
    range.e.r = Math.max(range.e.r, at.r);
    range.e.c = Math.max(range.e.c, at.c);
    ws['!ref'] = XLSX.utils.encode_range(range);
  }

  function formula(f, z) {
    return z ? { t: 'n', f: f, z: z } : { t: 'n', f: f };
  }

  /** list: payments (any order); written oldest first with Sl. No. 1..n */
  function exportLog(list, scopeText) {
    const items = list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const first = items.length ? isoToDMY(items[0].date) : '';
    const last = items.length ? isoToDMY(items[items.length - 1].date) : '';

    const aoa = [
      ['FORTITUDE FABRICS'],
      ['PAYMENT & EXPENSE LOG BOOK'],
      ['', '', '', 'Period:  From ' + first + '  To ' + last + (scopeText ? '   (' + scopeText + ')' : '')],
      [],
      HEADERS,
      []
    ];
    items.forEach(function (p, i) {
      aoa.push([i + 1, '', p.toWhom, p.fromWhom, p.purpose, p.source || '', Number(p.amount), p.mode, p.id]);
    });

    const firstData = 7;
    const lastData = firstData + Math.max(items.length, 1) - 1;
    const totalRow = lastData + 2;

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    items.forEach(function (p, i) {
      setCell(ws, 'B' + (firstData + i), { t: 'n', v: isoToSerial(p.date), z: 'dd-mm-yyyy' });
      ws['G' + (firstData + i)].z = '#,##0.00';
    });
    setCell(ws, 'F' + totalRow, { t: 's', v: 'TOTAL' });
    setCell(ws, 'G' + totalRow, formula('SUM(G' + firstData + ':G' + lastData + ')', '#,##0.00'));

    ws['!cols'] = [{ wch: 7 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 32 }, { wch: 18 },
      { wch: 14 }, { wch: 16 }, { wch: 20 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
    ws['!autofilter'] = { ref: 'A5:I' + lastData };

    // Summary sheet: same formulas as the template's Summary tab
    const range = function (col) { return 'Entry!$' + col + '$' + firstData + ':$' + col + '$' + lastData; };
    const sources = Array.from(new Set(items.map(function (p) { return (p.source || '').trim(); })
      .filter(Boolean))).sort();
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Summary'],
      [],
      ['Payment Mode', 'Entries', 'Total Amount (INR)'],
      ['Cash'], ['UPI'], ['Bank Transfer'],
      ['Total'],
      ['Check: all amounts'],
      ['Amounts without a payment mode'],
      [],
      ['By source of funds'],
      ['Source of Funds', 'Entries', 'Total Amount (INR)']
    ].concat(sources.map(function (s) { return [s]; })));
    const money = '#,##0.00';
    for (let r = 4; r <= 6; r++) {
      setCell(ws2, 'B' + r, formula('COUNTIFS(' + range('H') + ',$A' + r + ')'));
      setCell(ws2, 'C' + r, formula('SUMIFS(' + range('G') + ',' + range('H') + ',$A' + r + ')', money));
    }
    setCell(ws2, 'B7', formula('SUM(B4:B6)'));
    setCell(ws2, 'C7', formula('SUM(C4:C6)', money));
    setCell(ws2, 'C8', formula('SUM(' + range('G') + ')', money));
    setCell(ws2, 'C9', formula('C8-C7', money));
    sources.forEach(function (s, i) {
      const r = 13 + i;
      setCell(ws2, 'B' + r, formula('COUNTIFS(' + range('F') + ',$A' + r + ')'));
      setCell(ws2, 'C' + r, formula('SUMIFS(' + range('G') + ',' + range('F') + ',$A' + r + ')', money));
    });
    ws2['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 20 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entry');
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
    XLSX.writeFile(wb, 'Payment_Log_' + todayDMY().split('/').reverse().join('') + '.xlsx');
  }

  return { parse: parse, exportLog: exportLog };
})();
