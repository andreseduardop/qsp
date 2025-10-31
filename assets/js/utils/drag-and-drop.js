/**
 * @fileoverview Minimal, reusable drag-and-drop reorder helper (per UL).
 * Follows the Google JavaScript Style Guide.
 * Version: 1.0.8
 *
 * Changes in 1.0.8:
 * - Uses custom guide classes (app-guide-top / app-guide-bottom) that render
 *   via inset box-shadow, avoiding Bootstrap list-group border flattening.
 * - Keeps v1.0.7 behavior (single active context, geometry-based painting,
 *   container edge hot-zones).
 *
 * @see https://google.github.io/styleguide/jsguide.html
 */

/** @typedef {{
 *   itemSelector?: string,
 *   ignoreSelector?: string,
 *   beforeClass?: string,      // default: 'app-guide-top'
 *   afterClass?: string,       // default: 'app-guide-bottom'
 *   draggingClass?: string,
 *   allowGlobalEdges?: boolean,
 *   edgeRatio?: number,        // legacy (no painting effect since v1.0.5)
 *   containerEdgePx?: number,  // px for UL top/bottom hot zones (default 24)
 *   onReorder: (draggedId: string, toIndex: number) => void
 * }} AttachOptions */

/* Module-level singleton state; se mantiene igual que en tu versión previa */
let activeUL = null;
let activeAPI = null;
let globalHandlersAttached = false;

/**
 * Attaches drag-and-drop reordering behavior to a UL-like container.
 *
 * @param {HTMLElement} ul List root (<ul> or container) to bind.
 * @param {AttachOptions} opts Options.
 * @return {{ destroy(): void }} Disposer to unbind events.
 */
export function attachListReorder(ul, opts = {}) {
  // English code; comentarios en español (tercera persona)
  const {
    itemSelector = 'li.list-group-item[data-id]',
    ignoreSelector = "[data-role='new-entry']",
    beforeClass = 'app-guide-top',       // <<< NUEVO default
    afterClass = 'app-guide-bottom',     // <<< NUEVO default
    draggingClass = 'opacity-50',
    allowGlobalEdges = true,
    edgeRatio = 0.3, // eslint-disable-line no-unused-vars
    containerEdgePx = 24,
    onReorder,
  } = opts;

  if (typeof onReorder !== 'function') {
    throw new Error("attachListReorder: 'onReorder' callback is required.");
  }

  // Divide posibles clases múltiples por espacio
  const splitClasses = (s) =>
    (s ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const BEFORE_CLASSES = splitClasses(beforeClass);
  const AFTER_CLASSES = splitClasses(afterClass);

  // Utilidades para aplicar/quitar sets de clases
  const addClasses = (el, classes) => {
    // comentario: añade cada clase individualmente
    for (const c of classes) el.classList.add(c);
  };
  const removeClasses = (el, classes) => {
    // comentario: remueve cada clase individualmente
    for (const c of classes) el.classList.remove(c);
  };

  // Estado local
  let draggingId = null;

  // ===== Utilidades ligadas a esta UL =====
  const getRealItems = () =>
    Array.from(ul.querySelectorAll(itemSelector)).filter(
      (li) => !li.matches(ignoreSelector) && li.dataset.id,
    );

  const clearGuides = () => {
    // comentario: borra marcas y clases de guía solo dentro de esta UL
    ul.querySelectorAll('[data-dnd-guide]').forEach((el) => {
      const kind = el.getAttribute('data-dnd-guide');
      if (kind === 'before') removeClasses(el, BEFORE_CLASSES);
      if (kind === 'after') removeClasses(el, AFTER_CLASSES);
      el.removeAttribute('data-dnd-guide');
    });
  };

  const clearAll = () => {
    // comentario: limpia guías + estado de arrastre dentro de esta UL
    clearGuides();
    ul.querySelectorAll(`.${draggingClass}`).forEach((el) => {
      el.classList.remove(draggingClass);
    });
  };

  // Índice de inserción por midlines
  const insertionIndexFromY = (clientY) => {
    const items = getRealItems();
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  };

  // Pinta guía según índice
  const paintGuideByIndex = (index) => {
    const items = getRealItems();
    if (items.length === 0) return;

    if (index <= 0) {
      const first = items[0];
      first.setAttribute('data-dnd-guide', 'before');
      addClasses(first, BEFORE_CLASSES);
      return;
    }
    if (index >= items.length) {
      const last = items[items.length - 1];
      last.setAttribute('data-dnd-guide', 'after');
      addClasses(last, AFTER_CLASSES);
      return;
    }
    const current = items[index];
    current.setAttribute('data-dnd-guide', 'before');
    addClasses(current, BEFORE_CLASSES);
  };

  // Zonas calientes del contenedor (UL)
  const containerEdgeIndex = (clientY) => {
    // comentario: detecta franja superior/inferior del UL
    const rect = ul.getBoundingClientRect();
    const items = getRealItems();
    if (items.length === 0) return null;

    const topZone = rect.top + containerEdgePx;
    const bottomZone = rect.bottom - containerEdgePx;

    if (clientY <= topZone) return 0; // before del primero
    if (clientY >= bottomZone) return items.length; // after del último
    return null; // fuera de zonas del contenedor
  };

  // ===== Handlers de esta UL (ignoran eventos si no es la activa) =====
  const onDragStart = (e) => {
    const li = e.target.closest(itemSelector);
    if (!li?.dataset?.id || li.matches(ignoreSelector)) return;

    // comentario: establece esta UL como el contexto activo
    activeUL = ul;
    // comentario: expone utilidades al handler global mientras dure el drag
    activeAPI = {
      allowGlobalEdges,
      clearGuides,
      clearAll,
      insertionIndexFromY,
      paintGuideByIndex,
      containerEdgeIndex,
      getRect: () => ul.getBoundingClientRect(),
      getItemsLength: () => getRealItems().length,
      onReorder,
      draggingIdRef: () => draggingId,
      setInactive: () => {
        activeUL = null;
        activeAPI = null;
      },
    };

    draggingId = li.dataset.id;
    li.classList.add(draggingClass);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggingId);
  };

  const onDragOver = (e) => {
    if (activeUL !== ul || !draggingId) return;
    e.preventDefault();
    clearGuides();

    // 1) Intenta zona de contenedor (top/bottom del UL)
    const edgeIdx = containerEdgeIndex(e.clientY);
    if (edgeIdx !== null) {
      paintGuideByIndex(edgeIdx);
      return;
    }

    // 2) Si no está en zona de contenedor, usa índice geométrico normal
    const index = insertionIndexFromY(e.clientY);
    paintGuideByIndex(index);
  };

  const onDragLeave = (e) => {
    if (activeUL !== ul) return;
    // comentario: no limpia si se mueve entre hijos de la misma UL
    if (ul.contains(e.relatedTarget)) return;
    clearGuides();
  };

  const onDrop = (e) => {
    if (activeUL !== ul || !draggingId) return;
    e.preventDefault();

    // Usa el mismo orden: primero contenedor, luego geométrico
    const edgeIdx = containerEdgeIndex(e.clientY);
    const toIndex = edgeIdx !== null ? edgeIdx : insertionIndexFromY(e.clientY);

    onReorder(draggingId, toIndex);
    clearAll();
    draggingId = null;
    activeUL = null;
    activeAPI = null;
  };

  const onDragEnd = () => {
    if (activeUL !== ul) return;
    clearAll();
    draggingId = null;
    activeUL = null;
    activeAPI = null;
  };

  // Bind de esta UL
  ul.addEventListener('dragstart', onDragStart);
  ul.addEventListener('dragover', onDragOver);
  ul.addEventListener('dragleave', onDragLeave);
  ul.addEventListener('drop', onDrop);
  ul.addEventListener('dragend', onDragEnd);

  // ===== Handlers globales (adjunta una sola vez) =====
  if (!globalHandlersAttached) {
    document.addEventListener('dragover', (e) => {
      if (!activeUL || !activeAPI) return;
      if (!activeAPI.allowGlobalEdges) return;

      e.preventDefault(); // permite drop global
      const rect = activeAPI.getRect();

      const insideUl =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      // comentario: no interfiere si está dentro del UL activo
      if (insideUl) return;

      activeAPI.clearGuides();

      // Aplica también zona de contenedor cuando está fuera: arriba/abajo
      const edgeIdx = activeAPI.containerEdgeIndex(e.clientY);
      const index =
        edgeIdx !== null ? edgeIdx : activeAPI.insertionIndexFromY(e.clientY);

      activeAPI.paintGuideByIndex(index);
    });

    document.addEventListener('drop', (e) => {
      if (!activeUL || !activeAPI) return;

      const rect = activeAPI.getRect();
      const insideUl =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (insideUl) return; // deja que el drop del UL maneje
      e.preventDefault();

      // Usa misma lógica para índice
      const edgeIdx = activeAPI.containerEdgeIndex(e.clientY);
      const toIndex =
        edgeIdx !== null ? edgeIdx : activeAPI.insertionIndexFromY(e.clientY);

      const id = activeAPI.draggingIdRef?.();
      if (id) {
        activeAPI.onReorder(id, toIndex);
      }

      activeAPI.clearAll();
      activeAPI.setInactive();
    });

    globalHandlersAttached = true;
  }

  // API de destrucción de esta instancia
  return {
    destroy() {
      ul.removeEventListener('dragstart', onDragStart);
      ul.removeEventListener('dragover', onDragOver);
      ul.removeEventListener('dragleave', onDragLeave);
      ul.removeEventListener('drop', onDrop);
      ul.removeEventListener('dragend', onDragEnd);
      // comentario: los handlers globales permanecen; son inofensivos sin activeUL
    },
  };
}
