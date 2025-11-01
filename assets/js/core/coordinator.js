/**
 * @fileoverview App-level coordinator that selects and initializes UI components.
 * @module core/coordinator
 * @version 2.6.0
 *
 * @description
 * Starts the application depending on whether there is an active project.
 * Listens for sidebar events to activate an existing project or create a new one.
 * Ensures components re-render when the active project changes.
 * También ajusta el título principal (#app-title) según el estado de la aplicación.
 */

import { renderSidebar } from "../components/sidebar.js"; // (comentario) Monta el sidebar al iniciar
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
  setActiveProject,   // (comentario) Define activo con metadatos del modelo
  addProjectToList,   // (comentario) Upsert en projectList
  touchProjectInList, // (comentario) Refresca updatedAt en projectList
  clearActiveProject, // (comentario) Limpia el proyecto activo (nuevo)
} from "./storage.js"; // (comentario) APIs de storage

/** @const {string} */
const CONTAINER_0 = "app-container-0";
/** @const {string} */
const CONTAINER_1 = "app-container-1";
/** @const {string} */
const CONTAINER_2 = "app-container-2";

/** @const {string} */
const SECTION_NEW_PLAN = "section-new-plan";
/** @const {string} */
const SECTION_ACTIVE_PLANN = "section-active-plann";


/* ============================================================================
 * Título de la app (#app-title)
 * ========================================================================== */

/**
 * Obtiene y normaliza el nodo <h1 id="app-title">.
 * @return {?HTMLHeadingElement}
 */
function getAppTitleEl() {
  // (comentario) Busca el elemento del título principal
  const h1 = /** @type {?HTMLHeadingElement} */ (document.getElementById("app-title"));
  if (!h1) {
    // eslint-disable-next-line no-console
    console.warn('[coordinator] #app-title not found');
    return null;
  }
  // (comentario) Asegura clases estándar solicitadas
  h1.classList.add("app-icono", "fs-3", "my-0", "me-auto");
  return h1;
}

/**
 * Establece el título para la vista del generador de IA.
 * @return {void}
 */
function setAppTitleForAi() {
  // (comentario) Muestra solo el nombre completo de la app
  const h1 = getAppTitleEl();
  if (!h1) return;
  h1.textContent = ""; // (comentario) Limpia contenido previo
  // (comentario) Inserta texto fijo y espacio fino (&ensp;)
  h1.innerHTML = "quick smart plan";
}

/**
 * Establece el título para un proyecto activo.
 * @param {string=} projectTitle
 * @return {void}
 */
function setAppTitleForProject(projectTitle = "") {
  // (comentario) Muestra sigla 'qsp' y el título del proyecto activo
  const h1 = getAppTitleEl();
  if (!h1) return;

  h1.textContent = ""; // (comentario) Limpia contenido previo
  h1.innerHTML = 'qsp&ensp;<span class="fw-normal fs-4"></span>';

  // (comentario) Inserta el título de forma segura (textContent)
  const span = h1.querySelector("span.fw-normal.fs-4");
  if (span) span.textContent = projectTitle || "(untitled)";
}

/**
 * @typedef {Object} ComponentRender
 * @property {(host: HTMLElement) => void} render
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
};

/**
 * Crea (o reutiliza) un host bajo el padre indicado usando helpers.el().
 * @param {!HTMLElement} parent
 * @param {string} id
 * @return {!HTMLElement}
 */
function createHost(parent, id) {
  // (comentario) Reutiliza el host si ya existe para evitar duplicados
  const existing = document.getElementById(id);
  if (existing) {
    // (comentario) Si existe pero no está bajo el padre esperado, lo reubica
    if (existing.parentElement !== parent) parent.appendChild(existing);
    return existing;
  }

  // (comentario) Crea un host con atributos de trazabilidad
  const host = el("div", {
    attrs: { id, "data-role": "component-host", "data-owner": "coordinator" },
  });
  parent.appendChild(host); // (comentario) Inserta el host en el DOM
  return host;
}

/**
 * Monta el sidebar en la ubicación de offcanvas indicada por el layout.
 * @return {void}
 */
function mountSidebar() {
  // (comentario) Busca el contenedor del sidebar en el layout principal
  const container = document.querySelector(".app-sidebar .offcanvas-body");
  if (!container) {
    // eslint-disable-next-line no-console
    console.warn('[coordinator] sidebar container ".app-sidebar .offcanvas-body" not found');
    return;
  }
  // (comentario) Evita doble montaje simple con flag de datos
  if (container.dataset.mounted === "sidebar") return;

  try {
    renderSidebar(container); // (comentario) Renderiza el módulo sidebar
    container.dataset.mounted = "sidebar"; // (comentario) Marca como montado
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] failed to render sidebar:", err);
  }
}

/**
 * Adjunta manejadores globales (una sola vez).
 * @return {void}
 */
function attachGlobalHandlers() {
  // (comentario) Escucha la petición de nuevo plan desde el sidebar
  window.addEventListener("app:new-plan-requested", () => {
    // (comentario) Asegura secciones del layout
    const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
    const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
    if (sectionNewPlan) visibility.show(sectionNewPlan);
    if (sectionActivePlann) sectionActivePlann.classList.add("d-none");

    // (comentario) Ajusta título para modo generador de IA
    setAppTitleForAi();

    // (comentario) Carga el generador de IA en el contenedor 0
    const container0 = document.getElementById(CONTAINER_0);
    if (!container0) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] container #${CONTAINER_0} not found`);
      return;
    }
    // limpiar proyecto activo en el localStorage
    clearActiveProject();
    // eslint-disable-next-line no-floating-promises
    loadAiGenerator(container0); // (comentario) Ejecuta sin bloquear
  });

  // (comentario) Escucha selección de proyecto existente desde el sidebar
  window.addEventListener("app:select-project", (ev) => {
    /** @type {{id?: string}} */
    const detail = ev?.detail ?? {};
    const id = typeof detail.id === "string" ? detail.id.trim() : "";
    if (!id) {
      // eslint-disable-next-line no-console
      console.warn("[coordinator] select-project event without id");
      return;
    }

    // (comentario) Obtiene el modelo del proyecto seleccionado
    const model = getProject(id);
    if (!model) {
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] project "${id}" not found`);
      return;
    }

    const { title = null, createdAt = null, updatedAt = null } = model || {};

    // (comentario) Define el proyecto activo y actualiza projectList
    setActiveProject({ id, name: title, createdAt, updatedAt });
    touchProjectInList(id, updatedAt || new Date().toISOString());

    // (comentario) Alterna visibilidad de secciones (muestra plan activo)
    const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
    const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
    if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
    if (sectionActivePlann) visibility.show(sectionActivePlann);

    // (comentario) Ajusta título para proyecto activo
    setAppTitleForProject(title || "");

    // (comentario) Monta componentes del plan activo — forzar re-render si cambia el proyecto
    mountActiveProjectComponents(model, id);

    // (comentario) Opcional: sincroniza el hash para navegación profunda
    try {
      // (comentario) Actualiza el hash sin recargar
      history.replaceState(null, "", `/#${encodeURIComponent(id)}`);
    } catch {
      /* (comentario) Ignora si el navegador no soporta history API */
    }
  });
}

/**
 * Carga y renderiza el generador de IA en #app-container-0.
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

    // (comentario) Reutiliza (o crea) el host para evitar duplicados
    const host = createHost(parent, "host-00-ai-generator");

    // (comentario) Evita re-renderizar el mismo módulo si ya está montado
    if (host.dataset.mounted === "ai-generator") return;

    // (comentario) Asegura título de modo generador de IA
    setAppTitleForAi();

    const api = render(host);
    host.dataset.mounted = "ai-generator"; // (comentario) Marca como montado

    // (comentario) Espera el id del proyecto creado para activar y reflejar en projectList
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

        // (comentario) Upsert en projectList como red de seguridad
        addProjectToList({
          id: newId,
          title: title || 'New plan',
          createdAt,
          updatedAt,
        });

        // (comentario) Notifica globalmente que hay un nuevo plan disponible
        window.dispatchEvent(
          new CustomEvent("app:project-created", {
            detail: { id: newId, title: title, source: "coordinator" },
          }),
        );

        // (comentario) Define el proyecto activo con título y fechas del modelo
        setActiveProject({ id: newId, name: title, createdAt, updatedAt });

        // (comentario) Asegura updatedAt en projectList
        touchProjectInList(newId, updatedAt || new Date().toISOString());

        // (comentario) Alterna visibilidad de secciones
        const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
        const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
        if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
        if (sectionActivePlann) visibility.show(sectionActivePlann);

        // (comentario) Ajusta título para proyecto activo recién creado
        setAppTitleForProject(title || "");

        // (comentario) Monta componentes del proyecto activo recién creado (forzando afinidad por proyecto)
        mountActiveProjectComponents(model, newId);
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
 * Monta todos los componentes con state === 'mounted' del modelo del proyecto.
 * Fuerza re-render cuando cambia el proyecto activo.
 * @param {!Object} projectModel
 * @param {string=} activeProjectId
 * @return {void}
 */
function mountActiveProjectComponents(projectModel, activeProjectId = getActiveProjectId() || "") {
  // (comentario) Valida contenedores base para montaje alternado
  const container1 = document.getElementById(CONTAINER_1);
  const container2 = document.getElementById(CONTAINER_2);

  if (!container1) {
    // eslint-disable-next-line no-console
    console.error(`[coordinator] container #${CONTAINER_1} not found.\nIS TESTER PAGE?`);
    return;
  }

  /** @type {!Array<!HTMLElement>} */
  const parents = [container1];
  if (container2) parents.push(container2); // (comentario) Agrega el segundo contenedor si está presente

  // (comentario) Limpia hosts de proyectos antiguos para prevenir “fantasmas”
  parents.forEach((parent) => {
    const stale = parent.querySelectorAll(
      '[data-role="component-host"][data-owner="coordinator"][data-project-id]',
    );
    stale.forEach((el) => {
      if (el.dataset.projectId !== activeProjectId) {
        // (comentario) Borra el host si pertenece a otro proyecto
        el.remove();
      }
    });
  });

  // (comentario) Extrae componentes montables y ordena por position ascendente
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

  // (comentario) Monta alternando entre contenedores disponibles
  sorted.forEach((comp, i) => {
    const { name, position } = comp;
    const parent = parents[i % parents.length];
    const hostId = `host-${String(position).padStart(2, "0")}-${name}`;
    const host = createHost(parent, hostId);

    // (comentario) Si el host ya corresponde a este componente y proyecto, no re-renderiza
    if (host.dataset.mounted === name && host.dataset.projectId === activeProjectId) {
      return;
    }

    // (comentario) Si estaba montado con otro proyecto, limpia y re-renderiza
    host.textContent = "";
    try {
      RENDERERS[name].render(host); // (comentario) Invoca el render del componente
      host.dataset.mounted = name;   // (comentario) Marca host como montado para ese nombre
      host.dataset.projectId = activeProjectId; // (comentario) Liga el host al proyecto activo
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] failed to render "${name}" in #${host.id}:`, err);
    }
  });
}

/**
 * Inicia la app respetando la compuerta de "proyecto activo".
 * @return {void}
 */
export function startApp() {
  // (comentario) Manejadores globales (escucha acciones de UI como "New Plan" y "Select Project")
  attachGlobalHandlers();
  // (comentario) Monta el sidebar siempre al inicio
  mountSidebar();

  // (comentario) Resuelve secciones de layout
  const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
  const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);

  // (comentario) Lee id del proyecto activo (no crea archivos si falta)
  const activeId = getActiveProjectId();

  if (!activeId) {
    // ===== Caso 2a: id === null =====
    // (comentario) Muestra sección de "nuevo plan"
    if (sectionNewPlan) visibility.show(sectionNewPlan);
    else {
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] section #${SECTION_NEW_PLAN} not found`);
    }

    // (comentario) Ajusta título para modo generador de IA
    setAppTitleForAi();

    // (comentario) Carga ai-generator dentro de #app-container-0
    const container0 = document.getElementById(CONTAINER_0);
    if (!container0) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] container #${CONTAINER_0} not found`);
      return;
    }
    // eslint-disable-next-line no-floating-promises
    loadAiGenerator(container0); // (comentario) Ejecución asíncrona sin esperar bloqueante
    return;
  }

  // ===== Caso 2b: existe id =====
  // (comentario) Muestra sección de "plan activo"
  if (sectionActivePlann) visibility.show(sectionActivePlann);
  else {
    // eslint-disable-next-line no-console
    console.warn(`[coordinator] section #${SECTION_ACTIVE_PLANN} not found`);
  }

  // (comentario) Solicita contenido completo del proyecto activo y monta componentes con state='mounted'
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

  // (comentario) Ajusta título para proyecto activo
  setAppTitleForProject(model.title || "");

  // (comentario) Monta respetando afinidad de proyecto para evitar F5
  mountActiveProjectComponents(model, activeId);
}
