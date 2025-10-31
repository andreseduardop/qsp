/**
 * @fileoverview Guest list UI module.
 * @module components/guestlist
 *
 * @description
 * Builds and initializes a guest list inside the given container. It renders items,
 * wires inline editing, creation, confirmation toggling, and drag & drop reordering.
 * Persistence is handled by an internal `Model` class that delegates reads/writes
 * to `core/storage.js`, storing items under `components.<COMPONENT_NAME>.content`.
 *
 * @version 1.6.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 *
 * @exports renderGuestlist
 */

import { el, qs, qsa, visibility, flashBackground } from "../utils/helpers.js";
import { attachListReorder } from "../utils/drag-and-drop.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";

/* ================================
 * Model (component-scoped; delegates to storage.js)
 * ================================ */
/**
 * @typedef {Object} GuestItem
 * @property {string} id
 * @property {string} text
 * @property {boolean} checked
 */
class Model extends EventTarget {
  /**
   * @param {string} componentName
   */
  constructor(componentName) {
    super();
    /** @private {string} */
    this._name = componentName; // Comentario: guarda el nombre del componente
  }

  /** @private */
  _deepClone(obj) {
    // Comentario: clona objetos JSON de forma defensiva
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Returns all items for this component.
   * @return {!Array<GuestItem>}
   */
  getAll() {
    // Comentario: lee desde storage y normaliza a arreglo de items
    const content = storage.getComponentContent(this._name);
    const arr = Array.isArray(content) ? content : [];
    return arr.map((i) => ({ ...i }));
  }

  /** @private */
  _write(nextItems) {
    // Comentario: escribe items en storage y emite evento de cambio
    storage.setComponentContent(this._name, nextItems.map((i) => ({ ...i })));
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { name: this._name, items: this.getAll() },
      }),
    );
  }

  /**
   * Adds a new item.
   * @param {string} text
   * @return {void}
   */
  add(text) {
    // Comentario: agrega item si el texto no está vacío
    const t = String(text || "").trim();
    if (!t) return;
    const items = this.getAll();
    items.push({ id: uid(), text: t, checked: false });
    this._write(items);
  }

  /**
   * Toggles the `checked` state of an item by id.
   * @param {string} id
   * @return {void}
   */
  toggle(id) {
    // Comentario: invierte el estado `checked`
    const items = this.getAll().map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    this._write(items);
  }

  /**
   * Updates the text of an item; removes it if the text becomes empty.
   * @param {string} id
   * @param {string} text
   * @return {void}
   */
  updateText(id, text) {
    // Comentario: actualiza el texto o elimina si queda vacío
    const t = String(text || "").trim();
    if (!t) return this.remove(id);
    const items = this.getAll().map((i) => (i.id === id ? { ...i, text: t } : i));
    this._write(items);
  }

  /**
   * Removes an item by id.
   * @param {string} id
   * @return {void}
   */
  remove(id) {
    // Comentario: elimina el item según id
    const items = this.getAll().filter((i) => i.id !== id);
    this._write(items);
  }

  /**
   * Moves an item to a target index in the same list.
   * @param {string} id
   * @param {number} toIndex
   * @return {void}
   */
  moveToIndex(id, toIndex) {
    // Comentario: reubica el item al índice destino
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

/* ================================
 * View (builds full layout inside container)
 * ================================ */
class View {
  // selectores reutilizables
  static SEL = {
    pendingPane: "#guestlist-pending-tab-pane .app-guestlist .type-checkbox",
    completedPane: "#guestlist-completed-tab-pane .app-guestlist .type-checkbox",
    item: "li.list-group-item",
    newEntry: "li[data-role='new-entry']",
    newEntryInput: "li[data-role='new-entry'] input[type='text']",
    checkbox: "input.form-check-input.squircle",
    label: "label.form-check-label",
    btnAdd: "button.app-btn-add",
  };

  // crea todo el layout y devuelve referencias clave
  static buildLayout(containerEl) {
    // Comentario: limpia contenedor destino
    containerEl.innerHTML = "";

    // Comentario: crea columna y tarjeta
    const col = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });
    const h2 = el("h2", { html: "guests" });

    // Comentario: raíz lógica del guestlist
    const guestlistRoot = el("div", { attrs: { id: "guestlist-container" } });

    // Comentario: tabs (ids y atributos actualizados)
    const tabs = el("ul", {
      className: "nav nav-tabs nav-fill",
      attrs: { id: "guestlist-tabs", role: "tablist" },
    });

    const liPend = el("li", { className: "nav-item", attrs: { role: "presentation" } });
    const btnPend = el("button", {
      className: "nav-link active",
      attrs: {
        id: "guestlist-pending-tab",
        "data-bs-toggle": "tab",
        "data-bs-target": "#guestlist-pending-tab-pane",
        type: "button",
        role: "tab",
        "aria-controls": "guestlist-pending-tab-pane",
        "aria-selected": "true",
      },
      html: "Pending",
    });
    liPend.append(btnPend);

    const liConf = el("li", { className: "nav-item", attrs: { role: "presentation" } });
    const btnConf = el("button", {
      className: "nav-link",
      attrs: {
        id: "guestlist-completed-tab",
        "data-bs-toggle": "tab",
        "data-bs-target": "#guestlist-completed-tab-pane",
        type: "button",
        role: "tab",
        "aria-controls": "guestlist-completed-tab-pane",
        "aria-selected": "false",
        tabindex: "-1",
      },
      html: "Confirmed",
    });
    liConf.append(btnConf);

    tabs.append(liPend, liConf);

    // Comentario: contenido de pestañas
    const tabContent = el("div", {
      className: "tab-content",
      attrs: { id: "guestlist-tabs-content" },
    });

    const panePend = el("div", {
      className: "tab-pane fade active show",
      attrs: {
        id: "guestlist-pending-tab-pane",
        role: "tabpanel",
        "aria-labelledby": "guestlist-pending-tab",
        tabindex: "0",
      },
    });
    const ulPend = el("ul", { className: "app-guestlist type-checkbox list-group" });
    panePend.append(ulPend);

    const paneConf = el("div", {
      className: "tab-pane fade",
      attrs: {
        id: "guestlist-completed-tab-pane",
        role: "tabpanel",
        "aria-labelledby": "guestlist-completed-tab",
        tabindex: "0",
      },
    });
    const ulConf = el("ul", { className: "app-guestlist type-checkbox list-group" });
    paneConf.append(ulConf);

    tabContent.append(panePend, paneConf);

    // Comentario: ensambla tarjeta
    const cardHeader = el("div", { className: "d-flex align-items-center justify-content-between mb-2" });
    cardHeader.append(h2);
    const headerWrap = el("div", { className: "d-flex flex-column w-100" });
    headerWrap.append(cardHeader, tabs, tabContent);

    card.append(guestlistRoot, headerWrap);
    col.append(card);
    containerEl.append(col);

    return { root: guestlistRoot, ulPending: ulPend, ulCompleted: ulConf };
  }

  constructor(containerEl) {
    // Comentario: construye layout y guarda refs de listas
    const { root, ulPending, ulCompleted } = View.buildLayout(containerEl);
    this.root = root;
    this.pendingList = ulPending;
    this.completedList = ulCompleted;

    // Comentario: pool de manejadores DnD para limpieza
    this._dndHandles = [];
  }

  // Comentario: renderiza ambas listas
  render(items) {
    const pending = items.filter((i) => !i.checked);
    const completed = items.filter((i) => i.checked);

    this.pendingList.innerHTML = "";
    this.completedList.innerHTML = "";

    this.#renderList(this.pendingList, pending, { withNewEntry: true });
    this.#renderList(this.completedList, completed, { withNewEntry: false });

    this.#ensureCompletedEmptyState();
    this.#initDnD(); // Comentario: activa DnD tras render
  }

  // Comentario: inicializa drag & drop en ambas listas
  #initDnD() {
    // Comentario: destruye instancias previas
    this._dndHandles.forEach((h) => {
      try { h.destroy?.(); } catch {}
    });
    this._dndHandles = [];

    const common = {
      // Comentario: ignora fila de nueva entrada
      ignoreSelector: "[data-role='new-entry']",
      // Comentario: habilita drops en bordes globales
      allowGlobalEdges: true,
      // Comentario: reenvía orden al controlador
      onReorder: (draggedId, toIndex) => this.onReorder?.(draggedId, toIndex),
    };

    this._dndHandles.push(
      attachListReorder(this.pendingList, common),
      attachListReorder(this.completedList, common),
    );
  }

  // Comentario: renderiza una UL completa
  #renderList(ul, data, { withNewEntry }) {
    const frag = document.createDocumentFragment();
    data.forEach((item) => frag.appendChild(this.#renderItem(item)));
    if (withNewEntry) frag.appendChild(this.#renderNewItemEntry());
    ul.appendChild(frag);
  }

  // Comentario: crea <li> por item
  #renderItem(item) {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
      attrs: { draggable: "true" },
    });
    li.dataset.id = item.id;

    const form = el("div", {
      className: "form-check position-relative d-flex align-items-top flex-grow-1",
    });

    const input = el("input", {
      className: "form-check-input squircle",
      attrs: { type: "checkbox", id: `guestlist-check-${item.id}` },
    });
    input.checked = !!item.checked;

    const label = el("label", {
      className: "form-check-label me-auto",
      attrs: { for: `textarea-for-${item.id}` },
    });
    label.textContent = item.text;

    const panel = el("div", {
      className: "d-flex flex-column ps-1 flex-grow-1 d-none",
      attrs: { "data-role": "inline-panel" },
    });

    const editor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit guest name",
        name: "inline-editor",
        rows: "1",
        id: `textarea-for-${item.id}`,
      },
    });

    const actions = el("div", { className: "d-flex flex-column mt-2 small" });
    const actionDefs = [
      ["save", "Save", "[Enter]"],
      ["discard", "Discard", "[Esc]"],
      ["delete", "Delete", "[Shift+Del]"],
      ["ai-spelling", "Fix spelling", "[Shift+F8]", true],
      ["ai-improve", "Improve writing", "[Shift+F9]", true],
    ];

    actionDefs.forEach(([key, text, hint, icono = false]) => {
      const anchorClassName = "text-decoration-none fw-bold mb-2 d-flex justify-content-between";
      const spanClassName = icono ? "app-icono" : "";
      actions.append(
        el("a", {
          className: anchorClassName,
          attrs: { href: "#", "data-action": key },
          html: `<span class="${spanClassName}">${text}</span><span class="text-muted">${hint}</span>`,
        }),
      );
    });

    panel.append(editor, actions);
    form.append(input, label, panel);

    const btnMove = el("button", {
      className: "btn app-btn-move",
      attrs: {
        type: "button",
        "aria-label": "Move",
        title: "Move",
        "aria-hidden": "true",
        tabindex: "-1",
        draggable: "false",
      },
      html: `<i class="bi bi-arrow-down-up" aria-hidden="true"></i>`,
    });

    li.append(form, btnMove);

    // Comentario: listeners del item
    input.addEventListener("change", () => {
      this.onToggle?.(item.id);
      const targetTabId = input.checked
        ? "guestlist-completed-tab"
        : "guestlist-pending-tab";
      const targetEl = document.getElementById(targetTabId);
      if (targetEl) flashBackground(targetEl);
    });

    label.addEventListener("click", () => {
      // Comentario: prepara edición inline
      const currentText = label.textContent.trim();
      visibility.hide(label);
      visibility.show(panel, "d-flex");
      editor.value = currentText;

      // Comentario: auto-resize
      const autoresize = () => {
        editor.style.height = "auto";
        editor.style.height = editor.scrollHeight + "px";
      };

      // Comentario: sanea saltos de línea → espacios
      const sanitizeNoNewlines = () => {
        const sanitized = editor.value.replace(/\r?\n+/g, " ");
        if (sanitized !== editor.value) {
          const pos = editor.selectionStart;
          editor.value = sanitized;
          editor.selectionStart = editor.selectionEnd = Math.min(pos, editor.value.length);
        }
      };

      // Comentario: finaliza edición
      const finalize = (mode /* 'commit' | 'cancel' */) => {
        if (finalize._done) return;
        finalize._done = true;

        panel.removeEventListener("pointerdown", onAction);
        panel.removeEventListener("click", onAction);
        editor.removeEventListener("keydown", onKeyDown);
        editor.removeEventListener("input", onInput);
        editor.removeEventListener("blur", onBlur);

        if (mode === "commit") {
          const next = editor.value.trim();
          if (next && next !== currentText) this.onEdit?.(item.id, next);
          if (!next) this.onEdit?.(item.id, ""); // vacío → eliminar
        }

        visibility.hide(panel);
        visibility.show(label);
      };

      const onKeyDown = (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          finalize("commit");
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          finalize("cancel");
        } else if (ke.key === "Delete" && ke.shiftKey) {
          ke.preventDefault();
          editor.value = "";
          finalize("commit");
        }
      };

      const onInput = () => {
        sanitizeNoNewlines();
        autoresize();
      };
      const onBlur = () => finalize("commit");

      const onAction = (ev) => {
        const a = ev.target.closest("a[data-action]");
        if (!a) return;
        ev.preventDefault();
        const act = a.dataset.action;
        if (act === "save") finalize("commit");
        else if (act === "discard") finalize("cancel");
        else if (act === "delete") {
          editor.value = "";
          finalize("commit");
        }
      };

      panel.addEventListener("pointerdown", onAction);
      panel.addEventListener("click", onAction);
      editor.addEventListener("keydown", onKeyDown);
      editor.addEventListener("blur", onBlur, { once: true });
      editor.addEventListener("input", onInput);

      // Comentario: foco inicial
      editor.focus();
      const len = editor.value.length;
      editor.setSelectionRange(len, len);
      autoresize();
    });

    return li;
  }

  // Comentario: asegura placeholder cuando no hay confirmadas
  #ensureCompletedEmptyState() {
    const ul = this.completedList;
    if (!ul) return;
    const hasReal = [...ul.querySelectorAll("li.list-group-item[data-id]")].some(
      (li) => (li.dataset.id ?? "") !== "",
    );
    const currentPh = ul.querySelector('li.list-group-item[data-id=""]');

    if (hasReal && currentPh) currentPh.remove();
    if (!hasReal && !currentPh) {
      const li = el("li", {
        className: "list-group-item p-2 d-flex align-items-center",
        attrs: { draggable: "false" },
        html: "No guests confirmed.",
      });
      li.dataset.id = "";
      ul.appendChild(li);
    }
  }

  // Comentario: crea fila de nueva entrada
  #renderNewItemEntry() {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
    });
    li.dataset.role = "new-entry";
    li.draggable = false;

    const input = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-guest",
        placeholder: "Add guest [Enter]",
        "aria-label": "Add guest",
        enterkeyhint:"enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: { type: "button", title: "Add guest", "aria-label": "Add guest" },
      html: `<i class="bi bi-plus-lg fs-2" aria-hidden="true"></i>`,
    });

    const create = () => {
      const t = input.value.trim();
      if (!t) return;
      this.onCreate?.(t);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") create();
    });
    btnAdd.addEventListener("click", create);

    li.append(input, btnAdd);
    return li;
  }

  // Comentario: API para enfocar input nuevo
  focusNewEntryInput() {
    const entry = qs(this.pendingList, View.SEL.newEntryInput);
    if (entry) entry.focus({ preventScroll: true });
  }
}

/* ================================
 * Controller
 * ================================ */
class Controller {
  constructor(containerEl) {
    // Comentario: define y almacena el nombre del componente que controla
    this.COMPONENT_NAME = "guestlist";

    // Comentario: instancia modelo y vista
    this.model = new Model(this.COMPONENT_NAME);
    this.view = new View(containerEl);

    // Comentario: banderas para UX de creación
    this.createInFlight = false;
    this.shouldRefocusNewEntry = false;

    // Comentario: render inicial
    this.view.render(this.model.getAll());

    // Comentario: sincroniza vista ante cambios del modelo del mismo componente
    this.model.addEventListener("change", (ev) => {
      const changedName = ev?.detail?.name;
      if (!changedName || changedName === this.COMPONENT_NAME) {
        this.view.render(this.model.getAll());
        if (this.shouldRefocusNewEntry) {
          this.view.focusNewEntryInput();
          this.shouldRefocusNewEntry = false;
        }
        this.createInFlight = false;
      }
    });

    // Comentario: conecta handlers de la vista
    this.view.onCreate = (text) => {
      if (this.createInFlight) return;
      this.createInFlight = true;
      this.shouldRefocusNewEntry = true;
      this.model.add(text);
    };
    this.view.onToggle = (id) => this.model.toggle(id);
    this.view.onEdit = (id, text) => {
      if (String(text).trim() === "") this.model.remove(id);
      else this.model.updateText(id, text);
    };
    this.view.onReorder = (draggedId, toIndex) => {
      this.model.moveToIndex(draggedId, toIndex);
    };
  }
}

/* ================================
 * Public API
 * ================================ */

/**
 * renderGuestlist(containerEl: HTMLElement)
 * - Called by coordinator.js passing the container where everything must be created.
 */
export function renderGuestlist(containerEl) {
  // Comentario: valida el contenedor recibido
  if (!containerEl || !(containerEl instanceof HTMLElement)) {
    console.error("[guestlist] invalid container element");
    return;
  }
  // Comentario: crea layout y monta controlador sobre el contenedor
  new Controller(containerEl);
}
