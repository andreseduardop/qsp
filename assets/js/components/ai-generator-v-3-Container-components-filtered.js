/**
 * @fileoverview AI Generator (MVC) — opera sobre el layout ai-generator.html
 * y expone la función pública renderAiGenerator(host).
 * @version 1.0.1
 */

import { el, qs, qsa, visibility } from "../utils/helpers.js";
import { queryPrompt } from "./ai-tools/prompt-api.js";
// Comentario: importa las preguntas por tipo (lee JSON con assert)
import questions from "./ai-tools/questions.json" assert { type: "json" };
import toolsDescription from "./ai-tools/tools-description.json" assert { type: "json" };
import toolsContainer from "./ai-tools/tools-container.json" assert { type: "json" };

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
    const wrapper = el("div", { className: "ocultar" });
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

    const sugUl = wrapper.querySelector('ul[data-role="suggestions"]');
    const ul = sugUl?.querySelector("ul");
    if (sugUl) {
      sugUl.innerHTML = "";
      for (const s of data.suggestions || []) {
        const li = el("li", { className: "fs-4 mx-4", html: s });
        sugUl.appendChild(li);
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
      type: type,
      suggestions: Array.isArray(found?.suggestions) ? found.suggestions : [],
    };
    this.view_.mountSuggestions(data);
  }

  /**
  * @fileoverview Fix: makes cleanJson visible outside try/catch and guards on parse errors.
  * @version 1.0.2
  */
  /** @private */
  async onSubmitDetails_(text) {
    // (comentario) Guarda detalles en el modelo
    this.model_.patch({ eventDetails: text });

    // (comentario) Prepara prompt y consulta la API
    const { eventType, eventDetails } = this.model_.get();
    const toolsToText = JSON.stringify(toolsDescription);
    const promptText = `The user wants to plan an activity with the following characteristics. Activity to plan: ${eventType}. Activity details: ${eventDetails}. Determine which of the following tools are essential for planning that activity. Planning tools = ${toolsToText} Returns only an JSON containing the list of tool names. Output: Only generates a JSON. \noutputSchema = ['tool-name-1', 'tool-name-n']`;
    console.log(promptText);
    const jsonReceived = await queryPrompt(promptText);

    /** @type {unknown} */
    let cleanJson; // (comentario) Declara fuera del try para mantener el alcance

    try {
      // (comentario) Intenta limpiar y parsear el JSON recibido
      cleanJson = this.cleanJsonString_(jsonReceived);
      console.log("Resultado sin ```:", cleanJson);
    } catch (error) {
      // (comentario) Registra y aborta si el JSON no es válido
      console.error("Error al parsear el JSON:", /** @type {Error} */(error).message);
      return; // (comentario) Sale temprano; evita usar cleanJson indefinido
    }

    console.log("llamando a clone");
    // (comentario) Pasa el JSON (array o {names:[...]}); el método valida/lanza si es inválido
    const components = this.cloneAndFilterTools_(/** @type {any} */(cleanJson));
    console.log(components);
  }

  /**
   * Convierte una cadena de texto JSON que podría estar envuelta
   * en triples comillas invertidas (```) a un array de JavaScript.
   *
   * @param {string} rawString La cadena de texto que puede incluir ```.
   * @returns {Array<string>} El array de JavaScript resultante.
   * @throws {SyntaxError} Si la cadena de texto limpia no es un JSON válido.
   */
  cleanJsonString_(rawString) {
      // 1. Limpiar la cadena: Remover ``` del inicio y del final.
      // El patrón /^\s*```(json)?\s*|\s*```\s*$/g busca y elimina las
      // comillas invertidas y cualquier "json" opcional, incluyendo espacios.
    const cleanString = rawString.replace(/^\s*```(json)?\s*|\s*```\s*$/g, '');
      // 2. Convertir la cadena limpia a un objeto/array de JavaScript.
    return JSON.parse(cleanString);
  }

  /**
  * Returns a deep-cloned subset of tools from tools-container.json
  * keeping only the objects whose `name` is listed in `names`.
  *
  * @param {{names: string[]} | string[]} input - Object with `names` array, or the array itself.
  * @returns {Array<Object>} New array with filtered, deep-cloned tool objects.
  * @throws {TypeError} If `names` is missing or not an array of strings.
  */
  cloneAndFilterTools_(input) {
    // Comentario: normaliza la entrada; permite {names:[...]} o directamente [...]
    const names = Array.isArray(input) ? input : input?.names;

    // Comentario: valida que exista un arreglo de cadenas no vacío
    if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
      throw new TypeError("cloneAndFilterTools: `names` must be an array of strings");
    }

    // Comentario: obtiene fuente segura (arreglo) desde el JSON importado
    const source = Array.isArray(toolsContainer) ? toolsContainer : [];

    // Comentario: crea un Set para búsqueda O(1) y preserva comparación exacta
    const allowed = new Set(names);

    // Comentario: filtra por coincidencia exacta en la clave `name`
    const filtered = source.filter((tool) => tool && allowed.has(tool.name));

    // Comentario: clona profundamente para evitar efectos colaterales
    // Usa structuredClone si existe; si no, cae a JSON (suficiente para datos JSON puros)
    const deepClone = (obj) =>
    typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

    return deepClone(filtered);
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
