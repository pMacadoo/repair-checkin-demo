// Repair Check-in demo. Plain JavaScript, no build step. Data lives in localStorage only.
(function () {
  'use strict';

  var STORE = 'repair-checkin-demo:v1';
  var CONDITION_ITEMS = ['Screen', 'Back and housing', 'Buttons', 'Cameras', 'Charging port', 'Speakers and mic', 'Powers on'];
  var CONDITION_VALUES = ['OK', 'Damaged', "Can't test"];
  var STATUSES = ['Checked in', 'Diagnosing', 'Waiting on parts', 'Ready for pickup', 'Picked up'];

  var $ = function (sel) { return document.querySelector(sel); };
  var form = $('#form');
  var condition = {};
  var issues = new Set();

  // ---------- storage (wrapped: storage can be blocked or full) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* demo still works for this visit */ }
    memory = list;
  }
  var memory = load();

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
  function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function nextTicketNo() {
    var d = new Date();
    var stamp = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var todays = memory.filter(function (t) { return t.no.indexOf('RC-' + stamp) === 0; }).length;
    return 'RC-' + stamp + '-' + String(todays + 1).padStart(3, '0');
  }
  function maskPhone(p) {
    var digits = String(p).replace(/\D/g, '');
    return digits.length >= 4 ? '•••-' + digits.slice(-4) : p;
  }

  // ---------- views ----------
  function show(view) {
    ['new', 'queue', 'receipt'].forEach(function (v) { $('#view-' + v).hidden = v !== view; });
    document.querySelectorAll('.tab').forEach(function (t) {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (view === 'queue') renderQueue();
    if (view === 'new') $('#ticket-no').textContent = nextTicketNo();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.view); });
  });

  // ---------- condition checklist ----------
  function renderCondition() {
    var box = $('#cond');
    box.innerHTML = CONDITION_ITEMS.map(function (item, i) {
      var btns = CONDITION_VALUES.map(function (v) {
        return '<button type="button" data-i="' + i + '" data-v="' + esc(v) + '" aria-pressed="' + (condition[item] === v) + '">' + esc(v) + '</button>';
      }).join('');
      return '<div class="cond-row"><span id="cond-' + i + '">' + esc(item) + '</span><span class="seg" role="group" aria-labelledby="cond-' + i + '">' + btns + '</span></div>';
    }).join('');
  }
  $('#cond').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]');
    if (!b) return;
    condition[CONDITION_ITEMS[Number(b.dataset.i)]] = b.dataset.v;
    renderCondition();
    var again = document.querySelector('button[data-i="' + b.dataset.i + '"][data-v="' + b.dataset.v + '"]');
    if (again) again.focus();
  });

  // ---------- issue chips ----------
  document.querySelectorAll('.chip').forEach(function (c) {
    c.setAttribute('aria-pressed', 'false');
    c.addEventListener('click', function () {
      var on = !issues.has(c.dataset.issue);
      if (on) issues.add(c.dataset.issue); else issues.delete(c.dataset.issue);
      c.setAttribute('aria-pressed', String(on));
    });
  });

  // ---------- validation ----------
  function validate(data) {
    var errs = [];
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    function need(name, msg) {
      if (!String(data[name] || '').trim()) {
        errs.push(msg);
        var el = form.elements[name];
        if (el && el.setAttribute) el.setAttribute('aria-invalid', 'true');
      }
    }
    need('name', 'Add the customer name.');
    need('phone', 'Add a phone number so you can reach them.');
    need('type', 'Choose the device type.');
    need('model', 'Add the brand and model.');
    if (!issues.size && !String(data.issue || '').trim()) errs.push('Describe what is wrong, or pick a common issue.');
    var missing = CONDITION_ITEMS.filter(function (i) { return !condition[i]; });
    if (missing.length) errs.push('Check every condition item (missing: ' + missing.join(', ') + ').');
    if (!data.passcode) errs.push('Choose how the passcode will be handled.');
    need('estimate', 'Add an estimate.');
    need('due', 'Add a promised-by date.');
    if (Number(data.deposit) > Number(data.estimate)) errs.push('The deposit is more than the estimate.');
    if (!data.consent) errs.push('Confirm the customer agreed to the estimate and terms.');
    return errs;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var data = {};
    fd.forEach(function (v, k) { data[k] = v; });
    data.consent = form.elements.consent.checked;
    var errs = validate(data);
    var box = $('#errors');
    if (errs.length) {
      box.innerHTML = '<b>' + errs.length + (errs.length === 1 ? ' thing' : ' things') + ' to fix</b><ul>' + errs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      box.hidden = false;
      box.focus && box.setAttribute('tabindex', '-1');
      box.focus();
      return;
    }
    box.hidden = true;
    var ticket = {
      no: nextTicketNo(),
      created: new Date().toISOString(),
      status: STATUSES[0],
      customer: { name: data.name.trim(), phone: data.phone.trim(), email: (data.email || '').trim() },
      device: { type: data.type, model: data.model.trim(), serial: (data.serial || '').trim() },
      issues: Array.from(issues),
      issue: (data.issue || '').trim(),
      condition: Object.assign({}, condition),
      accessories: (data.accessories || '').trim(),
      passcode: data.passcode,
      estimate: Number(data.estimate),
      deposit: Number(data.deposit) || 0,
      due: data.due,
    };
    save([ticket].concat(memory));
    resetForm();
    updateCount();
    renderReceipt(ticket);
    show('receipt');
  });

  function resetForm() {
    form.reset();
    condition = {};
    issues.clear();
    document.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    $('#errors').hidden = true;
    renderCondition();
    form.elements.due.value = addDays(2);
  }
  form.addEventListener('reset', function () { setTimeout(resetForm, 0); });

  // Clear a field's error mark as soon as it's edited.
  form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); });

  // ---------- sample (invented) ----------
  $('#fill-sample').addEventListener('click', function () {
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    $('#errors').hidden = true;
    var f = form.elements;
    f.name.value = 'Jordan Rivera';
    f.phone.value = '(555) 010-2233';
    f.email.value = 'jordan@example.com';
    f.type.value = 'Phone';
    f.model.value = 'Pixel 8';
    f.serial.value = '';
    f.issue.value = 'Dropped it on the sidewalk this morning. Touch works but the top corner is shattered.';
    f.accessories.value = 'Clear case';
    f.passcode[0].checked = true;
    f.estimate.value = '189';
    f.deposit.value = '50';
    f.due.value = addDays(1);
    f.consent.checked = true;
    condition = { 'Screen': 'Damaged', 'Back and housing': 'OK', 'Buttons': 'OK', 'Cameras': 'OK', 'Charging port': 'OK', 'Speakers and mic': "Can't test", 'Powers on': 'OK' };
    issues = new Set(['Cracked screen']);
    document.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(issues.has(c.dataset.issue))); });
    renderCondition();
  });

  // ---------- receipt ----------
  function renderReceipt(t) {
    var rows = CONDITION_ITEMS.map(function (i) { return '<tr><td>' + esc(i) + '</td><td>' + esc(t.condition[i] || '-') + '</td></tr>'; }).join('');
    var issueText = t.issues.concat(t.issue ? [t.issue] : []).join(' · ');
    $('#receipt').innerHTML =
      '<h2>Repair receipt · ' + esc(t.no) + '</h2>' +
      '<div>Checked in ' + esc(new Date(t.created).toLocaleString()) + ' · Promised by ' + esc(t.due) + '</div>' +
      '<table><tbody>' +
      '<tr><th>Customer</th><td>' + esc(t.customer.name) + ' · ' + esc(maskPhone(t.customer.phone)) + '</td></tr>' +
      '<tr><th>Device</th><td>' + esc(t.device.type) + ' · ' + esc(t.device.model) + (t.device.serial ? ' · SN ' + esc(t.device.serial) : '') + '</td></tr>' +
      '<tr><th>Issue</th><td>' + esc(issueText) + '</td></tr>' +
      '<tr><th>Accessories</th><td>' + esc(t.accessories || 'None') + '</td></tr>' +
      '<tr><th>Passcode</th><td>' + esc(t.passcode) + '</td></tr>' +
      '<tr><th>Estimate</th><td>' + money(t.estimate) + ' · deposit ' + money(t.deposit) + ' · due at pickup ' + money(t.estimate - t.deposit) + '</td></tr>' +
      '</tbody></table>' +
      '<b>Condition at check-in</b><table><tbody>' + rows + '</tbody></table>' +
      '<p class="terms">We will contact you before doing any work beyond this estimate. Devices not picked up within 30 days of the ready notice may be recycled. Back up your data; repairs can erase it.</p>' +
      '<div class="tag"><b>' + esc(t.no) + '</b><br>' + esc(t.customer.name.split(' ')[0]) + ' · ' + esc(t.device.model) + '<br>Due ' + esc(t.due) + '</div>';
  }
  $('#print').addEventListener('click', function () { window.print(); });
  $('#back').addEventListener('click', function () { show('queue'); });

  // ---------- queue ----------
  function renderQueue() {
    var q = ($('#search').value || '').toLowerCase().trim();
    var list = memory.filter(function (t) {
      if (!q) return true;
      return [t.no, t.customer.name, t.device.model, t.device.type, t.status].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var box = $('#queue');
    if (!memory.length) { box.innerHTML = '<p class="empty">No repairs yet. Check one in, or use "Fill with sample".</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="empty">No tickets match "' + esc(q) + '".</p>'; return; }
    box.innerHTML = list.map(function (t) {
      var late = t.status !== 'Picked up' && t.status !== 'Ready for pickup' && t.due < today();
      var opts = STATUSES.map(function (s) { return '<option' + (s === t.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
      return '<div class="q">' +
        '<div><h2>' + esc(t.device.model) + ' · ' + esc(t.customer.name) + '</h2>' +
        '<div class="meta">' + esc(t.no) + ' · ' + esc((t.issues[0] || t.issue).slice(0, 60)) + ' · <span class="due' + (late ? ' late' : '') + '">' + (late ? 'Overdue · ' : 'Due ') + esc(t.due) + '</span></div></div>' +
        '<label><span class="sr">Status for ' + esc(t.no) + '</span><select data-no="' + esc(t.no) + '">' + opts + '</select></label>' +
        '<div class="row-actions"><button type="button" class="btn ghost" data-receipt="' + esc(t.no) + '">Receipt</button></div>' +
        '</div>';
    }).join('');
  }
  $('#queue').addEventListener('change', function (e) {
    var sel = e.target.closest('select[data-no]');
    if (!sel) return;
    save(memory.map(function (t) { return t.no === sel.dataset.no ? Object.assign({}, t, { status: sel.value }) : t; }));
    updateCount();
  });
  $('#queue').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-receipt]');
    if (!b) return;
    var t = memory.find(function (x) { return x.no === b.dataset.receipt; });
    if (t) { renderReceipt(t); show('receipt'); }
  });
  $('#search').addEventListener('input', renderQueue);

  function updateCount() {
    $('#queue-count').textContent = memory.filter(function (t) { return t.status !== 'Picked up'; }).length;
  }

  // ---------- start ----------
  renderCondition();
  form.elements.due.value = addDays(2);
  updateCount();
  show('new');
})();
