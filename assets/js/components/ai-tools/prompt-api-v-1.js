/**
 * @fileoverview Chrome Prompt API client (LanguageModel-first with window.ai fallback).
 * Exposes a single public function `queryPrompt(prompt, opts)` that returns the
 * raw Prompt API response for the given prompt.
 *
 * Version: 1.1.1
 * License: MIT
 * Style: Google JavaScript Style Guide.
 */

'use strict';

/**
 * @typedef {Object} QueryOptions
 * @property {AbortSignal=} signal Abort signal to cancel operations.
 * @property {number=} temperature Sampling temperature (if supported). Default: 0.
 * @property {number=} topK Top-K sampling (if supported). Default: 1.
 * @property {Object=} responseConstraint Optional JSON Schema for structured output.
 * @property {boolean=} omitResponseConstraintInput If true, omits schema from input tokens.
 * @property {Array<{type: 'text'|'image'|'audio', languages?: string[] }>=} expectedInputs
 * @property {Array<{type: 'text', languages?: string[] }>=} expectedOutputs
 * @property {Array<{role: 'system'|'user', content: (string|Array<{type:string,value:any}>)}>=} initialPrompts
 */

/**
 * SRP: Encapsula la detección de la API y la creación de sesiones.
 * Abierto/cerrado: Permite ampliación añadiendo nuevos adaptadores sin modificar clientes.
 * Liskov: Ambos adaptadores cumplen la misma interfaz.
 * ISP: Interfaz mínima para crear y usar sesiones.
 * DIP: Los consumidores dependen de abstracciones, no de implementaciones concretas.
 */
class AbstractPromptAdapter {
  /** @return {Promise<'available'|'downloadable'|'downloading'|'unavailable'>} */
  // Comentario (ES): expone disponibilidad de la API detectada.
  availability() { throw new Error('Not implemented'); }

  /** @param {QueryOptions=} opts @return {Promise<any>} */
  // Comentario (ES): crea y retorna una sesión lista para invocar prompt().
  async createSession(opts) { throw new Error('Not implemented'); }
}

/**
 * Implementación para la API moderna: global `LanguageModel`.
 */
class LanguageModelAdapter extends AbstractPromptAdapter {
  // Comentario (ES): verifica si existe el objeto global.
  static isSupported() {
    return typeof globalThis.LanguageModel?.availability === 'function' &&
           typeof globalThis.LanguageModel?.create === 'function';
  }

  /** @override */
  async availability() {
    // Comentario (ES): consulta disponibilidad indicando idioma de salida ('en' por defecto). Al consultar sin idioma indicado se dispara advertencia en la consola.
    return /** @type {Promise<'available'|'downloadable'|'downloading'|'unavailable'>} */ (
      globalThis.LanguageModel.availability({
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      })
    );
  }


  /** @override */
  async createSession(opts = {}) {
    // Comentario (ES): prepara opciones; por defecto fuerza salida en inglés ('en').
    const {
      temperature,
      topK,
      expectedInputs,
      expectedOutputs,
      initialPrompts,
      signal,
    } = opts;

    /** @type {Array<{type:'text', languages?: string[]}>} */
    // Comentario (ES): si no hay expectedOutputs, agrega inglés para cumplir políticas.
    const normalizedExpectedOutputs =
        expectedOutputs && expectedOutputs.length
          ? expectedOutputs
          : [{type: 'text', languages: ['en']}];

    const createOpts = {
      ...(typeof temperature === 'number' ? {temperature} : {}),
      ...(typeof topK === 'number' ? {topK} : {}),
      ...(expectedInputs ? {expectedInputs} : {}),
      expectedOutputs: normalizedExpectedOutputs,
      ...(initialPrompts ? {initialPrompts} : {}),
      ...(signal ? {signal} : {}),
    };

    // Comentario (ES): crea sesión; el propio objeto de sesión expone prompt() y promptStreaming().
    return globalThis.LanguageModel.create(createOpts);
  }
}

/**
 * Implementación de compatibilidad para la API previa: `window.ai`.
 */
class WindowAIAdapter extends AbstractPromptAdapter {
  static isSupported() {
    return typeof globalThis.window !== 'undefined' &&
           typeof globalThis.window.ai?.createTextSession === 'function';
  }

  /** @override */
  async availability() {
    // Comentario (ES): al no existir availability() oficial, aproxima con canCreateTextSession().
    if (!WindowAIAdapter.isSupported()) return 'unavailable';
    try {
      const status = await globalThis.window.ai.canCreateTextSession?.();
      if (status === 'no' || status === 'unsupported') return 'unavailable';
      if (status === 'readily' || status === 'readily-available') return 'available';
      if (status === 'after-download') return 'downloadable';
      return 'available';
    } catch {
      return 'unavailable';
    }
  }

  /** @override */
  async createSession(opts = {}) {
    const {temperature, topK, signal} = opts;
    // Comentario (ES): crea sesión de texto; `window.ai` no soporta expectedOutputs ni JSON Schema.
    const session = await globalThis.window.ai.createTextSession?.({
      ...(typeof temperature === 'number' ? {temperature} : {}),
      ...(typeof topK === 'number' ? {topK} : {}),
      ...(signal ? {signal} : {}),
    });
    return session;
  }
}

/**
 * Factoría/Localizador del adaptador adecuado.
 */
class PromptAdapterFactory {
  // Comentario (ES): selecciona la mejor implementación disponible en tiempo de ejecución.
  static getAdapter() {
    if (LanguageModelAdapter.isSupported()) return new LanguageModelAdapter();
    if (WindowAIAdapter.isSupported()) return new WindowAIAdapter();
    return null;
  }
}

/**
 * Servicio de alto nivel que gestiona ciclo de vida de la sesión y ejecución del prompt.
 */
class PromptService {
  constructor() {
    /** @type {AbstractPromptAdapter|null} */
    // Comentario (ES): guarda adaptador elegido; aplica DIP.
    this.adapter_ = PromptAdapterFactory.getAdapter();
    /** @type {any|null} */
    this.session_ = null;
    /** @type {boolean} */
    this.initialized_ = false;
    /** @type {'languageModel'|'windowAi'|null} */
    // Comentario (ES): recuerda tipo de backend para aplicar ajustes específicos.
    this.backend_ = null;
  }

  /**
   * @private
   * @param {QueryOptions=} opts
   * @return {Promise<void>}
   */
  async init_(opts) {
    // Comentario (ES): normaliza defaults: temperature=0, topK=1 si no vienen definidos.
    const normalizedOpts = {...(opts || {})};
    if (typeof normalizedOpts.temperature !== 'number') normalizedOpts.temperature = 0;
    if (typeof normalizedOpts.topK !== 'number') normalizedOpts.topK = 1;

    // Comentario (ES): valida soporte y disponibilidad; crea sesión bajo demanda.
    if (!this.adapter_) {
      throw new Error(
          'Chrome Prompt API is not available in this environment. ' +
          'Please use a supported version of Chrome with built-in AI enabled.');
    }

    const availability = await this.adapter_.availability();
    if (availability === 'unavailable') {
      throw new Error(
          'The language model is unavailable. Ensure device requirements are met ' +
          'and you are running a supported Chrome build.');
    }
    if (availability === 'downloadable' || availability === 'downloading') {
      // Comentario (ES): la descarga requiere gesto del usuario.
      throw new Error(
          'The on-device model must be downloaded first. Trigger a user interaction ' +
          '(e.g., click) before calling this function so Chrome can start/finish the download.');
    }

    // Comentario (ES): crea la sesión con las opciones ya normalizadas (incluye defaults).
    this.session_ = await this.adapter_.createSession(normalizedOpts);

    // Comentario (ES): detecta backend efectivo para lógica específica (p. ej., window.ai).
    this.backend_ = (this.adapter_ instanceof LanguageModelAdapter)
      ? 'languageModel'
      : (this.adapter_ instanceof WindowAIAdapter ? 'windowAi' : null);

    this.initialized_ = true;
  }

  /**
   * @private
   * @param {string} prompt
   * @return {string}
   */
  enforceEnglish_(prompt) {
    // Comentario (ES): asegura salida en inglés cuando el backend no soporta expectedOutputs.
    if (this.backend_ === 'windowAi') {
      // Comentario (ES): añade instrucción ligera sin alterar semántica del usuario.
      return `${prompt}\n\n[Instruction: Please answer in English only.]`;
    }
    return prompt;
  }

  /**
   * Ejecuta un prompt y retorna la respuesta cruda de la API subyacente.
   *
   * @param {string} prompt Texto del usuario.
   * @param {QueryOptions=} opts Opciones opcionales (temperatura, topK, JSON Schema, etc.).
   * @return {Promise<any>} Respuesta devuelta por `session.prompt(...)`. En la API moderna
   *     suele ser `string` (o JSON string si se usa `responseConstraint` boolean/number/object).
   */
  async run(prompt, opts = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      // Comentario (ES): valida argumento.
      throw new TypeError('`prompt` must be a non-empty string.');
    }

    if (!this.initialized_) {
      await this.init_(opts);
    }

    const session = this.session_;

    // Comentario (ES): API moderna: soporta responseConstraint y omitResponseConstraintInput.
    if (typeof session?.prompt === 'function') {
      const callOpts = {};
      if ('responseConstraint' in opts) {
        callOpts.responseConstraint = opts.responseConstraint;
      }
      if ('omitResponseConstraintInput' in opts) {
        callOpts.omitResponseConstraintInput = !!opts.omitResponseConstraintInput;
      }
      if ('signal' in opts) {
        callOpts.signal = opts.signal;
      }

      const finalPrompt = this.enforceEnglish_(prompt);
      return session.prompt(finalPrompt, callOpts);
    }

    // Comentario (ES): si por alguna razón no hay prompt(), lanza error explícito.
    throw new Error('Prompt session does not support prompt().');
  }
}

/** @type {PromptService|null} */
// Comentario (ES): instancia única para reusar sesión cuando sea posible.
let singletonService = null;

/**
 * PUBLIC API (única función): ejecuta un prompt y retorna la respuesta cruda de Prompt API.
 *
 * @param {string} prompt Texto del usuario a enviar al modelo.
 * @param {QueryOptions=} opts Opciones de consulta (ver typedef).
 * @return {Promise<any>} Respuesta cruda de la Prompt API (p. ej., `string` o JSON string).
 *
 * @example
 * // Basic:
 * const out = await queryPrompt('Write a haiku about llamas.');
 *
 * @example
 * // Structured output (boolean):
 * const out = await queryPrompt('Is this about pottery? ' + post, {
 *   responseConstraint: {type: 'boolean'},
 * });
 *
 * @example
 * // Language enforced to English by default; can still override if needed:
 * const out = await queryPrompt('Summarize this:', {
 *   expectedOutputs: [{type: 'text', languages: ['en']}],
 * });
 */
export async function promptApi(prompt, opts = undefined) {
  // Comentario (ES): crea servicio perezosamente y delega ejecución.
  if (!singletonService) singletonService = new PromptService();
  return singletonService.run(prompt, opts ?? {});
}
