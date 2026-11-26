(() => {
  'use strict';
  const root = new URL('./', document.currentScript.src);
  const modes = {old: root, new: new URL('v2/', root)};
  const current = location.pathname.startsWith(modes.new.pathname) ? 'new' : 'old';
  const requested = new URLSearchParams(location.search).get('ui');
  const explicit = requested === current;
  let saved;
  try {
    if (explicit) localStorage.setItem('starosta-ui-mode', current);
    saved = localStorage.getItem('starosta-ui-mode');
  } catch (_) {}
  if (explicit && typeof history !== 'undefined') {
    const url = new URL(location.href);
    url.searchParams.delete('ui');
    history.replaceState(history.state, '', url.href);
  }
  if (!explicit && Object.hasOwn(modes, saved) && saved !== current) {
    location.replace(modes[saved].href);
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-ui-mode]');
    const mode = link?.dataset.uiMode;
    if (!Object.hasOwn(modes, mode)) return;
    try { localStorage.setItem('starosta-ui-mode', mode); } catch (_) {}
  });
})();
