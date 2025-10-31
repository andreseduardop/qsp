/**
 * @fileoverview Supplies list UI module.
 * @module components/supplieslist
 *
 * @description
 * Replaces the old tabs+list-group layout with a single grid of Bootstrap cards
 * ("row type-checkbox g-3" with "col-6" columns). Each supply renders as a
 * <div class="card h-100 position-relative" data-id="..."> containing a checkbox,
 * label bound to the checkbox (for="supplieslist-check-<id>"), the editable text,
 * and an inline edit panel. Clicking the label now opens the textarea to edit its content. The move button now lives inside the card and is
 * positioned with utilities: "btn app-btn-move ".
 * The new-entry row sits outside the grid items in a horizontal card and uses
 * name="new-supply" and placeholder "Add supply [Enter]".
 *
 * Persistence and behavior are unchanged: toggling readiness, inline editing, and creation still work; AI actions were removed from the inline panel.
 *
 * @version 1.13.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 *
 * @exports renderSuppliesList
 */

import { el, qs, qsa, visibility, flashBackground } from "../utils/helpers.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";

/* ================================
 * Model (component-scoped; delegates to storage.js)
 * ================================ */
/**
 * @typedef {Object} SuppliesItem
 * @property {string} id
 * @property {string} text
 * @property {boolean} ready
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
   * @return {!Array<SuppliesItem>}
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
    items.push({ id: uid(), text: t, ready: false });
    this._write(items);
  }

  /**
   * Toggles the `ready` state of an item by id.
   * @param {string} id
   * @return {void}
   */
  toggle(id) {
    // Comentario: invierte el estado `ready`
    const items = this.getAll().map((i) => (i.id === id ? { ...i, ready: !i.ready } : i));
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
 * View (grid of cards; single container)
 * ================================ */
class View {
  // Comentario: selectores reutilizables
  static SEL = {
    grid: "div.row.type-checkbox.type-supplies.g-3",
    itemCol: "div.col-6[data-id]",
    card: ".card[data-id]",
    newEntry: "[data-role='new-entry']",
    newEntryInput: "[data-role='new-entry'] input[type='text']",
    checkbox: "input.form-check-input.squarebox",
    label: "label.form-check-label",
    btnAdd: "button.app-btn-add",
  };

  // Comentario: crea todo el layout y devuelve referencias clave
  static buildLayout(containerEl) {
    // Comentario: limpia contenedor destino
    containerEl.innerHTML = "";

    // Comentario: crea contenedor raíz y encabezado simple
    const col = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });
    const h2 = el("h2", { html: "supplies" });

    // Comentario: raíz lógica del componente
    const suppliesRoot = el("div", { attrs: { id: "supplieslist-container" } });

    // Comentario: contenedor de grilla (reemplaza ul/list-group y pestañas)
    const grid = el("div", { className: "row type-checkbox type-supplies g-3" });

    // Comentario: header y ensamblado
    const header = el("div", { className: "d-flex align-items-center justify-content-between mb-2" });
    header.append(h2);

    const headerWrap = el("div", { className: "d-flex flex-column w-100" });
    headerWrap.append(header);

    suppliesRoot.append(grid);
    card.append(headerWrap, suppliesRoot);
    col.append(card);
    containerEl.append(col);

    return { root: suppliesRoot, grid };
  }

  constructor(containerEl) {
    // Comentario: construye layout y guarda ref de grilla
    const { root, grid } = View.buildLayout(containerEl);
    this.root = root;
    this.grid = grid;
  }

  // Comentario: renderiza la grilla completa
  render(items) {
    this.grid.innerHTML = "";

    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(this.#renderItemCol(item)));
    this.grid.appendChild(frag);

    // Comentario: coloca el bloque de nueva entrada fuera y después del row
    const prevNew = this.root.querySelector("[data-role='new-entry']");
    if (prevNew) prevNew.remove();
    this.root.appendChild(this.#renderNewItemEntry());
  }

  // Comentario: inicializa drag & drop en la grilla

  // Comentario: crea columna y tarjeta por item
  #renderItemCol(item) {
    const col = el("div", { className: "col-6" });
    col.dataset.id = item.id;

    const card = el("div", { className: "card h-100 position-relative", attrs: { "data-id": item.id } });
    const body = el("div", { className: "card-body align-items-start p-2" });

    const formCheck = el("div", { className: "form-check d-flex align-items-start flex-grow-1" });

    const input = el("input", {
      className: "form-check-input squarebox",
      attrs: { type: "checkbox", id: `supplieslist-check-${item.id}` },
    });
    input.checked = !!item.ready;

    const label = el("label", {
      className: "form-check-label flex-grow-1 ms-2",
      attrs: { for: `supplieslist-check-${item.id}` },
    });

    // Comentario: contenedor de texto editable (no es label para permitir edición)
    label.textContent = item.text;

    // Comentario: panel inline de edición (sin acciones AI)
    const panel = el("div", {
      className: "d-flex flex-column d-none",
      attrs: { "data-role": "inline-panel" },
    });

    const editor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit supply text",
        name: "inline-editor",
        rows: "1",
        id: `textarea-for-${item.id}`,
      },
    });

    const actions = el("div", { className: "d-flex flex-column mt-3 small" });
    const actionDefs = [
      ["save", "Save", "[Enter]"],
      ["discard", "Discard", "[Esc]"],
      ["delete", "Delete", "[Shift+Del]"],
    ];

    actionDefs.forEach(([key, text, hint]) => {
      const anchorClassName = "text-decoration-none fw-bold mb-2";
      actions.append(
        el("a", {
          className: anchorClassName,
          attrs: { href: "#", "data-action": key },
          html: `<span>${text}</span><br><span class="text-muted">${hint}</span>`,
        }),
      );
    });

    panel.append(editor, actions);
    formCheck.append(input, label);
    body.append(formCheck, panel);

    card.append(body);
    col.append(card);

    // Comentario: listeners del item (toggle)
    input.addEventListener("change", () => {
      this.onToggle?.(item.id);
      flashBackground(input);
    });

    // Comentario: inicia edición al activar el texto editable
    const startInlineEdit = () => {
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
          if (!next) this.onEdit?.(item.id, ""); // Comentario: vacío → eliminar
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
    };

    

    // Comentario: permite editar haciendo doble clic en el label completo
    label.addEventListener("click", (e) => {
      // Comentario: evita que el clic active el checkbox
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit();
    });

    return col;
  }

  // Comentario: crea bloque de nueva entrada (card horizontal fuera de items)
  #renderNewItemEntry() {
    const col = el("div", { className: "col", attrs: { "data-role": "new-entry" } });

    const wrap = el("div", { className: "card d-flex flex-row border p-2 mt-3" });

    const input = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-supply",
        placeholder: "Add supply [Enter]",
        "aria-label": "Add new supply",
        enterkeyhint: "enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: { type: "button", title: "Add new supply", "aria-label": "Add new supply" },
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

    wrap.append(input, btnAdd);
    col.append(wrap);
    return col;
  }

  // Comentario: API para enfocar input nuevo
  focusNewEntryInput() {
    const entry = qs(this.root, View.SEL.newEntryInput);
    if (entry) entry.focus({ preventScroll: true });
  }
}

/* ================================
 * Controller
 * ================================ */
class Controller {
  constructor(containerEl) {
    // Comentario: define y almacena el nombre del componente que controla
    this.COMPONENT_NAME = "supplieslist";

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
  }
}

/* ================================
 * Public API
 * ================================ */

/**
 * renderSuppliesList(containerEl: HTMLElement)
 * - Called by coordinator.js passing the container where everything must be created.
 * @param {HTMLElement} containerEl
 * @return {void}
 */
export function renderSuppliesList(containerEl) {
  // Comentario: valida el contenedor recibido
  if (!containerEl || !(containerEl instanceof HTMLElement)) {
    console.error("[supplieslist] invalid container element");
    return;
  }
  // Comentario: crea layout y monta controlador sobre el contenedor
  new Controller(containerEl);
}
