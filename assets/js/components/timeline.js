/**
 * @fileoverview Editable timeline component with drag-and-drop reordering.
 * MVC structure + public API renderTimeline(containerEl).
 * Persists state under components.timeline.content using storage.js.
 * Drag & Drop behavior mirrors stepslist via utils/drag-and-drop.js.
 *
 * @version 2.2.0
 *
 * Changes in 2.2.0:
 * - Adds drag-and-drop reorder using attachListReorder (same pattern as stepslist).
 * - Introduces Model.moveToIndex(id, toIndex) for stable in-model reordering.
 * - View: initializes DnD after render; keeps disposers; cleans up on destroy.
 * - List items: now include class 'list-group-item' and draggable="true".
 * - Public destroy() also removes the document-level edit commit listener.
 */

import { el, qs, visibility } from "../utils/helpers.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";
import { attachListReorder } from "../utils/drag-and-drop.js"; // Comentario: importa helper DnD

/**
 * @typedef {{ id: string, heading: string, description: string }} TimelineItem
 * @typedef {{ items: !Array<TimelineItem> }} TimelineState
 */

/* ============================
 * Model (EventTarget style, like teamlist)
 * ============================ */
class Model extends EventTarget {
  constructor() {
    super();
    // (comentario) Clave de almacenamiento del componente
    this._name = "timeline";
  }

  /** @private */
  _clone(obj) {
    // (comentario) Realiza clon profundo defensivo
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Lee todos los ítems. Si no hay datos, inicializa y persiste defaults una sola vez.
   * @return {!Array<TimelineItem>}
   */
  getAll() {
    const content = storage.getComponentContent(this._name);
    const arr = Array.isArray(content) ? content : content?.items;
    if (Array.isArray(arr) && arr.length > 0) return arr.map((i) => ({ ...i }));

    // (comentario) No hay datos → crea y persiste defaults para estabilizar ids
    const defaults = [
      { id: uid(), heading: "Activity 1", description: "Activity 1 description text." },
      { id: uid(), heading: "Activity 2", description: "Activity 2 description text." },
    ];
    this._write(defaults);
    return defaults.map((i) => ({ ...i }));
  }

  /** @private */
  _write(nextItems) {
    // (comentario) Persiste y emite evento de cambio (estilo teamlist)
    storage.setComponentContent(this._name, nextItems.map((i) => ({ ...i })));
    this.dispatchEvent(new CustomEvent("change", { detail: { name: this._name, items: this.getAll() } }));
  }

  /**
   * Reemplaza la lista completa.
   * @param {!Array<TimelineItem>} items
   */
  set(items) {
    this._write(items);
  }

  /**
   * Agrega una nueva actividad (requiere heading y description con texto).
   * @param {string} heading
   * @param {string} description
   */
  add(heading, description) {
    // (comentario) Valida entradas (ambas necesarias)
    const h = String(heading || "").trim();
    const d = String(description || "").trim();
    if (!h || !d) return;

    const items = this.getAll();
    items.push({ id: uid(), heading: h, description: d });
    this._write(items);
  }

  /**
   * Actualiza campos de una actividad; si ambos quedan vacíos, elimina.
   * @param {string} id
   * @param {{heading?: string, description?: string}} patch
   */
  update(id, patch) {
    const items = this.getAll();
    const idx = items.findIndex((x) => x.id === id);
    if (idx === -1) return;

    const next = {
      ...items[idx],
      ...(patch.heading !== undefined ? { heading: String(patch.heading || "").trim() } : {}),
      ...(patch.description !== undefined ? { description: String(patch.description || "").trim() } : {}),
    };

    if (!next.heading && !next.description) {
      // (comentario) Ambos vacíos → elimina
      items.splice(idx, 1);
    } else {
      items[idx] = next;
    }
    this._write(items);
  }

  /**
   * Elimina una actividad por id.
   * @param {string} id
   */
  remove(id) {
    const items = this.getAll().filter((x) => x.id !== id);
    this._write(items);
  }

  /**
   * Moves an item to a target index in the same list.
   * @param {string} id
   * @param {number} toIndex
   * @return {void}
   */
  moveToIndex(id, toIndex) {
    // (comentario) Reubica el item de forma estable (igual que stepslist)
    const items = this.getAll();
    const len = items.length;
    if (len <= 1) return;

    const from = items.findIndex((i) => i.id === id);
    if (from === -1) return;

    let dest = Math.max(0, Math.min(len, Number(toIndex)));
    if (dest === from || dest === from + 1) return;

    const arr = [...items];
    const [moved] = arr.splice(from, 1);
    if (dest > from) dest -= 1;
    arr.splice(dest, 0, moved);

    this._write(arr);
  }
}

/* ============================
 * View
 * ============================ */
class View {
  // (comentario) Selectores reutilizables
  static SEL = {
    list: "ul.app-timeline",
    newEntry: "[data-role='new-entry']",
    newHeading: "[data-role='new-entry'] input[name='new-heading']",
    newDescription: "[data-role='new-entry'] input[name='new-description']",
    btnAdd: "[data-role='new-entry'] .app-btn-add",
  };

  /**
   * @param {!HTMLElement} host
   * @param {{
   *   onSave: (id:string, heading:string, description:string) => void,
   *   onDiscard: () => void,
   *   onDelete: (id:string) => void,
   *   onCreate: (heading:string, description:string) => void,
   *   onReorder: (id:string, toIndex:number) => void
   * }} handlers
   */
  constructor(host, handlers) {
    // (comentario) Guarda refs y estado
    this.host_ = host;
    this.handlers_ = handlers;
    /** @type {string|null} */
    this.editingId_ = null;

    // (comentario) Estructura base alineada a timeline.html
    this.root_ = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });
    const h2 = el("h2", { html: "timeline" });
    this.col_ = el("div", { className: "col" });

    // (comentario) Lista de actividades
    this.ul_ = el("ul", { className: "app-timeline", attrs: { role: "presentation" } });

    this.col_.append(this.ul_);
    card.append(h2, this.col_);
    this.root_.append(card);
    this.host_.append(this.root_);

    // (comentario) Pool de manejadores DnD para limpieza
    this._dndDisposers_ = [];

    // (comentario) Listener global para commit por clic fuera cuando está editando
    this.onDocPointerDown_ = (ev) => {
      if (this.editingId_ == null) return;
      const li = qs(this.ul_, `li[data-id="${this.editingId_}"]`);
      if (!li) return;
      if (li.contains(ev.target)) return; // clic dentro → ignora
      const { heading, description } = this.readDraftFrom_(li);
      this.handlers_.onSave(this.editingId_, heading, description);
      this.exitEdit_(li);
    };
    document.addEventListener("mousedown", this.onDocPointerDown_, true);
  }

  /**
   * Renderiza el estado completo (lista + bloque de nueva entrada).
   * @param {TimelineState} state
   */
  render(state) {
    // (comentario) Limpia lista y DnD previos
    this._destroyDnD_();
    this.ul_.innerHTML = "";

    // (comentario) Genera ítems
    for (const item of state.items) {
      const li = this.renderItem_(item);
      this.ul_.append(li);
    }

    // (comentario) Coloca bloque de nueva entrada debajo de la lista
    const prevNew = this.col_.querySelector(View.SEL.newEntry);
    if (prevNew) prevNew.remove();
    this.col_.append(this.renderNewEntry_());

    // (comentario) Inicializa DnD tras render
    this._initDnD_();

    // (comentario) Asegura visibilidad
    visibility.setVisible(this.root_, true);
  }

  // (comentario) Inicializa Drag & Drop similar a stepslist
  _initDnD_() {
    const common = {
      // (comentario) No hay fila "new-entry" dentro del UL; no hace falta ignorar
      allowGlobalEdges: true,
      onReorder: (draggedId, toIndex) => this.handlers_.onReorder?.(draggedId, toIndex),
    };
    this._dndDisposers_.push(attachListReorder(this.ul_, common));
  }

  // (comentario) Destruye instancias DnD activas
  _destroyDnD_() {
    this._dndDisposers_.forEach((d) => {
      try {
        d?.destroy?.();
      } catch {
        /* no-op */
      }
    });
    this._dndDisposers_ = [];
  }

  /**
   * Crea <li> por ítem y cablea interacciones.
   * @param {TimelineItem} item
   * @return {!HTMLLIElement}
   * @private
   */
  renderItem_(item) {
    const li = el("li", {
      // (comentario) Añade clases para que el helper seleccione por defecto
      className: "list-group-item",
      attrs: { "data-id": String(item.id), draggable: "true" },
    });

    // (comentario) Modo lectura
    const h3 = el("h3", {
      className: "fw-semibold fs-6 mb-0",
      attrs: { "data-role": "heading" },
      html: item.heading ?? "",
    });
    const p = el("p", {
      className: "mt-2",
      attrs: { "data-role": "description" },
      html: item.description ?? "",
    });

    // (comentario) Panel inline oculto (usa data-field para evitar problemas de selectores por id)
    const panel = el("div", {
      className: "d-flex flex-column gap-3 mt-3 d-none",
      attrs: { "data-role": "inline-panel" },
    });
    const taHeading = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "data-field": "heading",
        "aria-label": "Edit activity heading",
        name: "inline-editor-heading",
        rows: "1",
        placeholder: "Activity",
      },
    });
    const taDesc = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "data-field": "description",
        "aria-label": "Edit activity description",
        name: "inline-editor-description",
        rows: "1",
        placeholder: "Description",
      },
    });

    // (comentario) Toolbar de acciones
    const toolbar = el("div", { className: "d-flex flex-column small" });
    const mk = (key, text, hint) =>
      el("a", {
        className: "text-decoration-none fw-bold mb-2",
        attrs: { href: "#", "data-action": key },
        html: `<span>${text}</span><br><span class="text-muted">${hint}</span>`,
      });
    toolbar.append(
      mk("save", "Save", "[Enter]"),
      mk("discard", "Discard", "[Esc]"),
      mk("delete", "Delete", "[Shift+Del]"),
    );

    panel.append(taHeading, taDesc, toolbar);
    li.append(h3, p, panel);

    // (comentario) Entra a edición al hacer clic en los bloques de lectura
    const enterEdit = () => {
      if (this.editingId_ != null && this.editingId_ !== item.id) {
        const prev = qs(this.ul_, `li[data-id="${this.editingId_}"]`);
        if (prev) {
          const draftPrev = this.readDraftFrom_(prev);
          this.handlers_.onSave(this.editingId_, draftPrev.heading, draftPrev.description);
          this.exitEdit_(prev);
        }
      }
      this.enterEdit_(li, item);
    };
    h3.addEventListener("click", enterEdit);
    p.addEventListener("click", enterEdit);

    // (comentario) Acciones del toolbar
    toolbar.addEventListener("click", (ev) => {
      const a = /** @type {!HTMLElement} */ (ev.target).closest("a[data-action]");
      if (!a) return;
      ev.preventDefault();
      const action = a.getAttribute("data-action");
      if (action === "save") {
        const { heading, description } = this.readDraftFrom_(li);
        this.handlers_.onSave(item.id, heading, description);
        this.exitEdit_(li);
      } else if (action === "discard") {
        this.handlers_.onDiscard();
        this.exitEdit_(li, /*restore=*/true, item);
      } else if (action === "delete") {
        this.handlers_.onDelete(item.id);
      }
    });

    // (comentario) Atajos de teclado
    panel.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        const { heading, description } = this.readDraftFrom_(li);
        this.handlers_.onSave(item.id, heading, description);
        this.exitEdit_(li);
        return;
      }
      if (ev.key === "Escape") {
        ev.preventDefault();
        this.handlers_.onDiscard();
        this.exitEdit_(li, /*restore=*/true, item);
        return;
      }
      if (ev.shiftKey && (ev.key === "Delete" || ev.key === "Del")) {
        ev.preventDefault();
        this.handlers_.onDelete(item.id);
        return;
      }
    });

    // (comentario) Autosize
    const autosize = (ta) => {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    };
    taHeading.addEventListener("input", () => autosize(taHeading));
    taDesc.addEventListener("input", () => autosize(taDesc));

    return li;
  }

  /**
   * Crea el bloque de nueva entrada (dos inputs + botón), igual que en teamlist.
   * @return {!HTMLElement}
   * @private
   */
  renderNewEntry_() {
    // (comentario) Card horizontal con inputs y botón a la derecha
    const wrap = el("div", { className: "card d-flex flex-row border p-2 mt-3", attrs: { "data-role": "new-entry" } });

    const inputsWrap = el("div", { className: "d-flex flex-column flex-grow-1 gap-3" });

    const inputHeading = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-heading",
        placeholder: "Add activity title",
        "aria-label": "Add activity title",
        enterkeyhint: "next",
      },
    });

    const inputDesc = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-description",
        placeholder: "Add description [Enter]",
        "aria-label": "Add activity description",
        enterkeyhint: "enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: { type: "button", title: "Add new activity", "aria-label": "Add new activity" },
      html: `<i class="bi bi-plus-lg fs-2" aria-hidden="true"></i>`,
    });

    const create = () => {
      const h = inputHeading.value.trim();
      const d = inputDesc.value.trim();
      if (!h || !d) return; // (comentario) Requiere ambos campos
      this.handlers_.onCreate?.(h, d);
      // (comentario) Limpia y refocus en heading para ingreso rápido
      inputHeading.value = "";
      inputDesc.value = "";
      inputHeading.focus();
    };

    inputHeading.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inputDesc.focus();
      }
    });

    inputDesc.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        create();
      }
    });

    btnAdd.addEventListener("click", create);

    inputsWrap.append(inputHeading, inputDesc);
    wrap.append(inputsWrap, btnAdd);
    return wrap;
  }

  /**
   * Entra a modo edición para un <li>.
   * @param {!HTMLLIElement} li
   * @param {TimelineItem} item
   * @private
   */
  enterEdit_(li, item) {
    // (comentario) Marca id en edición
    this.editingId_ = item.id;

    const panel = qs(li, '[data-role="inline-panel"]');
    const taH = qs(panel, '[data-field="heading"]');
    const taD = qs(panel, '[data-field="description"]');
    const h3 = qs(li, '[data-role="heading"]');
    const p = qs(li, '[data-role="description"]');

    // (comentario) Carga borrador con contenido actual
    taH.value = h3.textContent ?? "";
    taD.value = p.textContent ?? "";

    // (comentario) Muestra panel y oculta lectura
    panel.classList.remove("d-none");
    h3.classList.add("d-none");
    p.classList.add("d-none");

    // (comentario) Foco y autoresize
    const autosize = (ta) => {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    };
    autosize(taH);
    autosize(taD);
    taH.focus();
  }

  /**
   * Sale del modo edición para un <li>.
   * @param {!HTMLLIElement} li
   * @param {boolean=} restore
   * @param {TimelineItem=} item
   * @private
   */
  exitEdit_(li, restore = false, item = undefined) {
    const panel = qs(li, '[data-role="inline-panel"]');
    const h3 = qs(li, '[data-role="heading"]');
    const p = qs(li, '[data-role="description"]');

    if (restore && item) {
      // (comentario) Restaura contenido
      h3.textContent = item.heading ?? "";
      p.textContent = item.description ?? "";
    }

    panel.classList.add("d-none");
    h3.classList.remove("d-none");
    p.classList.remove("d-none");
    this.editingId_ = null;
  }

  /**
   * Lee valores del borrador para un <li>.
   * @param {!HTMLLIElement} li
   * @return {{ heading: string, description: string }}
   * @private
   */
  readDraftFrom_(li) {
    const taH = qs(li, '[data-field="heading"]');
    const taD = qs(li, '[data-field="description"]');
    const heading = String(taH.value ?? "").replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim();
    const description = String(taD.value ?? "").replace(/\r?\n/g, " ").replace(/\s{2,}/g, " ").trim();
    return { heading, description };
  }

  // (comentario) API UX: enfoca el input de título de nueva actividad
  focusNewEntryHeading() {
    const inp = this.col_.querySelector(View.SEL.newHeading);
    if (inp) inp.focus({ preventScroll: true });
  }

  /**
   * Limpia listeners y disposers de la vista.
   */
  destroy() {
    // (comentario) Remueve listener global de commit por clic fuera
    if (this.onDocPointerDown_) {
      document.removeEventListener("mousedown", this.onDocPointerDown_, true);
    }
    // (comentario) Limpia DnD
    this._destroyDnD_();
  }
}

/* ============================
 * Controller
 * ============================ */
class Controller {
  /**
   * @param {!HTMLElement} containerEl
   */
  constructor(containerEl) {
    // (comentario) Instancia modelo y vista; define banderas UX
    this.COMPONENT_NAME = "timeline";
    this.model = new Model();
    this.view = new View(containerEl, {
      onSave: (id, heading, description) => {
        this.model.update(id, { heading, description });
      },
      onDiscard: () => {
        /* (comentario) No hace nada; la vista restaura visualmente */
      },
      onDelete: (id) => {
        this.model.remove(id);
      },
      onCreate: (heading, description) => {
        if (this._createInFlight) return;
        this._createInFlight = true;
        this._shouldRefocusNew = true;
        this.model.add(heading, description);
      },
      onReorder: (draggedId, toIndex) => {
        // (comentario) Aplica reordenamiento del modelo
        this.model.moveToIndex(draggedId, toIndex);
      },
    });

    this._createInFlight = false;
    this._shouldRefocusNew = false;

    // (comentario) Render inicial
    this.view.render({ items: this.model.getAll() });

    // (comentario) Re-render ante cambios del modelo (estilo teamlist)
    this.onModelChange_ = (ev) => {
      const changedName = ev?.detail?.name;
      if (!changedName || changedName === this.COMPONENT_NAME) {
        this.view.render({ items: this.model.getAll() });
        if (this._shouldRefocusNew) {
          this.view.focusNewEntryHeading();
          this._shouldRefocusNew = false;
        }
        this._createInFlight = false;
      }
    };
    this.model.addEventListener("change", this.onModelChange_);
  }

  /**
   * Limpia recursos del controlador.
   */
  destroy() {
    // (comentario) Limpia listener del modelo y vista
    if (this.onModelChange_) {
      this.model.removeEventListener("change", this.onModelChange_);
    }
    this.view?.destroy?.();
  }
}

/* ============================
 * Public API
 * ============================ */
/**
 * Public API — renderTimeline for coordinator.js compatibility.
 * @param {!HTMLElement} containerEl Mount point provided by coordinator.
 * @return {{ destroy: () => void }} Optional cleanup handle.
 */
export function renderTimeline(containerEl) {
  // (comentario) Crea controlador y devuelve handle para limpiar listeners
  const controller = new Controller(containerEl);
  return {
    destroy() {
      controller?.destroy?.();
    },
  };
}
