// Dieses Script läuft im isolierten Content-Script-Kontext von Firefox.
// Es hat keinen direkten Zugriff auf `window.fabric` der Seite selbst,
// darum injizieren wir den eigentlichen Code als <script>-Tag in die Seite.

function injectPageScript() {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('page-hook.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

injectPageScript();
