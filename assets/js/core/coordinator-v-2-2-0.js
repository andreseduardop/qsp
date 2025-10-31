/**
 * @fileoverview App-level coordinator that selects and initializes UI components.
 * @module core/coordinator
 * @version 2.2.0
 *
 * @description
 * Starts the application depending on whether there is an active project:
 *  - No active project: shows "new plan" section and loads ai-generator inside #app-container-0.
 *  - Active project: shows "active plan" section and mounts components whose state === 'mounted'.
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 */


import { renderSidebar } from "../components/sidebar.js";
import { renderDescription } from "../components/description.js";
import { renderChecklist } from "../components/checklist.js";
import { renderSuppliesList } from "../components/supplieslist.js";
import { renderStepslist } from "../components/stepslist.js";
import { renderSchedule } from "../components/schedule.js";
import { renderTeamList } from "../components/teamlist.js";
import { renderSearchNext } from "../components/searchnext.js";
import { renderTimeline } from "../components/timeline.js";
import { el, visibility } from "../utils/helpers.js";
import {
  getActiveProjectId,
  getProject,
  setActiveProject,   // ← define activo con metadatos del modelo
  addProjectToList,   // ← upsert en projectList
  touchProjectInList, // ← refresca updatedAt en projectList
} from "./storage.js"; // APIs de storage (projectos, activo, projectList)


/** @const {string} */
const CONTAINER_0 = "app-container-0";
/** @const {string} */
const CONTAINER_1 = "app-container-1";
/** @const {string} */
const CONTAINER_2 = "app-container-2";

/** @const {string} */
const SECTION_NEW_PLAN = "section-new-plan";
/** @const {string} (sic) nombre según solicitud del usuario */
const SECTION_ACTIVE_PLANN = "section-active-plann";

/**
 * @typedef {Object} ComponentRender
 * @property {(host: HTMLElement) => void} render - Render function for the component.
 */

/** @const {!Record<string, !ComponentRender>} */
const RENDERERS = {
  description:  { render: renderDescription },
  timeline:     { render: renderTimeline },
  schedule:     { render: renderSchedule },
  checklist:    { render: renderChecklist },
  supplieslist: { render: renderSuppliesList },
  stepslist:    { render: renderStepslist },
  teamlist:     { render: renderTeamList },
  searchnext:   { render: renderSearchNext },
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
 * Loads and renders the AI generator into #app-container-0.
 * Además, espera el id del proyecto creado y configura el activo.
 * @param {!HTMLElement} parent
 * @return {Promise<void>}
 */
async function loadAiGenerator(parent) {
  try {
    const mod = await import("../components/ai-generator.js");
    const render =
      typeof mod.renderAiGenerator === "function"
        ? mod.renderAiGenerator
        : typeof mod.render === "function"
          ? mod.render
          : null;

    if (!render) {
      throw new Error('[coordinator] "ai-generator.js" does not export a render function');
    }

    const host = createHost(parent, "host-00-ai-generator");
    const api = render(host);

    // Comentario: espera el id del proyecto creado para activar y reflejar en projectList
    if (api && typeof api.onCreated?.then === "function") {
      try {
        const newId = await api.onCreated;
        if (!newId) return;

        const model = getProject(newId);
        if (!model) {
          // eslint-disable-next-line no-console
          console.warn(`[coordinator] project "${newId}" not found after creation`);
          return;
        }

        const { title = null, createdAt = null, updatedAt = null } = model || {};

        // Comentario: upsert en projectList como red de seguridad (si falló en ai-generator)
        addProjectToList({
          id: newId,
          title: title || "New plan",
          createdAt,
          updatedAt,
        }); // upsert por id en projectList. :contentReference[oaicite:4]{index=4}

        // Comentario: define el proyecto activo con título y fechas del modelo
        setActiveProject({ id: newId, title, createdAt, updatedAt }); // :contentReference[oaicite:5]{index=5}

        // Comentario: asegura updatedAt en projectList (por si hay modificaciones inmediatas)
        touchProjectInList(newId, updatedAt || new Date().toISOString()); // :contentReference[oaicite:6]{index=6}

        // Comentario: alterna visibilidad de secciones
        const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
        const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
        if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
        if (sectionActivePlann) visibility.show(sectionActivePlann);

        // Comentario: monta componentes del proyecto activo recién creado
        mountActiveProjectComponents(model);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[coordinator] failed to finalize new project activation:", err);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] failed to load ai-generator:", err);
  }
}

/**
 * Mounts all components with state === 'mounted' from a project model.
 * @param {!Object} projectModel
 * @return {void}
 */
function mountActiveProjectComponents(projectModel) {
  // comentario: valida contenedores base para montaje alternado
  const container1 = document.getElementById(CONTAINER_1);
  const container2 = document.getElementById(CONTAINER_2);

  if (!container1) {
    // eslint-disable-next-line no-console
    console.error(`[coordinator] container #${CONTAINER_1} not found.\nIS TESTER PAGE?`);
    return;
  }

  /** @type {!Array<!HTMLElement>} */
  const parents = [container1];
  if (container2) parents.push(container2); // agrega el segundo contenedor si está presente

  // comentario: extrae componentes montables y ordena por position ascendente
  const components = Array.isArray(projectModel?.components) ? projectModel.components : [];
  const sorted = components
    .filter(
      (c) =>
        c &&
        c.state === "mounted" &&
        typeof c.name === "string" &&
        RENDERERS[c.name] &&
        Number.isFinite(Number(c.position)),
    )
    .sort((a, b) => Number(a.position) - Number(b.position));

  // comentario: monta alternando entre contenedores disponibles
  sorted.forEach((comp, i) => {
    const { name, position } = comp;
    const parent = parents[i % parents.length];
    const hostId = `host-${String(position).padStart(2, "0")}-${name}`;
    const host = createHost(parent, hostId);

    try {
      RENDERERS[name].render(host); // invoca el render del componente
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] failed to render "${name}" in #${host.id}:`, err);
    }
  });
}

/**
 * Starts the app respecting the "active project" gate.
 * @return {void}
 */
export function startApp() {
  // comentario: resuelve secciones de layout
  const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
  const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);

  // comentario: lee id del proyecto activo (no crea archivos si falta)
  const activeId = getActiveProjectId();

  if (!activeId) {
    // ===== Caso 2a: id === null =====
    // comentario: muestra sección de "nuevo plan"
    if (sectionNewPlan) visibility.show(sectionNewPlan);
    else {
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] section #${SECTION_NEW_PLAN} not found`);
    }

    // comentario: carga ai-generator dentro de #app-container-0
    const container0 = document.getElementById(CONTAINER_0);
    if (!container0) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] container #${CONTAINER_0} not found`);
      return;
    }
    // ejecución asíncrona sin esperar bloqueante
    // (no usa promesa de retorno para mantener firma startApp: void)
    // eslint-disable-next-line no-floating-promises
    loadAiGenerator(container0);
    return;
  }

  // ===== Caso 2b: existe id =====
  // comentario: muestra sección de "plan activo"
  if (sectionActivePlann) visibility.show(sectionActivePlann);
  else {
    // eslint-disable-next-line no-console
    console.warn(`[coordinator] section #${SECTION_ACTIVE_PLANN} not found`);
  }

  // comentario: solicita contenido completo del proyecto activo y monta componentes con state='mounted'
  let model = null;
  try {
    model = getProject(activeId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] failed to read active project:", err);
    return;
  }

  if (!model) {
    // eslint-disable-next-line no-console
    console.warn(`[coordinator] project "${activeId}" not found or empty`);
    return;
  }

  mountActiveProjectComponents(model);
}
