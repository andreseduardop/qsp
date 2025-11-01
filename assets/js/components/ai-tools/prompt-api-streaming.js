/**
 * @fileoverview Streamer util for Chrome's Prompt API that yields full lines.
 * @version 1.1.0
 *
 * - Streams model output and yields only when a newline is observed.
 * - Omits structural tokens (e.g., '[', '],', '{', '},') and removes parentheses.
 * - Supports both ReadableStream (official docs) and async-iterable variants.
 * - Provides defensive error handling and optional cancellation (AbortSignal).
 *
 * References:
 * - Prompt API docs (LanguageModel.availability/create/promptStreaming): developer.chrome.com. 
 * - web.dev article showing async-iterable usage of promptStreaming.
 */

/** Structural tokens to omit exactly (trimmed). */
const STRUCTURAL_TOKENS_TO_OMIT = ['[', ']', '],', '{', '}', '},'];

/**
 * Checks if Prompt API seems available; throws helpful error otherwise.
 * @returns {Promise<void>}
 */
async function assertAvailability() {
  // Comentario: valida disponibilidad de la API antes de crear sesión
  if (typeof globalThis.LanguageModel?.availability !== 'function') {
    throw new Error(
      '[prompt-api] LanguageModel API is not exposed in this context.',
    );
  }
  const availability = await globalThis.LanguageModel.availability();
  // Valores esperados incluyen 'available', 'after-download', etc., se evita bloquear salvo 'unavailable'.
  if (availability === 'unavailable') {
    throw new Error(
      '[prompt-api] Model unavailable. Check device requirements or chrome://on-device-internals.',
    );
  }
}

/**
 * Normalizes promptStreaming return into an async iterator of string chunks.
 * Supports ReadableStream and async-iterable surfaces.
 * @param {*} stream
 * @returns {AsyncIterable<string>}
 */
function toAsyncIterable(stream) {
  // Comentario: si ya es async iterable, lo devuelve tal cual
  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    return stream;
  }
  // Comentario: si es ReadableStream, crea un adaptador async-iterable
  if (stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // Comentario: decodifica chunk en texto
            yield decoder.decode(value, { stream: true });
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* noop */
          }
        }
      },
    };
  }
  throw new TypeError('[prompt-api] Unsupported stream surface from promptStreaming().');
}

/**
 * Sanitizes one textual line:
 * - Trims edges for comparison
 * - Skips structural tokens exactly
 * - Removes round parentheses anywhere
 * @param {string} raw
 * @returns {string|null} sanitized line or null if it should be skipped
 */
function sanitizeLine(raw) {
  // Comentario: conserva espacios originales para devolver, pero usa trimmed para filtro
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (STRUCTURAL_TOKENS_TO_OMIT.includes(trimmed)) return null;

  // Comentario: elimina paréntesis '(' y ')' en cualquier posición
  const noParens = raw.replace(/[()]/g, '');
  const candidate = noParens.trim();
  if (!candidate) return null;

  return noParens;
}

/**
 * Computes the "delta" newly appended by a chunk when the API yields the
 * entire-so-far string (web.dev behavior). Falls back to returning the chunk as-is.
 * @param {string} current
 * @param {string} previous
 * @returns {string}
 */
function extractDelta(current, previous) {
  // Comentario: si el chunk empieza con el texto previo, devuelve solo lo nuevo
  if (previous && current.startsWith(previous)) {
    return current.slice(previous.length);
  }
  // Comentario: si no coincide, devuelve tal cual (posible reinicio de stream)
  return current;
}

/**
 * Streams model output and yields full lines (newline-terminated),
 * omitting structural tokens and removing parentheses.
 *
 * Usage:
 *   for await (const line of promptApiStreaming("Your prompt...")) {
 *     console.log("LINE:", line);
 *   }
 *
 * @param {string} prompt - User prompt to send to the model.
 * @param {{
 *   signal?: AbortSignal,
 *   createOptions?: Object,          // passed to LanguageModel.create()
 *   promptOptions?: Object,          // passed to session.promptStreaming(...)
 *   onLine?: (line:string)=>void,    // optional side-channel callback per yielded line
 * }} [opts]
 * @returns {AsyncGenerator<string>} async generator yielding sanitized lines
 * @throws {Error} if Prompt API is unavailable or streaming fails
 */
export async function* promptApiStreaming(prompt, opts = {}) {
  // Comentario: valida entrada y opciones
  if (typeof prompt !== 'string' || !prompt) {
    throw new TypeError('[prompt-api] prompt must be a non-empty string.');
  }

  const { signal, createOptions, promptOptions, onLine } = opts;

  // Comentario: permite cancelación temprana
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  await assertAvailability();

  // Comentario: crea sesión; define expectedOutputs:text y languages opcionales si el entorno lo permite
  const session = await globalThis.LanguageModel.create({
    // expectedOutputs: [{ type: 'text', languages: ['en'] }], // opcional; dejar que el host defina
    ...(createOptions || {}),
  });

  // Comentario: inicia streaming; soporta AbortSignal si la implementación lo respeta
  let rawStream;
  try {
    rawStream = session.promptStreaming(prompt, { ...(promptOptions || {}) });
  } catch (err) {
    throw new Error(`[prompt-api] failed to start streaming: ${err?.message || err}`);
  }

  const iterable = toAsyncIterable(rawStream);

  // Comentario: bufferiza hasta '\n' y emite líneas completas
  let buffer = '';
  let previousAggregate = ''; // para compatibilidad con streams que reemiten el acumulado completo

  // Comentario: escucha cancelación mientras itera (si el host no la respeta internamente)
  const abortCheck = () => {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
  };

  try {
    for await (const chunkRaw of iterable) {
      abortCheck();

      // Comentario: extrae delta si el stream emite el acumulado completo
      const chunk = extractDelta(String(chunkRaw), previousAggregate);
      previousAggregate = previousAggregate + chunk;

      // Comentario: acumula y procesa por saltos de línea
      buffer += chunk;

      // Comentario: procesa todas las líneas completas disponibles
      while (true) {
        const nl = buffer.indexOf('\n');
        if (nl === -1) break;

        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);

        const sanitized = sanitizeLine(line);
        if (sanitized != null) {
          // Comentario: publica en consola y por el canal del generador
          console.log(sanitized); // imprime la línea original (menos paréntesis)
          if (typeof onLine === 'function') {
            try {
              onLine(sanitized);
            } catch {
              /* comentario: evita propagar errores del callback del usuario */
            }
          }
          yield sanitized;
        }
      }
    }

    // Comentario: al finalizar, si queda residuo en el buffer, lo emite como última línea
    if (buffer.length > 0) {
      const sanitized = sanitizeLine(buffer);
      if (sanitized != null) {
        console.log(sanitized);
        if (typeof onLine === 'function') {
          try {
            onLine(sanitized);
          } catch {
            /* noop */
          }
        }
        yield sanitized;
      }
    }
  } catch (err) {
    // Comentario: mapea algunos errores comunes a mensajes claros
    if (err?.name === 'AbortError') {
      console.warn('[prompt-api] streaming aborted by caller.');
      return;
    }
    if (/NotSupportedError/i.test(err?.name || err?.message || '')) {
      console.error(
        '[prompt-api] NotSupportedError: check expectedInputs/outputs languages or modalities.',
      );
    }
    throw err;
  } finally {
    try {
      // Comentario: libera sesión si la implementación lo requiere (no está en la spec aún)
      if (typeof session?.destroy === 'function') {
        session.destroy();
      }
    } catch {
      /* noop */
    }
  }
}

/* ------------------------------ Convenience ------------------------------ */
/**
 * Small helper to collect all lines into an array (not streamed to caller).
 * @param {string} prompt
 * @param {Parameters<typeof promptApiStreaming>[1]} [opts]
 * @returns {Promise<string[]>}
 */
export async function promptApiStreamingToArray(prompt, opts) {
  // Comentario: consume el generador y acumula líneas en un arreglo
  const lines = [];
  for await (const line of promptApiStreaming(prompt, opts)) {
    lines.push(line);
  }
  return lines;
}
