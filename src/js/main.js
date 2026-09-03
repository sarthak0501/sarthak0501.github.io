/* Fourth edition — three jobs, nothing else:
   the mobile menu's close/escape behaviour, the copy button in Contact,
   and the run-trace step-through on the incident write-up. Everything
   works without this file; it only adds convenience. */
(function () {
  'use strict';

  // ---- mobile menu: <details> works without JS; JS closes it politely ----
  var menu = document.getElementById('navMenu');
  if (menu) {
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.removeAttribute('open'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('open')) {
        menu.removeAttribute('open');
        menu.querySelector('summary').focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (menu.hasAttribute('open') && !menu.contains(e.target)) menu.removeAttribute('open');
    });
  }

  // ---- copy the plain-text summary ----
  var src = document.getElementById('ats-summary');
  var copy = document.querySelector('.copy-btn');
  if (src && copy) {
    var orig = copy.textContent;
    copy.addEventListener('click', function () {
      var text = src.textContent.trim();
      var done = function (ok) {
        copy.textContent = ok ? 'Copied' : 'Copy failed — select the text instead';
        setTimeout(function () { copy.textContent = orig; }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        done(false);
      }
    });
  }

  // ---- run-trace step-through (progressive: <details> works without JS) ----
  var trace = document.getElementById('traceViewer');
  if (trace) {
    var steps = Array.prototype.slice.call(trace.querySelectorAll('.trace-step'));
    var idx = -1;
    var go = function (i) {
      idx = (i + steps.length) % steps.length;
      steps.forEach(function (s, j) {
        s.open = j === idx;
        s.classList.toggle('current', j === idx);
      });
      steps[idx].querySelector('summary').focus({ preventScroll: true });
    };
    var expandAll = function () {
      idx = -1;
      steps.forEach(function (s) { s.open = true; s.classList.remove('current'); });
    };
    trace.classList.add('js');
    trace.querySelectorAll('[data-trace]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var op = btn.getAttribute('data-trace');
        if (op === 'next') go(idx + 1);
        else if (op === 'prev') go(idx <= 0 ? -1 : idx - 1);
        else expandAll();
      });
    });
    // arrow keys only while focus is inside the trace, never page-wide
    trace.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(idx <= 0 ? -1 : idx - 1); }
    });
    steps.forEach(function (s, j) {
      s.addEventListener('toggle', function () {
        if (s.open && idx !== j) {
          idx = j;
          steps.forEach(function (o, k) { o.classList.toggle('current', k === j); });
        }
      });
    });
    expandAll();
  }
})();
