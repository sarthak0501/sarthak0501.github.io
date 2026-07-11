/* The Hiring Brief · ed.2 — all client JS. Five jobs, nothing else:
   mobile nav, reader-lane tabs, reveal-on-scroll, copy-summary,
   run-trace step-through (case/incident-agent). */
(function () {
  'use strict';

  // ---- mobile nav toggle ----
  var nav = document.getElementById('topnav');
  var toggle = document.getElementById('navToggle');
  if (nav && toggle) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.querySelectorAll('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---- reader lanes: ARIA tablist (<980px), roving tabindex ----
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.lanes-tabs [role="tab"]'));
  if (tabs.length) {
    var select = function (tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowRight') to = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') to = tabs[(i + tabs.length - 1) % tabs.length];
        else if (e.key === 'Home') to = tabs[0];
        else if (e.key === 'End') to = tabs[tabs.length - 1];
        if (!to) return;
        e.preventDefault();
        select(to);
        to.focus();
      });
    });
  }

  // ---- reveal on scroll (staggered, ≤180ms, reduced-motion aware) ----
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealed = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealed.forEach(function (el) { el.classList.add('in'); });
  } else {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = Math.min(i * 40, 160) + 'ms';
        e.target.classList.add('in');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.1 });
    revealed.forEach(function (el) { obs.observe(el); });
  }

  // ---- copy candidate summary (clipboard + execCommand fallback) ----
  var src = document.getElementById('ats-summary');
  var buttons = document.querySelectorAll('.copy-btn');
  if (src && buttons.length) {
    var SUMMARY = src.textContent.trim();
    buttons.forEach(function (btn) {
      var orig = btn.textContent;
      btn.addEventListener('click', function () {
        var done = function (ok) {
          btn.classList.add('copied');
          btn.textContent = ok ? '✓ copied — paste anywhere' : '⚠ copy failed';
          setTimeout(function () { btn.classList.remove('copied'); btn.textContent = orig; }, 2200);
        };
        var fallback = function () {
          var ta = document.createElement('textarea');
          ta.value = SUMMARY;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (_) {}
          ta.remove();
          done(ok);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(SUMMARY).then(function () { done(true); }, fallback);
        } else {
          fallback();
        }
      });
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
    trace.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(idx <= 0 ? -1 : idx - 1); }
    });
    // opening a step by hand (or via noscript habits) syncs the pointer
    steps.forEach(function (s, j) {
      s.addEventListener('toggle', function () {
        if (s.open && idx !== j) {
          idx = j;
          steps.forEach(function (o, k) { o.classList.toggle('current', k === j); });
        }
      });
    });
    go(0);
  }
})();
