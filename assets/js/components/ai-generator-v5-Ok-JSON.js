/**
 * @fileoverview AI Generator (MVC) — operates over the existing layout
 *               defined in ai-generator.html and exposes renderAiGenerator(host).
 * @version 1.1.0
 */

// English code; comentarios en español (tercera persona)
// importa módulo node para reparar JSON
import { jsonrepair } from 'jsonrepair'
// Modelo
import modelTemplate from "../core/json/model.json" assert { type: "json" };
import { el, qs, qsa, visibility } from "../utils/helpers.js";
import { queryPrompt } from "./ai-tools/prompt-api.js";
// Comentario: importa preguntas y descripciones/containers (lee JSON con assert)
import questions from "./ai-tools/questions.json" assert { type: "json" };
import toolsDescription from "./ai-tools/tools-description.json" assert { type: "json" };
import toolsContainer from "./ai-tools/tools-container.json" assert { type: "json" };
import { uid } from "../utils/uid.js"; // Devuelve un identificadór único
// + NEW: persistencia del modelo generado
import { setProject } from "../core/storage.js"; // guarda el proyecto por id


/** @typedef {{ eventType: (string|null), eventDetails: (string|null) }} AiGenState */

/* ==========================================================================
 * Constants (no alteran el layout implícito)
 * =========================================================================*/
const IDS = /** @type {const} */ ({
  app: "app-ai-generator",
  screen1: "ai-generator-screen-1",
  tplInput: "ai-generator-input-template",
  tplSuggest: "ai-generator-suggestions-template",
});

const SELECTORS = /** @type {const} */ ({
  orderedList: "ol",
  inputName: 'input[name="ai-generator-input"]',
  qSpan: 'p[data-role="question"] span.fw-semibold',
  sugRoot: 'ul[data-role="suggestions"]',
  inlineEditor: 'textarea[data-role="inline-editor"], textarea[name="inline-editor"]',
  optionButton: "button[data-option]",
});

/* ==========================================================================
 * Utilities
 * =========================================================================*/
/**
 * Devuelve número máximo de opciones válidas leyendo los botones del layout.
 * @param {HTMLElement|null} ol
 * @return {number}
 */
function getMaxOption(ol) {
  // Comentario: calcula límite superior desde los botones disponibles
  if (!ol) return 0;
  const nums = qsa(ol, SELECTORS.optionButton)
    .map((b) => Number(b.getAttribute("data-option")))
    .filter((n) => Number.isInteger(n));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Aplica autoresize a un <textarea> (idempotente).
 * @param {HTMLTextAreaElement} ta
 */
function attachAutosize(ta) {
  // Comentario: ajusta alto en función del scrollHeight
  const autosize = () => {
    ta.style.height = "auto";
    ta.style.overflow = "hidden";
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener("input", autosize);
  autosize();
}

/**
 * Intenta extraer/parsear JSON desde una cadena posiblemente decorada.
 * Acepta bloques con ```json ... ```, BOM y texto antes/después.
 * @param {string} raw
 * @returns {unknown}
 * @throws {SyntaxError}
 */
function reapairAndParseJson(raw) {
  const jsonString = raw;
  let repairedJson;
  try {
    repairedJson = jsonrepair(jsonString);
  } catch (err) {
    console.error("Falla al intentar reparar jsonSting", err);
  }
  return JSON.parse(repairedJson);
}

/**
 * Clona profundamente valores JSON puros.
 * @template T
 * @param {T} v
 * @return {T}
 */
function deepClone(v) {
  // Comentario: usa structuredClone si existe; cae a JSON para datos puros
  return typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

/* ==========================================================================
 * Model
 * =========================================================================*/
class Model {
  constructor() {
    /** @private */ this._state = /** @type {AiGenState} */ ({
      eventType: null,
      eventDetails: null,
    });
  }
  /** @return {AiGenState} */
  get() {
    // Comentario: devuelve copia defensiva del estado
    return { ...this._state };
  }
  /** @param {Partial<AiGenState>} patch */
  patch(patch) {
    // Comentario: mezcla cambios superficialmente
    this._state = { ...this._state, ...patch };
  }
}

/* ==========================================================================
 * View
 * =========================================================================*/
class View {
  /**
   * @param {{
   *   onValidOption: (num: number, type: string) => void,
   *   onSubmitDetails: (text: string) => void,
   * }} handlers
   */
  constructor(handlers) {
    /** @private @const */ this._handlers = handlers;

    // Comentario: referencias del layout (no se cambian ids/clases)
    /** @private */ this._app = document.getElementById(IDS.app);
    /** @private */ this._screen1 = document.getElementById(IDS.screen1);
    /** @private */ this._ol = this._screen1?.querySelector(SELECTORS.orderedList) || null;
    /** @private */ this._tplInput = /** @type {?HTMLTemplateElement} */ (
      document.getElementById(IDS.tplInput)
    );
    /** @private */ this._tplSuggest = /** @type {?HTMLTemplateElement} */ (
      document.getElementById(IDS.tplSuggest)
    );

    /** @private */ this._inputEl = /** @type {HTMLInputElement|null} */ (null);
    /** @private */ this._listeners = /** @type {Array<() => void>} */ ([]);

    this._mountInput();
    this._bindOptionsList();
  }

  /** @private */
  _mountInput() {
    if (!this._app || !this._screen1 || !this._tplInput) return;

    // Comentario: muestra app quitando d-none
    visibility.setVisible(this._app, true);

    // Comentario: clona e inserta bloque de input
    const frag = this._tplInput.content.cloneNode(true);
    const wrapper = el("div");
    wrapper.appendChild(frag);
    this._screen1.appendChild(wrapper);

    // Comentario: referencia del input y handlers
    this._inputEl = /** @type {HTMLInputElement|null} */ (
      wrapper.querySelector(SELECTORS.inputName)
    );

    if (!this._inputEl) return;

    this._inputEl.focus();

    const onInput = () => {
      if (this._inputEl && this._inputEl.value.trim() !== "") {
        this._inputEl.classList.remove("animated");
      }
    };

    const onKey = (ev) => {
      if (!this._inputEl) return;
      if (ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();

      const raw = (this._inputEl.value || "").trim();
      const num = Number(raw);
      const maxOption = getMaxOption(this._ol);
      if (!Number.isInteger(num) || num < 1 || num > maxOption) {
        this._inputEl.value = "";
        this._inputEl.focus();
        return;
        }

      const type = this._getTypeByOption(num);
      if (!type) {
        this._inputEl.value = "";
        this._inputEl.focus();
        return;
      }
      this._inputEl.setAttribute("readonly", "");
      this._disableOptionsList();
      this._handlers.onValidOption(num, type);
    };

    this._inputEl.addEventListener("input", onInput);
    this._inputEl.addEventListener("keydown", onKey);

    // Comentario: guarda disposers
    this._listeners.push(() => this._inputEl?.removeEventListener("input", onInput));
    this._listeners.push(() => this._inputEl?.removeEventListener("keydown", onKey));
  }

  /** @private */
  _bindOptionsList() {
    if (!this._ol) return;

    const onClick = (ev) => {
      const btn = /** @type {HTMLElement|null} */ (
        ev.target instanceof HTMLElement ? ev.target.closest(SELECTORS.optionButton) : null
      );
      if (!btn || btn.classList.contains("disabled")) return;

      const num = Number(btn.getAttribute("data-option"));
      const type = btn.getAttribute("data-event-type") || "";
      const maxOption = getMaxOption(this._ol);
      if (!Number.isInteger(num) || num < 1 || num > maxOption || !type) return;

      if (this._inputEl) {
        this._inputEl.value = String(num);
        this._inputEl.classList.remove("animated");
        this._inputEl.setAttribute("readonly", "");
      }
      this._disableOptionsList();
      this._handlers.onValidOption(num, type);
    };

    this._ol.addEventListener("click", onClick);
    this._listeners.push(() => this._ol?.removeEventListener("click", onClick));
  }

  /** @private */
  _disableOptionsList() {
    if (!this._ol) return;
    // Comentario: desactiva todos los botones dentro de la <ol>
    qsa(this._ol, SELECTORS.optionButton).forEach((b) => b.classList.add("disabled"));
  }

  /** @private */
  _getTypeByOption(num) {
    if (!this._ol) return null;
    const btn = this._ol.querySelector(`button[data-option="${num}"]`);
    return btn?.getAttribute("data-event-type") || null;
  }

  /**
   * Inserta el bloque de sugerencias y devuelve el textarea de edición inline.
   * @param {{ question: string, suggestions: string[] }} data
   * @return {HTMLTextAreaElement|null}
   */
  mountSuggestions(data) {
    if (!this._tplSuggest || !this._screen1) return null;

    const frag = this._tplSuggest.content.cloneNode(true);
    const wrapper = el("div");
    wrapper.appendChild(frag);

    const qSpan = wrapper.querySelector(SELECTORS.qSpan);
    if (qSpan) qSpan.textContent = data.question;

    const sugRoot = /** @type {HTMLElement|null} */ (wrapper.querySelector(SELECTORS.sugRoot));
    if (sugRoot) {
      // Comentario: limpia y rellena con <li> por sugerencia
      sugRoot.innerHTML = "";
      for (const s of data.suggestions || []) {
        const li = el("li", { className: "fs-4 mx-4", html: s });
        sugRoot.appendChild(li);
      }
    }

    this._screen1.appendChild(wrapper);

    const ta = /** @type {HTMLTextAreaElement|null} */ (
      wrapper.querySelector(SELECTORS.inlineEditor)
    );

    if (!ta) return null;

    attachAutosize(ta);
    ta.focus();

    const onInput = () => {
      if (ta.value.trim() !== "") ta.classList.remove("animated");
    };

    const onKey = (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();
      const text = ta.value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
      if (!text) {
        ta.focus();
        return;
      }
      this._handlers.onSubmitDetails(text);
      ta.setAttribute("readonly", "");
    };

    ta.addEventListener("input", onInput);
    ta.addEventListener("keydown", onKey);

    this._listeners.push(() => ta.removeEventListener("input", onInput));
    this._listeners.push(() => ta.removeEventListener("keydown", onKey));

    return ta;
  }

  /** Limpia listeners de la vista */
  destroy() {
    // Comentario: ejecuta disposers registrados
    try {
      for (const off of this._listeners) off();
    } finally {
      this._listeners.length = 0;
    }
  }
}

/* ==========================================================================
 * Controller
 * =========================================================================*/
class Controller {
  constructor() {
    /** @private */ this._model = new Model();
    /** @private */ this._view = new View({
      onValidOption: (num, type) => this._onValidOption(num, type),
      onSubmitDetails: (text) => this._onSubmitDetails(text),
    });
  }

  /** @private */
  _onValidOption(_num, type) {
    // Comentario: guarda tipo y monta bloque de sugerencias
    this._model.patch({ eventType: type });

    const qa = Array.isArray(questions) ? questions : [];
    const found = qa.find((q) => q?.type === type);
    const data = {
      question: found?.question || "Please describe what you have in mind.",
      suggestions: Array.isArray(found?.suggestions) ? found.suggestions : [],
    };
    this._view.mountSuggestions(data);
  }

  /** @private */
  async _onSubmitDetails(text) {
    // Comentario: guarda detalles en el modelo
    this._model.patch({ eventDetails: text });

    const { eventType, eventDetails } = this._model.get();
    const toolsToText = JSON.stringify(toolsDescription);
    const promptText1 =
      `The user wants to plan an activity with the following characteristics. ` +
      `Activity to plan: ${eventType}. Activity details: ${eventDetails}- ` +
      `Determine which of the following tools are essential for planning that activity. ` +
      `Planning tools = ${toolsToText} Returns only a JSON containing the list of tool names. ` +
      `Output: Only generates a JSON.\noutputSchema = ['tool-name-1', 'tool-name-n']`;

    let componentsSelected;
    try {
      // Comentario: consulta la API y parsea de forma robusta
      console.debug("[ai-generator] llamanddo a Prompt API con prompt:\n", promptText1);
      componentsSelected = await queryPrompt(promptText1);
      console.debug("[ai-generator] componentes seleccionados por Prompt API, STRING:\n", componentsSelected);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ai-generator] failed to obtain/parse JSON:", err);
      return;
    }

    let parsedJson = reapairAndParseJson(String(componentsSelected));
    let components; // {Array<Object>} para componentes seleccionados
    try {
      // Comentario: filtra y clona componentes según nombres
      components = this._filterComponents(parsedJson);
      // eslint-disable-next-line no-console
      console.debug("[ai-generator] componentes seleccionados por Prompt API, OBJECT\n:", components);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ai-generator] invalid tools payload:", err);
    }

    const componentsToText = JSON.stringify(components);
    const promptText2 =
      `The user wants to plan an activity with the following characteristics. ` +
      `Activity to plan: ${eventType}. Activity details: ${eventDetails}.\n\n` +
      `INSTRUCTIONS:\n` +
      `1. The JSON output MUST be a complete array of objects. Each object MUST use ONLY the exact key names ("name", "description", "title", "content") as defined in the outputSchema.\n` +
      `2. The "content" key for each tool must be FILLED with RELEVANT data for the Activity details, matching the exact data type (object or array) and internal structure defined in the outputSchema.\n` +
      `3. DO NOT introduce new keys (like "tool-name", "duration", or "notes") or extra nesting levels not present in the outputSchema. DO NOT copy the placeholder content (e.g., "task 1"); generate new, specific content.\n` +
      `4. Output: Only generates a JSON.\n\n` +
      `outputSchema = ${componentsToText}`;

    let componentsContent;
    let componentsParsed;
    try {
      console.debug("[ai-generator] llamanddo a Prompt API con prompt:\n", promptText2);
      componentsContent = await queryPrompt(promptText2);
      console.debug("[ai-generator] components with content, STRING:\n", componentsContent);
      componentsParsed = reapairAndParseJson(String(componentsContent));
      console.debug("[ai-generator] parsed commponents with content, OBJECT: ", componentsParsed);
    } catch (err) {
      console.error("[ai-generator] invalid components payload:", err);
    }

    // ==== Build & persist model from template ====
    // Comentario: clona profundamente el template base del modelo
    const model = deepClone(modelTemplate); // usa helper local deepClone()
    // Comentario: genera un id único para el nuevo modelo
    const newId = uid();

    // Comentario: asigna el id y reemplaza la lista completa de componentes
    model.id = newId;
    model.components = Array.isArray(componentsParsed)
      ? deepClone(componentsParsed) // clona para mantener inmutabilidad
      : [];

    // Comentario: intenta persistir el nuevo proyecto en storage
    try {
      setProject(newId, model);
      console.debug(`[ai-generator] project saved: ${newId}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ai-generator] failed to save project:", err);
    }
  }

  /**
   * Retorna subconjunto clonado de tools-container.json acorde a `names`.
   * @param {{names: string[]} | string[]} input
   * @return {Array<Object>}
   */
  _filterComponents(input) {
    // Comentario: normaliza a arreglo de strings
    const names = Array.isArray(input) ? input : input?.names;

    if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
      throw new TypeError("[_filterComponents]: `names` deben ser un array de strings");
    }

    const source = Array.isArray(toolsContainer) ? toolsContainer : [];
    const allowed = new Set(names);
    const filtered = source.filter((tool) => tool && allowed.has(tool.name));
    return deepClone(filtered);
  }

  /** Limpia recursos del controlador */
  destroy() {
    // Comentario: delega en la vista; no mantiene listeners globales
    this._view.destroy();
  }
}

/* ==========================================================================
 * Public API
 * =========================================================================*/
/**
 * Public API — renderAiGenerator(host)
 * @param {!HTMLElement} _containerEl Mount point (no usa host, opera sobre layout existente)
 * @return {{ destroy: () => void }}
 */
export function renderAiGenerator(_containerEl) {
  const controller = new Controller();
  return {
    destroy() {
      // Comentario: desmonta listeners y limpia
      controller.destroy();
    },
  };
}
