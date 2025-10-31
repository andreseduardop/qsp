/**
 * @fileoverview Team list UI module.
 * @module components/teamlist
 *
 * @description
 * Implements the new "team" layout replacing the former supplies-based UI.
 * Renders a single grid of Bootstrap cards ("row type-checkbox type-team g-3"
 * with "col-6" columns). Each person renders as a
 * <div class="card h-100 position-relative" data-id="..."> showing a person icon,
 * a role block (fw-semibold) and a name block, plus an inline panel for editing
 * both fields (two textareas: role + name). The new-entry row sits outside the
 * grid items in a horizontal card with two stacked inputs wrapped in
 * "d-flex flex-column flex-grow-1 gap-3" and a right-aligned add button titled
 * "Add new person". There are no checkboxes anymore.
 *
 * Persistence and behavior are analogous to the previous component: inline
 * editing and creation still work; there is no readiness toggle. Move support
 * remains available via the model.
 *
 * @version 2.1.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 *
 * @exports renderTeamList
 */

import { el, qs, qsa, visibility, flashBackground } from "../utils/helpers.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";

/* ================================
 * Model (component-scoped; delegates to storage.js)
 * ================================ */
/**
 * @typedef {Object} TeamItem
 * @property {string} id
 * @property {string} role
 * @property {string} name
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
   * @return {!Array<TeamItem>}
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
   * Adds a new team entry.
   * @param {string} role
   * @param {string} name
   * @return {void}
   */
  add(role, name) {
    // Comentario: agrega item si ambos campos tienen texto
    const r = String(role || "").trim();
    const n = String(name || "").trim();
    if (!r || !n) return;
    const items = this.getAll();
    items.push({ id: uid(), role: r, name: n });
    this._write(items);
  }

  /**
   * Updates fields of an item; removes it if both fields become empty.
   * @param {string} id
   * @param {{role?: string, name?: string}} fields
   * @return {void}
   */
  updateFields(id, fields) {
    // Comentario: actualiza rol/nombre; si ambos quedan vacíos, elimina
    const items = this.getAll();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;

    const current = items[idx];
    const next = {
      ...current,
      ...(fields.role !== undefined ? { role: String(fields.role || "").trim() } : {}),
      ...(fields.name !== undefined ? { name: String(fields.name || "").trim() } : {}),
    };

    if (!next.role && !next.name) {
      // Comentario: ambos vacíos → elimina
      items.splice(idx, 1);
    } else {
      items[idx] = next;
    }
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
    grid: "div.row.type-checkbox.type-team.g-3",
    itemCol: "div.col-6[data-id]",
    card: ".card[data-id]",
    newEntry: "[data-role='new-entry']",
    newEntryRoleInput: "[data-role='new-entry'] input[name='new-role']",
    newEntryNameInput: "[data-role='new-entry'] input[name='new-person']",
    roleText: "[data-role='role']",
    nameText: "[data-role='name']",
    btnAdd: "button.app-btn-add",
  };

  // Comentario: crea todo el layout y devuelve referencias clave
  static buildLayout(containerEl) {
    // Comentario: limpia contenedor destino
    containerEl.innerHTML = "";

    // Comentario: crea contenedor raíz y encabezado
    const col = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });
    const h2 = el("h2", { html: "team" });

    // Comentario: raíz lógica del componente
    const teamRoot = el("div", { attrs: { id: "teamlist-container" } });

    // Comentario: contenedor de grilla
    const grid = el("div", { className: "row type-checkbox type-team g-3" });

    // Comentario: header y ensamblado
    const header = el("div", { className: "d-flex align-items-center justify-content-between mb-2" });
    header.append(h2);

    const headerWrap = el("div", { className: "d-flex flex-column w-100" });
    headerWrap.append(header);

    teamRoot.append(grid);
    card.append(headerWrap, teamRoot);
    col.append(card);
    containerEl.append(col);

    return { root: teamRoot, grid };
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

  // Comentario: crea columna y tarjeta por item
  #renderItemCol(item) {
    const col = el("div", { className: "col-6" });
    col.dataset.id = item.id;

    const card = el("div", { className: "card h-100 position-relative", attrs: { "data-id": item.id } });
    const body = el("div", { className: "card-body p-2" });

    // Comentario: icono de persona
    const iconWrap = el("div");
    iconWrap.innerHTML = '<i class="bi bi-person"></i>';

    // Comentario: bloques de texto estáticos (rol y nombre)
    const roleDiv = el("div", { className: "fw-semibold text-center", attrs: { "data-role": "role" } });
    roleDiv.textContent = item.role;

    const nameDiv = el("div", { className: "text-center", attrs: { "data-role": "name" } });
    nameDiv.textContent = item.name;

    // Comentario: panel inline de edición (dos textareas)
    const panel = el("div", {
      className: "d-flex flex-column gap-3 mt-3 d-none",
      attrs: { "data-role": "inline-panel" },
    });

    const roleEditor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit person text",
        name: "inline-editor",
        rows: "1",
        id: `textarea-role-for-${item.id}`,
        placeholder: "Role",
      },
    });

    const nameEditor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit person text",
        name: "inline-editor",
        rows: "1",
        id: `textarea-name-for-${item.id}`,
        placeholder: "Name",
      },
    });

    const actions = el("div", { className: "d-flex flex-column small" });
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

    panel.append(roleEditor, nameEditor, actions);

    body.append(iconWrap, roleDiv, nameDiv, panel);
    card.append(body);
    col.append(card);

    // Comentario: inicia edición al activar cualquiera de los bloques de texto
    const startInlineEdit = () => {
      visibility.hide(roleDiv);
      visibility.hide(nameDiv);
      visibility.show(panel, "d-flex");
      roleEditor.value = roleDiv.textContent.trim();
      nameEditor.value = nameDiv.textContent.trim();

      // Comentario: auto-resize
      const autoresize = (ta) => {
        ta.style.height = "auto";
        ta.style.height = ta.scrollHeight + "px";
      };

      // Comentario: sanea saltos de línea → espacios
      const sanitizeNoNewlines = (ta) => {
        const sanitized = ta.value.replace(/\r?\n+/g, " ");
        if (sanitized !== ta.value) {
          const pos = ta.selectionStart;
          ta.value = sanitized;
          ta.selectionStart = ta.selectionEnd = Math.min(pos, ta.value.length);
        }
      };

      // Comentario: finaliza edición
      const finalize = (mode /* 'commit' | 'cancel' */) => {
        if (finalize._done) return;
        finalize._done = true;

        panel.removeEventListener("pointerdown", onAction);
        panel.removeEventListener("click", onAction);
        panel.removeEventListener("focusout", onFocusOut, true);
        roleEditor.removeEventListener("keydown", onKeyDown);
        nameEditor.removeEventListener("keydown", onKeyDown);
        roleEditor.removeEventListener("input", onInput);
        nameEditor.removeEventListener("input", onInput);

        if (mode === "commit") {
          const nextRole = roleEditor.value.trim();
          const nextName = nameEditor.value.trim();
          if (nextRole || nextName) this.onEdit?.(item.id, { role: nextRole, name: nextName });
          if (!nextRole && !nextName) this.onEdit?.(item.id, { role: "", name: "" }); // Comentario: vacío → eliminar
        }

        visibility.hide(panel);
        visibility.show(roleDiv);
        visibility.show(nameDiv);
      ;
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
          roleEditor.value = "";
          nameEditor.value = "";
          finalize("commit");
        }
      };

      const onInput = (e) => {
        const ta = e.target;
        sanitizeNoNewlines(ta);
        autoresize(ta);
      };
      // Comentario: confirma al hacer clic fuera del panel (focusout hacia fuera)
      const onFocusOut = (e) => {
        const next = e.relatedTarget;
        // Si el siguiente foco NO está dentro del panel, guarda (commit)
        if (!panel.contains(next)) {
          finalize("commit");
        }
      };

      const onAction = (ev) => {
        const a = ev.target.closest("a[data-action]");
        if (!a) return;
        ev.preventDefault();
        const act = a.dataset.action;
        if (act === "save") finalize("commit");
        else if (act === "discard") finalize("cancel");
        else if (act === "delete") {
          roleEditor.value = "";
          nameEditor.value = "";
          finalize("commit");
        }
      };

      panel.addEventListener("pointerdown", onAction);
      panel.addEventListener("click", onAction);
      panel.addEventListener("focusout", onFocusOut, true);
      roleEditor.addEventListener("keydown", onKeyDown);
      nameEditor.addEventListener("keydown", onKeyDown);
      roleEditor.addEventListener("input", onInput);
      nameEditor.addEventListener("input", onInput);

      // Comentario: foco inicial
      roleEditor.focus();
      autoresize(roleEditor);
      autoresize(nameEditor);
    

      // Comentario: foco inicial
      roleEditor.focus();
      autoresize(roleEditor);
      autoresize(nameEditor);
    };

    // Comentario: permite editar haciendo clic en rol o nombre
    roleDiv.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit();
    });
    nameDiv.addEventListener("click", (e) => {
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

    const inputsWrap = el("div", { className: "d-flex flex-column flex-grow-1 gap-3" });

    const roleInput = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-role",
        placeholder: "Add role",
        "aria-label": "Add role",
        enterkeyhint: "next",
      },
    });

    const nameInput = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "new-person",
        placeholder: "Add person [Enter]",
        "aria-label": "Add new person",
        enterkeyhint: "enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: { type: "button", title: "Add new person", "aria-label": "Add new person" },
      html: `<i class="bi bi-plus-lg fs-2" aria-hidden="true"></i>`,
    });

    const create = () => {
      const r = roleInput.value.trim();
      const n = nameInput.value.trim();
      if (!r || !n) return; // Comentario: requiere ambos campos
      this.onCreate?.(r, n);
    };

    roleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInput.focus();
      }
    });

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        create();
      }
    });

    btnAdd.addEventListener("click", create);

    inputsWrap.append(roleInput, nameInput);
    wrap.append(inputsWrap, btnAdd);
    col.append(wrap);
    return col;
  }

  // Comentario: API para enfocar input de nuevo nombre (segundo input)
  focusNewEntryInput() {
    const entry = qs(this.root, View.SEL.newEntryNameInput);
    if (entry) entry.focus({ preventScroll: true });
  }
}

/* ================================
 * Controller
 * ================================ */
class Controller {
  constructor(containerEl) {
    // Comentario: define y almacena el nombre del componente que controla
    this.COMPONENT_NAME = "teamlist";

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
    this.view.onCreate = (role, name) => {
      if (this.createInFlight) return;
      this.createInFlight = true;
      this.shouldRefocusNewEntry = true;
      this.model.add(role, name);
    };

    this.view.onEdit = (id, fields) => {
      const r = String(fields.role ?? "").trim();
      const n = String(fields.name ?? "").trim();
      if (!r && !n) this.model.remove(id);
      else this.model.updateFields(id, { role: r, name: n });
    };
  }
}

/* ================================
 * Public API
 * ================================ */

/**
 * renderTeamList(containerEl: HTMLElement)
 * - Called by coordinator.js passing the container where everything must be created.
 * @param {HTMLElement} containerEl
 * @return {void}
 */
export function renderTeamList(containerEl) {
  // Comentario: valida el contenedor recibido
  if (!containerEl || !(containerEl instanceof HTMLElement)) {
    console.error("[teamlist] invalid container element");
    return;
  }
  // Comentario: crea layout y monta controlador sobre el contenedor
  new Controller(containerEl);
}
