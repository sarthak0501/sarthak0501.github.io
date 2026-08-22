/* The Hiring Brief · ed.3 — all client JS. Five jobs, nothing else:
   mobile nav, reveal-on-scroll, copy-summary, lane filter,
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

  // ---- lane filter (progressive: no JS = everything shown) ----
  // ?lane=ai deep-links a cold outreach message straight to the right frame.
  var laneUI = document.querySelector('[data-lanes-ui]');
  if (laneUI) {
    var laneBtns = Array.prototype.slice.call(laneUI.querySelectorAll('[data-lane]'));
    var blurb = document.getElementById('laneBlurb');
    var empty = document.getElementById('laneEmpty');
    var targets = document.querySelectorAll('[data-lanes]');

    var apply = function (lane, push) {
      var shown = 0;
      targets.forEach(function (el) {
        var hit = lane === 'all' || (' ' + el.getAttribute('data-lanes') + ' ').indexOf(' ' + lane + ' ') > -1;
        el.classList.toggle('lane-hidden', !hit);
        if (hit && el.classList.contains('exhibit')) shown++;
      });
      laneBtns.forEach(function (b) {
        var on = b.getAttribute('data-lane') === lane;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on && blurb) blurb.textContent = '// ' + (b.getAttribute('data-blurb') || '');
      });
      if (empty) empty.hidden = shown !== 0;
      if (push && window.history && history.replaceState) {
        var url = lane === 'all' ? location.pathname : location.pathname + '?lane=' + lane;
        history.replaceState(null, '', url + location.hash);
      }
    };

    laneBtns.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-lane'), true); });
    });

    var initial = (location.search.match(/[?&]lane=([a-z]+)/) || [])[1];
    if (initial && laneBtns.some(function (b) { return b.getAttribute('data-lane') === initial; })) {
      apply(initial, false);
    }
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
