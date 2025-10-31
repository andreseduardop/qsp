/**
 * @fileoverview AI Generator component (MVC) that operates over the
 * ai-generator layout and templates. Exposes renderAiGenerator(containerEl).
 * It asks the user to choose an event type (1..5 or click) and then shows a
 * follow-up question/options based on ./ai-tools/questions.json.
 *
 * @version 1.1.0
 */

import { el, qs, qsa, visibility } from "../utils/helpers.js";
// Comentario: importa el banco de preguntas por tipo (event, project, trip, class, else)
import QUESTIONS from "./ai-tools/questions.json" assert { type: "json" };

/** @typedef {{ eventType: (string|null), eventDetails: (string|null) }} AiGenState */

/**
 * Modelo: encapsula el estado volátil (no persiste en storage por ahora).
 * (comentario) Guarda 'eventType' y 'eventDetails' en memoria.
 */
class Model {
  constructor() {
    /** @private */ this.state_ = /** @type {AiGenState} */ ({
      eventType: null,
      eventDetails: null,
    });
  }

  /** @return {AiGenState} */
  get() {
    // (comentario) Devuelve copia defensiva del estado actual.
    return { ...this.state_ };
  }

  /**
   * @param {Partial<AiGenState>} patch
   * @return {void}
   */
  patch(patch) {
    // (comentario) Fusiona cambios y notifica opcionalmente si se necesitase.
    this.state_ = { ...this.state_, ...patch };
    document.dispatchEvent(new CustomEvent("ai-generator:change"));
  }
}

/**
 * Vista: construye/usa el layout de ai-generator.html y maneja plantillas.
 * (comentario) Inserta DOM necesario dentro del host y gestiona eventos UI.
 */
class View {
  /**
   * @param {!HTMLElement} host
   * @param {{
   *   onNumberSubmit: (n:number|string) => void,
   *   onTypeClick: (type:string) => void,
   *   onOptionsSubmit: (details:string) => void,
   * }} handlers
   */
  constructor(host, handlers) {
    /** @private @const */ this.host_ = host;
    /** @private @const */ this.handlers_ = handlers;

    // (comentario) Crea la estructura base siguiendo ai-generator.html
    this.root_ = el("div", { className: "col-12" });

    // (comentario) Crea la tarjeta como en el layout y la marca visible al iniciar
    this.card_ = el("div", {
      className:
        "app-card col app-scroll-enable overflow-y-auto app-vh-75 d-none",
    });

    const wrapper = el("div", { className: "app-ai-generator" });
    const h2 = el("h2", {
      className: "icon-none accordion-header d-none",
      attrs: {
        type: "button",
        "data-bs-toggle": "collapse",
        "data-bs-target": "#ai-generator-container",
        "aria-expanded": "true",
        "aria-controls": "ai-generator-container",
      },
    });
    h2.append(
      el("span", { html: "ai-generator" }),
      el("span", {
        className: "icon-collapsed float-end",
        attrs: { "aria-expanded": "true" },
        html: '<i class="bi bi-chevron-down"></i>',
      }),
      el("span", {
        className: "icon-not-collapsed float-end",
        attrs: { "aria-expanded": "false" },
        html: '<i class="bi bi-chevron-up"></i>',
      }),
    );

    // (comentario) Pantalla principal
    this.screen1_ = el("div", { attrs: { id: "ai-generator-screen-1" } });
    const headerBox = el("div", { className: "fw-semibold" });
    headerBox.append(
      el("div", { className: "linea-caracter" }),
      el("h3", {
        className: "fs-1 fw-semibold text-center",
        html: "What do you want to plan today?",
      }),
      el("div", { className: "linea-caracter" }),
    );

    // (comentario) Lista de opciones (ol) con 5 elementos
    this.ol_ = el("ol", { className: "fw-normal my-4" });
    const items = [
      { label: "An event", type: "event" },
      { label: "A project", type: "project" },
      { label: "A trip", type: "trip" },
      { label: "A class or lecture", type: "class" },
      { label: "Something else", type: "else" },
    ];
    items.forEach(({ label, type }) => {
      const li = el("li", { className: "fs-4 m-3" });
      const a = el("a", {
        className: "fw-normal",
        attrs: { role: "button", "data-event-type": type, href: "#" },
        html: label,
      });
      li.append(a);
      this.ol_.append(li);
    });

    // (comentario) Contenedor donde se apilan las interacciones
    this.stack_ = el("div", { className: "mt-2" });

    // (comentario) Ensambla jerarquía
    this.screen1_.append(headerBox, this.ol_, this.stack_);
    wrapper.append(h2, this.screen1_);
    this.card_.append(wrapper);
    this.root_.append(this.card_);
    this.host_.append(this.root_);

    // (comentario) Construye las plantillas en runtime (idénticas al layout)
    this.inputTpl_ = this.buildInputTemplate_();
    this.optionsTpl_ = this.buildOptionsTemplate_();

    // (comentario) Hace visible la tarjeta al iniciar (quita d-none)
    visibility.setVisible(this.card_, true);

    // (comentario) Configura listeners de la lista <ol>
    this.ol_.addEventListener("click", (ev) => {
      const a = /** @type {HTMLElement} */ (ev.target).closest(
        "a[data-event-type]",
      );
      if (!a) return;
      ev.preventDefault();
      const type = a.getAttribute("data-event-type");
      if (type) this.handlers_.onTypeClick(type);
    });
  }

  /**
   * Publica un bloque de input (clona la plantilla y ajusta copy).
   * @param {string} message Texto que se muestra en el primer <p> (instrucción).
   * @param {(value:string)=>void} onEnter Callback al presionar Enter.
   * @return {HTMLInputElement} El input creado (para control externo si se desea).
   */
  publishInput(message, onEnter) {
    // (comentario) Clona la plantilla de input y ajusta el mensaje
    const frag = /** @type {DocumentFragment} */ (
      this.inputTpl_.content.cloneNode(true)
    );
    const textP = frag.querySelector("p.fs-4");
    if (textP) textP.textContent = message;

    const input = /** @type {HTMLInputElement} */ (
      frag.querySelector('input[type="text"]')
    );

    // (comentario) Al escribir algo, retira .animated
    input.addEventListener("input", () => {
      if ((input.value ?? "").trim() !== "") {
        input.classList.remove("animated");
      }
    });

    // (comentario) Enter confirma opción de número
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onEnter?.(input.value.trim());
      }
    });

    // (comentario) Inserta y enfoca
    this.stack_.append(frag);
    input.focus();

    return input;
  }

  /**
   * Publica el bloque de opciones (pregunta + lista) basado en los datos.
   * @param {{question:string, options:string[]}} data
   * @param {(details:string)=>void} onSubmit
   * @return {HTMLInputElement} El input de detalles (para control externo).
   */
  publishOptions(data, onSubmit) {
    // (comentario) Clona plantilla de opciones
    const frag = /** @type {DocumentFragment} */ (
      this.optionsTpl_.content.cloneNode(true)
    );

    // (comentario) Inserta pregunta y opciones dentro del primer <p class="fs-4">
    const p = frag.querySelector("p.fs-4");
    if (p) {
      p.innerHTML = "";
      const spanQ = el("span", { className: "fw-semibold" });
      spanQ.textContent = data.question || "";
      const ul = el("ul", { className: "lh-base my-3" });
      for (const opt of data.options || []) {
        const li = el("li", { className: "mx-4" });
        li.textContent = opt;
        ul.append(li);
      }
      p.append(spanQ, ul);
    }

    // (comentario) Prepara el input de detalles (segundo <p> del template)
    const input = /** @type {HTMLInputElement} */ (
      frag.querySelector('p.fs-4 input[type="text"]')
    );

    // (comentario) Al escribir algo, retira .animated
    input.addEventListener("input", () => {
      if ((input.value ?? "").trim() !== "") {
        input.classList.remove("animated");
      }
    });

    // (comentario) Enter envía la respuesta (puede ser vacía)
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onSubmit?.(input.value.trim());
      }
    });

    // (comentario) Inserta y enfoca
    this.stack_.append(frag);
    input.focus();

    return input;
  }

  // ======= Helpers privados de construcción de templates =======

  /** @private @return {HTMLTemplateElement} */
  buildInputTemplate_() {
    // (comentario) Replica el template de ai-generator.html
    const tpl = document.createElement("template");
    tpl.id = "ai-generator-input-template";
    tpl.innerHTML = `
      <div class="my-5">
        <p class="fs-4">Select an option.</p>
        <p class="fs-4">
          <span class="app-icono-static fw-semibold">qsp</span>
          <input class="animated" type="text" name="ai-generator input" placeholder="▮">
        </p>
      </div>
    `.trim();
    return tpl;
  }

  /** @private @return {HTMLTemplateElement} */
  buildOptionsTemplate_() {
    // (comentario) Replica el template de opciones como en el layout
    const tpl = document.createElement("template");
    tpl.id = "ai-generator-options-template";
    tpl.innerHTML = `
      <div class="my-5">
        <p class="fs-4">
          <span class="fw-semibold"></span>
          <ul class="lh-base my-3"></ul>
        </p>
        <p class="fs-4">
          <span class="app-icono-static fw-semibold">qsp</span>
          <input class="animated" type="text" name="ai-generator input" placeholder="▮">
        </p>
      </div>
    `.trim();
    return tpl;
  }
}

/**
 * Controlador: orquesta el flujo de selección, validación y preguntas.
 */
class Controller {
  /** @param {!HTMLElement} host */
  constructor(host) {
    /** @private */ this.model_ = new Model();
    /** @private */ this.view_ = new View(host, {
      onNumberSubmit: (n) => this.onNumberSubmit_(n),
      onTypeClick: (type) => this.onTypeClick_(type),
      onOptionsSubmit: (details) => this.onOptionsSubmit_(details),
    });

    /** @private @type {HTMLInputElement|null} */
    this.numberInput_ = null;

    // (comentario) Publica el primer prompt pidiendo 1..5 (una sola vez)
    this.numberInput_ = this.view_.publishInput(
      "Please, select an option (1 to 5):",
      (value) => this.onNumberSubmit_(value),
    );
  }

  /**
   * @private
   * Maneja envío por teclado del número 1..5.
   * @param {string|number} value
   */
  onNumberSubmit_(value) {
    // (comentario) Normaliza valor y valida rango
    const n = Number(String(value ?? "").trim());
    const valid = Number.isInteger(n) && n >= 1 && n <= 5;

    if (!valid) {
      // (comentario) En vez de volver a publicar el mensaje, limpia el input,
      // añade de nuevo .animated y devuelve el foco.
      if (this.numberInput_) {
        this.numberInput_.value = "";
        this.numberInput_.classList.add("animated");
        this.numberInput_.focus();
      }
      return;
    }

    // (comentario) Mapea número a tipo y procede como si fuese clic
    const map = { 1: "event", 2: "project", 3: "trip", 4: "class", 5: "else" };
    const type = /** @type {any} */ (map)[n];
    this.commitType_(type);
  }

  /**
   * @private
   * Maneja clic sobre la lista <ol>.
   * @param {string} type
   */
  onTypeClick_(type) {
    // (comentario) Valida que el tipo esté entre los conocidos
    const ok = ["event", "project", "trip", "class", "else"].includes(type);
    if (!ok) {
      // (comentario) Si ocurre un tipo inesperado, simplemente ignora.
      if (this.numberInput_) {
        this.numberInput_.value = "";
        this.numberInput_.classList.add("animated");
        this.numberInput_.focus();
      }
      return;
    }
    this.commitType_(type);
  }

  /**
   * @private
   * Fija el tipo, busca pregunta/opciones y publica el bloque de opciones.
   * @param {string} type
   */
  commitType_(type) {
    // (comentario) Guarda eventType en el modelo
    this.model_.patch({ eventType: type });

    // (comentario) Busca en QUESTIONS el objeto con type == eventType
    const found =
      Array.isArray(QUESTIONS) &&
      QUESTIONS.find((q) => q && q.type === type);

    const data = {
      question:
        found?.question ||
        "Could you share more details, please?",
      options: Array.isArray(found?.options) ? found.options : [],
    };

    // (comentario) Publica template de opciones y espera Enter
    this.view_.publishOptions(data, (details) => this.onOptionsSubmit_(details));
  }

  /**
   * @private
   * Recibe los detalles (puede ser cadena vacía) y reporta en consola.
   * @param {string} details
   */
  onOptionsSubmit_(details) {
    // (comentario) Permite respuestas en blanco; solo guarda y loguea
    this.model_.patch({ eventDetails: details ?? "" });

    const { eventType, eventDetails } = this.model_.get();
    // eslint-disable-next-line no-console
    console.log("[ai-generator] eventType:", eventType);
    // eslint-disable-next-line no-console
    console.log("[ai-generator] eventDetails:", eventDetails);
  }
}

/**
 * Public API — renderAiGenerator para compatibilidad con coordinator.js.
 * @param {!HTMLElement} containerEl Mount point provided by coordinator.
 * @return {{ destroy: () => void }} Optional cleanup handle.
 */
export function renderAiGenerator(containerEl) {
  // (comentario) Crea controlador y devuelve un handle de limpieza opcional.
  const controller = new Controller(containerEl);
  return {
    destroy() {
      // (comentario) No se adjuntan listeners globales, no hay limpieza especial.
      void controller;
    },
  };
}
