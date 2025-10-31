/**
 * @fileoverview Unique ID generator utility.
 * @module utils/uid
 *
 * @description
 * Provides a small helper to generate short, fairly unique identifiers for
 * client-side objects. Uses `crypto.randomUUID()` when available, and falls
 * back to a timestamp + random suffix. Returns a 12-char string.
 *
 * @version 1.0.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 */

/**
 * Generates a short unique id (12 chars).
 * @return {string}
 */
export function uid() {
  // Comentario: genera id corto estable usando UUID si está disponible
  const s =
    typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  return s.slice(0, 12);
}
