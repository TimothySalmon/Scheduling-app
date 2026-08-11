/* CatFace Production Scheduler
   Every video is a chain of steps on a 15-minute grid. Steps run back to back,
   so moving or resizing one step automatically pushes every step after it. */
(function () {
  'use strict';

  var SLOT = 15;   // minutes in one chunk
  var PX = 26;     // pixels per chunk (keep in sync with --slot-w in styles.css)
  var KEY = 'catface-scheduler-v1';
  var Q = String.fromCharCode(34);

  var TYPES = [
    { id: 'prod',  label: 'Prod',            color: '#7c4dff' },
    { id: 'bl',    label: 'BL (Block)',      color: '#ff7043' },
    { id: 'rec',   label: 'Recording',       color: '#26a69a' },
    { id: 'wt',    label: 'WT / Revs',       color: '#42a5f5' },
    { id: 'wrap',  label: 'Wrap',            color: '#8d6e63' },
    { id: 'sp',    label: 'SP',              color: '#ec407a' },
    { id: 'admin', label: 'Admin Tasks',     color: '#5c6bc0' },
    { id: 'scrum', label: 'Prod Mgmt Scrum', color: '#ab47bc' },
    { id: 'lunch', label: 'Lunch',           color: '#78909c' },
    { id: 'other', label: 'Other',           color: '#607d8b' }
  ];

  var TEMPLATES = {
    standard: [
      { name: 'Admin Tasks', type: 'admin', dur: 30 },
      { name: 'Prod Mgmt Scrum', type: 'scrum', dur: 15 },
      { name: 'BL', type: 'bl', dur: 60 },
      { name: 'Prod', type: 'prod', dur: 105 },
      { name: 'Lunch', type: 'lunch', dur: 60 },
      { name: 'Recording', type: 'rec', dur: 90 },
      { name: 'WT / Revs', type: 'wt', dur: 60 },
      { name: 'Wrap', type: 'wrap', dur: 30 }
    ],
    record: [
      { name: 'Recording', type: 'rec', dur: 120 },
      { name: 'WT / Revs', type: 'wt', dur: 60 },
      { name: 'Wrap', type: 'wrap', dur: 30 }
    ],
    empty: []
  };

  var state = { dayLabel: '', dayStart: 540, dayEnd: 1080, tracks: [] };
  var sel = null;       // { trackId: id, stepId: id }
  var drag = null;      // timeline move / resize
  var listDrag = null;  // step list reorder
  var openCards = {};

  var el = {
    ruler: document.getElementById('ruler'),
    rows: document.getElementById('rows'),
    inspector: document.getElementById('inspector'),
    empty: document.getElementById('empty-msg'),
    dayLabel: document.getElementById('day-label'),
    dayStart: document.getElementById('day-start'),
    dayEnd: document.getElementById('day-end'),
    dayHint: document.getElementById('day-hint'),
    dialog: document.getElementById('video-dialog'),
    fileJson: document.getElementById('file-json')
  };

  /* ---------------- helpers ---------------- */
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toHHMM(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function fromHHMM(s) { var p = String(s || '').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
  function clock(m) { var h = Math.floor(m / 60) % 24, x = h % 12; if (x === 0) { x = 12; } return x + ':' + pad(m % 60) + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function hourName(m) { var h = Math.floor(m / 60) % 24, x = h % 12; if (x === 0) { x = 12; } return x + ' ' + (h >= 12 ? 'PM' : 'AM'); }
  function human(d) { var h = Math.floor(d / 60), m = d % 60; if (h && m) { return h + 'h ' + m + 'm'; } if (h) { return h + 'h'; } return m + 'm'; }
  function snap(m) { return Math.round(m / SLOT) * SLOT; }
  function typeOf(id) { for (var i = 0; i < TYPES.length; i++) { if (TYPES[i].id === id) { return TYPES[i]; } } return TYPES[TYPES.length - 1]; }
  function elem(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text !== undefined) { n.textContent = text; } return n; }

  /* ---------------- model ---------------- */
  function layout(track) {
    var t = track.start, out = [], i, s;
    for (i = 0; i < track.steps.length; i++) {
      s = track.steps[i];
      t += (s.gap || 0);
      out.push({ step: s, index: i, start: t, end: t + s.dur });
      t += s.dur;
    }
    return out;
  }
  function trackEnd(track) { var p = layout(track); return p.length ? p[p.length - 1].end : track.start; }
  function findTrack(id) { for (var i = 0; i < state.tracks.length; i++) { if (state.tracks[i].id === id) { return state.tracks[i]; } } return null; }
  function findStep(track, id) { for (var i = 0; i < track.steps.length; i++) { if (track.steps[i].id === id) { return track.steps[i]; } } return null; }
  function indexOfStep(track, id) { for (var i = 0; i < track.steps.length; i++) { if (track.steps[i].id === id) { return i; } } return -1; }
  function lastEnd() { var m = state.dayEnd; state.tracks.forEach(function (t) { m = Math.max(m, trackEnd(t)); }); return m; }
  function slotCount() { return Math.max(8, Math.ceil((lastEnd() - state.dayStart) / SLOT)); }
  function newStep(name, type, d, gap) {
    return { id: uid(), name: name, type: type || 'other', dur: Math.max(SLOT, snap(d || SLOT)), gap: gap || 0 };
  }
  function addVideo(o) {
    var steps = (TEMPLATES[o.template] || []).map(function (s) { return newStep(s.name, s.type, s.dur, 0); });
    var track = { id: uid(), title: o.title, team: o.team || '', owner: o.owner || '', link: o.link || '', start: o.start, steps: steps };
    state.tracks.push(track);
    return track;
  }

  /* ---------------- storage ---------------- */
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ } }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) { return false; }
      var data = JSON.parse(raw);
      if (!data || !data.tracks) { return false; }
      state = data;
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- rendering ---------------- */
  function render() {
    renderRuler();
    renderRows();
    renderInspector();
    el.empty.hidden = state.tracks.length > 0;
    el.dayHint.textContent = state.tracks.length + ' video(s), latest finish ' + clock(lastEnd());
    save();
  }

  function renderRuler() {
    el.ruler.innerHTML = '';
    el.ruler.appendChild(elem('div', 'head-spacer'));
    var n = slotCount(), i = 0, k, hour, count, quarters;
    while (i < n) {
      count = Math.min(4, n - i);
      hour = elem('div', 'hour');
      hour.style.width = (count * PX) + 'px';
      hour.appendChild(elem('div', 'hour-label', hourName(state.dayStart + i * SLOT)));
      quarters = elem('div', 'quarters');
      for (k = 0; k < count; k++) {
        quarters.appendChild(elem('div', 'quarter', ':' + pad((state.dayStart + (i + k) * SLOT) % 60)));
      }
      hour.appendChild(quarters);
      el.ruler.appendChild(hour);
      i += count;
    }
  }

  function renderRows() {
    el.rows.innerHTML = '';
    var width = slotCount() * PX;
    state.tracks.forEach(function (track) {
      var row = elem('div', 'row');
      var head = elem('div', 'row-head');
      head.appendChild(elem('div', 'row-title', track.title));
      var bits = [];
      if (track.team) { bits.push(track.team); }
      if (track.owner) { bits.push(track.owner); }
      bits.push(clock(track.start) + ' - ' + clock(trackEnd(track)));
      head.appendChild(elem('div', 'row-meta', bits.join(' . ')));
      row.appendChild(head);

      var lane = elem('div', 'lane');
      lane.style.width = width + 'px';
      layout(track).forEach(function (p) {
        var b = elem('div', 'step' + (sel && sel.stepId === p.step.id ? ' selected' : ''));
        b.style.left = ((p.start - state.dayStart) / SLOT * PX) + 'px';
        b.style.width = Math.max(PX, (p.step.dur / SLOT) * PX - 3) + 'px';
        b.style.background = typeOf(p.step.type).color;
        b.dataset.track = track.id;
        b.dataset.step = p.step.id;
        b.title = p.step.name + '  ' + clock(p.start) + ' - ' + clock(p.end);
        b.appendChild(elem('span', 'step-label', p.step.name));
        b.appendChild(elem('span', 'step-time', clock(p.start) + ' - ' + clock(p.end) + '  (' + human(p.step.dur) + ')'));
        b.appendChild(elem('span', 'step-resize'));
        lane.appendChild(b);
      });
      row.appendChild(lane);
      el.rows.appendChild(row);
    });
  }

  function renderInspector() {
    el.inspector.innerHTML = '';
    if (!state.tracks.length) {
      el.inspector.appendChild(elem('p', 'hint', 'Add a video to start scheduling. Each task you add is dropped straight onto the timeline after the previous one.'));
      return;
    }
    state.tracks.forEach(function (track) { el.inspector.appendChild(card(track)); });
  }

  function field(labelText, input) {
    var f = elem('div', 'field');
    f.appendChild(elem('label', null, labelText));
    f.appendChild(input);
    return f;
  }
  function textInput(value, onchange) {
    var i = document.createElement('input');
    i.value = value || '';
    i.addEventListener('change', function () { onchange(i.value); });
    return i;
  }

  function card(track) {
    var c = elem('div', 'card');
    var head = elem('div', 'card-head');
    head.appendChild(elem('h3', null, track.title));
    var btns = elem('div', 'btn-row');
    var edit = elem('button', 'small', openCards[track.id] ? 'Close' : 'Edit');
    edit.onclick = function () { openCards[track.id] = !openCards[track.id]; render(); };
    var del = elem('button', 'small danger-ghost', 'Delete');
    del.onclick = function () {
      if (!window.confirm('Remove ' + track.title + ' and all of its tasks?')) { return; }
      state.tracks = state.tracks.filter(function (t) { return t.id !== track.id; });
      if (sel && sel.trackId === track.id) { sel = null; }
      render();
    };
    btns.appendChild(edit);
    btns.appendChild(del);
    head.appendChild(btns);
    c.appendChild(head);

    var meta = [];
    if (track.team) { meta.push(track.team); }
    if (track.owner) { meta.push(track.owner); }
    meta.push(clock(track.start) + ' - ' + clock(trackEnd(track)));
    meta.push(human(trackEnd(track) - track.start) + ' total');
    c.appendChild(elem('div', 'meta', meta.join(' . ')));

    if (track.link) {
      var a = elem('a', 'meta', 'Open video link');
      a.href = track.link;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      c.appendChild(a);
    }

    if (openCards[track.id]) { c.appendChild(trackSettings(track)); }
    c.appendChild(stepList(track));
    c.appendChild(addTaskBox(track));
    if (sel && sel.trackId === track.id) {
      var s = findStep(track, sel.stepId);
      if (s) { c.appendChild(stepEditor(track, s)); }
    }
    return c;
  }

  function trackSettings(track) {
    var box = elem('div', 'editor');
    box.appendChild(field('Video / episode title', textInput(track.title, function (v) { track.title = v || 'Untitled video'; render(); })));
    box.appendChild(field('Team', textInput(track.team, function (v) { track.team = v; render(); })));
    box.appendChild(field('Showrunner / owner', textInput(track.owner, function (v) { track.owner = v; render(); })));
    var t = document.createElement('input');
    t.type = 'time';
    t.step = '900';
    t.value = toHHMM(track.start);
    t.addEventListener('change', function () { track.start = snap(fromHHMM(t.value)); render(); });
    box.appendChild(field('Call time (the whole chain moves with it)', t));
    box.appendChild(field('Video link', textInput(track.link, function (v) { track.link = v; render(); })));
    return box;
  }

  function stepList(track) {
    var ul = elem('ul', 'steps');
    if (!track.steps.length) {
      ul.appendChild(elem('li', 'li-time', 'No tasks yet - add one below.'));
      return ul;
    }
    layout(track).forEach(function (p) {
      var li = elem('li', sel && sel.stepId === p.step.id ? 'sel' : '');
      li.draggable = true;
      li.appendChild(elem('span', 'grip', '..'));
      var sw = elem('span', 'swatch');
      sw.style.background = typeOf(p.step.type).color;
      li.appendChild(sw);
      var main = elem('div', 'li-main');
      main.appendChild(elem('div', 'li-name', p.step.name));
      main.appendChild(elem('div', 'li-time', clock(p.start) + ' - ' + clock(p.end) + '  (' + human(p.step.dur) + ')'));
      li.appendChild(main);
      var minus = elem('button', 'small', '-15');
      minus.onclick = function (e) { e.stopPropagation(); resizeStep(track, p.step, -SLOT); };
      var plus = elem('button', 'small', '+15');
      plus.onclick = function (e) { e.stopPropagation(); resizeStep(track, p.step, SLOT); };
      li.appendChild(minus);
      li.appendChild(plus);
      li.onclick = function () { select(track.id, p.step.id); };
      li.addEventListener('dragstart', function (e) {
        listDrag = { trackId: track.id, index: p.index };
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', p.step.id); } catch (err) { /* ignore */ }
      });
      li.addEventListener('dragover', function (e) {
        if (!listDrag) { return; }
        e.preventDefault();
        li.classList.add('drop-before');
      });
      li.addEventListener('dragleave', function () { li.classList.remove('drop-before'); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        li.classList.remove('drop-before');
        if (listDrag) { moveStep(listDrag.trackId, listDrag.index, track.id, p.index); }
        listDrag = null;
      });
      li.addEventListener('dragend', function () { listDrag = null; });
      ul.appendChild(li);
    });
    return ul;
  }

  function addTaskBox(track) {
    var box = elem('div', 'editor');
    var grid = elem('div', 'add-task');
    var name = document.createElement('input');
    name.placeholder = 'New task, e.g. Prod - Ep 12';
    var type = document.createElement('select');
    TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.label;
      type.appendChild(o);
    });
    var len = document.createElement('select');
    for (var m = SLOT; m <= 480; m += SLOT) {
      var o2 = document.createElement('option');
      o2.value = String(m);
      o2.textContent = human(m);
      len.appendChild(o2);
    }
    len.value = '60';
    var add = elem('button', 'small primary', 'Add task');
    add.onclick = function () {
      var n = name.value.trim();
      if (!n) { name.focus(); return; }
      var s = newStep(n, type.value, parseInt(len.value, 10), 0);
      track.steps.push(s);
      name.value = '';
      select(track.id, s.id);
    };
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { add.click(); } });
    grid.appendChild(name);
    grid.appendChild(type);
    grid.appendChild(len);
    box.appendChild(grid);
    var row = elem('div', 'btn-row');
    row.appendChild(add);
    box.appendChild(row);
    return box;
  }

  function stepEditor(track, step) {
    var idx = indexOfStep(track, step.id);
    var box = elem('div', 'editor');
    box.appendChild(elem('div', 'meta', 'Editing task ' + (idx + 1) + ' of ' + track.steps.length + ' - later tasks follow automatically'));
    box.appendChild(field('Task name', textInput(step.name, function (v) { step.name = v || 'Untitled task'; render(); })));

    var type = document.createElement('select');
    TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.label;
      if (t.id === step.type) { o.selected = true; }
      type.appendChild(o);
    });
    type.addEventListener('change', function () { step.type = type.value; render(); });
    box.appendChild(field('Type', type));

    var d = document.createElement('input');
    d.type = 'number';
    d.min = String(SLOT);
    d.step = String(SLOT);
    d.value = String(step.dur);
    d.addEventListener('change', function () { step.dur = Math.max(SLOT, snap(parseInt(d.value, 10) || SLOT)); render(); });
    box.appendChild(field('Length in minutes', d));

    var g = document.createElement('input');
    g.type = 'number';
    g.min = '0';
    g.step = String(SLOT);
    g.value = String(step.gap || 0);
    g.addEventListener('change', function () { step.gap = Math.max(0, snap(parseInt(g.value, 10) || 0)); render(); });
    box.appendChild(field('Gap before this task (minutes)', g));

    var row1 = elem('div', 'btn-row');
    row1.appendChild(button('-15 min', function () { resizeStep(track, step, -SLOT); }));
    row1.appendChild(button('+15 min', function () { resizeStep(track, step, SLOT); }));
    row1.appendChild(button('Move earlier', function () { shiftStep(track, step, -SLOT); }));
    row1.appendChild(button('Move later', function () { shiftStep(track, step, SLOT); }));
    box.appendChild(row1);

    var row2 = elem('div', 'btn-row');
    row2.appendChild(button('Up in order', function () { if (idx > 0) { moveStep(track.id, idx, track.id, idx - 1); } }));
    row2.appendChild(button('Down in order', function () { if (idx < track.steps.length - 1) { moveStep(track.id, idx, track.id, idx + 2); } }));
    row2.appendChild(button('Duplicate', function () {
      var copy = newStep(step.name, step.type, step.dur, 0);
      track.steps.splice(idx + 1, 0, copy);
      select(track.id, copy.id);
    }));
    var rm = button('Delete task', function () {
      track.steps.splice(idx, 1);
      sel = null;
      render();
    });
    rm.className = 'small danger-ghost';
    row2.appendChild(rm);
    box.appendChild(row2);

    if (state.tracks.length > 1) {
      var mv = document.createElement('select');
      var head = document.createElement('option');
      head.value = '';
      head.textContent = 'Move task to another video...';
      mv.appendChild(head);
      state.tracks.forEach(function (t) {
        if (t.id === track.id) { return; }
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.title;
        mv.appendChild(o);
      });
      mv.addEventListener('change', function () {
        if (!mv.value) { return; }
        var target = findTrack(mv.value);
        moveStep(track.id, idx, target.id, target.steps.length);
      });
      box.appendChild(field('Reassign', mv));
    }
    return box;
  }

  function button(text, fn) {
    var b = elem('button', 'small', text);
    b.onclick = fn;
    return b;
  }

  /* ---------------- actions ---------------- */
  function select(trackId, stepId) {
    sel = { trackId: trackId, stepId: stepId };
    render();
  }
  function resizeStep(track, step, delta) {
    step.dur = Math.max(SLOT, step.dur + delta);
    select(track.id, step.id);
  }
  function shiftStep(track, step, delta) {
    step.gap = Math.max(0, (step.gap || 0) + delta);
    select(track.id, step.id);
  }
  function moveStep(fromId, fromIdx, toId, toIdx) {
    var from = findTrack(fromId), to = findTrack(toId);
    if (!from || !to) { return; }
    var moved = from.steps.splice(fromIdx, 1)[0];
    if (!moved) { return; }
    moved.gap = 0;
    if (from === to && fromIdx < toIdx) { toIdx = toIdx - 1; }
    to.steps.splice(Math.max(0, Math.min(toIdx, to.steps.length)), 0, moved);
    select(to.id, moved.id);
  }

  /* ---------------- timeline drag ---------------- */
  el.rows.addEventListener('pointerdown', function (e) {
    var block = e.target.closest ? e.target.closest('.step') : null;
    if (!block) { return; }
    var track = findTrack(block.dataset.track);
    if (!track) { return; }
    var step = findStep(track, block.dataset.step);
    if (!step) { return; }
    drag = {
      mode: e.target.classList.contains('step-resize') ? 'resize' : 'move',
      trackId: track.id,
      stepId: step.id,
      x: e.clientX,
      gap: step.gap || 0,
      dur: step.dur,
      moved: false
    };
    select(track.id, step.id);
    e.preventDefault();
  });

  window.addEventListener('pointermove', function (e) {
    if (!drag) { return; }
    var track = findTrack(drag.trackId);
    if (!track) { return; }
    var step = findStep(track, drag.stepId);
    if (!step) { return; }
    var slots = Math.round((e.clientX - drag.x) / PX);
    if (drag.mode === 'resize') {
      var d = Math.max(SLOT, drag.dur + slots * SLOT);
      if (d === step.dur) { return; }
      step.dur = d;
    } else {
      var g = Math.max(0, drag.gap + slots * SLOT);
      if (g === (step.gap || 0)) { return; }
      step.gap = g;
    }
    drag.moved = true;
    render();
  });

  window.addEventListener('pointerup', function () {
    if (!drag) { return; }
    drag = null;
    render();
  });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', function (e) {
    if (!sel) { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { return; }
    var track = findTrack(sel.trackId);
    if (!track) { return; }
    var step = findStep(track, sel.stepId);
    if (!step) { return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) { resizeStep(track, step, SLOT); } else { shiftStep(track, step, SLOT); } }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (e.shiftKey) { resizeStep(track, step, -SLOT); } else { shiftStep(track, step, -SLOT); } }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      var i = indexOfStep(track, step.id);
      track.steps.splice(i, 1);
      sel = null;
      render();
    }
  });

  /* ---------------- day settings ---------------- */
  el.dayLabel.addEventListener('change', function () { state.dayLabel = el.dayLabel.value; save(); });
  el.dayStart.addEventListener('change', function () { state.dayStart = snap(fromHHMM(el.dayStart.value)); render(); });
  el.dayEnd.addEventListener('change', function () { state.dayEnd = snap(fromHHMM(el.dayEnd.value)); render(); });

  /* ---------------- add video ---------------- */
  document.getElementById('btn-add-video').addEventListener('click', function () {
    document.getElementById('v-title').value = '';
    document.getElementById('v-link').value = '';
    document.getElementById('v-start').value = toHHMM(state.dayStart);
    if (el.dialog.showModal) { el.dialog.showModal(); } else { el.dialog.setAttribute('open', 'open'); }
  });
  document.getElementById('video-form').addEventListener('submit', function (e) {
    if (e.submitter && e.submitter.value === 'cancel') { return; }
    if (!document.getElementById('v-title').value.trim()) { return; }
    var track = addVideo({
      title: document.getElementById('v-title').value.trim() || 'Untitled video',
      team: document.getElementById('v-team').value.trim(),
      owner: document.getElementById('v-owner').value.trim(),
      link: document.getElementById('v-link').value.trim(),
      start: snap(fromHHMM(document.getElementById('v-start').value)),
      template: document.getElementById('v-template').value
    });
    openCards[track.id] = false;
    render();
  });

  /* ---------------- export / import ---------------- */
  function download(text, filename, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function csvCell(v) { return Q + String(v).split(Q).join(Q + Q) + Q; }
  document.getElementById('btn-export-csv').addEventListener('click', function () {
    var slots = slotCount(), i;
    var header = ['Video / Team'];
    for (i = 0; i < slots; i++) { header.push(clock(state.dayStart + i * SLOT)); }
    var lines = [header.map(csvCell).join(',')];
    state.tracks.forEach(function (t) {
      var row = [];
      row.push(t.title + (t.team ? ' (' + t.team + ')' : ''));
      for (i = 0; i < slots; i++) { row.push(''); }
      layout(t).forEach(function (p) {
        for (var m = p.start; m < p.end; m += SLOT) {
          var idx = Math.round((m - state.dayStart) / SLOT);
          if (idx >= 0 && idx < slots) { row[idx + 1] = p.step.name; }
        }
      });
      lines.push(row.map(csvCell).join(','));
    });
    download(lines.join('\r\n'), 'production-schedule.csv', 'text/csv');
  });
  document.getElementById('btn-save-json').addEventListener('click', function () {
    download(JSON.stringify(state, null, 2), 'production-schedule.json', 'application/json');
  });
  document.getElementById('btn-load-json').addEventListener('click', function () { el.fileJson.click(); });
  el.fileJson.addEventListener('change', function () {
    var file = el.fileJson.files && el.fileJson.files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || !data.tracks) { throw new Error('bad file'); }
        state = data;
        sel = null;
        syncDayInputs();
        render();
      } catch (err) { window.alert('That file could not be read as a saved schedule.'); }
    };
    reader.readAsText(file);
    el.fileJson.value = '';
  });
  document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
  document.getElementById('btn-reset').addEventListener('click', function () {
    if (!window.confirm('Clear every video and task from this schedule?')) { return; }
    state.tracks = [];
    sel = null;
    render();
  });

  /* ---------------- start ---------------- */
  function syncDayInputs() {
    el.dayLabel.value = state.dayLabel || '';
    el.dayStart.value = toHHMM(state.dayStart);
    el.dayEnd.value = toHHMM(state.dayEnd);
  }
  if (!load()) {
    state.dayLabel = 'Monday X/X';
    addVideo({ title: 'Example video - rename me', team: 'Team A', owner: '', link: '', start: 540, template: 'standard' });
  }
  document.documentElement.style.setProperty('--slot-w', PX + 'px');
  syncDayInputs();
  render();
}());
