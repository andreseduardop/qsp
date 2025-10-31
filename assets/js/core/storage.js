/**
 * @fileoverview Low-level storage module for multi-project JSON models in localStorage.
 * @module core/storage
 *
 * @description
 * Administra:
 *  - Proyectos individuales en claves: "project:<id>"
 *  - Lista de proyectos en "projectList"
 *  - Proyecto activo en "activeProject" (solo lectura por defecto; coordinator.js lo actualiza)
 * Además mantiene compatibilidad con el modelo raíz legado "app.model.5" y con
 * las funciones getComponentContent/setComponentContent usadas por los componentes.
 *
 * @version 2.1.0
 *
 * Code style: Google JavaScript Style Guide.
 */

import modelTemplate from "./json/model.json" assert { type: "json" };
// import { uid } from "../utils/uid.js"; // Comentario: se deja disponible si se necesitase más adelante

/** @const {string} Clave del modelo raíz legado */
export const STORAGE_KEY = "app.model.5";

/** @const {string} Clave de la lista de proyectos */
const STORAGE_KEY_PROJECT_LIST = "projectList";

/** @const {string} Clave del proyecto activo */
const STORAGE_KEY_ACTIVE_PROJECT = "activeProject";

/** @const {string} Prefijo para claves de proyectos */
const PROJECT_KEY_PREFIX = "project:";

/* ============================================================================
 * Utilidades internas
 * ========================================================================== */

/** @private */
function keyForProject(id) {
  // Comentario: arma la clave del proyecto con prefijo consistente
  if (!id) throw new Error("[storage] missing project id");
  return PROJECT_KEY_PREFIX + id;
}

/** @private */
function deepClone(obj) {
  // Comentario: clona profundamente un objeto JSON de forma segura
  return JSON.parse(JSON.stringify(obj));
}

/* ============================================================================
 * API: Proyectos (JSON completo en "project:<id>")
 * ========================================================================== */

/**
 * Lee el JSON completo de un proyecto por id.
 * @param {string} id
 * @return {?Object}
 */
export function getProject(id) {
  // Comentario: devuelve el JSON del proyecto o null si no existe
  if (!id) throw new Error("[storage] missing project id");
  const raw = localStorage.getItem(keyForProject(id));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Crea/actualiza un proyecto con id dado.
 * @param {string} id
 * @param {!Object} model
 * @return {void}
 */
export function setProject(id, model) {
  // Comentario: valida y persiste el JSON del proyecto
  if (!id || !model || typeof model !== "object") {
    throw new Error("[storage] invalid project args");
  }
  const next = deepClone(model);
  localStorage.setItem(keyForProject(id), JSON.stringify(next));
}

/**
 * Elimina el JSON completo de un proyecto por id.
 * @param {string} id
 * @return {void}
 */
export function deleteProject(id) {
  // Comentario: borra el proyecto y lo quita de la lista; limpia activo si coincide
  if (!id) throw new Error("[storage] missing project id");
  localStorage.removeItem(keyForProject(id));
  removeProjectFromList(id);

  const ap = readActiveProject(); // Comentario: lee sin crear si no existe
  if (ap?.id === id) {
    writeActiveProject({ id: null }); // Comentario: establece activo nulo explícitamente
  }
}

/* ============================================================================
 * API: Compatibilidad modelo raíz legado "app.model.5"
 * ========================================================================== */

/** @private */
function readRoot() {
  // Comentario: lee el modelo raíz desde localStorage o cae a la plantilla
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : deepClone(modelTemplate);
  } catch {
    return deepClone(modelTemplate);
  }
}

/** @private */
function writeRoot(root) {
  // Comentario: escribe el modelo raíz en localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
}

/** @private */
function findComponentIndex(root, name) {
  // Comentario: busca índice del componente por nombre
  if (!root || !Array.isArray(root.components)) return -1;
  return root.components.findIndex((c) => c && c.name === name);
}

/** @private */
function ensureComponent(root, componentName) {
  // Comentario: garantiza existencia de `components[]` y el componente pedido
  if (!componentName) throw new Error("[storage] missing componentName");
  if (!root || typeof root !== "object") root = {};
  if (!Array.isArray(root.components)) root.components = [];

  let idx = findComponentIndex(root, componentName);
  if (idx === -1) {
    root.components.push({
      name: componentName,
      title: componentName.charAt(0).toUpperCase() + componentName.slice(1),
      content: [],
    });
    idx = root.components.length - 1;
  }

  const comp = root.components[idx];
  if (!comp || typeof comp !== "object") {
    root.components[idx] = { name: componentName, title: componentName, content: [] };
  } else if (!("content" in comp) || comp.content == null) {
    // Comentario: normaliza 'content' con arreglo por defecto
    comp.content = [];
  }
  return root;
}

/**
 * Devuelve una copia defensiva del modelo raíz (legado).
 * @return {!Object}
 */
export function getModel() {
  // Comentario: devuelve copia defensiva del modelo raíz completo
  return deepClone(readRoot());
}

/**
 * Sobrescribe el modelo raíz (legado).
 * @param {!Object} next
 * @return {void}
 */
export function setModel(next) {
  // Comentario: escribe el modelo raíz completo
  if (!next || typeof next !== "object") {
    throw new Error("[storage] invalid model object");
  }
  writeRoot(deepClone(next));
}

/* ============================================================================
 * API: Componentes (compatibilidad; ahora resuelven por proyecto ACTIVO)
 * ========================================================================== */

/** @private */
function ensureProjectComponent(root, componentName) {
  // Comentario: garantiza que exista la entrada del componente dentro del proyecto
  if (!Array.isArray(root.components)) root.components = [];
  let idx = root.components.findIndex((c) => c && c.name === componentName);
  if (idx === -1) {
    root.components.push({
      name: componentName,
      title: componentName.charAt(0).toUpperCase() + componentName.slice(1),
      content: [],
      mounted: false,
      position: Number(root.components.length) + 1,
    });
    idx = root.components.length - 1;
  }
  const comp = root.components[idx];
  if (!("content" in comp) || comp.content == null) comp.content = [];
  return { root, idx };
}

/** @private */
function readActiveProjectModelOrNull() {
  // Comentario: devuelve { id, model } o null si no hay activo o no existe el JSON del proyecto
  const id = getActiveProjectId();
  if (!id) return null;
  const raw = localStorage.getItem(keyForProject(id));
  if (!raw) return null;
  try {
    return { id, model: JSON.parse(raw) };
  } catch {
    return null;
  }
}

/**
 * Devuelve `components.<name>.content` del proyecto ACTIVO.
 * @param {string} componentName
 * @return {*}
 */
export function getComponentContent(componentName) {
  // Comentario: mantiene firma existente; ahora lee del proyecto ACTIVO
  if (!componentName) throw new Error("[storage] missing componentName");
  const ctx = readActiveProjectModelOrNull();
  if (!ctx) {
    // Comentario: si no hay activo o no existe el JSON del proyecto, devuelve null
    return null;
  }
  const { model } = ctx;
  const { root, idx } = ensureProjectComponent(model, componentName);
  return deepClone(root.components[idx].content);
}

/**
 * Reemplaza `components.<name>.content` del proyecto ACTIVO.
 * @param {string} componentName
 * @param {*} content
 * @return {void}
 */
export function setComponentContent(componentName, content) {
  // Comentario: mantiene firma existente; ahora escribe en el proyecto ACTIVO
  if (!componentName) throw new Error("[storage] missing componentName");
  const ctx = readActiveProjectModelOrNull();
  if (!ctx) {
    // Comentario: en ausencia de proyecto activo, lanza error explícito
    throw new Error("[storage] cannot write: no active project");
  }
  const { id, model } = ctx;
  const { root, idx } = ensureProjectComponent(model, componentName);
  root.components[idx].content = deepClone(content);

  // Comentario: actualiza marca temporal y persiste proyecto
  const now = new Date().toISOString();
  root.updatedAt = now;
  localStorage.setItem(keyForProject(id), JSON.stringify(root));

  // Comentario: intenta reflejar updatedAt en projectList (si existe)
  try {
    const rawList = localStorage.getItem(STORAGE_KEY_PROJECT_LIST);
    if (rawList) {
      const list = JSON.parse(rawList);
      if (Array.isArray(list?.projects)) {
        const i = list.projects.findIndex((p) => p.id === id);
        if (i !== -1) {
          list.projects[i] = { ...list.projects[i], updatedAt: now };
          localStorage.setItem(STORAGE_KEY_PROJECT_LIST, JSON.stringify(list));
        }
      }
    }
  } catch {
    // Comentario: ignora inconsistencias en la lista
  }
}

/* ============================================================================
 * API: projectList
 * Estructura: { projects: Array<{id, title, createdAt, updatedAt}> }
 * ========================================================================== */

/** @private */
function readProjectList() {
  // Comentario: lee la lista desde localStorage o devuelve estructura vacía
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECT_LIST);
    const parsed = raw ? JSON.parse(raw) : { projects: [] };
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    return parsed;
  } catch {
    return { projects: [] };
  }
}

/** @private */
function writeProjectList(pl) {
  // Comentario: escribe la lista en localStorage con copia defensiva
  const safe = { projects: Array.isArray(pl?.projects) ? [...pl.projects] : [] };
  localStorage.setItem(STORAGE_KEY_PROJECT_LIST, JSON.stringify(safe));
}

/**
 * Devuelve todos los proyectos listados (copia defensiva).
 * @return {{projects: Array<{id:string, title:string, createdAt?:string, updatedAt?:string}>}}
 */
export function getProjectList() {
  // Comentario: devuelve la lista completa de proyectos
  const pl = readProjectList();
  return deepClone(pl);
}

/**
 * Reemplaza toda la lista (operación en bloque).
 * @param {{projects:Array}} next
 * @return {void}
 */
export function setProjectList(next) {
  // Comentario: valida forma mínima y persiste
  if (!next || !Array.isArray(next.projects)) {
    throw new Error("[storage] setProjectList expects { projects: [] }");
  }
  writeProjectList(next);
}

/**
 * Añade o actualiza un proyecto en la lista (upsert por id).
 * @param {{id:string, title:string, createdAt?:string, updatedAt?:string}} entry
 * @return {void}
 */
export function addProjectToList(entry) {
  // Comentario: inserta/actualiza un proyecto por id
  const { id, title, createdAt, updatedAt } = entry || {};
  if (!id || !title) throw new Error("[storage] invalid project entry", {id, title} );

  const pl = readProjectList();
  const idx = pl.projects.findIndex((p) => p.id === id);
  if (idx === -1) pl.projects.push({ id, title, createdAt, updatedAt });
  else pl.projects[idx] = { ...pl.projects[idx], title, createdAt, updatedAt };
  writeProjectList(pl);
}

/**
 * Elimina un proyecto de la lista por id.
 * @param {string} id
 * @return {void}
 */
export function removeProjectFromList(id) {
  // Comentario: remueve el proyecto por id
  if (!id) throw new Error("[storage] missing project id");
  const pl = readProjectList();
  const next = pl.projects.filter((p) => p.id !== id);
  writeProjectList({ projects: next });
}

/**
 * Cambia el título mostrado de un proyecto (no toca el JSON del proyecto).
 * @param {string} id
 * @param {string} nextTitle
 * @return {void}
 */
export function renameProjectInList(id, nextTitle) {
  // Comentario: actualiza 'title' del proyecto listado
  if (!id || !nextTitle) throw new Error("[storage] missing id/title");
  const pl = readProjectList();
  const idx = pl.projects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  pl.projects[idx] = { ...pl.projects[idx], title: nextTitle };
  writeProjectList(pl);

  // Comentario: sincroniza título en activo si coincide
  try {
    const ap = readActiveProject();
    if (ap?.id === id) writeActiveProject({ ...ap, title: nextTitle });
  } catch {
    // Comentario: ignora si el activo no existe
  }
}

/**
 * Actualiza la marca de tiempo 'updatedAt' del proyecto en la lista.
 * @param {string} id
 * @param {string=} updatedAt
 * @return {void}
 */
export function touchProjectInList(id, updatedAt = new Date().toISOString()) {
  // Comentario: marca actualización en la lista
  if (!id) throw new Error("[storage] missing project id");
  const pl = readProjectList();
  const idx = pl.projects.findIndex((p) => p.id === id);
  if (idx === -1) return;
  pl.projects[idx] = { ...pl.projects[idx], updatedAt };
  writeProjectList(pl);
}

/**
 * Busca una entrada de la lista por id.
 * @param {string} id
 * @return {?{id:string, title:string, createdAt?:string, updatedAt?:string}}
 */
export function findProjectInList(id) {
  // Comentario: devuelve copia de la entrada encontrada (o null)
  if (!id) throw new Error("[storage] missing project id");
  const pl = readProjectList();
  const found = pl.projects.find((p) => p.id === id) || null;
  return found ? deepClone(found) : null;
}

/* ============================================================================
 * API: activeProject
 * Nota importante:
 *  - Se elimina cualquier fallback que cree "activeProject" con nulos.
 *  - Si se requiere y no existe, solo se avisa en consola.
 *  - coordinator.js es el responsable de actualizar/crear el activo.
 * ========================================================================== */

/** @private */
function readActiveProject() {
  // Comentario: lee el proyecto activo; si no existe, avisa en consola y devuelve {id:null}
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT);
    if (!raw) {
      // eslint-disable-next-line no-console
      console.log('[storage] "activeProject" not found in localStorage.');
      return { id: null };
    }
    return JSON.parse(raw);
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[storage] failed to parse "activeProject"; returning {id:null}.');
    return { id: null };
  }
}

/** @private */
function writeActiveProject(ap) {
  // Comentario: escribe el activo en localStorage tal cual se recibe
  localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, JSON.stringify(ap || { id: null }));
}

/**
 * Devuelve el proyecto activo (o { id: null } si no existe o está corrupto).
 * @return {{id: (string|null), title?: (string|null), createdAt?: (string|null), updatedAt?: (string|null)}}
 */
export function getActiveProject() {
  // Comentario: devuelve objeto activo sin crear archivo si falta
  return deepClone(readActiveProject());
}

/**
 * Devuelve solo el id del proyecto activo (o null).
 * @return {?string}
 */
export function getActiveProjectId() {
  // Comentario: ayuda para recuperar el id activo sin efectos colaterales
  const ap = readActiveProject();
  return ap?.id ?? null;
}

/**
 * Define el proyecto activo (uso previsto: coordinator.js).
 * @param {{id:string, title?:string, createdAt?:string, updatedAt?:string}} payload
 * @return {void}
 */
export function setActiveProject({ id, title, createdAt, updatedAt }) {
  // Comentario: actualiza el archivo activo con metadatos
  if (!id) throw new Error("[storage] setActiveProject requires id");
  const ap = {
    id,
    title: title ?? null,
    createdAt: createdAt ?? null,
    updatedAt: updatedAt ?? null,
  };
  writeActiveProject(ap);
}

/**
 * Limpia el proyecto activo (ninguno seleccionado).
 * @return {void}
 */
export function clearActiveProject() {
  // Comentario: establece explícitamente activo nulo (coordinator.js controla cuándo llamarlo)
  writeActiveProject({ id: null, title: null, createdAt: null, updatedAt: null });
}

/**
 * Indica si un id dado es el activo.
 * @param {string} id
 * @return {boolean}
 */
export function isProjectActive(id) {
  // Comentario: compara contra el activo actual
  if (!id) return false;
  const ap = readActiveProject();
  return ap?.id === id;
}
