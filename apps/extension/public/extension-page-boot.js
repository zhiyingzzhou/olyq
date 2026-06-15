(function () {
  var BOOTSTRAP_PREFIX = '__olyq.bootstrap__.';
  var BOOTSTRAP_SCHEMA_VERSION = 1;
  var THEME_KEY = 'olyq.theme.v1';

  function readBootstrapMirror(key) {
    try {
      var raw = localStorage.getItem(BOOTSTRAP_PREFIX + key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (parsed.schemaVersion !== BOOTSTRAP_SCHEMA_VERSION) return null;
      if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null;
      return parsed.value;
    } catch {
      return null;
    }
  }

  function resolveThemeMode() {
    var stored = readBootstrapMirror(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    try {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    } catch {
      return 'dark';
    }
  }

  document.documentElement.classList.toggle('dark', resolveThemeMode() === 'dark');
})();
