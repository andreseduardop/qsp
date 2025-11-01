/**
 * @fileoverview Streamed wrapper for Chrome's Prompt API with line-buffered publishing + auto focus.
 * @version 1.3.0
 *
 * - Exports: promptApi(promptText)
 * - Streams chunks from session.promptStreaming() but publishes only on full lines
 * - Skips structural JSON tokens and blank lines when publishing
 * - Each published line gets programmatic focus and is scrolled into view
 * - Returns the full concatenated string after streaming completes
 * - Passes expectedOutputs to LanguageModel.availability() and LanguageModel.create()
 *
 * Requisitos:
 *  - Prompt API disponible en el navegador (LanguageModel.*). Ver documentación oficial:
 *    https://developer.chrome.com/docs/ai/prompt-api
 */

/** Referencia de sesión (lazy) */
// Comentario: almacena la sesión de LanguageModel para reutilizarla entre llamadas
let _session = null;

/** Opciones compartidas para availability() y create() */
// Comentario: define la salida esperada (texto en inglés) para validar y crear la sesión
const SESSION_OPTIONS = {
  expectedOutputs: [
    { type: 'text', languages: ['en'] },
  ],
};

/** Lista de tokens estructurales a omitir al publicar */
// Comentario: define los tokens exactos que se omiten si componen una línea completa
const structuralTokensToOmit = ['[', ']', '],', '{', '}', '},'];
const _STRUCTURAL_SET = new Set(structuralTokensToOmit.map(t => String(t)));

/**
 * Crea (si no existe) y devuelve el contenedor de streaming.
 * @returns {HTMLElement}
 */
function ensureStreamingScreen() {
  // Comentario: garantiza que el contenedor #streaming-screen esté disponible en el DOM
  let host = null;
  try {
    host = document.getElementById('streaming-screen');
    if (!host) {
      host = document.createElement('div');
      host.id = 'streaming-screen';
      document.body.appendChild(host);
    }
  } catch (err) {
    // Comentario: en caso de error de DOM, lanza un mensaje claro
    throw new Error(`[prompt-api] cannot ensure streaming container: ${err?.message || err}`);
  }
  return host;
}

/**
 * Hace una publicación segura de una línea en el contenedor como <div class="m-0">,
 * y mueve el enfoque hacia esa línea de forma programática.
 * @param {HTMLElement} host
 * @param {string} line
 */
function publishLine(host, line) {
  // Comentario: agrega una fila al contenedor, usa textContent para evitar inyección
  try {
    const div = document.createElement('div');
    div.classList = 'm-0 fs-3';
    div.textContent = line;

    // Comentario: hace el <div> programáticamente enfocable sin afectar el orden de tabulación
    // - tabindex="-1" permite focus por script, pero no con la tecla Tab
    // - ver MDN sobre tabindex y focus()
    div.setAttribute('tabindex', '-1');

    host.appendChild(div);

    // Comentario: intenta mover el foco; usa preventScroll si está disponible
    try {
      // preventScroll=false (predeterminado) provoca desplazamiento al elemento
      // ver MDN: HTMLElement.focus(options.preventScroll)
      div.focus({ preventScroll: false });
    } catch {
      // Comentario: compatibilidad; algunos navegadores no soportan el objeto options
      div.focus();
    }

    // Comentario: asegura visibilidad en contenedores con overflow; usa scrollIntoView
    // ver MDN: Element.scrollIntoView()
    try {
      div.scrollIntoView({ block: 'end', inline: 'nearest' });
    } catch {
      // Comentario: fallback simple
      div.scrollIntoView();
    }
  } catch (err) {
    // Comentario: registra pero no interrumpe el flujo si falla la publicación
    console.error('[prompt-api] failed to publish/focus line:', err);
  }
}

/**
 * Determina si una línea debe omitirse (token estructural o en blanco).
 * @param {string} rawLine
 * @returns {boolean}
 */
function shouldOmitLine(rawLine) {
  // Comentario: trimea la línea y valida si es vacía o coincide con tokens estructurales
  const t = (rawLine ?? '').trim();
  if (!t) return true;                   // línea en blanco
  if (_STRUCTURAL_SET.has(t)) return true; // token estructural exacto
  return false;
}

/**
 * Convierte una entrada chunk en texto seguro.
 * @param {any} chunk
 * @returns {string}
 */
function normalizeChunk(chunk) {
  // Comentario: convierte cualquier tipo a string sin lanzar
  if (typeof chunk === 'string') return chunk;
  if (chunk == null) return '';
  try {
    // Comentario: intenta representar objetos de manera estable
    if (typeof chunk === 'object') {
      // Si el chunk es ya texto estructurado, devuelve JSON estable
      return JSON.stringify(chunk);
    }
    return String(chunk);
  } catch {
    return '';
  }
}

/**
 * Verifica disponibilidad y crea (o reutiliza) una sesión de LanguageModel.
 * @returns {Promise<any>} Sesión de LanguageModel.
 */
async function getOrCreateSession() {
  // Comentario: valida existencia de la API
  if (typeof window === 'undefined' || typeof window.LanguageModel === 'undefined') {
    throw new Error('[prompt-api] LanguageModel API not found. Update Chrome or enable built-in AI.');
    }

  // Comentario: comprueba disponibilidad con las mismas opciones que se usarán al crear
  let availability;
  try {
    availability = await LanguageModel.availability({ ...SESSION_OPTIONS });
  } catch (err) {
    throw new Error(`[prompt-api] availability() failed: ${err?.message || err}`);
  }

  if (availability === 'unavailable') {
    throw new Error('[prompt-api] Model unavailable for requested outputs on this device/profile.');
  }

  // Comentario: crea la sesión si no existe, aplicando las opciones declaradas
  if (!_session) {
    try {
      _session = await LanguageModel.create({
        ...SESSION_OPTIONS,
        // Comentario: se podría añadir monitor de descarga para UX (ver guía oficial)
        // monitor(m) {
        //   m.addEventListener('downloadprogress', (e) => {
        //     console.debug(`[prompt-api] model download: ${Math.round((e.loaded ?? 0) * 100)}%`);
        //   });
        // },
      });
    } catch (err) {
      throw new Error(`[prompt-api] create() failed: ${err?.message || err}`);
    }
  }
  return _session;
}

/**
 * Envía un prompt por streaming, publica solo líneas completas y devuelve el texto completo.
 * - Acumula partials en un buffer y publica únicamente al detectar saltos de línea.
 * - Omite tokens estructurales definidos y líneas en blanco al publicar.
 * - Mueve el foco a cada línea publicada.
 *
 * @param {string} promptText - Texto a enviar a la Prompt API.
 * @returns {Promise<string>} Texto completo concatenado al finalizar.
 */
export async function promptApi(promptText) {
  // Comentario: valida entrada del usuario
  if (typeof promptText !== 'string' || !promptText.trim()) {
    throw new TypeError('[prompt-api] promptApi(promptText) expects a non-empty string.');
  }

  // Comentario: obtiene o crea el contenedor de streaming
  const host = ensureStreamingScreen();

  // Comentario: muestra marcador inicial opcional
  const startDiv = document.createElement('div');
  startDiv.className = 'm-0';
  startDiv.textContent = '…';
  try { host.appendChild(startDiv); } catch { /* no-op */ }

  // Comentario: prepara variables de streaming
  let full = '';
  let buffer = ''; // acumula hasta detectar salto(s) de línea

  // Comentario: obtiene o crea la sesión de modelo
  const session = await getOrCreateSession();

  try {
    // Comentario: inicia el streaming del modelo
    const stream = session.promptStreaming(promptText);

    // Comentario: recorre los chunks del modelo
    for await (const chunk of stream) {
      const piece = normalizeChunk(chunk);
      full += piece;
      buffer += piece;

      // Comentario: procesa líneas completas si existen saltos de línea en el buffer
      // Soporta \n y \r\n. Conserva el último segmento como parcial.
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!shouldOmitLine(line)) {
          publishLine(host, line);
        }
      }
    }
  } catch (err) {
    // Comentario: informa el error en la UI y relanza
    publishLine(host, `[prompt-api] streaming failed: ${err?.message || err}`);
    throw err;
  } finally {
    // Comentario: retira el marcador inicial si sigue sin cambios
    try {
      if (startDiv?.isConnected && startDiv.textContent === '…') {
        startDiv.remove();
      }
    } catch { /* no-op */ }
  }

  // Comentario: publica la última línea parcial si quedó contenido (sin requerir \n final)
  // Si se desea estrictamente esperar a '\n', comentar el bloque siguiente.
  if (buffer && !shouldOmitLine(buffer)) {
    publishLine(host, buffer);
  }

  // Comentario: devuelve el texto completo generado (sin filtrado)
  return full;
}

// Exporta también los tokens por si se requiere en otros módulos (opcional)
// Comentario: permite que otros módulos conozcan/compartan la política de omisión
export { structuralTokensToOmit };
