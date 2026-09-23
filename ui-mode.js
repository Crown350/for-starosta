(() => {
  'use strict';
  const root = new URL('./', document.currentScript.src);
  const modes = {old: root, new: new URL('v2/', root)};
  const current = location.pathname.startsWith(modes.new.pathname) ? 'new' : 'old';
  let saved;
  try { saved = localStorage.getItem('starosta-ui-mode'); } catch (_) {}
  if (Object.hasOwn(modes, saved) && saved !== current) {
    location.replace(modes[saved].href);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-ui-mode]');
    const mode = link?.dataset.uiMode;
    if (!Object.hasOwn(modes, mode)) return;
    try { localStorage.setItem('starosta-ui-mode', mode); } catch (_) {}
  });
})();
