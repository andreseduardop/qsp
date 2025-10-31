/**
 * @fileoverview Stepslist UI module.
 * @module components/stepslist
 *
 * @description
 * Construye e inicializa una lista de pasos dentro del contenedor dado. Renderiza ítems,
 * conecta edición en línea, creación y reordenamiento drag & drop.
 * La persistencia la maneja una clase interna `Model` que delega lecturas/escrituras
 * a `core/storage.js`, guardando elementos bajo `components.<COMPONENT_NAME>.content`.
 *
 * Cambios vs checklist:
 * - Elimina estados Pending/Completed y la propiedad `checked` en el modelo.
 * - Elimina checkbox y `toggle()`; cambia UL→OL con clases numeradas.
 * - Actualiza IDs, nombres, clases y atributos ARIA según el layout stepslist.html.
 *
 * @version 2.0.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 *
 * @exports renderStepslist
 */

import { el, qs, qsa, visibility, flashBackground } from "../utils/helpers.js";
import { attachListReorder } from "../utils/drag-and-drop.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";

/* ================================
 * Model (component-scoped; delegates to storage.js)
 * ================================ */
/**
 * @typedef {Object} StepslistItem
 * @property {string} id
 * @property {string} text
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
   * @return {!Array<StepslistItem>}
   */
  getAll() {
    // Comentario: lee desde storage y normaliza a arreglo de items
    const content = storage.getComponentContent(this._name);
    const arr = Array.isArray(content) ? content : [];
    // Comentario: garantiza que no haya residuos de `checked`
    return arr.map(({ id, text }) => ({ id, text }));
  }

  /** @private */
  _write(nextItems) {
    // Comentario: escribe items en storage y emite evento de cambio
    storage.setComponentContent(
      this._name,
      nextItems.map(({ id, text }) => ({ id, text })),
    );
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
    items.push({ id: uid(), text: t });
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
    // Incluye list-group-numbered para coincidir exactamente con el layout
    list: "ol.app-stepslist.type-stepslist.list-group.list-group-numbered",
    item: "li.list-group-item",
    newEntry: "li[data-role='new-entry']",
    newEntryInput: "li[data-role='new-entry'] input[type='text']",
    label: "label.form-label",
    btnAdd: "button.app-btn-add",
  };

  // crea todo el layout y devuelve referencias clave
  static buildLayout(containerEl) {
    // Comentario: limpia contenedor destino
    containerEl.innerHTML = "";

    // Comentario: crea columna y tarjeta
    const col = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });

    // Comentario: título directamente dentro de .app-card (sin wrappers extra)
    const h2 = el("h2", { html: "steps" });

    // Comentario: raíz lógica de stepslist
    const stepsRoot = el("div", { attrs: { id: "stepslist-container" } });

    // Comentario: única lista ordenada con numeración
    const ol = el("ol", {
      className:
        "app-stepslist type-stepslist list-group list-group-numbered",
    });

    stepsRoot.append(ol);

    const headerWrap = el("div", { className: "d-flex flex-column w-100" });
    const cardHeader = el("div", {
      className: "d-flex align-items-center justify-content-between mb-2",
    });
    cardHeader.append(h2);
    headerWrap.append(cardHeader);

    card.append(h2, stepsRoot);
    col.append(card);
    containerEl.append(col);

    return { root: stepsRoot, listEl: ol };
  }

  /**
   * @param {!HTMLElement} containerEl
   */
  constructor(containerEl) {
    // Comentario: construye layout y guarda refs
    const { root, listEl } = View.buildLayout(containerEl);
    this.root = root;
    this.listEl = listEl;

    // Comentario: pool de manejadores DnD para limpieza
    this._dndHandles = [];
  }

  /**
   * Renderiza la lista completa.
   * @param {!Array<StepslistItem>} items
   * @return {void}
   */
  render(items) {
    this.listEl.innerHTML = "";
    this.#renderList(this.listEl, items, { withNewEntry: true });
    this.#initDnD(); // Comentario: activa DnD tras render
  }

  // inicializa drag & drop en la lista única
  #initDnD() {
    // Comentario: destruye instancias previas
    this._dndHandles.forEach((h) => {
      try {
        h.destroy?.();
      } catch {}
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

    this._dndHandles.push(attachListReorder(this.listEl, common));
  }

  // renderiza una OL completa
  #renderList(ol, data, { withNewEntry }) {
    const frag = document.createDocumentFragment();
    data.forEach((item) => frag.appendChild(this.#renderItem(item)));
    if (withNewEntry) frag.appendChild(this.#renderNewItemEntry());
    ol.appendChild(frag);
  }

  // crea <li> por item
  #renderItem(item) {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-start",
      attrs: { draggable: "true" },
    });
    li.dataset.id = item.id;

    const wrapper = el("div", {
      className: "position-relative d-flex align-items-top flex-grow-1",
    });

    const label = el("label", {
      className: "form-label me-auto mb-0",
      attrs: { for: `textarea-for-${item.id}` },
    });
    label.textContent = item.text;

    // Panel inline: sin data-role (mantiene solo clases visuales)
    const panel = el("div", {
      className: "d-flex flex-column ps-1 flex-grow-1 d-none",
    });

    // Textarea: aria-label "Edit step"; elimina name para coincidir con el layout
    const editor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor", // permitido en textarea
        "aria-label": "Edit step",
        rows: "1",
        id: `textarea-for-${item.id}`,
      },
    });

    // Comentario: acciones 
    const actions = el("div", { className: "d-flex flex-column mt-2 small" });
    const actionDefs = [
      ["save", "Save", "[Enter]"],
      ["discard", "Discard", "[Esc]"],
      ["delete", "Delete", "[Shift+Del]"],
    ];

    actionDefs.forEach(([key, text, hint, icono = false]) => {
      const anchorClassName =
        "text-decoration-none fw-bold mb-2 d-flex justify-content-between";
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
    wrapper.append(label, panel);

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

    li.append(wrapper, btnMove);

    // Comentario: listeners del item (solo edición inline)
    label.addEventListener("click", () => {
      // Comentario: prepara edición inline
      const currentText = label.textContent.trim();
      visibility.hide(label);
      visibility.show(panel, "d-flex");
      // Comentario: el contenido por defecto en el HTML de ejemplo es "Editing step",
      // aquí se carga el texto actual; si se desea un valor por defecto, se podría usar "Editing step".
      editor.value = currentText || "Editing step";

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
          editor.selectionStart = editor.selectionEnd = Math.min(
            pos,
            editor.value.length,
          );
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
    });

    return li;
  }

  // crea fila de nueva entrada
  #renderNewItemEntry() {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
    });
    li.dataset.role = "new-entry";
    li.draggable = false;

    // Comentario: input con placeholder/aria/name actualizados
    const input = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "Add new step",
        placeholder: "Add step [Enter]",
        "aria-label": "Add new step",
        enterkeyhint:"enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: {
        type: "button",
        title: "Add new step",
        "aria-label": "Add new step",
      },
      html: `<i class="bi bi-plus-lg fs-2" aria-hidden="true"></i>`,
    });

    const create = () => {
      const t = input.value.trim();
      if (!t) return;
      this.onCreate?.(t);
      // Comentario: limpia y refocus tras crear
      input.value = "";
      input.focus();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") create();
    });
    btnAdd.addEventListener("click", create);

    li.append(input, btnAdd);
    return li;
  }

  // API para enfocar input nuevo
  focusNewEntryInput() {
    const entry = qs(this.listEl, View.SEL.newEntryInput);
    if (entry) entry.focus({ preventScroll: true });
  }
}

/* ================================
 * Controller
 * ================================ */
class Controller {
  /**
   * @param {!HTMLElement} containerEl
   */
  constructor(containerEl) {
    // Comentario: define y almacena el nombre del componente que controla
    this.COMPONENT_NAME = "stepslist";

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
    // Comentario: onToggle eliminado (no hay estados)
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
 * renderStepslist(containerEl: HTMLElement)
 * - Called by coordinator.js passing the container where everything must be created.
 * - Reemplaza al antiguo renderChecklist.
 * @param {!HTMLElement} containerEl
 * @return {void}
 */
export function renderStepslist(containerEl) {
  // Comentario: valida el contenedor recibido
  if (!containerEl || !(containerEl instanceof HTMLElement)) {
    console.error("[stepslist] invalid container element");
    return;
  }
  // Comentario: crea layout y monta controlador sobre el contenedor
  new Controller(containerEl);
}
