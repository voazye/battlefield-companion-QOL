(function () {
  'use strict';

  const LOG_PREFIX = '[Emblem Rotate Fix]';

  function patchObject(obj) {
    if (!obj || obj.__rotateFixApplied) return;
    obj.hasRotatingPoint = true;
    obj.lockRotation = false;
    obj.__rotateFixApplied = true;
  }

  // Rotation rastet auf Vielfache dieses Werts ein (z.B. 45 => 0°, 45°, 90°, 135° ...)
  const SNAP_ANGLE = 45;
  // Toleranzbereich in Grad, innerhalb dessen die Rotation einrastet
  const SNAP_THRESHOLD = 6;

  // Fabric 1.5.0 unterstützt canvas.snapAngle/snapThreshold noch NICHT
  // (das Feature kam erst mit 1.6.7). Wir implementieren das Snapping daher
  // selbst, indem wir während des Rotierens den Winkel live runden.
  function snapAngleValue(angle) {
    const nearest = Math.round(angle / SNAP_ANGLE) * SNAP_ANGLE;
    const diff = Math.abs(angle - nearest);
    if (diff <= SNAP_THRESHOLD || diff >= 360 - SNAP_THRESHOLD) {
      return ((nearest % 360) + 360) % 360;
    }
    return angle;
  }

  function attachSnapping(canvasInstance) {
    canvasInstance.on('object:rotating', function (e) {
      const obj = e.target;
      if (!obj) return;

      // Shift gedrückt? Dann Snapping für diese Drehung überspringen.
      const originalEvent = e.e || {};
      if (originalEvent.shiftKey) return;

      const snapped = snapAngleValue(obj.angle);
      if (snapped !== obj.angle) {
        obj.angle = snapped;
        obj.setCoords();
        canvasInstance.renderAll();
      }
    });
  }

  // --- Winkel-Anzeige/-Eingabe-Box ---

  function createAngleBox() {
    const box = document.createElement('div');
    box.id = 'emblem-rotate-fix-anglebox';
    box.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'z-index:99999',
      'background:rgba(0,0,0,0.75)',
      'color:#fff',
      'font-family:sans-serif',
      'font-size:12px',
      'padding:4px 6px',
      'border-radius:4px',
      'display:none',
      'align-items:center',
      'gap:4px',
      'pointer-events:auto',
      'user-select:none'
    ].join(';');

    const label = document.createElement('span');
    label.textContent = '∠';
    label.style.opacity = '0.7';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '359';
    input.step = '1';
    input.style.cssText = [
      'width:48px',
      'background:rgba(255,255,255,0.1)',
      'color:#fff',
      'border:1px solid rgba(255,255,255,0.3)',
      'border-radius:3px',
      'font-size:12px',
      'padding:2px 4px',
      'outline:none'
    ].join(';');

    const deg = document.createElement('span');
    deg.textContent = '°';
    deg.style.opacity = '0.7';

    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(deg);

    return { box, input };
  }

  function clampAngle(value) {
    let n = Math.round(Number(value));
    if (Number.isNaN(n)) return 0;
    n = n % 360;
    if (n < 0) n += 360;
    return n;
  }

  function attachAngleBox(canvasInstance) {
    const container = canvasInstance.wrapperEl || canvasInstance.lowerCanvasEl.parentNode;
    if (!container) return;

    // Falls der Container nicht selbst positioniert ist, als Bezugsrahmen herstellen
    const computedPosition = window.getComputedStyle(container).position;
    if (computedPosition === 'static') {
      container.style.position = 'relative';
    }

    const { box, input } = createAngleBox();
    container.appendChild(box);

    let currentTarget = null;
    let suppressInputEvent = false;

    function showFor(obj) {
      currentTarget = obj;
      box.style.display = 'flex';
      suppressInputEvent = true;
      input.value = clampAngle(obj.angle);
      suppressInputEvent = false;
    }

    function hideBox() {
      currentTarget = null;
      box.style.display = 'none';
    }

    canvasInstance.on('object:selected', function (e) {
      if (e && e.target) showFor(e.target);
    });

    canvasInstance.on('selection:cleared', hideBox);

    canvasInstance.on('object:rotating', function (e) {
      if (e && e.target && e.target === currentTarget) {
        suppressInputEvent = true;
        input.value = clampAngle(e.target.angle);
        suppressInputEvent = false;
      }
    });

    // Falls die Form per Maus bewegt/skaliert wird, bleibt der Winkel sichtbar synchron
    canvasInstance.on('object:modified', function (e) {
      if (e && e.target && e.target === currentTarget) {
        suppressInputEvent = true;
        input.value = clampAngle(e.target.angle);
        suppressInputEvent = false;
      }
    });

    function applyInputValue() {
      if (suppressInputEvent || !currentTarget) return;
      const newAngle = clampAngle(input.value);
      currentTarget.angle = newAngle;
      currentTarget.setCoords();
      canvasInstance.renderAll();
      canvasInstance.fire('object:modified', { target: currentTarget });
    }

    input.addEventListener('change', applyInputValue);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        applyInputValue();
        input.blur();
      }
      // Verhindert, dass Tastendrücke im Eingabefeld an den Emblem-Editor durchgereicht
      // werden (z.B. Entf-Taste löscht sonst evtl. die Form im Hintergrund).
      e.stopPropagation();
    });

    // Falls beim Laden bereits ein Objekt ausgewählt ist
    const active = canvasInstance.getActiveObject && canvasInstance.getActiveObject();
    if (active) showFor(active);
  }

  function patchCanvas(canvasInstance) {
    if (!canvasInstance || canvasInstance.__rotateFixHooked) return;
    canvasInstance.__rotateFixHooked = true;

    attachSnapping(canvasInstance);
    attachAngleBox(canvasInstance);

    // Alle aktuell vorhandenen Objekte patchen
    (canvasInstance._objects || []).forEach(patchObject);
    canvasInstance.renderAll();

    // Künftig hinzugefügte Objekte (z.B. neue Formen) automatisch mit-patchen
    canvasInstance.on('object:added', function (e) {
      if (e && e.target) {
        patchObject(e.target);
        canvasInstance.renderAll();
      }
    });

    console.log(LOG_PREFIX, 'Canvas erkannt, Rotation aktiviert, Snap auf', SNAP_ANGLE + '°.', canvasInstance);
    window.dispatchEvent(new CustomEvent('emblem-rotate-fix:active'));
  }

  function installHook() {
    if (typeof window.fabric === 'undefined' || !window.fabric.Canvas) {
      // fabric ist noch nicht geladen, später erneut versuchen
      return false;
    }
    if (window.fabric.Canvas.__rotateFixPatched) {
      return true; // Hook schon installiert
    }

    const OriginalCanvas = window.fabric.Canvas;

    function PatchedCanvas(...args) {
      const instance = new OriginalCanvas(...args);
      patchCanvas(instance);
      return instance;
    }
    PatchedCanvas.prototype = OriginalCanvas.prototype;
    PatchedCanvas.prototype.constructor = PatchedCanvas;
    PatchedCanvas.__rotateFixPatched = true;

    // Statische Properties/Methoden von fabric.Canvas übernehmen, falls vorhanden
    Object.keys(OriginalCanvas).forEach(function (key) {
      PatchedCanvas[key] = OriginalCanvas[key];
    });

    window.fabric.Canvas = PatchedCanvas;
    console.log(LOG_PREFIX, 'Hook auf fabric.Canvas installiert.');
    return true;
  }

  // fabric lädt asynchron als Teil des App-Bundles, daher kurz pollen
  let attempts = 0;
  const maxAttempts = 100; // ~20 Sekunden bei 200ms Intervall
  const interval = setInterval(function () {
    attempts++;
    if (installHook() || attempts >= maxAttempts) {
      clearInterval(interval);
      if (attempts >= maxAttempts) {
        console.warn(LOG_PREFIX, 'fabric.js wurde nicht innerhalb der Wartezeit gefunden.');
      }
    }
  }, 200);
})();
