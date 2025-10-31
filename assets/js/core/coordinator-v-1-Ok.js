/**
 * @fileoverview App-level coordinator that selects and initializes UI components.
 * @module core/coordinator
 * @version 1.9.0
 *
 * @description
 * Centralizes component selection and initialization. Components are mounted
 * in ascending order by their `position` from the model, and are assigned
 * alternately to the available root containers (#app-container-1, #app-container-2).
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 */

import { renderDescription } from "../components/description.js";      // importa el inicializador de description
import { renderChecklist } from "../components/checklist.js";      // importa el inicializador de checklist
import { renderSuppliesList } from "../components/supplieslist.js"; // importa el inicializador de supplieslist
import { renderStepslist } from "../components/stepslist.js";      // importa el inicializador de stepslist
import { renderSchedule } from "../components/schedule.js";     // importa el inicializador de schedule
import { renderTeamList } from "../components/teamlist.js";     // importa el inicializador de teamlist
import { renderSearchNext } from "../components/searchnext.js";     // importa el inicializador de teamlist
import { renderTimeline } from "../components/timeline.js";     // importa el inicializador de teamlist
import { el } from "../utils/helpers.js";                          // crea elementos HTML
import { getModel } from "./storage.js";                                // recupera el modelo raíz (getModel)

/** @const {string} */
const CONTAINER_1 = "app-container-1";
/** @const {string} */
const CONTAINER_2 = "app-container-2";

/**
 * @typedef {Object} ComponentRender
 * @property {(host: HTMLElement) => void} render - Render function for the component.
 */

/** @const {!Record<string, !ComponentRender>} */
const RENDERERS = {
  description:    { render: renderDescription },
  timeline:       { render: renderTimeline },
  schedule:       { render: renderSchedule },
  checklist:      { render: renderChecklist },
  supplieslist:   { render: renderSuppliesList },
  stepslist:      { render: renderStepslist },
  teamlist:       { render: renderTeamList },
  searchnext:     { render: renderSearchNext },
  // Nota: se pueden mapear más nombres del modelo cuando existan inicializadores.
};

/**
 * Creates and returns a new host under the given parent using helpers.el().
 * @param {!HTMLElement} parent Parent element where the host will be created.
 * @param {string} id Desired id for the host.
 * @return {!HTMLElement} Newly created host element.
 */
function createHost(parent, id) {
  // crea un host con atributos de trazabilidad
  const host = el("div", {
    attrs: {
      id,
      "data-role": "component-host",
      "data-owner": "coordinator",
    },
  });
  parent.appendChild(host); // inserta el host en el DOM
  return host;
}

/**
 * Starts all configured UI components according to the model's positions,
 * assigning them alternately to the available parent containers.
 * @return {void}
 */
export function startApp() {
  // obtiene contenedores raíz disponibles
  const container1 = document.getElementById(CONTAINER_1);
  const container2 = document.getElementById(CONTAINER_2);

  // valida existencia del contenedor 1 (requisito mínimo para iniciar)
  if (!container1) {
    // eslint-disable-next-line no-console
    console.error(`[coordinator] container #${CONTAINER_1} not found.\nIS TESTER PAGE?`);
    return; // sale si no existe el contenedor principal mínimo
  }

  /** @type {!Array<!HTMLElement>} */
  const parents = [container1];
  if (container2) parents.push(container2); // agrega el segundo contenedor si está presente

  // lee el modelo raíz y obtiene la lista de componentes con su posición
  const model = new getModel(); // Comentario: recupera el modelo completo
  const components = Array.isArray(model?.components) ? model.components : [];

  // ordena por position ascendente y filtra solo componentes soportados
  const sorted = components
    .filter((c) => c && typeof c.name === "string" && RENDERERS[c.name] && Number.isFinite(Number(c.position)))
    .sort((a, b) => Number(a.position) - Number(b.position));

  // asigna alternando entre los padres disponibles (round-robin por índice de iteración)
  let hostAutoId = 1; // lleva un contador para ids legibles
  sorted.forEach((comp, i) => {
    const { name, position } = comp;

    // elige el contenedor alternando por el índice de iteración (no por el valor de position)
    const parent = parents[i % parents.length];

    // crea host y renderiza el componente indicado
    const hostId = `host-${String(position).padStart(2, "0")}-${name}`;
    const host = createHost(parent, hostId);

    console.log(`llamando a ${name}`);
    try {
      RENDERERS[name].render(host); // invoca el render del componente
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] failed to render "${name}" in #${host.id}:`, err);
    }

    hostAutoId += 1; // incrementa el contador (mantiene trazabilidad, si se necesitase)
  });

  // no realiza acciones adicionales; la ubicación queda definida por el orden y la alternancia
}
