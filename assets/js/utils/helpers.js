/* =====================================
 * DOM helpers
 * ===================================== */

// Crea un elemento con clases, atributos, estilos y HTML opcional
export function el(tag, { className = "", attrs = {}, style = {}, html = "" } = {}) {
  // Crea nodo base
  const node = document.createElement(tag);

  // Asigna clases si procede
  if (className) node.className = className;

  // Aplica atributos excepto style (se gestiona aparte)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") continue; // delega estilo
    node.setAttribute(k, v);
  }

  // Aplica estilos (attrs.style primero, luego style con precedencia)
  applyStyle(node, attrs?.style);
  applyStyle(node, style);

  // Inserta HTML si procede
  if (html) node.innerHTML = html;

  return node;
}

// Aplica estilos a un elemento desde string u objeto
export function applyStyle(target, st) {
  // Ignora estilos vacíos
  if (!st) return;

  // Si es string, asigna directo
  if (typeof st === "string") {
    target.setAttribute("style", st);
    return;
  }

  // Si es objeto, itera claves
  for (const [prop, val] of Object.entries(st)) {
    if (val == null) continue; // omite nulos/undefined
    // Usa setProperty para custom properties o kebab-case
    if (prop.startsWith("--") || prop.includes("-")) {
      target.style.setProperty(prop, String(val));
    } else {
      // Usa acceso camelCase
      target.style[prop] = String(val);
    }
  }
}

// Query helpers
export const qs  = (root, sel) => root.querySelector(sel); // selecciona un elemento
export const qsa = (root, sel) => Array.from(root.querySelectorAll(sel)); // selecciona múltiples

/* =====================================
 * Visibility module (singleton sin estado)
 * ===================================== */
export const visibility = (() => {
  // Asegura conocer la clase de display visible original; si no existe, usa fallback
  function ensureDisplayClass(el, fallback = "d-block") {
    // Detecta utilidades Bootstrap-like de display
    const displayUtil = Array.from(el.classList).find((c) =>
      /^d-(block|inline|inline-block|flex|inline-flex|grid|inline-grid)$/.test(c)
    );
    el.dataset.displayClass = el.dataset.displayClass || displayUtil || fallback;
    return el.dataset.displayClass;
  }

  // Oculta el elemento
  function hide(el) {
    if (!el) return;
    ensureDisplayClass(el);
    el.classList.add("d-none");
  }

  // Muestra el elemento
  function show(el, displayFallback = "d-block") {
    if (!el) return;
    const display = ensureDisplayClass(el, displayFallback);
    el.classList.remove("d-none");
    if (!el.classList.contains(display)) el.classList.add(display);
    el.setAttribute("aria-hidden", "false");
  }

  // Control determinista
  function setVisible(el, visible, displayFallback = "d-block") {
    if (visible) show(el, displayFallback);
    else hide(el);
  }

  // Alterna visibilidad
  function toggleVisible(el, displayFallback = "d-block") {
    setVisible(el, el.classList.contains("d-none"), displayFallback);
  }

  // Expone API pública del módulo
  return { hide, show, setVisible, toggleVisible };
})();

/* =====================================
 * Visual flash helper
 * ===================================== */
export function flashBackground(el, color = "#f5d9ab", holdMs = 800, backMs = 250) {
  // Valida elemento
  if (!el || !(el instanceof HTMLElement)) return;

  // Limpia timers previos
  if (el.__flashTimerHold) clearTimeout(el.__flashTimerHold);
  if (el.__flashTimerBack) clearTimeout(el.__flashTimerBack);
  if (el.__flashPrevBg !== undefined) {
    el.style.backgroundColor = el.__flashPrevBg || "";
  }

  // Guarda estado actual
  el.__flashPrevBg = el.style.backgroundColor || "";
  void el.offsetWidth; // fuerza repaint
  el.style.backgroundColor = color;

  el.__flashTimerHold = setTimeout(() => {
    void el.offsetWidth;
    el.style.backgroundColor = el.__flashPrevBg || "";
    el.__flashTimerBack = setTimeout(() => {
      delete el.__flashTimerHold;
      delete el.__flashTimerBack;
      delete el.__flashPrevBg;
    }, backMs);
  }, holdMs);
}
