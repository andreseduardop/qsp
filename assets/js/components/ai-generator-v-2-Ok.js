/**
 * @fileoverview AI Generator (MVC) — opera sobre el layout ai-generator.html
 * y expone la función pública renderAiGenerator(host).
 * @version 1.0.1
 */

import { el, qs, qsa, visibility } from "../utils/helpers.js";
// Comentario: importa las preguntas por tipo (lee JSON con assert)
import questions from "./ai-tools/questions.json" assert { type: "json" };

/** @typedef {{ eventType: (string|null), eventDetails: (string|null) }} AiGenState */

class Model {
  constructor() {
    /** @private */ this.state_ = /** @type {AiGenState} */ ({
      eventType: null,
      eventDetails: null,
    });
  }
  get() { return { ...this.state_ }; } // (comentario) Devuelve copia del estado
  patch(patch) { this.state_ = { ...this.state_, ...patch }; } // (comentario) Mezcla cambios
}

class View {
  /**
   * @param {{
   *   onValidOption: (num: number, type: string) => void,
   *   onSubmitDetails: (text: string) => void,
   * }} handlers
   */
  constructor(handlers) {
    /** @private @const */ this.handlers_ = handlers;

    // (comentario) Referencias del layout
    /** @private */ this.app_ = document.getElementById("app-ai-generator");
    /** @private */ this.screen1_ = document.getElementById("ai-generator-screen-1");
    /** @private */ this.ol_ = this.screen1_?.querySelector("ol");
    /** @private */ this.tplInput_ = document.getElementById("ai-generator-input-template");
    /** @private */ this.tplSuggest_ = document.getElementById("ai-generator-suggestions-template");
    /** @private */ this.inputEl_ = null;

    this.mountInput_();       // (comentario) Inserta el bloque de input
    this.bindOptionsList_();  // (comentario) Vincula clics de la lista
  }

  /** @private */
  mountInput_() {
    if (!this.app_ || !this.screen1_ || !this.tplInput_) return;

    // (comentario) Muestra app quitando d-none
    visibility.setVisible(this.app_, true);

    // (comentario) Clona el template y lo inserta en pantalla
    const frag = /** @type {HTMLTemplateElement} */ (this.tplInput_).content.cloneNode(true);
    const wrapper = el("div");
    wrapper.appendChild(frag);

    // 🔧 FIX: usa el nodo wrapper (sin comillas) — evita TypeError de appendChild
    this.screen1_.appendChild(wrapper);

    // (comentario) Toma referencia del input y configura handlers
    this.inputEl_ = wrapper.querySelector('input[name="ai-generator-input"]');
    if (this.inputEl_) {
      this.inputEl_.focus(); // (comentario) Enfoca de inmediato

      // (comentario) Quita .animated cuando hay texto
      this.inputEl_.addEventListener("input", () => {
        if (this.inputEl_.value.trim() !== "") this.inputEl_.classList.remove("animated");
      });

      // (comentario) Acepta Enter para validar opción 1..5
      this.inputEl_.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        const raw = (this.inputEl_.value || "").trim();
        const num = Number(raw);
        if (!Number.isInteger(num) || num < 1 || num > 5) {
          this.inputEl_.value = "";
          this.inputEl_.focus();
          return;
        }
        const type = this.getTypeByOption_(num);
        if (!type) {
          this.inputEl_.value = "";
          this.inputEl_.focus();
          return;
        }
        this.inputEl_.setAttribute("readonly", ""); // (comentario) Bloquea input
        this.disableOptionsList_();                 // (comentario) Desactiva lista
        this.handlers_.onValidOption(num, type);    // (comentario) Notifica selección
      });
    }
  }

  /** @private */
  bindOptionsList_() {
    if (!this.ol_) return;
    // (comentario) Maneja clics delegados en los botones de la lista
    this.ol_.addEventListener("click", (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest("button[data-option]");
      if (!btn || btn.classList.contains("disabled")) return;

      const num = Number(btn.getAttribute("data-option"));
      const type = btn.getAttribute("data-event-type") || "";
      if (!Number.isInteger(num) || num < 1 || num > 5 || !type) return;

      if (this.inputEl_) {
        this.inputEl_.value = String(num);
        this.inputEl_.classList.remove("animated");
        this.inputEl_.setAttribute("readonly", "");
      }
      this.disableOptionsList_(); // (comentario) Desactiva todas las opciones
      this.handlers_.onValidOption(num, type);
    });
  }

  /** @private */
  disableOptionsList_() {
    if (!this.ol_) return;
    // 🔧 Ajuste: desactiva todos los <button> dentro de la <ol>
    qsa(this.ol_, "button").forEach((b) => b.classList.add("disabled"));
  }

  /**
   * @private
   * @param {number} num
   * @return {string|null}
   */
  getTypeByOption_(num) {
    // (comentario) Busca botón por data-option y obtiene data-event-type
    if (!this.ol_) return null;
    const btn = this.ol_.querySelector(`button[data-option="${num}"]`);
    return btn?.getAttribute("data-event-type") || null;
  }

  /**
   * Inserta el bloque de sugerencias para un tipo dado.
   * @param {{ question: string, suggestions: string[] }} data
   * @return {HTMLTextAreaElement|null}
   */
  mountSuggestions(data) {
    if (!this.tplSuggest_ || !this.screen1_) return null;

    // (comentario) Clona template y ajusta contenidos
    const frag = /** @type {HTMLTemplateElement} */ (this.tplSuggest_).content.cloneNode(true);
    const wrapper = el("div");
    wrapper.appendChild(frag);

    const qSpan = wrapper.querySelector('p[data-role="question"] span.fw-semibold');
    if (qSpan) qSpan.textContent = data.question;

    const sugP = wrapper.querySelector('p[data-role="suggestions"]');
    const ul = sugP?.querySelector("ul");
    if (ul) {
      ul.innerHTML = "";
      for (const s of data.suggestions || []) {
        const li = el("li", { className: "fs-4 mx-4", html: s });
        ul.appendChild(li);
      }
    }

    this.screen1_.appendChild(wrapper); // (comentario) Inserta en pantalla

    // 🔧 Soporta <textarea data-role="inline-editor"> o name="inline-editor"
    const ta = /** @type {HTMLTextAreaElement} */ (
      wrapper.querySelector('textarea[data-role="inline-editor"], textarea[name="inline-editor"]')
    );

    if (ta) {
      // (comentario) Configura autoresize
      const autosize = () => {
        ta.style.height = "auto";
        ta.style.overflow = "hidden";
        ta.style.height = `${ta.scrollHeight}px`;
      };
      ta.addEventListener("input", autosize);
      ta.focus();
      autosize();

      // (comentario) Quita .animated cuando hay texto
      ta.addEventListener("input", () => {
        if (ta.value.trim() !== "") ta.classList.remove("animated");
      });

      // (comentario) Acepta Enter (sin Shift) para enviar detalles no vacíos
      ta.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || ev.shiftKey) return;
        ev.preventDefault();
        const text = ta.value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
        if (!text) {
          ta.focus();
          return;
        }
        this.handlers_.onSubmitDetails(text);
        ta.setAttribute("readonly", ""); // (comentario) Bloquea tras enviar
      });
    }

    return ta || null;
  }
}

class Controller {
  constructor() {
    /** @private */ this.model_ = new Model();
    /** @private */ this.view_ = new View({
      onValidOption: (num, type) => this.onValidOption_(num, type),
      onSubmitDetails: (text) => this.onSubmitDetails_(text),
    });
  }

  /** @private */
  onValidOption_(_num, type) {
    // (comentario) Guarda eventType y despliega pregunta/sugerencias
    this.model_.patch({ eventType: type });

    const qa = Array.isArray(questions) ? questions : [];
    const found = qa.find((q) => q?.type === type);
    const data = {
      question: found?.question || "Please describe what you have in mind.",
      suggestions: Array.isArray(found?.suggestions) ? found.suggestions : [],
    };
    this.view_.mountSuggestions(data);
  }

  /** @private */
  onSubmitDetails_(text) {
    // (comentario) Guarda detalles y publica en consola
    this.model_.patch({ eventDetails: text });

    const { eventType, eventDetails } = this.model_.get();
    // eslint-disable-next-line no-console
    console.log("[ai-generator] selection:", { eventType, eventDetails });
  }
}

/**
 * Public API — renderAiGenerator(host)
 * @param {!HTMLElement} _containerEl Mount point (no usa host, opera sobre layout existente)
 * @return {{ destroy: () => void }}
 */
export function renderAiGenerator(_containerEl) {
  const controller = new Controller(); // (comentario) Inicializa controlador

  return {
    destroy() {
      // (comentario) No deja listeners globales colgando
      void controller;
    },
  };
}
