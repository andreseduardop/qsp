/**
 * @fileoverview Renderiza el sidebar con la lista de proyectos y el botón "New Plan".
 * Expone la función pública renderSidebar(containerEl).
 * Interactúa con storage.getProjectList() y storage.isProjectActive().
 * @module components/sidebar
 * @version 1.1.0
 */

import { el } from "../utils/helpers.js"; // (comentario) Crea nodos DOM de forma segura
import * as storage from "../core/storage.js"; // (comentario) Lee/consulta estado de proyectos

/** @typedef {{ id: string, title: string }} ProjectEntry */
/** @typedef {{ projects: Array<ProjectEntry> }} SidebarModelState */

/** (comentario) Escapa selectores de forma segura con fallback si CSS.escape no existe */
function esc(sel) {
  // (comentario) Utiliza CSS.escape cuando está disponible
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(sel);
  }
  // (comentario) Fallback mínimo para atributos data-id
  return String(sel).replace(/"/g, '\\"');
}

class Model {
  /** @return {SidebarModelState} */
  get() {
    // (comentario) Obtiene y normaliza la lista de proyectos
    const raw = storage.getProjectList();
    const list = Array.isArray(raw?.projects) ? raw.projects : [];
    const projects = list
      .map((p) => {
        const id = String(p?.id ?? "").trim();
        const title = String(p?.title ?? p?.name ?? "").trim();
        return id && title ? { id, title } : null;
      })
      .filter(Boolean);
    return { projects };
  }
}

class View {
  /**
   * @param {!HTMLElement} host
   * @param {{ onItemClick?: (id:string) => void, onNewClick?: () => void }} handlers
   */
  constructor(host, handlers = {}) {
    /** @private @const */ this.host_ = host;
    /** @private @const */ this.handlers_ = handlers;
    /** @private */ this.activeId_ = null;

    // (comentario) Limpia el contenedor de destino
    this.host_.textContent = "";

    // (comentario) Crea estructura base del sidebar
    const row = el("div", { className: "row g-0" });

    // (comentario) Columna del botón "New Plan"
    const colBtn = el("div", { className: "col-12" });
    const btnNew = el("button", {
      className:
        "btn fw-semibold fs-4 d-flex align-items-center border-0 w-100 mb-3 p-0",
      attrs: { type: "button" },
    });
    const icon = el("i", { className: "bi bi-pencil-square me-2" });
    const span = el("span", { html: "New Plan" });
    btnNew.append(icon, span);
    btnNew.addEventListener("click", () => {
      if (typeof this.handlers_.onNewClick === "function") {
        this.handlers_.onNewClick();
      }
    });
    colBtn.append(btnNew);

    // (comentario) Columna del menú de proyectos
    const colMenu = el("div", { className: "col-12" });
    this.menu_ = el("menu", {
      className: "list-group list-group-flush fw-normal col-12 mt-0",
    });
    colMenu.append(this.menu_);

    // (comentario) Inserta en el host
    row.append(colBtn, colMenu);
    this.host_.append(row);

    // (comentario) Delegación de clic para los items del menú
    this.menu_.addEventListener("click", (ev) => {
      const a = /** @type {HTMLElement} */ (ev.target).closest("a[data-id]");
      if (!a) return;
      ev.preventDefault();

      const id = a.getAttribute("data-id");
      if (!id) return;

      // (comentario) Marca de forma inmediata el nuevo activo en UI
      this.setActive_(id);

      // (comentario) Notifica al controlador la selección
      if (typeof this.handlers_.onItemClick === "function") {
        this.handlers_.onItemClick(id);
      }
    });
  }

  /**
   * @param {SidebarModelState} state
   * @return {void}
   */
  render(state) {
    // (comentario) Reconstruye el menú de proyectos
    this.menu_.textContent = "";
    const items = Array.isArray(state?.projects) ? state.projects : [];

    for (const p of items) {
      const isActive = storage.isProjectActive(p.id);

      const li = el("li", {
        className:
          "list-group-item list-group-item-action border border-0 my-1 p-0",
      });

      const a = el("a", {
        className: "text-body fw-normal d-block py-2 px-1",
        attrs: {
          href: `/#${encodeURIComponent(p.id)}`,
          "data-id": p.id,
          ...(isActive ? { "aria-current": "true" } : {}),
        },
      });

      const span = el("span", {
        className: `stretched-link${isActive ? " fw-semibold" : ""}`,
        html: p.title,
      });

      a.append(span);
      li.append(a);
      this.menu_.append(li);

      // (comentario) Sincroniza activeId_ para futuras actualizaciones optimistas
      if (isActive) this.activeId_ = p.id;
    }
  }

  /**
   * (comentario) Marca el elemento como activo en el UI sin re-render completo
   * @param {string} id
   */
  setActive_(id) {
    // (comentario) Desmarca el activo previo
    const prevA = this.menu_.querySelector('a[aria-current="true"]');
    if (prevA) {
      prevA.removeAttribute("aria-current");
      const prevSpan = prevA.querySelector(".stretched-link.fw-semibold");
      if (prevSpan) prevSpan.classList.remove("fw-semibold");
    }

    // (comentario) Marca el nuevo activo
    const nextA = this.menu_.querySelector(`a[data-id="${esc(id)}"]`);
    if (nextA) {
      nextA.setAttribute("aria-current", "true");
      const span = nextA.querySelector(".stretched-link");
      if (span && !span.classList.contains("fw-semibold")) {
        span.classList.add("fw-semibold");
      }
      this.activeId_ = id;
    }
  }
}

class Controller {
  /** @param {!HTMLElement} host */
  constructor(host) {
    /** @private */ this.model_ = new Model();
    /** @private */ this.view_ = new View(host, {
      onItemClick: (id) => this.onItemClick_(id),
      onNewClick: () => this.onNewClick_(),
    });

    // (comentario) Render inicial
    this.view_.render(this.model_.get());

    // (comentario) Refresca menú al crear un proyecto
    this.onProjectCreated_ = () => {
      this.view_.render(this.model_.get());
    };
    window.addEventListener("app:project-created", this.onProjectCreated_);

    // (comentario) Re-sincroniza marcado cuando cambia el proyecto activo en otra parte
    this.onActiveProjectChanged_ = (ev) => {
      const id = ev?.detail?.id;
      if (id) {
        this.view_.setActive_(id);
      } else {
        // (comentario) Si no llega id, re-renderiza por seguridad
        this.view_.render(this.model_.get());
      }
    };
    window.addEventListener(
      "app:active-project-changed",
      this.onActiveProjectChanged_
    );
  }

  /** @private @param {string} id */
  onItemClick_(id) {
    // (comentario) Emite evento de selección; la persistencia la gestiona el coordinador
    const ev = new CustomEvent("app:select-project", {
      detail: { id, source: "sidebar" },
    });
    window.dispatchEvent(ev);
  }

  /** @private */
  onNewClick_() {
    // (comentario) Emite evento de solicitud de creación de nuevo plan
    const ev = new CustomEvent("app:new-plan-requested", {
      detail: { source: "sidebar" },
    });
    window.dispatchEvent(ev);
  }
}

/**
 * @param {!HTMLElement} containerEl
 * @return {{ destroy: () => void }}
 */
export function renderSidebar(containerEl) {
  // (comentario) Valida el contenedor
  if (!(containerEl instanceof HTMLElement)) {
    throw new TypeError("[sidebar] renderSidebar(containerEl) expects an HTMLElement");
  }
  const controller = new Controller(containerEl);
  return {
    destroy() {
      // (comentario) Limpia listeners globales al destruir
      window.removeEventListener("app:project-created", controller.onProjectCreated_);
      window.removeEventListener(
        "app:active-project-changed",
        controller.onActiveProjectChanged_
      );
    },
  };
}
