// Blocking (not deferred) and loaded before styles.css so a stored explicit
// theme choice is applied before first paint — otherwise the page would
// flash the system-default theme for a moment before main.js (deferred)
// corrects it.
(function () {
  try {
    var stored = localStorage.getItem('kj-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    // Storage blocked (private mode, disabled cookies) — fall back to the
    // prefers-color-scheme media query already in styles.css.
  }
})();
