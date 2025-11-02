/**
 * @fileoverview App-level coordinator that selects and initializes UI components.
 * @module core/coordinator
 * @version 2.9.0
 *
 * @description
 * Starts the application depending on whether there is an active project.
 * Listens for sidebar events to activate an existing project or create a new one.
 * Ensures components re-render when the active project changes.
 * También ajusta el título principal (#app-title) según el estado de la aplicación.
 * Además, verifica disponibilidad de Prompt API antes de cargar el módulo 'ai-generator.js'.
 * Si Prompt API está "unavailable", muestra un aviso y prepara un proyecto de ejemplo.
 */

import { renderSidebar } from "../components/sidebar.js"; // Monta el sidebar al iniciar
import { renderDescription } from "../components/description.js";
import { renderChecklist } from "../components/checklist.js";
import { renderSuppliesList } from "../components/supplieslist.js";
import { renderStepslist } from "../components/stepslist.js";
import { renderSchedule } from "../components/schedule.js";
import { renderTeamList } from "../components/teamlist.js";
import { renderSearchNext } from "../components/searchnext.js";
import { renderTimeline } from "../components/timeline.js";
import { el, visibility } from "../utils/helpers.js";
import { uid } from "../utils/uid.js"; // Genera ids únicos
import modelExample from "./json/model-example.json" assert { type: "json" }; // Modelo de ejemplo cuando no hay IA
import {
  getActiveProjectId,
  getProject,
  setActiveProject,   // Define activo con metadatos del modelo
  addProjectToList,   // Upsert en projectList
  touchProjectInList, // Refresca updatedAt en projectList
  clearActiveProject, // Limpia el proyecto activo (nuevo)
  setProject,         // Persiste un proyecto completo en localStorage
} from "./storage.js"; // APIs de storage

/** @const {string} */
const CONTAINER_0 = "app-container-0";
/** @const {string} */
const CONTAINER_1 = "app-container-1";
/** @const {string} */
const CONTAINER_2 = "app-container-2";

/** @const {string} */
const SECTION_NEW_PLAN = "section-new-plan";
/** @const {string} */
const SECTION_NOTIFICATION = "section-notification";
/** @const {string} */
const SECTION_ACTIVE_PLANN = "section-active-plann";

/* ============================================================================
 * Prompt API availability (suave)
 * ========================================================================== */

/** @const {!Object} */
const SESSION_OPTIONS = {
  // Declara salidas esperadas según la guía del usuario
  expectedOutputs: [
    { type: "text", languages: ["en"] },
  ],
};

/**
 * Verifica disponibilidad de Prompt API usando LanguageModel.availability().
 * Retorna uno de: "unavailable" | "downloadable" | "downloading" | "available".
 * @return {Promise<string>}
 * @throws {Error} Si availability() lanza error.
 */
async function getPromptApiAvailability() {
  // Si no existe el símbolo global, se considera no disponible
  const hasApi =
    typeof globalThis !== "undefined" &&
    globalThis.LanguageModel &&
    typeof globalThis.LanguageModel.availability === "function";

  if (!hasApi) {
    return "unavailable";
  }

  let availability;
  try {
    // Invoca availability con las opciones de sesión provistas
    availability = await globalThis.LanguageModel.availability({ ...SESSION_OPTIONS });
  } catch (err) {
    // Re-lanza con mensaje requerido por el usuario
    throw new Error(`[prompt-api] availability() failed: ${err?.message || err}`);
  }
  return availability;
}

/* ============================================================================
 * Fallback sin IA (withoutAi)
 * ========================================================================== */

/**
 * Modo sin IA: limpia el contenedor, muestra una notificación HTML
 * y genera un proyecto de ejemplo basado en model-example.json.
 * Además, persiste el proyecto, lo marca como activo y monta sus componentes.
 * @param {!HTMLElement=} _parent (sin uso directo aquí; reservado para futuras mejoras)
 * @return {Promise<void>}
 */
async function withoutAi(_parent) {
  // Clona el modelo de ejemplo
  const clone = JSON.parse(JSON.stringify(modelExample));

  // Genera id
  const id = uid();

  // Calcula fechas: ISO para persistencia y MM-DD-YYYY para título
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0"); // Rellena con cero a la izquierda
  const now = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`; // Formatea MM-DD-YYYY
  const nowISO = d.toISOString(); // Mantiene ISO para createdAt/updatedAt

  // Asigna campos obligatorios
  clone.id = id;
  clone.createdAt = nowISO;
  clone.updatedAt = nowISO;
  clone.title = `Project ${now}`; // Construye el título solicitado

  try {
    // Persiste el proyecto y lo lista/marca como activo
    setProject(id, clone);
    addProjectToList({
      id,
      title: clone.title,
      createdAt: nowISO,
      updatedAt: nowISO,
    });
    setActiveProject({ id, title: clone.title || null, createdAt: nowISO, updatedAt: nowISO });
    touchProjectInList(id, nowISO);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] failed to persist fallback project:", err);
  }

  // Alterna visibilidad: oculta "nuevo plan" y muestra "plan activo"
  const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
  const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
  if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
  if (sectionActivePlann) visibility.show(sectionActivePlann);

  // Ajusta título para proyecto activo
  setAppTitleForProject(clone.title || "");

  // Monta los componentes del proyecto recién creado
  try {
    mountActiveProjectComponents(clone, id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] failed to mount components for fallback project:", err);
  }

  // Sincroniza el hash para navegación directa al proyecto
  try {
    history.replaceState(null, "", `/#${encodeURIComponent(id)}`);
  } catch {
    /* Ignora si el navegador no soporta history API */
  }
  // Emite evento para actualizar sidebar
  try {
    window.dispatchEvent(
      new CustomEvent("app:project-created", {
        detail: { id, title: clone.title, source: "coordinator" }, // comenta: pasa id/título
      }),
    );
    // Si se quiere que otros módulos reaccionen al activo:
    window.dispatchEvent(
      new CustomEvent("app:active-project-changed", {
        detail: { id, title: clone.title, source: "coordinator" }, // comenta: sincroniza activo
      }),
    );
  } catch (err) {
    console.error("[coordinator] failed to dispatch events.", err);
  }
}

/* ============================================================================
 * Título de la app (#app-title)
 * ========================================================================== */

/**
 * Obtiene y normaliza el nodo <h1 id="app-title">.
 * @return {?HTMLHeadingElement}
 */
function getAppTitleEl() {
  // Busca el elemento del título principal
  const h1 = /** @type {?HTMLHeadingElement} */ (document.getElementById("app-title"));
  if (!h1) {
    // eslint-disable-next-line no-console
    console.warn('[coordinator] #app-title not found');
    return null;
  }
  // Asegura clases estándar solicitadas
  h1.classList.add("app-icono", "fs-3", "my-0", "me-auto");
  return h1;
}

/**
 * Establece el título para la vista del generador de IA.
 * @return {void}
 */
function setAppTitleForAi() {
  // Muestra solo el nombre completo de la app
  const h1 = getAppTitleEl();
  if (!h1) return;
  h1.textContent = ""; // Limpia contenido previo
  // Inserta texto fijo
  h1.innerHTML = "quick smart plan";
}

/**
 * Establece el título para un proyecto activo.
 * @param {string=} projectTitle
 * @return {void}
 */
function setAppTitleForProject(projectTitle = "") {
  // Muestra sigla 'qsp' y el título del proyecto activo
  const h1 = getAppTitleEl();
  if (!h1) return;

  h1.textContent = ""; // Limpia contenido previo
  h1.innerHTML = 'qsp&ensp;<span class="fw-normal fs-4"></span>';

  // Inserta el título de forma segura (textContent)
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
  // Reutiliza el host si ya existe para evitar duplicados
  const existing = document.getElementById(id);
  if (existing) {
    // Si existe pero no está bajo el padre esperado, lo reubica
    if (existing.parentElement !== parent) parent.appendChild(existing);
    return existing;
  }

  // Crea un host con atributos de trazabilidad
  const host = el("div", {
    attrs: { id, "data-role": "component-host", "data-owner": "coordinator" },
  });
  parent.appendChild(host); // Inserta el host en el DOM
  return host;
}

/**
 * Monta el sidebar en la ubicación de offcanvas indicada por el layout.
 * @return {void}
 */
function mountSidebar() {
  // Busca el contenedor del sidebar en el layout principal
  const container = document.querySelector(".app-sidebar .offcanvas-body");
  if (!container) {
    // eslint-disable-next-line no-console
    console.warn('[coordinator] sidebar container ".app-sidebar .offcanvas-body" not found');
    return;
  }
  // Evita doble montaje simple con flag de datos
  if (container.dataset.mounted === "sidebar") return;

  try {
    renderSidebar(container); // Renderiza el módulo sidebar
    container.dataset.mounted = "sidebar"; // Marca como montado
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
  // Escucha la petición de nuevo plan desde el sidebar
  window.addEventListener("app:new-plan-requested", () => {
    // Asegura secciones del layout
    const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
    const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
    if (sectionNewPlan) visibility.show(sectionNewPlan);
    if (sectionActivePlann) sectionActivePlann.classList.add("d-none");

    // Ajusta título para modo generador de IA
    setAppTitleForAi();

    // Carga el generador de IA en el contenedor 0
    const container0 = document.getElementById(CONTAINER_0);
    if (!container0) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] container #${CONTAINER_0} not found`);
      return;
    }
    // limpiar proyecto activo en el localStorage
    clearActiveProject();
    // eslint-disable-next-line no-floating-promises
    loadAiGenerator(container0); // Ejecuta sin bloquear
  });

  // Escucha selección de proyecto existente desde el sidebar
  window.addEventListener("app:select-project", (ev) => {
    /** @type {{id?: string}} */
    const detail = ev?.detail ?? {};
    const id = typeof detail.id === "string" ? detail.id.trim() : "";
    if (!id) {
      // eslint-disable-next-line no-console
      console.warn("[coordinator] select-project event without id");
      return;
    }

    // Obtiene el modelo del proyecto seleccionado
    const model = getProject(id);
    if (!model) {
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] project "${id}" not found`);
      return;
    }

    const { title = null, createdAt = null, updatedAt = null } = model || {};

    // Define el proyecto activo y actualiza projectList
    setActiveProject({ id, title, createdAt, updatedAt });
    touchProjectInList(id, updatedAt || new Date().toISOString());

    // Alterna visibilidad de secciones (muestra plan activo)
    const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
    const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
    if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
    if (sectionActivePlann) visibility.show(sectionActivePlann);

    // Ajusta título para proyecto activo
    setAppTitleForProject(title || "");

    // Monta componentes del plan activo — forzar re-render si cambia el proyecto
    mountActiveProjectComponents(model, id);

    // Opcional: sincroniza el hash para navegación profunda
    try {
      history.replaceState(null, "", `/#${encodeURIComponent(id)}`);
    } catch {
      /* Ignora si el navegador no soporta history API */
    }
  });
}

/**
 * Carga y renderiza el generador de IA en #app-container-0.
 * Antes de importar el módulo, verifica disponibilidad de Prompt API.
 * Si availability === "unavailable", publica aviso en consola y ejecuta withoutAi().
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

    // Reutiliza (o crea) el host para evitar duplicados
    const host = createHost(parent, "host-00-ai-generator");

    // Evita re-renderizar el mismo módulo si ya está montado
    if (host.dataset.mounted === "ai-generator") return;

    // Asegura título de modo generador de IA
    setAppTitleForAi();

    const api = render(host);
    host.dataset.mounted = "ai-generator"; // Marca como montado

    // Espera el id del proyecto creado para activar y reflejar en projectList
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

        // Upsert en projectList como red de seguridad
        addProjectToList({
          id: newId,
          title: title || 'New plan',
          createdAt,
          updatedAt,
        });

        // Notifica globalmente que hay un nuevo plan disponible
        window.dispatchEvent(
          new CustomEvent("app:project-created", {
            detail: { id: newId, title: title, source: "coordinator" },
          }),
        );

        // Define el proyecto activo con título y fechas del modelo
        setActiveProject({ id: newId, title, createdAt, updatedAt });

        // Asegura updatedAt en projectList
        touchProjectInList(newId, updatedAt || new Date().toISOString());

        // Alterna visibilidad de secciones
        const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
        const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);
        if (sectionNewPlan) sectionNewPlan.classList.add("d-none");
        if (sectionActivePlann) visibility.show(sectionActivePlann);

        // Ajusta título para proyecto activo recién creado
        setAppTitleForProject(title || "");

        // Monta componentes del proyecto activo recién creado
        mountActiveProjectComponents(model, newId);

        // Sincroniza hash
        try {
          history.replaceState(null, "", `/#${encodeURIComponent(newId)}`);
        } catch { /* Ignora */ }
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
async function mountActiveProjectComponents(projectModel, activeProjectId = getActiveProjectId() || "") {
  // Verifica si el modelo indica que NO fue generado por IA; si es falso, muestra aviso
  const availability = await getPromptApiAvailability();
    if (availability === "unavailable") {
    // Busca la sección de notificación y la hace visible
    const sectionNotification = document.getElementById(SECTION_NOTIFICATION);
    if (sectionNotification) visibility.show(sectionNotification);
  }

  // Valida contenedores base para montaje alternado
  const container1 = document.getElementById(CONTAINER_1);
  const container2 = document.getElementById(CONTAINER_2);

  if (!container1) {
    // eslint-disable-next-line no-console
    console.error(`[coordinator] container #${CONTAINER_1} not found.\nIS TESTER PAGE?`);
    return;
  }

  /** @type {!Array<!HTMLElement>} */
  const parents = [container1];
  if (container2) parents.push(container2); // Agrega el segundo contenedor si está presente

  // Limpia hosts de proyectos antiguos para prevenir “fantasmas”
  parents.forEach((parent) => {
    const stale = parent.querySelectorAll(
      '[data-role="component-host"][data-owner="coordinator"][data-project-id]',
    );
    stale.forEach((el) => {
      if (el.dataset.projectId !== activeProjectId) {
        // Borra el host si pertenece a otro proyecto
        el.remove();
      }
    });
  });

  // Extrae componentes montables y ordena por position ascendente
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

  // Monta alternando entre contenedores disponibles
  sorted.forEach((comp, i) => {
    const { name, position } = comp;
    const parent = parents[i % parents.length];
    const hostId = `host-${String(position).padStart(2, "0")}-${name}`;
    const host = createHost(parent, hostId);

    // Si el host ya corresponde a este componente y proyecto, no re-renderiza
    if (host.dataset.mounted === name && host.dataset.projectId === activeProjectId) {
      return;
    }

    // Si estaba montado con otro proyecto, limpia y re-renderiza
    host.textContent = "";
    try {
      RENDERERS[name].render(host); // Invoca el render del componente
      host.dataset.mounted = name;   // Marca host como montado para ese nombre
      host.dataset.projectId = activeProjectId; // Liga el host al proyecto activo
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
export async function startApp() {
  // Manejadores globales (escucha acciones de UI como "New Plan" y "Select Project")
  attachGlobalHandlers();
  // Monta el sidebar siempre al inicio
  mountSidebar();

  // Resuelve secciones de layout
  const sectionNewPlan = document.getElementById(SECTION_NEW_PLAN);
  const sectionActivePlann = document.getElementById(SECTION_ACTIVE_PLANN);

  // Lee id del proyecto activo 
  const activeId = getActiveProjectId();
  if (!activeId) {
    // Verifica disponibilidad de Prompt API 
    const availability = await getPromptApiAvailability();
    if (availability === "unavailable") {
      // eslint-disable-next-line no-console
      console.warn("[coordinator] Built-in AI not available.");
      await withoutAi(); // Ejecuta modo sin IA (ahora monta componentes)
      return; // Sale temprano; no intenta cargar ai-generator
    }

    // ===== Caso 2a: id === null =====
    // Muestra sección de "nuevo plan"
    if (sectionNewPlan) visibility.show(sectionNewPlan);
    else {
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] section #${SECTION_NEW_PLAN} not found`);
    }

    // Ajusta título para modo generador de IA
    setAppTitleForAi();

    // Carga ai-generator dentro de #app-container-0 (previa verificación Prompt API)
    const container0 = document.getElementById(CONTAINER_0);
    if (!container0) {
      // eslint-disable-next-line no-console
      console.error(`[coordinator] container #${CONTAINER_0} not found`);
      return;
    }
    // eslint-disable-next-line no-floating-promises
    loadAiGenerator(container0); // Ejecución asíncrona sin esperar bloqueante
    return;
  }

  // ===== Caso 2b: existe id =====
  // Muestra sección de "plan activo"
  if (sectionActivePlann) visibility.show(sectionActivePlann);
  else {
    // eslint-disable-next-line no-console
    console.warn(`[coordinator] section #${SECTION_ACTIVE_PLANN} not found`);
  }

  // Solicita contenido completo del proyecto activo y monta componentes con state='mounted'
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

  // Ajusta título para proyecto activo
  setAppTitleForProject(model.title || "");

  // Monta respetando afinidad de proyecto para evitar F5
  mountActiveProjectComponents(model, activeId);
}
