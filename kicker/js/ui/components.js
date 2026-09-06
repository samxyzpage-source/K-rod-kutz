/**
 * Road to Glory: Kicker — RTG.UI.C, the DOM component kit (SPEC §4.4, UI_API.md §Components).
 *
 * Everything returns plain HTMLElements styled by css/style.css. No framework, no templates: `C.el` builds
 * elements, the rest are small factories. Every number shown by a screen must come from state / engine read
 * helpers — these components only lay things out.
 *
 *   C.el(tag, attrs, ...children)                 attrs: class, text, html, style, on<Event>, aria-*, data-*, any attribute
 *   C.button({label, kind, onClick, icon, disabled, small, title, ariaLabel, type})
 *   C.meter({label, value, blocks, delta, max, suffix, kind})          5-block pixel bar
 *   C.bar({label, value, max, kind})                                    continuous attribute bar (0..99)
 *   C.card({title, body, footer, kind, class})
 *   C.tabs({items:[{id,label,icon?}], active, onChange}) → el (+ el.setActive(id))
 *   C.list(items, renderRow, opts?) · C.kv(rows) · C.table(cols, rows, opts) (in .scroll-x)
 *   C.modal({title, body, buttons, closable, kind, onClose}) → {el, close}      focus-trapped, Escape closes
 *   C.modalOpen() · C.closeAllModals()
 *   C.confirm({title, text, okLabel, cancelLabel, kind}) → Promise-free: {onOk(fn), onCancel(fn)}
 *   C.toast(text, kind, ms) · C.deltaChip(value, suffix) · C.chip(text, kind)
 *   C.crest(teamOrId, size) · C.sparkline(canvasEl, values, opts) · C.tooltip(el, text)
 *   C.icon(name, size) · C.announce(text) · C.stars(n, max) · C.pixelAvatar(look, size)
 *   C.fmt — re-exports RTG.Util formatters (money, pct, clock, ordinal, pad) + date / int helpers
 */
(function (root) {
  'use strict';
  var RTG = root.RTG = root.RTG || {};
  RTG.UI = RTG.UI || {};
  var doc = root.document;

  var C = {};

  // ─────────────────────────── el ───────────────────────────

  function appendChild(parent, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { for (var i = 0; i < child.length; i++) appendChild(parent, child[i]); return; }
    if (typeof child === 'string' || typeof child === 'number') { parent.appendChild(doc.createTextNode(String(child))); return; }
    if (child.nodeType) { parent.appendChild(child); return; }
    if (child.el && child.el.nodeType) { parent.appendChild(child.el); return; }
  }

  var PROPS = { value: 1, checked: 1, disabled: 1, selected: 1, readOnly: 1, multiple: 1, indeterminate: 1 };

  /**
   * DOM helper. `attrs` keys: class/className, text, html, style (string | object), on<Event> (function),
   * aria-* / data-* / role / id / any attribute; `value`/`checked`/`disabled` are set as properties.
   */
  C.el = function (tag, attrs) {
    var e = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class' || k === 'className') e.className = String(v);
        else if (k === 'text') e.textContent = String(v);
        else if (k === 'html') e.innerHTML = String(v);
        else if (k === 'style') {
          if (typeof v === 'string') e.style.cssText = v;
          else for (var s in v) if (Object.prototype.hasOwnProperty.call(v, s)) { if (s.indexOf('--') === 0) e.style.setProperty(s, v[s]); else e.style[s] = v[s]; }
        }
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.charAt(2).toLowerCase() + k.slice(3), v);
        else if (PROPS[k]) e[k] = v;
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (var i = 2; i < arguments.length; i++) appendChild(e, arguments[i]);
    return e;
  };

  C.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  C.replace = function (el) { C.clear(el); for (var i = 1; i < arguments.length; i++) appendChild(el, arguments[i]); return el; };

  // ─────────────────────────── icons (pixel strings → inline SVG) ───────────────────────────

  var ICONS = {
    wind: ['.......', 'XXXX...', '....X..', 'XXXXX.X', '.......', '..XXXX.', '......X'],
    rain: ['.XXXX..', 'XXXXXX.', 'XXXXXXX', '.......', '.X..X..', '..X..X.', '.X..X..'],
    snow: ['...X...', '.X.X.X.', '..XXX..', 'XXXXXXX', '..XXX..', '.X.X.X.', '...X...'],
    dome: ['..XXX..', '.X...X.', 'X.....X', 'X.....X', 'XXXXXXX', '.X...X.', '.XXXXX.'],
    star: ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', 'X.....X'],
    trophy: ['XXXXXXX', 'X.XXX.X', 'X.XXX.X', '.XXXXX.', '..XXX..', '...X...', '.XXXXX.'],
    envelope: ['XXXXXXX', 'X.....X', 'XX...XX', 'X.X.X.X', 'X..X..X', 'X.....X', 'XXXXXXX'],
    boot: ['.XX....', '.XX....', '.XX....', '.XXX...', '.XXXXX.', 'XXXXXXX', 'XXXXXXX'],
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    clock: ['..XXX..', '.X.X.X.', 'X..X..X', 'X..XX.X', 'X.....X', '.X...X.', '..XXX..'],
    'arrow-l': ['...X...', '..XX...', '.XXXXXX', 'XXXXXXX', '.XXXXXX', '..XX...', '...X...'],
    'arrow-r': ['...X...', '...XX..', 'XXXXXX.', 'XXXXXXX', 'XXXXXX.', '...XX..', '...X...'],
    'arrow-u': ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '..XXX..', '..XXX..', '..XXX..'],
    'arrow-d': ['..XXX..', '..XXX..', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    check: ['......X', '.....XX', '....XX.', 'X..XX..', 'XXXX...', '.XX....', '.......'],
    x: ['X.....X', 'XX...XX', '.XX.XX.', '..XXX..', '.XX.XX.', 'XX...XX', 'X.....X'],
    home: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XX.XX.', '.XX.XX.', '.XXXXX.'],
    team: ['XXXXXXX', 'X.XXX.X', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    train: ['XX...XX', 'XX...XX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', 'XX...XX', 'XX...XX'],
    stats: ['.....XX', '.....XX', '..XX.XX', '..XX.XX', 'XXXX.XX', 'XXXX.XX', 'XXXX.XX'],
    more: ['.......', '.......', 'XX.XX.X', 'XX.XX.X', '.......', '.......', '.......'],
    dice: ['XXXXXXX', 'XX...XX', 'X.....X', 'X..X..X', 'X.....X', 'XX...XX', 'XXXXXXX'],
    save: ['XXXXX..', 'X.X.XX.', 'X.X..XX', 'X.....X', 'X.XXX.X', 'X.XXX.X', 'XXXXXXX'],
    sun: ['X..X..X', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', 'X..X..X'],
    cloud: ['.......', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.......'],
    money: ['...X...', '.XXXXX.', 'X..X...', '.XXXXX.', '...X..X', '.XXXXX.', '...X...'],
    ball: ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'XX.X.XX', '.XXXXX.', '..XXX..'],
    flag: ['X......', 'XXXXXX.', 'XXXXXXX', 'XXXXXX.', 'X......', 'X......', 'X......'],
    ice: ['X.....X', '.X.X.X.', '..XXX..', 'XXXXXXX', '..XXX..', '.X.X.X.', 'X.....X'],
    bolt: ['....XX.', '...XX..', '..XX...', '.XXXXXX', '...XX..', '..XX...', '.XX....'],
    gear: ['.X.X.X.', 'XXXXXXX', '.XX.XX.', 'XX...XX', '.XX.XX.', 'XXXXXXX', '.X.X.X.'],
    trash: ['..XXX..', 'XXXXXXX', '.X.X.X.', '.X.X.X.', '.X.X.X.', '.X.X.X.', '.XXXXX.']
  };
  C.ICONS = ICONS;

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Pixel-string → inline SVG (fill: currentColor). @param {string} name @param {number} [size] css px (default 12) */
  C.icon = function (name, size) {
    var rows = ICONS[name] || ICONS.x;
    var h = rows.length, w = rows[0].length;
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('width', String(size || 12));
    svg.setAttribute('height', String(size || 12));
    svg.setAttribute('class', 'icon icon-' + name);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    for (var y = 0; y < h; y++) {
      var x = 0;
      while (x < w) {
        if (rows[y].charAt(x) !== 'X') { x++; continue; }
        var run = 1;
        while (x + run < w && rows[y].charAt(x + run) === 'X') run++;
        var r = doc.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
        r.setAttribute('width', String(run)); r.setAttribute('height', '1');
        r.setAttribute('fill', 'currentColor');
        svg.appendChild(r);
        x += run;
      }
    }
    return svg;
  };

  /** Weather icon name for a weather string ('clear' | 'rain' | 'snow' | 'wind' | 'dome' | 'cloudy'). */
  C.weatherIcon = function (weather, windSpeed) {
    var w = String(weather || '').toLowerCase();
    if (w === 'dome') return 'dome';
    if (w === 'snow') return 'snow';
    if (w === 'rain') return 'rain';
    if (w === 'cloudy' || w === 'overcast') return 'cloud';
    if (windSpeed && windSpeed >= 12) return 'wind';
    return 'sun';
  };

  // ─────────────────────────── buttons ───────────────────────────

  /**
   * Chunky pressable button. kind: 'primary' | 'secondary' (default) | 'danger' | 'ghost' | 'gold' (alias primary).
   * @returns {HTMLButtonElement}
   */
  C.button = function (o) {
    o = o || {};
    var kind = o.kind === 'gold' ? 'primary' : (o.kind || 'secondary');
    var cls = 'btn btn-' + kind + (o.small ? ' btn-sm' : '') + (o.block ? ' btn-block' : '') + (o.class ? ' ' + o.class : '');
    var b = C.el('button', {
      class: cls, type: o.type || 'button', disabled: !!o.disabled, title: o.title,
      'aria-label': o.ariaLabel, 'data-action': o.action, onClick: o.onClick
    });
    if (o.icon) b.appendChild(typeof o.icon === 'string' ? C.icon(o.icon) : o.icon);
    if (o.label !== undefined && o.label !== null) b.appendChild(C.el('span', { class: 'btn-label', text: String(o.label) }));
    if (o.right) b.appendChild(typeof o.right === 'string' ? C.icon(o.right) : o.right);
    return b;
  };

  C.buttonRow = function (buttons, cls) {
    return C.el('div', { class: 'btn-row' + (cls ? ' ' + cls : '') }, buttons);
  };

  // ─────────────────────────── chips / meters ───────────────────────────

  /** @param {string} text @param {'gold'|'red'|'mint'|'sky'|'grey'|'team'|''} [kind] */
  C.chip = function (text, kind, icon) {
    var e = C.el('span', { class: 'chip' + (kind ? ' chip-' + kind : '') });
    if (icon) e.appendChild(C.icon(icon, 10));
    e.appendChild(doc.createTextNode(String(text)));
    return e;
  };

  /** +3 / −2 chip coloured by sign (0 → grey '±0'). */
  C.deltaChip = function (value, suffix) {
    var v = typeof value === 'number' ? value : 0;
    var txt = (v > 0 ? '+' : (v < 0 ? '−' : '±')) + Math.abs(Math.round(v * 10) / 10) + (suffix || '');
    var kind = v > 0 ? 'mint' : (v < 0 ? 'red' : 'grey');
    var e = C.chip(txt, kind);
    e.classList.add('delta');
    e.setAttribute('aria-label', (v > 0 ? 'up ' : v < 0 ? 'down ' : 'unchanged ') + Math.abs(v) + (suffix || ''));
    return e;
  };

  /**
   * 5-block pixel meter. value 0..max (default 100). kind colours the lit blocks ('gold' default, 'red', 'mint', 'sky', 'team').
   * The block count is a display rule (blocks lit = round(value / max · blocks)), the number itself is always shown.
   */
  C.meter = function (o) {
    o = o || {};
    var blocks = o.blocks || 5, max = o.max || 100;
    var v = typeof o.value === 'number' && o.value === o.value ? Math.max(0, Math.min(max, o.value)) : 0;
    var lit = Math.round(v / max * blocks);
    var wrap = C.el('div', { class: 'meter' + (o.kind ? ' meter-' + o.kind : ''), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.round(v), 'aria-label': o.label || '' });
    if (o.label) wrap.appendChild(C.el('span', { class: 'meter-label', text: o.label }));
    var bar = C.el('span', { class: 'meter-blocks', 'aria-hidden': 'true' });
    for (var i = 0; i < blocks; i++) bar.appendChild(C.el('span', { class: 'blk' + (i < lit ? ' on' : '') }));
    wrap.appendChild(bar);
    wrap.appendChild(C.el('span', { class: 'meter-value num', text: String(Math.round(v)) + (o.suffix || '') }));
    if (typeof o.delta === 'number' && o.delta !== 0) wrap.appendChild(C.deltaChip(o.delta));
    return wrap;
  };

  /** Continuous bar for attributes (0..99). kind as C.meter. `pot` draws a hidden-cap tick. */
  C.bar = function (o) {
    o = o || {};
    var max = o.max || 99, v = typeof o.value === 'number' ? Math.max(0, Math.min(max, o.value)) : 0;
    var wrap = C.el('div', { class: 'bar' + (o.kind ? ' bar-' + o.kind : ''), role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': Math.round(v), 'aria-label': o.label || '' });
    if (o.label) wrap.appendChild(C.el('span', { class: 'bar-label', text: o.label }));
    var track = C.el('span', { class: 'bar-track', 'aria-hidden': 'true' }, C.el('span', { class: 'bar-fill', style: { width: (v / max * 100).toFixed(1) + '%' } }));
    if (typeof o.pot === 'number') track.appendChild(C.el('span', { class: 'bar-pot', style: { left: (Math.min(max, o.pot) / max * 100).toFixed(1) + '%' } }));
    wrap.appendChild(track);
    if (!o.noValue) wrap.appendChild(C.el('span', { class: 'bar-value num', text: String(Math.round(v)) }));
    if (typeof o.delta === 'number' && o.delta !== 0) wrap.appendChild(C.deltaChip(o.delta));
    return wrap;
  };

  /** ★★★☆☆ */
  C.stars = function (n, max) {
    max = max || 5;
    var s = '';
    for (var i = 0; i < max; i++) s += i < n ? '★' : '☆';
    return C.el('span', { class: 'stars', text: s, 'aria-label': n + ' of ' + max + ' stars' });
  };

  // ─────────────────────────── cards / tabs / lists / tables ───────────────────────────

  /** kind: '' | 'gold' | 'red' | 'sky' | 'mint' | 'team' | 'flat' */
  C.card = function (o) {
    o = o || {};
    var card = C.el('section', { class: 'card' + (o.kind ? ' card-' + o.kind : '') + (o.class ? ' ' + o.class : ''), 'aria-label': o.ariaLabel });
    if (o.title !== undefined && o.title !== null) {
      var h = C.el('h2', { class: 'card-title' });
      if (o.icon) h.appendChild(C.icon(o.icon));
      appendChild(h, o.title);
      if (o.right) h.appendChild(C.el('span', { class: 'card-title-right' }, o.right));
      card.appendChild(h);
    }
    var body = C.el('div', { class: 'card-body' }, o.body);
    card.appendChild(body);
    card.body = body;
    if (o.footer) card.appendChild(C.el('div', { class: 'card-footer' }, o.footer));
    return card;
  };

  /** Tab strip. Returns the element with `setActive(id)`; onChange(id) fires on click / arrow keys. */
  C.tabs = function (o) {
    o = o || {};
    var items = o.items || [];
    var active = o.active || (items[0] && items[0].id);
    var strip = C.el('div', { class: 'tabs' + (o.class ? ' ' + o.class : ''), role: 'tablist' });
    var buttons = {};
    function setActive(id, fire) {
      active = id;
      for (var k in buttons) {
        var on = k === id;
        buttons[k].classList.toggle('active', on);
        buttons[k].setAttribute('aria-selected', on ? 'true' : 'false');
        buttons[k].setAttribute('tabindex', on ? '0' : '-1');
      }
      if (fire && typeof o.onChange === 'function') o.onChange(id);
    }
    items.forEach(function (it, idx) {
      var b = C.el('button', { class: 'tab', type: 'button', role: 'tab', 'data-tab': it.id, onClick: function () { setActive(it.id, true); } });
      if (it.icon) b.appendChild(C.icon(it.icon));
      b.appendChild(C.el('span', { text: it.label }));
      b.addEventListener('keydown', function (ev) {
        var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        var n = items[(idx + d + items.length) % items.length];
        setActive(n.id, true);
        buttons[n.id].focus();
      });
      buttons[it.id] = b;
      strip.appendChild(b);
    });
    setActive(active, false);
    strip.setActive = function (id) { setActive(id, false); };
    strip.active = function () { return active; };
    return strip;
  };

  /** Vertical list; renderRow(item, index) → element | string. opts.empty = text when there are no items. */
  C.list = function (items, renderRow, opts) {
    opts = opts || {};
    var ul = C.el('ul', { class: 'list' + (opts.class ? ' ' + opts.class : '') });
    if (!items || !items.length) {
      ul.appendChild(C.el('li', { class: 'list-empty', text: opts.empty || 'Nothing here yet.' }));
      return ul;
    }
    for (var i = 0; i < items.length; i++) {
      var li = C.el('li', { class: 'list-row' });
      appendChild(li, renderRow ? renderRow(items[i], i) : String(items[i]));
      ul.appendChild(li);
    }
    return ul;
  };

  /** Key/value rows: [[label, value], …] or [{k, v, kind}]. */
  C.kv = function (rows) {
    var dl = C.el('dl', { class: 'kv' });
    (rows || []).forEach(function (r) {
      var k = Array.isArray(r) ? r[0] : r.k, v = Array.isArray(r) ? r[1] : r.v, kind = Array.isArray(r) ? r[2] : r.kind;
      dl.appendChild(C.el('dt', { text: String(k) }));
      var dd = C.el('dd', { class: kind ? 'txt-' + kind : '' });
      appendChild(dd, v === undefined || v === null ? '—' : v);
      dl.appendChild(dd);
    });
    return dl;
  };

  /**
   * Table in a .scroll-x wrapper. cols: [{key, label, align?:'r', render?(row)→el|string, cls?}]; rows: objects.
   * opts: {rowClass(row)→string, onRow(row), caption, compact}
   */
  C.table = function (cols, rows, opts) {
    opts = opts || {};
    var t = C.el('table', { class: 'tbl' + (opts.compact ? ' tbl-compact' : '') });
    if (opts.caption) t.appendChild(C.el('caption', { class: 'sr-only', text: opts.caption }));
    var tr = C.el('tr');
    cols.forEach(function (c) { tr.appendChild(C.el('th', { text: c.label, class: (c.align === 'r' ? 'r ' : '') + (c.cls || ''), scope: 'col' })); });
    t.appendChild(C.el('thead', null, tr));
    var tb = C.el('tbody');
    (rows || []).forEach(function (row) {
      var r = C.el('tr', { class: opts.rowClass ? opts.rowClass(row) : '', tabindex: opts.onRow ? 0 : null, onClick: opts.onRow ? function () { opts.onRow(row); } : null });
      if (opts.onRow) r.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onRow(row); } });
      cols.forEach(function (c) {
        var td = C.el('td', { class: (c.align === 'r' ? 'r num ' : '') + (c.cls || '') });
        var v = c.render ? c.render(row) : row[c.key];
        appendChild(td, v === undefined || v === null ? '—' : v);
        r.appendChild(td);
      });
      tb.appendChild(r);
    });
    if (!rows || !rows.length) tb.appendChild(C.el('tr', null, C.el('td', { colspan: cols.length, class: 'list-empty', text: opts.empty || 'No rows.' })));
    t.appendChild(tb);
    return C.el('div', { class: 'scroll-x' }, t);
  };

  // ─────────────────────────── modal ───────────────────────────

  var modals = [];
  var FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function modalRoot() {
    var r = doc.getElementById('modal-root');
    if (!r) { r = C.el('div', { id: 'modal-root' }); doc.body.appendChild(r); }
    return r;
  }

  C.modalOpen = function () { return modals.length > 0; };
  C.closeAllModals = function () { while (modals.length) modals[modals.length - 1].close(); };

  /**
   * Modal dialog with a focus trap. buttons: [{label, kind, onClick(close), close?:false, icon}] — a button closes the
   * modal after onClick unless `close === false`. closable (default true) adds the ✕ and Escape/backdrop closing.
   * @returns {{el:HTMLElement, close:function, body:HTMLElement}}
   */
  C.modal = function (o) {
    o = o || {};
    var previous = doc.activeElement;
    var backdrop = C.el('div', { class: 'modal-backdrop' + (o.kind ? ' modal-' + o.kind : '') });
    var box = C.el('div', { class: 'modal' + (o.wide ? ' modal-wide' : '') + (o.class ? ' ' + o.class : ''), role: 'dialog', 'aria-modal': 'true' });
    var closed = false;
    var handle = { el: backdrop, box: box };
    function close() {
      if (closed) return;
      closed = true;
      var i = modals.indexOf(handle);
      if (i >= 0) modals.splice(i, 1);
      doc.removeEventListener('keydown', onKey, true);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (typeof o.onClose === 'function') { try { o.onClose(); } catch (e) { /* ignore */ } }
      if (previous && typeof previous.focus === 'function' && doc.body.contains(previous)) { try { previous.focus(); } catch (e) { /* ignore */ } }
    }
    handle.close = close;
    var closable = o.closable !== false;
    var titleId = 'modal-title-' + Math.floor(Math.random() * 1e9);
    if (o.title) {
      var head = C.el('div', { class: 'modal-head' }, C.el('h2', { class: 'modal-title', id: titleId }, o.title));
      box.setAttribute('aria-labelledby', titleId);
      if (closable) head.appendChild(C.button({ kind: 'ghost', small: true, icon: 'x', ariaLabel: 'Close', class: 'modal-x', onClick: close }));
      box.appendChild(head);
    }
    var body = C.el('div', { class: 'modal-body' }, o.body);
    box.appendChild(body);
    handle.body = body;
    if (o.buttons && o.buttons.length) {
      var row = C.el('div', { class: 'modal-buttons' });
      o.buttons.forEach(function (b) {
        row.appendChild(C.button({
          label: b.label, kind: b.kind, icon: b.icon, disabled: b.disabled, small: b.small,
          onClick: function () {
            var keep = false;
            if (typeof b.onClick === 'function') keep = b.onClick(close) === false;
            if (b.close !== false && !keep) close();
          }
        }));
      });
      box.appendChild(row);
    }
    backdrop.appendChild(box);
    if (closable) backdrop.addEventListener('click', function (ev) { if (ev.target === backdrop) close(); });
    function onKey(ev) {
      if (modals[modals.length - 1] !== handle) return;
      if (ev.key === 'Escape' && closable) { ev.preventDefault(); ev.stopPropagation(); close(); return; }
      if (ev.key === 'Tab') {
        var f = box.querySelectorAll(FOCUSABLE);
        if (!f.length) { ev.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && (doc.activeElement === first || !box.contains(doc.activeElement))) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && doc.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
      ev.stopPropagation();   // keys inside a modal never reach the screen's onKey
    }
    doc.addEventListener('keydown', onKey, true);
    modals.push(handle);
    modalRoot().appendChild(backdrop);
    var focusables = box.querySelectorAll(FOCUSABLE);
    var target = o.focus ? box.querySelector(o.focus) : null;
    if (!target) { target = focusables.length ? focusables[o.title && closable && focusables.length > 1 ? 1 : 0] : box; }
    if (target === box) box.setAttribute('tabindex', '-1');
    try { target.focus(); } catch (e) { /* ignore */ }
    return handle;
  };

  /** Confirm dialog; returns the modal handle with onOk / onCancel registration. */
  C.confirm = function (o) {
    o = o || {};
    var okFn = o.onOk, cancelFn = o.onCancel;
    var h = C.modal({
      title: o.title || 'Are you sure?', kind: o.kind, closable: true,
      body: typeof o.text === 'string' ? C.el('p', { text: o.text }) : o.text,
      buttons: [
        { label: o.cancelLabel || 'CANCEL', kind: 'ghost', onClick: function () { if (cancelFn) cancelFn(); } },
        { label: o.okLabel || 'OK', kind: o.kind === 'danger' ? 'danger' : 'primary', onClick: function () { if (okFn) okFn(); } }
      ],
      onClose: o.onClose
    });
    h.onOk = function (fn) { okFn = fn; return h; };
    h.onCancel = function (fn) { cancelFn = fn; return h; };
    return h;
  };

  // ─────────────────────────── toast / announce ───────────────────────────

  function toastHost() {
    var h = doc.getElementById('toast-host');
    if (!h) { h = C.el('div', { id: 'toast-host', class: 'toast-host', 'aria-live': 'polite' }); doc.body.appendChild(h); }
    return h;
  }

  /** kind: '' | 'good' | 'bad' | 'gold' | 'info'; ms default 2600. Returns the element (with .dismiss()). */
  C.toast = function (text, kind, ms) {
    var t = C.el('div', { class: 'toast' + (kind ? ' toast-' + kind : ''), role: 'status' }, C.el('span', { text: String(text) }));
    var host = toastHost();
    host.appendChild(t);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    var timer = root.setTimeout(dismiss, ms || 2600);
    function dismiss() {
      root.clearTimeout(timer);
      t.classList.add('toast-out');
      root.setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }
    t.dismiss = dismiss;
    t.addEventListener('click', dismiss);
    return t;
  };

  var lastAnnounce = 0;
  /** Write to the aria-live region (#live). Alternates a zero-width suffix so repeated texts are re-announced. */
  C.announce = function (text) {
    var live = doc.getElementById('live');
    if (!live) return;
    lastAnnounce = 1 - lastAnnounce;
    live.textContent = String(text) + (lastAnnounce ? '​' : '');
  };

  // ─────────────────────────── crest ───────────────────────────

  function hash(str) {
    return RTG.Util && RTG.Util.fnv1a32 ? RTG.Util.fnv1a32(String(str)) : String(str).length;
  }

  var SHAPES = {
    shield: ['XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...'],
    pennant: ['XXXXXXXX', 'XXXXXXX.', 'XXXXXX..', 'XXXXX...', 'XXXXXX..', 'XXXXXXX.', 'XXXXXXXX', '........'],
    badge: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..']
  };
  var MOTIFS = {
    stripe: ['........', '........', '........', 'XXXXXXXX', 'XXXXXXXX', '........', '........', '........'],
    chevron: ['........', 'X......X', 'XX....XX', '.XX..XX.', '..XXXX..', '...XX...', '........', '........'],
    dot: ['........', '........', '...XX...', '..XXXX..', '..XXXX..', '...XX...', '........', '........'],
    bars: ['........', '.X.XX.X.', '.X.XX.X.', '.X.XX.X.', '.X.XX.X.', '.X.XX.X.', '........', '........'],
    cross: ['........', '...XX...', '...XX...', '.XXXXXX.', '.XXXXXX.', '...XX...', '...XX...', '........']
  };
  var SHAPE_KEYS = Object.keys(SHAPES), MOTIF_KEYS = Object.keys(MOTIFS);

  function rects(svg, rows, fill, mask) {
    for (var y = 0; y < rows.length; y++) {
      var x = 0, w = rows[y].length;
      while (x < w) {
        var on = rows[y].charAt(x) === 'X' && (!mask || mask[y].charAt(x) === 'X');
        if (!on) { x++; continue; }
        var run = 1;
        while (x + run < w && rows[y].charAt(x + run) === 'X' && (!mask || mask[y].charAt(x + run) === 'X')) run++;
        var r = doc.createElementNS(SVG_NS, 'rect');
        r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', String(run)); r.setAttribute('height', '1'); r.setAttribute('fill', fill);
        svg.appendChild(r);
        x += run;
      }
    }
  }

  /**
   * Procedural pixel crest: shape (shield / pennant / badge) and motif chosen by a hash of the team id, painted
   * in the team's two colours. Accepts a team object or id (looked up in store.state, then the static data).
   * @param {Object|string} teamOrId @param {number} [size] css px (default 32)
   */
  C.crest = function (teamOrId, size) {
    size = size || 32;
    var P = RTG.UI.Palette;
    var team = P && P.findTeam ? P.findTeam(teamOrId) : (typeof teamOrId === 'object' ? teamOrId : null);
    var id = team ? (team.id || team.abbr || '') : String(teamOrId || '');
    var tint = P ? P.teamTint(team || teamOrId) : ['#f6c445', '#f4e9d0'];
    var h = hash(id || 'none');
    var shape = SHAPES[SHAPE_KEYS[h % SHAPE_KEYS.length]];
    var motif = MOTIFS[MOTIF_KEYS[(h >>> 3) % MOTIF_KEYS.length]];
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
    svg.setAttribute('class', 'crest');
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', team ? ((team.name || (team.city + ' ' + team.nick)) + ' crest') : 'crest');
    rects(svg, shape, tint[0]);
    rects(svg, motif, tint[1], shape);
    if (!team) {
      var q = doc.createElementNS(SVG_NS, 'rect');
      q.setAttribute('x', '3'); q.setAttribute('y', '3'); q.setAttribute('width', '2'); q.setAttribute('height', '2'); q.setAttribute('fill', '#1b1f3a');
      svg.appendChild(q);
    }
    return svg;
  };

  /** Tiny pixel avatar from player.look {skin, hair, boot} (pure DOM boxes). */
  var SKINS = ['#f1c9a5', '#d9a066', '#a3683a', '#5c3a21'];
  var HAIRS = ['#2b1d12', '#6b4a2b', '#d8b45a', '#b53a2a', '#8a8f9e', '#111111'];
  var BOOTS = ['#111111', '#f2f2e6', '#d8433a', '#f6c445'];
  C.LOOK = { skins: SKINS, hairs: HAIRS, boots: BOOTS };
  C.pixelAvatar = function (look, size) {
    look = look || { skin: 0, hair: 0, boot: 0 };
    size = size || 48;
    var px = size / 8;
    var rows = [
      'HHHHHH..', 'HSSSSH..', 'HSESES..', '.SSSS...', '.SSSS...', 'JJJJJJ..', 'JJJJJJ..', 'BB..BB..'
    ];
    var colours = { H: HAIRS[(look.hair | 0) % HAIRS.length], S: SKINS[(look.skin | 0) % SKINS.length], E: '#101226', J: 'var(--team-1, #f6c445)', B: BOOTS[(look.boot | 0) % BOOTS.length] };
    var wrap = C.el('div', { class: 'avatar', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
    for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
      var ch = rows[y].charAt(x);
      if (ch === '.') continue;
      wrap.appendChild(C.el('i', { style: { left: (x * px) + 'px', top: (y * px) + 'px', width: px + 'px', height: px + 'px', background: colours[ch] } }));
    }
    return wrap;
  };

  // ─────────────────────────── sparkline ───────────────────────────

  /** Draw values as a pixel polyline on a canvas (gold, with a grey baseline). opts: {min, max, color, dots} */
  C.sparkline = function (canvas, values, opts) {
    opts = opts || {};
    if (!canvas || !canvas.getContext) return canvas;
    var P = RTG.UI.Palette;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    var vals = (values || []).filter(function (v) { return typeof v === 'number' && v === v; });
    if (!vals.length) return canvas;
    var lo = opts.min !== undefined ? opts.min : Math.min.apply(null, vals);
    var hi = opts.max !== undefined ? opts.max : Math.max.apply(null, vals);
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    ctx.fillStyle = P ? P.get('grey') : '#8a8f9e';
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillStyle = opts.color || (P ? P.get('gold') : '#f6c445');
    var n = vals.length, step = n > 1 ? (w - 2) / (n - 1) : 0;
    var px = -1, py = -1;
    for (var i = 0; i < n; i++) {
      var x = Math.round(1 + i * step), y = Math.round(1 + (h - 4) * (1 - (vals[i] - lo) / (hi - lo)));
      if (px >= 0) {
        var dx = x - px, dy = y - py, steps = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
        for (var s = 0; s <= steps; s++) ctx.fillRect(Math.round(px + dx * s / steps), Math.round(py + dy * s / steps), 2, 2);
      } else ctx.fillRect(x, y, 2, 2);
      px = x; py = y;
    }
    return canvas;
  };

  // ─────────────────────────── tooltip ───────────────────────────

  var tipEl = null, tipTimer = null, tipCount = 0;
  function showTip(anchor, text) {
    if (RTG.UI.store && RTG.UI.store.settings && RTG.UI.store.settings.tooltips === false) return;
    if (!tipEl) { tipEl = C.el('div', { class: 'tooltip', role: 'tooltip' }); doc.body.appendChild(tipEl); }
    tipEl.textContent = text;
    tipEl.classList.add('show');
    var r = anchor.getBoundingClientRect();
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var left = Math.max(4, Math.min(root.innerWidth - tw - 4, r.left + r.width / 2 - tw / 2));
    var top = r.top - th - 6;
    if (top < 4) top = r.bottom + 6;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('show'); if (tipTimer) { root.clearTimeout(tipTimer); tipTimer = null; } }

  /** Hover / focus (desktop) and 400 ms long-press (touch) tooltip; sets aria-describedby on the element. */
  C.tooltip = function (el, text) {
    if (!el) return el;
    var id = 'tip-' + (++tipCount);
    var desc = C.el('span', { id: id, class: 'sr-only', text: text });
    el.appendChild(desc);
    el.setAttribute('aria-describedby', id);
    el.classList.add('has-tip');
    el.addEventListener('mouseenter', function () { showTip(el, text); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', function () { showTip(el, text); });
    el.addEventListener('blur', hideTip);
    el.addEventListener('touchstart', function () { tipTimer = root.setTimeout(function () { showTip(el, text); }, 400); }, { passive: true });
    el.addEventListener('touchend', hideTip);
    el.addEventListener('touchcancel', hideTip);
    return el;
  };
  C.hideTooltip = hideTip;

  // ─────────────────────────── formatting ───────────────────────────

  function U() { return RTG.Util || {}; }
  C.fmt = {
    money: function (m) { return U().fmtMoney ? U().fmtMoney(m) : '$' + m + 'M'; },
    pct: function (x, d) { return U().fmtPct ? U().fmtPct(x, d === undefined ? 1 : d) : (x * 100).toFixed(1) + '%'; },
    clock: function (s) { return U().fmtClock ? U().fmtClock(s) : String(s); },
    ordinal: function (n) { return U().ordinal ? U().ordinal(n) : String(n); },
    pad: function (n, w, ch) { return U().pad ? U().pad(n, w, ch) : String(n); },
    int: function (n) { return typeof n === 'number' && n === n ? String(Math.round(n)) : '—'; },
    signed: function (n) { return n > 0 ? '+' + n : String(n); },
    /** 'Sep 6, 14:02' from ms. */
    date: function (ms) {
      if (!ms) return '—';
      var d = new Date(ms);
      var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return M[d.getMonth()] + ' ' + d.getDate() + ', ' + C.fmt.pad(d.getHours(), 2) + ':' + C.fmt.pad(d.getMinutes(), 2);
    },
    /** '3 min ago' style. */
    ago: function (ms) {
      if (!ms) return '—';
      var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.round(s / 60) + ' min ago';
      if (s < 86400) return Math.round(s / 3600) + ' h ago';
      return Math.round(s / 86400) + ' d ago';
    },
    /** 'Y3 · WK 5' / 'Y3 · PRE' */
    week: function (state) {
      if (!state) return '';
      var ph = state.phase;
      if (ph === 'REG' || ph === 'POST') return 'Y' + state.year + ' · WK ' + state.week;
      return 'Y' + state.year + ' · ' + ph;
    },
    /** Calendar year for a career year. */
    calYear: function (year) { return RTG.Schema && RTG.Schema.calendarYear ? RTG.Schema.calendarYear(year) : 2025 + year; },
    stage: function (state) {
      if (!state) return '';
      var S = { HS: 'High School', COLLEGE: 'College', DRAFT: 'Draft', NFL: 'Pro', RETIRED: 'Retired' };
      return (S[state.stage] || state.stage) + ' · ' + state.phase;
    },
    kickType: function (ctx) { return ctx ? (ctx.type === 'PAT' ? 'PAT' : ctx.type === 'KO' ? 'KICKOFF' : (ctx.distance + ' YD FG')) : ''; },
    hash: function (h) { return h === -1 ? 'L HASH' : h === 1 ? 'R HASH' : 'MIDDLE'; }
  };

  /** Team display helpers (read-only lookups). */
  C.team = function (teamOrId) { return RTG.UI.Palette && RTG.UI.Palette.findTeam ? RTG.UI.Palette.findTeam(teamOrId) : null; };
  C.teamName = function (teamOrId) { var t = C.team(teamOrId); return t ? (t.name || (t.city + ' ' + t.nick)) : String(teamOrId || '—'); };
  C.teamAbbr = function (teamOrId) { var t = C.team(teamOrId); return t ? (t.abbr || t.id) : String(teamOrId || '—'); };

  /** A titled screen wrapper: <div class="screen"><header class="screen-head"><h1>…</h1>…</header>…children</div> */
  C.screen = function (o) {
    o = o || {};
    var el = C.el('div', { class: 'screen' + (o.class ? ' ' + o.class : '') });
    if (o.title) {
      var head = C.el('header', { class: 'screen-head' });
      if (o.back) head.appendChild(C.button({ kind: 'ghost', small: true, icon: 'arrow-l', ariaLabel: 'Back', class: 'back-btn', onClick: typeof o.back === 'function' ? o.back : function () { RTG.UI.Router.back(); } }));
      head.appendChild(C.el('h1', { class: 'screen-title', text: o.title }));
      if (o.right) head.appendChild(C.el('div', { class: 'screen-head-right' }, o.right));
      el.appendChild(head);
    }
    for (var i = 0; i < (o.children || []).length; i++) appendChild(el, o.children[i]);
    return el;
  };

  RTG.UI.C = C;
})(typeof window !== 'undefined' ? window : globalThis);
