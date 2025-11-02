/**
 * @fileoverview AI Generator (MVC) — operates over the existing layout
 *               defined in ai-generator.html and exposes renderAiGenerator(host).
 * @version 1.3.0
 *
 * Design notes
 * - Preserves the implicit DOM layout (IDs, classes, templates) — no structural changes.
 * - English code; comentarios en español (tercera persona del singular).
 * - MVC organization with minimal coupling between layers.
 * - Robust JSON repair/parse helpers to handle LLM responses safely.
 */

import { jsonrepair } from 'jsonrepair'; // repara JSON malformado
import modelTemplate from '../core/json/model.json' assert { type: 'json' };
import { el, qs, qsa, visibility } from '../utils/helpers.js';
import { promptApi } from './ai-tools/prompt-api.js';
import questions from './ai-tools/questions.json' assert { type: 'json' };
import toolsDescription from './ai-tools/tools-description.json' assert { type: 'json' };
import { uid } from '../utils/uid.js'; // genera identificador único
import { setProject, addProjectToList } from '../core/storage.js'; 
// persiste el proyecto por id
// añade/actualiza en projectList (upsert)
import toolsContainer from './ai-tools/tools-container.json' assert { type: 'json' };

//    
/** @typedef {{ eventType: (string|null), eventDetails: (string|null) }} AiGenState */

/* ==========================================================================
 * Constants (no alteran el layout implícito)
 * ========================================================================= */
const IDS = /** @type {const} */ ({
  app: 'app-ai-generator',
  screen1: 'ai-generator-screen-1',
  tplInput: 'ai-generator-input-template',
  tplSuggest: 'ai-generator-suggestions-template',
});

const SELECTORS = /** @type {const} */ ({
  orderedList: 'ol',
  inputName: 'input[name="ai-generator-input"]',
  qSpan: 'p[data-role="question"] span.fw-semibold',
  sugRoot: 'ul[data-role="suggestions"]',
  inlineEditor:
    'textarea[data-role="inline-editor"], textarea[name="inline-editor"]',
  optionButton: 'button[data-option]',
});
/** @const {string} */
const SECTION_NEW_PLAN = "section-new-plan";
/** @const {string} */
const APP_AI_GENERATOR = "app-ai-generator";
/** @const {string} */
const STREAMING_SCREEN = "streaming-screen";

/* ==========================================================================
 * Utilities
 * ========================================================================= */

function getMaxOption(ol) {
  // Comentario: calcula límite superior desde los botones disponibles
  if (!ol) return 0;
  const nums = qsa(ol, SELECTORS.optionButton)
    .map((b) => Number(b.getAttribute('data-option')))
    .filter((n) => Number.isInteger(n));
  return nums.length ? Math.max(...nums) : 0;
}

function attachAutosize(ta) {
  // Comentario: ajusta alto en función del scrollHeight
  const autosize = () => {
    ta.style.height = 'auto';
    ta.style.overflow = 'hidden';
    ta.style.height = `${ta.scrollHeight}px`;
  };
  ta.addEventListener('input', autosize);
  autosize();
}

function extractJsonSnippet(raw) {
  // Comentario: intenta extraer contenido entre fences ```json ... ```
  const fence = raw.match(/```json([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();
  // Comentario: elimina BOM y espacios laterales
  return raw.replace(/^\uFEFF/, '').trim();
}

function repairAndParseJson(raw) {
  // Comentario: extrae fragmento probable y repara JSON
  const snippet = extractJsonSnippet(String(raw));
  let repaired = snippet;
  try {
    repaired = jsonrepair(snippet);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ai-generator] falla al intentar reparar JSON:', err);
  }
  return JSON.parse(repaired);
}

function deepClone(v) {
  // Comentario: usa structuredClone si existe; cae a JSON para datos puros
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

/* ==========================================================================
 * Sretreaming screen and Backdrop
 * ========================================================================= */
function streamingScreen() {
  const temp = document.getElementById(APP_AI_GENERATOR);
  if (temp) temp.classList.add("d-none");
  const appAiGenerator = document.getElementById(APP_AI_GENERATOR);
  if (appAiGenerator) appAiGenerator.classList.add("d-none");
  // Comentario: evita duplicados si ya existe un backdrop activo
  let node = document.getElementById(STREAMING_SCREEN);
  if (node) node.classList.remove("d-none");
  if (!node) {
    node = el("div", {
          className: "app-card col app-scroll-enable overflow-y-auto app-vh-75",
          attrs: { "data-id": String(item.id), id: STREAMING_SCREEN },
        });
    // Comentario: inserta justo antes del cierre de </body> (último hijo)
    document.body.appendChild(node);
  }
  // Comentario: devuelve función que elimina el backdrop de forma segura
  return () => {
    try { node.remove(); } catch { /* no-op */ }
  };

  // const = 
}
// Comentario: monta un backdrop al final del <body> y devuelve un disposer para retirarlo
function mountBackdrop() {
  // Comentario: evita duplicados si ya existe un backdrop activo
  let node = document.querySelector('.app-backdrop');
  if (!node) {
    node = document.createElement('div');
    node.className = 'app-backdrop'; // requerido por la solicitud
    // Comentario: inserta justo antes del cierre de </body> (último hijo)
    document.body.appendChild(node);
  }
  // Comentario: devuelve función que elimina el backdrop de forma segura
  return () => {
    try { node.remove(); } catch { /* no-op */ }
  };
}
// Comentario: mapa débil para registrar temporizadores pendientes por contenedor
const pendingTimers = new WeakMap();

/**
 * Updates/creates the backdrop title & subtitle inside `.app-backdrop`.
 * If the subtitle already has text and it changes, both texts remain visible
 * for 2 seconds, then the title updates and the subtitle plays fade-out → swap → fade-in.
 * (Sin WeakMap: usa una propiedad _fxState en el elemento <span> del subtítulo)
 * @param {string} title    - Text for <span class="backdrop-title">
 * @param {string} subtitle - Text for <span class="backdrop-subtitle">
 * @returns {{container: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement}}
 */
export function setBackdropText(title, subtitle) {
  // Comentario: normaliza entradas
  const t = title == null ? "" : String(title);
  const s = subtitle == null ? "" : String(subtitle);

  // Comentario: obtiene o crea contenedor
  let container = document.querySelector(".app-backdrop");
  if (!container) {
    container = document.createElement("div");
    container.className = "app-backdrop";
    document.body.appendChild(container);
  }

  // Comentario: obtiene o crea <span> título
  let titleEl = container.querySelector(".backdrop-title");
  if (!titleEl) {
    titleEl = document.createElement("span");
    titleEl.className = "backdrop-title";
    container.appendChild(titleEl);
  }

  // Comentario: obtiene o crea <span> subtítulo
  let subtitleEl = container.querySelector(".backdrop-subtitle");
  if (!subtitleEl) {
    subtitleEl = document.createElement("span");
    subtitleEl.className = "backdrop-subtitle";
    container.appendChild(subtitleEl);
  }

  // Comentario: inicializa/recupera estado local en el propio elemento
  subtitleEl._fxState ||= {};
  const { delayId, fadeOutEnd } = subtitleEl._fxState;

  // Comentario: limpia cualquier temporizador/handler previo
  if (delayId) clearTimeout(delayId);
  if (fadeOutEnd) subtitleEl.removeEventListener("animationend", fadeOutEnd);
  subtitleEl.classList.remove("is-fading-out");
  subtitleEl.style.animation = ""; // Comentario: asegura estado base limpio

  // Comentario: determina si debe esperar 2s (ya tiene texto y va a cambiar)
  const subtitleHasText = !!subtitleEl.textContent;
  const subtitleChanges = subtitleEl.textContent !== s;

  // Comentario: función que aplica el cambio inmediato (sin espera/animación de salida)
  const applyImmediate = () => {
    titleEl.textContent = t;
    subtitleEl.textContent = s;

    // Comentario: re-dispara la animación de entrada de forma fiable
    subtitleEl.style.animation = "none";
    // eslint-disable-next-line no-unused-expressions
    subtitleEl.offsetWidth; // Comentario: fuerza reflow
    subtitleEl.style.animation = ""; // Comentario: permite reglas CSS existentes
    const animName = getComputedStyle(subtitleEl).animationName;
    if (!animName || animName === "none") {
      subtitleEl.style.animation = "fadeIn 1s ease-out forwards";
      subtitleEl.addEventListener("animationend", () => {
        subtitleEl.style.animation = "";
      }, { once: true });
    }
  };

  // Comentario: si no hay que esperar (no cambia subtítulo, o no hay texto previo)
  if (!(subtitleHasText && subtitleChanges)) {
    applyImmediate();
    subtitleEl._fxState = {};
    return { container, titleEl, subtitleEl };
  }

  // Comentario: hay texto previo y cambia → mantiene visibles 2s y luego animación de salida
  const onFadeOutEnd = () => {
    // Comentario: termina fadeOut
    subtitleEl.removeEventListener("animationend", onFadeOutEnd);
    subtitleEl.classList.remove("is-fading-out");

    // Comentario: cambia textos (título ya se actualizó al iniciar fadeOut)
    subtitleEl.textContent = s;

    // Comentario: re-inicia animación de entrada
    subtitleEl.style.animation = "none";
    // eslint-disable-next-line no-unused-expressions
    subtitleEl.offsetWidth; // Comentario: fuerza reflow
    subtitleEl.style.animation = "";
    const animName = getComputedStyle(subtitleEl).animationName;
    if (!animName || animName === "none") {
      subtitleEl.style.animation = "fadeIn 1s ease-out forwards";
      subtitleEl.addEventListener("animationend", () => {
        subtitleEl.style.animation = "";
      }, { once: true });
    }

    // Comentario: limpia estado
    subtitleEl._fxState = {};
  };

  const id = setTimeout(() => {
    // Comentario: tras 2s, actualiza título y dispara fadeOut del subtítulo
    titleEl.textContent = t;
    subtitleEl.addEventListener("animationend", onFadeOutEnd, { once: true });
    subtitleEl.classList.add("is-fading-out");
  }, 2000);

  // Comentario: guarda referencias en el propio elemento
  subtitleEl._fxState = { delayId: id, fadeOutEnd: onFadeOutEnd };

  return { container, titleEl, subtitleEl };
}


/* ==========================================================================
 * Model
 * ========================================================================= */
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
 * ========================================================================= */
class View {
  /**
   * @param {{
   *   onValidOption: (num: number, type: string) => void,
   *   onSubmitDetails: (text: string) => Promise<string|undefined>,
   * }} handlers
   */
  constructor(handlers) {
    /** @private @const */ this._handlers = handlers;

    // Comentario: referencias del layout (no se cambian ids/clases)
    /** @private */ this._app = document.getElementById(IDS.app);
    /** @private */ this._screen1 = document.getElementById(IDS.screen1);
    /** @private */ this._ol =
      this._screen1?.querySelector(SELECTORS.orderedList) || null;
    /** @private */ this._tplInput =
      /** @type {?HTMLTemplateElement} */ (document.getElementById(IDS.tplInput));
    /** @private */ this._tplSuggest =
      /** @type {?HTMLTemplateElement} */ (document.getElementById(IDS.tplSuggest));

    /** @private */ this._inputEl =
      /** @type {HTMLInputElement|null} */ (null);
    /** @private */ this._listeners =
      /** @type {Array<() => void>} */ ([]);

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
    const wrapper = el('div', { className: "ocultar" });
    wrapper.appendChild(frag);
    this._screen1.appendChild(wrapper);

    // Comentario: referencia del input y handlers
    this._inputEl = /** @type {HTMLInputElement|null} */ (
      wrapper.querySelector(SELECTORS.inputName)
    );
    if (!this._inputEl) return;

    this._inputEl.focus();

    const onInput = () => {
      if (this._inputEl && this._inputEl.value.trim() !== '') {
        this._inputEl.classList.remove('animated');
      }
    };

    const onKey = (ev) => {
      if (!this._inputEl) return;
      if (ev.key !== 'Enter' || ev.shiftKey) return;
      ev.preventDefault();

      const raw = (this._inputEl.value || '').trim();
      const num = Number(raw);
      const maxOption = getMaxOption(this._ol);
      if (!Number.isInteger(num) || num < 1 || num > maxOption) {
        this._inputEl.value = '';
        this._inputEl.focus();
        return;
      }

      const type = this._getTypeByOption(num);
      if (!type) {
        this._inputEl.value = '';
        this._inputEl.focus();
        return;
      }
      this._inputEl.setAttribute('readonly', '');
      this._disableOptionsList();
      this._handlers.onValidOption(num, type);
    };

    this._inputEl.addEventListener('input', onInput);
    this._inputEl.addEventListener('keydown', onKey);

    // Comentario: guarda disposers
    this._listeners.push(() =>
      this._inputEl?.removeEventListener('input', onInput),
    );
    this._listeners.push(() =>
      this._inputEl?.removeEventListener('keydown', onKey),
    );
  }

  /** @private */
  _bindOptionsList() {
    if (!this._ol) return;

    const onClick = (ev) => {
      const btn = /** @type {HTMLElement|null} */ (
        ev.target instanceof HTMLElement
          ? ev.target.closest(SELECTORS.optionButton)
          : null
      );
      if (!btn || btn.classList.contains('disabled')) return;

      const num = Number(btn.getAttribute('data-option'));
      const type = btn.getAttribute('data-event-type') || '';
      const maxOption = getMaxOption(this._ol);
      if (!Number.isInteger(num) || num < 1 || num > maxOption || !type) return;

      if (this._inputEl) {
        this._inputEl.value = String(num);
        this._inputEl.classList.remove('animated');
        this._inputEl.setAttribute('readonly', '');
      }
      this._disableOptionsList();
      this._handlers.onValidOption(num, type);
    };

    this._ol.addEventListener('click', onClick);
    this._listeners.push(() => this._ol?.removeEventListener('click', onClick));
  }

  /** @private */
  _disableOptionsList() {
    if (!this._ol) return;
    // Comentario: desactiva todos los botones dentro de la <ol>
    qsa(this._ol, SELECTORS.optionButton).forEach((b) =>
      b.classList.add('disabled'),
    );
  }

  /** @private */
  _getTypeByOption(num) {
    if (!this._ol) return null;
    const btn = this._ol.querySelector(`button[data-option="${num}"]`);
    return btn?.getAttribute('data-event-type') || null;
  }

  /**
   * Inserta el bloque de sugerencias y devuelve el textarea de edición inline.
   * @param {{ question: string, suggestions: string[] }} data
   * @return {HTMLTextAreaElement|null}
   */
  mountSuggestions(data) {
    if (!this._tplSuggest || !this._screen1) return null;

    const frag = this._tplSuggest.content.cloneNode(true);
    const wrapper = el('div');
    wrapper.appendChild(frag);

    const qSpan = wrapper.querySelector(SELECTORS.qSpan);
    if (qSpan) qSpan.textContent = data.question;

    const sugRoot = /** @type {HTMLElement|null} */ (
      wrapper.querySelector(SELECTORS.sugRoot)
    );
    if (sugRoot) {
      // Comentario: limpia y rellena con <li> por sugerencia
      sugRoot.innerHTML = '';
      for (const s of data.suggestions || []) {
        const li = el('li', { className: 'fs-4 mx-4', html: s });
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
      if (ta.value.trim() !== '') ta.classList.remove('animated');
    };

    const onKey = async (ev) => {
      if (ev.key !== 'Enter' || ev.shiftKey) return;
      ev.preventDefault();
      const text = ta.value
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!text) {
        ta.focus();
        return;
      }
      // Comentario: delega en el handler y marca readonly
      try {
        ta.setAttribute('readonly', '');
        await this._handlers.onSubmitDetails(text);
      } finally {
        // opcional adicional
      }
    };

    ta.addEventListener('input', onInput);
    ta.addEventListener('keydown', onKey);

    this._listeners.push(() => ta.removeEventListener('input', onInput));
    this._listeners.push(() => ta.removeEventListener('keydown', onKey));

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
 * ========================================================================= */
class Controller {
  constructor() {
    /** @private */ this._model = new Model();

    // Comentario: crea una promesa que se resuelve con el id creado
    /** @private */ this._resolveCreated = null;
    /** @private */ this._onCreatedPromise = new Promise((resolve) => {
      this._resolveCreated = resolve;
    });

    /** @private */ this._view = new View({
      onValidOption: (num, type) => this._onValidOption(num, type),
      onSubmitDetails: (text) => this._onSubmitDetails(text),
    });
  }

  /** Expone promesa que resuelve al crear proyecto */
  onCreated() {
    // Comentario: devuelve promesa inmutable con el id creado
    return this._onCreatedPromise;
  }

  /** @private */
  _onValidOption(_num, type) {
    // Comentario: guarda tipo y monta bloque de sugerencias
    this._model.patch({ eventType: type });

    const qa = Array.isArray(questions) ? questions : [];
    const found = qa.find((q) => q?.type === type);
    const data = {
      question: found?.question || 'Please describe what you have in mind.',
      suggestions: Array.isArray(found?.suggestions) ? found.suggestions : [],
    };
    this._view.mountSuggestions(data);
  }

  /** @private */
  async _onSubmitDetails(text) {
    // Comentario: muestra backdrop mientras se genera el proyecto
    const disposeStreamingScreen = streamingScreen();
    const disposeBackdrop = mountBackdrop();
    try {
      // Comentario: guarda detalles en el modelo
      this._model.patch({ eventDetails: text });

      const { eventType, eventDetails } = this._model.get();

      // ===== Prompt 1: selección de herramientas =====
      const toolsToText = JSON.stringify(toolsDescription);
      const promptText1 =
        `The user wants to plan an activity with the following characteristics. ` +
        `Activity to plan: ${eventType}. Activity details: ${eventDetails}. ` +
        `Determine which of the following tools are essential for planning that activity. ` +
        `Planning tools = ${toolsToText} Returns only a JSON containing the array of tool names. ` +
        `Output: Only generates a JSON array. \noutputSchema = ['tool-name-1', 'tool-name-n']`;

      let componentsSelectedRaw;
      try {
        // Comentario: consulta la API (recupera JSON como string)
        console.debug(
          '[ai-generator] Prompt API call for tool selection: \n',
          promptText1,
        );
        setBackdropText("Creating an interface for you", "Local AI is selecting tools...");
        componentsSelectedRaw = await promptApi(promptText1);
        console.debug(
          '[ai-generator] Tools selected by Prompt API (STRING):\n',
          componentsSelectedRaw,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] failed to query Prompt API (step 1):', err);
        return undefined;
      }

      /** @type {unknown} */
      let parsedNames;
      try {
        parsedNames = repairAndParseJson(String(componentsSelectedRaw));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] failed to parse components list JSON:', err);
        return undefined;
      }

      /** @type {Array<Object>} */
      let components;
      try {
        // Comentario: filtra y clona componentes según nombres
        components = this._filterComponents(parsedNames);
        console.debug(
          '[ai-generator] Tools filtered by Prompt API (OBJECT):\n',
          components,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] invalid components payload:', err);
        return undefined;
      }

      // ===== Prompt 2: contenido de herramientas =====
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

      let componentsContentRaw;
      /** @type {unknown} */
      let componentsParsed;
      try {
        console.debug(
          '[ai-generator] Prompt API call for content generation: \n',
          promptText2,
        );
        setBackdropText("Creating an interface for you", "Local AI content generation is in progress...");
        // setBackdropText("Local AI content generation is in progress. Almost complete.");
        componentsContentRaw = await promptApi(promptText2);
        console.debug(
          '[ai-generator] Tool content created by Prompt API (STRING):\n',
          componentsContentRaw,
        );
        componentsParsed = repairAndParseJson(String(componentsContentRaw));
        console.debug(
          '[ai-generator] Tool content created by Prompt API (OBJECT):\n',
          componentsParsed,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] invalid components content payload:', err);
        return undefined;
      }

      // ===== Normalización previa a persistencia =====
      // Comentario: transforma cada componente — quita 'description', añade 'position' incremental y 'state: "mounted"'
      const normalizedComponents = Array.isArray(componentsParsed)
        ? componentsParsed.map((comp, idx) => {
            // Comentario: valida forma básica del componente
            if (!comp || typeof comp !== 'object') return comp;

            // Comentario: elimina 'description' manteniendo el resto de claves
            const { description, ...rest } = /** @type {Record<string, any>} */ (comp);

            // Comentario: añade position (2..n+1) y state 'mounted' (reserva position 1 para 'description')
            return {
              ...rest,
              position: idx + 2,
              state: 'mounted',
            };
          })
        : [];

      // ===== Prompt 3: título y descripción de la actividad =====
      // Comentario: genera título y descripción concisos para el plan
      const promptText3 =
        `You are helping a user plan an activity.\n` +
        `Activity to plan: ${eventType}.\n` +
        `Activity details: ${eventDetails}.\n\n` +
        `Write a concise, human-friendly TITLE and a single-paragraph DESCRIPTION for this plan.\n` +
        `Requirements:\n` +
        `- Title: natural language, 6–50 characters, no trailing period.\n` +
        `- Description: 1 paragraph (15–30 words), clear and specific to the user's details; avoid hype or clichés.\n` +
        `- Audience: general users; prefer active voice.\n` +
        `- Output ONLY JSON using the exact schema below.\n` +
        `outputSchema = { "title": "string", "description": "string" }`;

      let titleDescRaw;
      /** @type {{title?: string, description?: string}} */
      let titleDescParsed = {};
      // Comentario: variables solicitadas para almacenar resultados
      let generatedTitle = '';
      let generatedDescription = '';

      try {
        console.debug('[ai-generator] Prompt API call to create title and description: \n', promptText3);
        setBackdropText("Creating an interface for you", "Finishing touches...");
        titleDescRaw = await promptApi(promptText3);
        console.debug('[ai-generator] Title and description (STRING):\n',
          String(titleDescRaw));        
        titleDescParsed = /** @type {any} */ (repairAndParseJson(String(titleDescRaw))) || {};
        generatedTitle = typeof titleDescParsed.title === 'string' ? titleDescParsed.title.trim() : '';
        generatedDescription =
          typeof titleDescParsed.description === 'string' ? titleDescParsed.description.trim() : '';
        console.debug('[ai-generator] Title and description (OBJECT):\n', {
          titleDescParsed,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] failed to generate title/description:', err);
      }

      // ===== Construcción y persistencia del modelo =====
      const model = deepClone(modelTemplate);   // Comentario: clona plantilla
      const newId = uid();                      // Comentario: genera id único
      const nowISO = new Date().toISOString();  // Comentario: marca temporal única

      model.id = newId;
      model.createdAt = nowISO;
      model.updatedAt = nowISO;

      // Comentario: si se generó título válido, lo aplica al modelo
      if (generatedTitle) model.title = generatedTitle;

      // Comentario: crea el componente 'description' en position 1 con el texto generado (puede ser cadena vacía)
      const descriptionComponent = {
        name: 'description',
        title: 'Description',
        position: 1,
        state: 'mounted',
        content: {
          // Comentario: coloca el texto de la descripción generada
          text: generatedDescription,
        },
      };

      // Comentario: compone el arreglo final de componentes (description primero)
      model.components = [descriptionComponent, ...deepClone(normalizedComponents)];

      // Comentario: intenta persistir el nuevo proyecto en storage
      try {
        // Comentario: persiste el JSON completo del nuevo proyecto
        setProject(newId, model);

        // Comentario: registra/actualiza la entrada en projectList (upsert por id)
        // - 'title' en la lista refleja el 'title' del modelo
        addProjectToList({
          id: newId,
          title: model.title || 'New plan',
          createdAt: model.createdAt,
          updatedAt: model.updatedAt,
        }); // Usa addProjectToList para mantener la lista consistente. :contentReference[oaicite:3]{index=3}
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ai-generator] failed to save project or update projectList:', err);
        return undefined;
      }
      
      // Comentario: resuelve promesa y devuelve id
      try { this._resolveCreated?.(newId); } catch {}
      return newId;
    } finally {
      // Comentario: retira el backdrop y screen incluso si hubo errores
      disposeStreamingScreen();
      disposeBackdrop();
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

    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
      throw new TypeError(
        '[_filterComponents]: `names` deben ser un array de strings',
      );
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
 * ========================================================================= */
/**
 * Public API — renderAiGenerator(host)
 * @param {!HTMLElement} _containerEl Mount point (no usa host, opera sobre layout existente)
 * @return {{ destroy: () => void, onCreated: Promise<string> }}
 */
export function renderAiGenerator(_containerEl) {
  // Comentario: mantiene firma pública, añade promesa onCreated
  const controller = new Controller();
  return {
    destroy() {
      // Comentario: desmonta listeners y limpia
      controller.destroy();
    },
    onCreated: controller.onCreated(), // Comentario: expone promesa con id del proyecto creado
  };
}
