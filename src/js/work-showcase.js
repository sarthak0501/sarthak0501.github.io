/* The complete public case summaries are readable before this enhancement. */
(() => {
  'use strict';
  document.querySelectorAll('[data-work-showcase]').forEach((showcase) => {
    const tablist = showcase.querySelector('[data-work-tabs]');
    const tabs = [...showcase.querySelectorAll('[data-work-tab]')];
    const panels = [...showcase.querySelectorAll('[data-work-panel]')];
    if (!tablist || !tabs.length || tabs.length !== panels.length
      || tabs.some((tab) => !panels.some((panel) => panel.dataset.workPanel === tab.dataset.workTab))) return;

    function select(index, focus = false) {
      tabs.forEach((tab, tabIndex) => {
        const selected = index === tabIndex;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        const panel = panels.find((item) => item.dataset.workPanel === tab.dataset.workTab);
        panel.hidden = !selected;
      });
      if (focus) tabs[index].focus();
    }

    tablist.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      const panel = panels.find((item) => item.dataset.workPanel === tab.dataset.workTab);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        select(index);
      });
      tab.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else if (event.key === ' ') next = index;
        else return;
        event.preventDefault();
        select(next, true);
      });
    });
    select(0);
    showcase.dataset.workEnhanced = 'true';
  });
})();
