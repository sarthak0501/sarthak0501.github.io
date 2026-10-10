/* Enhance the same assistant with a native dialog; no-JS content stays inline. */
(() => {
  'use strict';
  const assistant = document.getElementById('assistant');
  const dialog = document.getElementById('assistant-dialog');
  const launcher = document.getElementById('assistant-launcher');
  const invite = document.querySelector('.hero-assistant-invite');
  const closeButton = document.getElementById('assistant-close');
  if (!assistant || !dialog || !launcher || !invite || !closeButton
    || typeof dialog.showModal !== 'function') return;

  // Move, rather than clone, so one controller retains the draft and history.
  dialog.append(assistant);
  invite.hidden = false;
  let returnFocus = launcher;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!motion.matches) launcher.classList.add('is-inviting');
  const stopPulse = () => launcher.classList.remove('is-inviting');
  launcher.addEventListener('animationend', stopPulse, { once: true });
  motion.addEventListener('change', stopPulse);

  function open(trigger) {
    if (dialog.open) return;
    returnFocus = trigger;
    stopPulse();
    dialog.showModal();
    document.body.classList.add('assistant-panel-open');
    launcher.setAttribute('aria-expanded', 'true');
    // Keep the mobile keyboard closed until the visitor chooses to type.
    closeButton.focus({ preventScroll: true });
    assistant.dispatchEvent(new Event('assistant:open'));
  }
  launcher.addEventListener('click', () => open(launcher));
  document.querySelectorAll('a[href="#assistant"]').forEach(link => {
    link.addEventListener('click', event => { event.preventDefault(); open(link); });
  });
  function openFromHash() {
    if (location.hash === '#assistant') open(launcher);
  }
  window.addEventListener('hashchange', openFromHash);
  // Let the browser finish its initial fragment navigation before setting focus.
  if (document.readyState === 'complete') openFromHash();
  else window.addEventListener('load', openFromHash, { once: true });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('assistant-panel-open');
    launcher.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  // A fallback Contact link must reveal its destination outside the modal.
  dialog.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname
      && url.hash && !assistant.contains(document.getElementById(url.hash.slice(1)))) {
      dialog.close();
    }
  });
})();
