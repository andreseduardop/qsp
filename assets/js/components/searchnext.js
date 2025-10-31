/**
 * @fileoverview UI module for the "Search Next" block (read-only link list).
 * Renders a simple card that mirrors searchnext.html:
 *   - <h2>search next</h2>
 *   - <div class="row" id="search-container">
 *       <aside class="col-12">
 *         <ul class="lh-base"> ... </ul>
 *       </aside>
 *     </div>
 *
 * No inline editor, no AI actions, no visibility toggling.
 *
 * @version 1.0.0
 *
 * Style: Google JavaScript Style Guide.
 */

import { el } from "../utils/helpers.js"; // crea elementos DOM (evita visibility) — ver helpers.js
import * as storage from "../core/storage.js"; // lee contenido del componente — ver storage.js

/** @typedef {{ topics: string[] }} SearchNextState */

/**
 * Modelo: encapsula lectura del estado del componente en storage.
 * (comentario) Lee `components.searchnext.content`; si está vacío, usa ["topic-1"].
 */
class Model {
  /** @return {SearchNextState} */
  get() {
    // (comentario) Lee contenido y normaliza a arreglo de strings
    let content = storage.getComponentContent("searchnext");
    if (!Array.isArray(content)) {
      // (comentario) Tolera objetos/strings heredados; normaliza a arreglo
      if (typeof content === "string") content = [content];
      else content = [];
    }
    const topics = content.length ? content : ["suggested topic for search"];
    return { topics: topics.map((t) => String(t).trim()).filter(Boolean) };
  }
}

/**
 * Vista: construye el DOM fijo (sin edición) y renderiza la lista de enlaces.
 */
class View {
  /**
   * @param {!HTMLElement} host
   */
  constructor(host) {
    /** @private @const */ this.host_ = host;

    // (comentario) Estructura de tarjeta y encabezado
    this.root_ = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });
    const title = el("h2", { html: "search next" }); 

    // (comentario) Contenedor principal con id "search-container"
    this.container_ = el("div", { className: "row", attrs: { id: "search-container" } });

    // (comentario) Aside con lista <ul.lh-base>
    this.aside_ = el("aside", { className: "col-12" });
    this.ul_ = el("ul", { className: "lh-lg" });
    this.aside_.append(this.ul_);

    // (comentario) Ensambla estructura
    this.container_.append(this.aside_);
    card.append(title, this.container_);
    this.root_.append(card);
    this.host_.append(this.root_);
  }

  /**
   * Renderiza la lista de temas como enlaces externos a Google.
   * @param {SearchNextState} state
   * @return {void}
   */
  render(state) {
    // (comentario) Limpia lista previa
    while (this.ul_.firstChild) this.ul_.removeChild(this.ul_.firstChild);

    // (comentario) Inserta <li><a class="external" target="_blank" href="...">texto</a></li>
    state.topics.forEach((topic) => {
      const q = encodeURIComponent(topic);
      const a = el("a", {
        className: "external",
        attrs: {
          href: `https://www.google.com/search?q=${q}`,
          target: "_blank",
        },
        html: topic,
      });

      const li = el("li");
      li.append(a);
      this.ul_.append(li);
    });
  }
}

/**
 * Controlador: conecta vista y modelo (solo lectura).
 */
class Controller {
  /** @param {!HTMLElement} host */
  constructor(host) {
    /** @private */ this.model_ = new Model();
    /** @private */ this.view_ = new View(host);

    // (comentario) Render inicial
    this.view_.render(this.model_.get());

    // (comentario) Re-render si cambia el almacenamiento del componente
    document.addEventListener("searchnext:change", () => {
      this.view_.render(this.model_.get());
    });
  }
}

/**
 * Public API — renderSearchNext para compatibilidad futura con coordinator.
 * @param {!HTMLElement} containerEl Mount point provided by coordinator.
 * @return {{ destroy: () => void }} Optional cleanup handle.
 */
export function renderSearchNext(containerEl) {
  // (comentario) Crea controlador; no registra listeners globales adicionales
  const controller = new Controller(containerEl);
  return {
    destroy() {
      // (comentario) No realiza limpieza adicional (no hay listeners globales aquí)
      void controller;
    },
  };
}
