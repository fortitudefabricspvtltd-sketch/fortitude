/* =========================================================
   Excel import / export for the Fortitude "Attendance &
   Stitching Log Book" (Attendance_Log_Digital.xlsx layout):

     Row 5  Sl. No. | Date | Person Name | Attendance (P / A) |
            Time In | Time Out | Hours | Item Stitched |
            Item Quantity | Paid (Y / N) | Payment
     Row 7+ entries

   Import finds the header row by its titles, so older copies
   (with "Signature" instead of "Payment") still work.
   Needs SheetJS (window.XLSX), common.js and att-common.js.
   ========================================================= */

const AttendanceExcel = (function () {

  const HEADERS = ['Sl. No.', 'Date', 'Person Name', 'Attendance\n(P / A)', 'Time In', 'Time Out', 'Hours',
    'Item Stitched', 'Item Quantity', 'Paid\n(Y / N)', 'Payment', 'Worker ID', 'Entry ID'];

  const HEADER_MAP = {
    'sl. no.': 'sl', 'sl no': 'sl', 'sl.no.': 'sl', 's.no': 'sl', 's. no.': 'sl',
    'date': 'date',
    'person name': 'person', 'person': 'person', 'name': 'person', 'worker': 'person',
    'attendance': 'status',
    'time in': 'timeIn', 'in time': 'timeIn',
    'time out': 'timeOut', 'out time': 'timeOut',
    'item stitched': 'item', 'item': 'item',
    'item quantity': 'qty', 'quantity': 'qty', 'qty': 'qty',
    'paid': 'paid',
    'payment': 'frequency',
    'entry id': 'id',
    'worker id': 'workerId', 'roll no': 'workerId', 'roll no.': 'workerId', 'roll number': 'workerId'
  };

  // Field -> column title, for import error messages
  const COLUMN_NAMES = { date: 'Date', person: 'Person Name', status: 'Attendance', timeIn: 'Time In',
    timeOut: 'Time Out', item: 'Item Stitched', qty: 'Item Quantity', paid: 'Paid', frequency: 'Payment' };

  function norm(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  // "Attendance\n(P / A)" -> "attendance"
  function headerKey(v) {
    const k = norm(v).toLowerCase().replace(/\s*\(.*\)\s*$/, '');
    return Object.prototype.hasOwnProperty.call(HEADER_MAP, k) ? HEADER_MAP[k] : null;
  }

  /* ---------------- Cell converters ---------------- */

  function toDMY(v) {
    if (typeof v === 'number' && v > 0) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
      return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    }
    const s = norm(v);
    let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
    if (m) return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    return s;
  }

  // 0.395833 / "9:30 AM" / "18:00" / "6 PM" -> "HH:MM" (24h); unreadable text is passed on for validation to flag
  function toTime(v) {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') {
      const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
      return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    }
    const s = norm(v).toLowerCase().replace(/\./g, ':');
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(s);
    if (!m || (!m[2] && !m[3])) return s;
    let h = +m[1];
    const min = m[2] || '00';
    if (m[3]) {
      if (h < 1 || h > 12) return s;
      h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
    }
    return String(h).padStart(2, '0') + ':' + min;
  }

  function toStatus(v) {
    const k = norm(v).toLowerCase();
    if (k === 'p' || k === 'present') return 'P';
    if (k === 'a' || k === 'absent') return 'A';
    return norm(v).toUpperCase();
  }

  function toPaid(v) {
    const k = norm(v).toLowerCase();
    if (k === 'y' || k === 'yes' || k === 'paid') return 'Y';
    if (k === 'n' || k === 'no' || k === 'unpaid' || k === '') return 'N';
    return norm(v).toUpperCase();
  }

  function toFrequency(v) {
    const k = norm(v).toLowerCase();
    if (k === 'daily' || k === 'day') return 'Daily';
    if (k === 'weekly' || k === 'week') return 'Weekly';
    return norm(v);
  }

  function toQty(v) {
    if (typeof v === 'number') return String(v);
    return norm(v).replace(/[,\s]/g, '');
  }

  /* ---------------- Import ---------------- */

  /**
   * Returns { sheetName, rows: [{ line, sl, id, entry }], errors: [{ line, sl, message }], defaulted }
   * `defaulted` counts rows with a blank Payment that were set to Daily.
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
      if (found.person !== undefined && found.status !== undefined) {
        headerRow = r;
        cols = found;
        break;
      }
    }
    if (headerRow === -1) {
      throw new Error('Could not find the header row (Person Name, Attendance ...). Use the Attendance Log template.');
    }

    const get = function (row, key) { return cols[key] === undefined ? '' : row[cols[key]]; };
    const rows = [];
    const errors = [];
    let defaulted = 0;

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r];
      // A row may give only the Worker ID; the server turns it into that worker's name
      const person = norm(get(row, 'person')) || norm(get(row, 'workerId')).toUpperCase();
      const rawStatus = norm(get(row, 'status'));
      // Pre-numbered blank lines (and the TOTAL line) have no person and no attendance mark
      if (!person && !rawStatus && !norm(get(row, 'date'))) continue;

      const rawFreq = norm(get(row, 'frequency'));
      const entry = {
        date: toDMY(get(row, 'date')),
        person: person,
        status: toStatus(rawStatus),
        timeIn: toTime(get(row, 'timeIn')),
        timeOut: toTime(get(row, 'timeOut')),
        item: norm(get(row, 'item')),
        qty: toQty(get(row, 'qty')),
        paid: toPaid(get(row, 'paid')),
        frequency: rawFreq ? toFrequency(rawFreq) : 'Daily'
      };
      if (entry.status === 'A') { entry.timeIn = entry.timeOut = entry.item = entry.qty = ''; }

      const line = r + 1;
      const sl = norm(get(row, 'sl'));
      const errs = validateAttendance(entry);
      const keys = Object.keys(errs);
      if (keys.length) {
        errors.push({ line: line, sl: sl, message: keys.map(function (k) { return COLUMN_NAMES[k] + ': ' + errs[k]; }).join(' ') });
      } else {
        if (!rawFreq) defaulted++;
        rows.push({ line: line, sl: sl, id: norm(get(row, 'id')), entry: entry });
      }
    }
    return { sheetName: sheetName, rows: rows, errors: errors, defaulted: defaulted };
  }

  /* ---------------- Export ---------------- */

  function isoToSerial(iso) {
    const p = iso.split('-');
    return (Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function timeToSerial(t) {
    const p = t.split(':');
    return (+p[0] * 60 + +p[1]) / 1440;
  }

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

  /** list: entries (any order); written oldest first with Sl. No. 1..n */
  function exportLog(list, scopeText) {
    const items = list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    const first = items.length ? isoToDMY(items[0].date) : '';
    const last = items.length ? isoToDMY(items[items.length - 1].date) : '';

    const aoa = [
      ['FORTITUDE FABRICS'],
      ['ATTENDANCE & STITCHING LOG BOOK'],
      ['', '', '', '', '', 'Period:  From ' + first + '  To ' + last + (scopeText ? '   (' + scopeText + ')' : '')],
      [],
      HEADERS,
      []
    ];
    items.forEach(function (a, i) {
      aoa.push([i + 1, '', a.person, a.status, '', '', '', a.item, a.qty === '' ? '' : Number(a.qty), a.paid, a.frequency, a.workerId || '', a.id]);
    });

    const firstData = 7;
    const lastData = firstData + Math.max(items.length, 1) - 1;
    const totalRow = lastData + 2;

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    items.forEach(function (a, i) {
      const r = firstData + i;
      setCell(ws, 'B' + r, { t: 'n', v: isoToSerial(a.date), z: 'dd-mm-yyyy' });
      if (a.timeIn) setCell(ws, 'E' + r, { t: 'n', v: timeToSerial(a.timeIn), z: 'hh:mm AM/PM' });
      if (a.timeOut) setCell(ws, 'F' + r, { t: 'n', v: timeToSerial(a.timeOut), z: 'hh:mm AM/PM' });
      setCell(ws, 'G' + r, formula('IF(AND(ISNUMBER(E' + r + '),ISNUMBER(F' + r + ')),MOD(F' + r + '-E' + r + ',1)*24,"")', '0.00'));
      if (ws['I' + r] && ws['I' + r].t === 'n') ws['I' + r].z = '#,##0';
    });
    setCell(ws, 'F' + totalRow, { t: 's', v: 'TOTAL' });
    setCell(ws, 'G' + totalRow, formula('SUM(G' + firstData + ':G' + lastData + ')', '0.00'));
    setCell(ws, 'I' + totalRow, formula('SUM(I' + firstData + ':I' + lastData + ')', '#,##0'));

    ws['!cols'] = [{ wch: 7 }, { wch: 12 }, { wch: 24 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 8 },
      { wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 19 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } }];
    ws['!autofilter'] = { ref: 'A5:M' + lastData };

    // Summary sheet: same formulas as the template's Summary tab
    const rng = function (col) { return 'Entry!$' + col + '$' + firstData + ':$' + col + '$' + lastData; };
    const seen = {};
    const people = [];
    const workerOf = {};
    items.forEach(function (a) {
      const k = a.person.trim().toLowerCase();
      if (k && !seen[k]) { seen[k] = true; people.push(a.person.trim()); }
      if (k && a.workerId) workerOf[k] = a.workerId;
    });
    people.sort(function (x, y) { return x.toLowerCase() < y.toLowerCase() ? -1 : 1; });

    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Summary by person'],
      [],
      ['Person Name', 'Days Present', 'Hours Worked', 'Total Quantity', 'Unpaid Entries (N)', 'Worker ID']
    ].concat(people.map(function (p) { return [p, '', '', '', '', workerOf[p.toLowerCase()] || '']; })).concat([['Total']]));
    people.forEach(function (p, i) {
      const r = 4 + i;
      const a = '$A' + r;
      setCell(ws2, 'B' + r, formula('COUNTIFS(' + rng('C') + ',' + a + ',' + rng('D') + ',"P")'));
      setCell(ws2, 'C' + r, formula('SUMIFS(' + rng('G') + ',' + rng('C') + ',' + a + ')', '0.00'));
      setCell(ws2, 'D' + r, formula('SUMIFS(' + rng('I') + ',' + rng('C') + ',' + a + ')', '#,##0'));
      setCell(ws2, 'E' + r, formula('COUNTIFS(' + rng('C') + ',' + a + ',' + rng('J') + ',"N")'));
    });
    const tr = 4 + people.length;
    const lastP = Math.max(tr - 1, 4);
    ['B', 'C', 'D', 'E'].forEach(function (c) {
      setCell(ws2, c + tr, formula('SUM(' + c + '4:' + c + lastP + ')', c === 'C' ? '0.00' : (c === 'D' ? '#,##0' : null)));
    });
    ws2['!cols'] = [{ wch: 28 }, { wch: 13 }, { wch: 14 }, { wch: 15 }, { wch: 19 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entry');
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
    XLSX.writeFile(wb, 'Attendance_Log_' + todayDMY().split('/').reverse().join('') + '.xlsx');
  }

  return { parse: parse, exportLog: exportLog };
})();
