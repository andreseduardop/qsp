/**
 * @fileoverview Application entry point: wires DOM readiness and starts the UI coordinator.
 * @module main
 *
 * @description
 * Carga el coordinador de la app y delega en él la selección e inicialización
 * de componentes de interfaz.
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 */

// importa el coordinador de componentes
import { startApp } from "./core/coordinator.js";

/**
 * Bootstraps the application once the DOM is ready.
 * @return {void}
 */
const start = () => {
  // delega la selección de contenedores e inicialización al coordinador
  startApp();
};

// espera a que el DOM esté listo o ejecuta de inmediato
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
