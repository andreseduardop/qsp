/**
 * @fileoverview Schedule (activity list with times) UI module.
 * @module components/schedule
 *
 * @description
 * Builds and initializes a schedule list inside the given container based on the
 * `schedule.html` layout: an unordered list where each item has a time input and
 * an inline editor for the activity text. Supports inline editing, creation, and
 * in-list reordering via drag & drop.
 *
 * New requirements in this version:
 * - Computes each activity duration as the forward difference to the next activity (END has no duration).
 * - After a drag & drop reorder, recalculates and assigns new "time" values for all activities:
 *   1) First, compute durations from the pre-DnD order (id, start time, and position).
 *   2) Then, apply these durations to the new order to compute the new start times.
 *   3) If the moved item was the FIRST before DnD, the activity that was SECOND before DnD
 *      takes the old first activity's start time. (Anchor rule.)
 * - END item remains non-draggable, no actions panel, and has editable time.
 * - **v3.6.0**: When a user manually edits the time of any activity or END, activities are
 *   re-sorted by the new times and persisted. END is enforced to be at least 15 minutes
 *   after the last activity; if not, it is automatically adjusted.
 *
 * Persistence is delegated to `core/storage.js` under the key
 * `components.<COMPONENT_NAME>.content`.
 *
 * Differences vs stepslist:
 * - Uses <ul> with classes "app-schedule type-schedule list-group" (no numbering).
 * - Item layout adds a leading <input type="time"> block.
 * - Renames "step" → "activity" in labels, placeholders, and ARIA attributes.
 * - Data model includes {id, text, time}. A special item id "__END__" is reserved for END.
 *
 * @version 3.6.0
 *
 * Code style: follows the Google JavaScript Style Guide.
 * https://google.github.io/styleguide/jsguide.html
 *
 * @exports renderSchedule
 */
import { el, qs, visibility, flashBackground } from "../utils/helpers.js";
import { attachListReorder } from "../utils/drag-and-drop.js";
import * as storage from "../core/storage.js";
import { uid } from "../utils/uid.js";

/* ================================
 * Constants
 * ================================ */
// Comentario: define el id reservado para el ítem final "End"
const END_ID = "__END__";
// Comentario: define el margen mínimo obligatorio entre la última actividad y END
const MIN_GAP_MINUTES = 15;

/* ================================
 * Utilidades de tiempo
 * ================================ */
/**
 * Convierte "HH:MM" a minutos 0..1439.
 * @param {string} hhmm
 * @return {number}
 */
function toMinutes(hhmm) {
  // Comentario: parsea HH:MM, limita al rango diario
  const m = /^\s*(\d{2}):(\d{2})\s*$/.exec(hhmm || "");
  const h = m ? Number(m[1]) : 0;
  const min = m ? Number(m[2]) : 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, min));
}

/**
 * Convierte minutos 0..n a "HH:MM" en 24h (envuelve si excede 1440).
 * @param {number} minutes
 * @return {string}
 */
function fromMinutes(minutes) {
  // Comentario: normaliza y formatea HH:MM
  const total = ((minutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Diferencia hacia adelante entre dos horas (b - a) en minutos, envolviendo en 24h.
 * @param {string} a
 * @param {string} b
 * @return {number}
 */
function diffForward(a, b) {
  // Comentario: calcula b-a con envoltura de 24h
  const am = toMinutes(a);
  const bm = toMinutes(b);
  const d = bm - am;
  return d >= 0 ? d : d + 1440;
}

/**
 * Suma minutos a un "HH:MM" con envoltura de 24h.
 * @param {string} hhmm
 * @param {number} minutes
 * @return {string}
 */
function addMinutes(hhmm, minutes) {
  // Comentario: suma minutos y formatea
  return fromMinutes(toMinutes(hhmm) + (minutes || 0));
}

/* ================================
 * Model (component-scoped; delegates to storage.js)
 * ================================ */
/**
 * @typedef {Object} ScheduleItem
 * @property {string} id
 * @property {string} text
 * @property {string} time  // "HH:MM"
 */
class Model extends EventTarget {
  /**
   * @param {string} componentName
   */
  constructor(componentName) {
    super();
    /** @private {string} */
    this._name = componentName; // Comentario: guarda el nombre del componente
  }

  /**
   * Lee items desde storage, normaliza y retorna actividades (END opcional al final).
   * @return {!Array<ScheduleItem>}
   */
  getAll() {
    // Comentario: obtiene contenido crudo
    const content = storage.getComponentContent(this._name);
    const arr = Array.isArray(content) ? content : [];

    /** @type {!Array<ScheduleItem>} */
    const normal = [];
    /** @type {ScheduleItem|null} */
    let endItem = null;

    for (const it of arr) {
      if (!it || typeof it.id !== "string") continue;
      const text = typeof it.text === "string" ? it.text : "";
      const time =
        typeof it.time === "string" && /^\d{2}:\d{2}$/.test(it.time)
          ? it.time
          : "08:00";
      if (it.id === END_ID) {
        // Comentario: conserva END si existe
        endItem = { id: END_ID, text: text || "End", time: time || "23:59" };
      } else {
        normal.push({ id: it.id, text, time });
      }
    }
    // Comentario: coloca END al final si existe
    return endItem ? [...normal, endItem] : normal;
  }

  /** @private */
  _write(nextItems) {
    // Comentario: escribe items en storage y emite evento de cambio
    storage.setComponentContent(
      this._name,
      nextItems.map(({ id, text, time }) => ({ id, text, time })),
    );
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { name: this._name, items: this.getAll() },
      }),
    );
  }

  /**
   * Agrega una actividad; si es la primera, crea END con +60 min desde esa hora.
   * Si ya existe END, usa su hora actual para la nueva actividad y extiende END +60 min.
   * @param {string} text
   * @param {string=} time
   * @return {void}
   */
  add(text, time = "08:00") {
    // Comentario: agrega una nueva actividad con ajuste del END
    const t = String(text || "").trim();
    if (!t) return;

    const items = this.getAll();
    const hasEnd = items.some((i) => i.id === END_ID);
    const activities = items.filter((i) => i.id !== END_ID);

    let newItem;
    let next = [];

    if (activities.length === 0 && !hasEnd) {
      // Comentario: primera actividad → crea END +60 min
      const endTime = addMinutes(time, 60);
      const end = { id: END_ID, text: "End", time: endTime };
      newItem = { id: uid(), text: t, time };
      next = [newItem, end];
    } else {
      const end = items.find((i) => i.id === END_ID);
      const others = items.filter((i) => i.id !== END_ID);
      const newTime = end ? end.time : time;

      // Comentario: crea la nueva actividad usando la hora del END actual
      newItem = { id: uid(), text: t, time: newTime };

      // Comentario: actualiza el END a +60 min
      const updatedEnd = end
        ? { ...end, time: addMinutes(end.time, 60) }
        : { id: END_ID, text: "End", time: addMinutes(newTime, 60) };

      next = [...others, newItem, updatedEnd];
    }

    this._write(next);
  }

  /**
   * Actualiza el texto (END no puede quedar vacío).
   * @param {string} id
   * @param {string} text
   * @return {void}
   */
  updateText(id, text) {
    // Comentario: asegura 'End' por defecto en END y elimina items vacíos
    const t = String(text ?? "").trim();
    const items = this.getAll().map((i) => {
      if (i.id !== id) return i;
      if (id === END_ID) return { ...i, text: t || "End" };
      return t ? { ...i, text: t } : i;
    });

    if (id !== END_ID && !t) {
      this._write(items.filter((i) => i.id !== id));
    } else {
      this._write(items);
    }
  }

  /**
   * Ordena actividades por hora ascendente de forma estable.
   * @param {!Array<ScheduleItem>} activities
   * @return {!Array<ScheduleItem>}
   */
  static _stableSortByTime(activities) {
    // Comentario: implementa orden estable usando índice original como desempate
    const withIndex = activities.map((it, idx) => ({ it, idx }));
    withIndex.sort((a, b) => {
      const ta = toMinutes(a.it.time);
      const tb = toMinutes(b.it.time);
      if (ta !== tb) return ta - tb;
      return a.idx - b.idx;
    });
    return withIndex.map(({ it }) => it);
  }

  /**
   * Asegura que END sea al menos MIN_GAP_MINUTES después de la última actividad.
   * @param {string} endTime
   * @param {!Array<ScheduleItem>} activitiesSorted
   * @return {string}
   */
  static _enforceEndAfterLast(endTime, activitiesSorted) {
    // Comentario: si no hay actividades, retorna la hora de END sin cambios
    if (!activitiesSorted.length) return endTime;
    const lastStart = activitiesSorted[activitiesSorted.length - 1].time;
    // Comentario: calcula la diferencia hacia adelante y corrige si es insuficiente
    const gap = diffForward(lastStart, endTime);
    if (gap < MIN_GAP_MINUTES) return addMinutes(lastStart, MIN_GAP_MINUTES);
    return endTime;
  }

  /**
   * Actualiza la hora (END inclusive) con reordenamiento por horario y ajuste de END.
   * - Reordena actividades por su hora ascendente cada vez que el usuario edita un time.
   * - END no puede quedar igual o por debajo de la última actividad; si ocurre, se recalcula
   *   a +15 minutos desde la última actividad.
   * - Persiste el nuevo orden.
   * @param {string} id
   * @param {string} time
   * @return {void}
   */
  updateTime(id, time) {
    // Comentario: valida HH:MM y normaliza el valor
    const hhmm = String(time || "");
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return;

    // Comentario: aplica el cambio de hora al item objetivo
    const current = this.getAll();
    const mapped = current.map((i) => (i.id === id ? { ...i, time: hhmm } : i));

    // Comentario: separa actividades y END
    const end = mapped.find((i) => i.id === END_ID) || null;
    const activities = mapped.filter((i) => i.id !== END_ID);

    // Comentario: ordena actividades por la nueva hora
    const sorted = Model._stableSortByTime(activities);

    // Comentario: ajusta END para que esté al menos +15 minutos de la última actividad
    const nextEndTime = Model._enforceEndAfterLast(end?.time || "23:59", sorted);
    const endFinal = end
      ? { ...end, time: nextEndTime }
      : /** @type {ScheduleItem} */ ({ id: END_ID, text: "End", time: nextEndTime });

    // Comentario: escribe el nuevo orden y END ajustado
    this._write([...sorted, endFinal]);
  }

  /**
   * Elimina un item (END no se elimina).
   * @param {string} id
   * @return {void}
   */
  remove(id) {
    // Comentario: protege END
    if (id === END_ID) return;
    const items = this.getAll().filter((i) => i.id !== id);
    this._write(items);
  }

  /**
   * Reordena un item (END no se mueve) y reajusta tiempos preservando duraciones previas.
   * - Calcula duraciones con el orden anterior.
   * - Aplica duraciones a la nueva secuencia.
   * - Regla especial si el arrastrado era el primero antes del DnD: la actividad que
   *   estaba de segunda hereda la hora del primero anterior.
   * @param {string} draggedId
   * @param {number} toIndex
   * @return {void}
   */
  moveToIndexWithReflow(draggedId, toIndex) {
    // Comentario: toma estado PRE-DnD
    const beforeAll = this.getAll();
    const beforeActivities = beforeAll.filter((i) => i.id !== END_ID);
    const endBefore = beforeAll.find((i) => i.id === END_ID) || null;
    if (beforeActivities.length <= 1) return;

    const idxDraggedBefore = beforeActivities.findIndex((i) => i.id === draggedId);
    if (idxDraggedBefore === -1) return;

    const wasFirst = idxDraggedBefore === 0;
    const firstBefore = beforeActivities[0];
    const secondBefore = beforeActivities[1] || null;

    // Comentario: mapa de duraciones (id → minutos) usando el orden previo
    /** @type {Record<string, number>} */
    const durations = {};
    for (let i = 0; i < beforeActivities.length; i++) {
      const cur = beforeActivities[i];
      const nextStart =
        i < beforeActivities.length - 1
          ? beforeActivities[i + 1].time
          : endBefore?.time || "23:59";
      durations[cur.id] = diffForward(cur.time, nextStart);
    }

    // Comentario: construye el NUEVO orden de actividades al aplicar el movimiento
    const activitiesAfter = [...beforeActivities];
    let dest = Math.max(0, Math.min(beforeActivities.length, Number(toIndex)));
    const [moved] = activitiesAfter.splice(idxDraggedBefore, 1);
    if (dest > idxDraggedBefore) dest -= 1; // Comentario: ajusta destino por extracción
    activitiesAfter.splice(dest, 0, moved);

    // Comentario: determina el ancla inicial para la nueva secuencia
    // - Por defecto, se mantiene la hora inicial del primer item "antes del DnD".
    // - Si el arrastrado era el primero, se asume que la actividad que era segunda pasa a ser primera
    //   y toma la hora del primero original (regla solicitada).
    let anchorTime = firstBefore.time; // Comentario: hora del antiguo primero
    if (wasFirst) {
      // Comentario: en caso extremo donde la segunda no termina como primera, se conserva la ancla igual,
      // ya que la intención es que la que quede primera (que típicamente era la segunda) use la hora del primero antiguo.
      anchorTime = firstBefore.time;
    }

    // Comentario: recalcula tiempos a partir del ancla y las duraciones previas
    /** @type {!Array<ScheduleItem>} */
    const reflowedActivities = [];
    let currentStart = anchorTime;

    for (let i = 0; i < activitiesAfter.length; i++) {
      const it = activitiesAfter[i];
      // Comentario: asigna el nuevo time al item actual
      reflowedActivities.push({ ...it, time: currentStart });

      // Comentario: prepara la hora del siguiente sumando la duración del item actual (según orden previo)
      const dur = durations[it.id] ?? 0;
      currentStart = addMinutes(currentStart, dur);
    }

    // Comentario: ajusta END con la nueva hora resultante
    const endAfter =
      endBefore != null
        ? { ...endBefore, time: currentStart }
        : /** @type {ScheduleItem} */ ({ id: END_ID, text: "End", time: currentStart });

    // Comentario: escribe nuevo estado (actividades reordenadas + END)
    this._write([...reflowedActivities, endAfter]);
  }
}

/* ================================
 * View (builds full layout inside container)
 * ================================ */
class View {
  // Comentario: selectores reutilizables
  static SEL = {
    list: "ul.app-schedule.type-schedule.list-group",
    item: "li.list-group-item",
    endItem: "li[data-role='end']",
    newEntry: "li[data-role='new-entry']",
    newEntryInput: "li[data-role='new-entry'] input[type='text']",
    label: "label.form-label",
    time: "input[type='time']",
    btnAdd: "button.app-btn-add",
  };

  // Comentario: crea el layout y devuelve referencias clave
  static buildLayout(containerEl) {
    // Comentario: limpia contenedor destino
    containerEl.innerHTML = "";

    // Comentario: crea columna y tarjeta
    const col = el("div", { className: "col-12" });
    const card = el("div", { className: "app-card col" });

    // Comentario: título
    const h2 = el("h2", { html: "schedule" });

    // Comentario: raíz del componente
    const root = el("div", { attrs: { id: "schedule-container" } });

    // Comentario: lista UL principal
    const ul = el("ul", {
      className: "app-schedule type-schedule list-group",
    });

    root.append(ul);
    card.append(h2, root);
    col.append(card);
    containerEl.append(col);

    return { root, listEl: ul };
  }

  /**
   * @param {!HTMLElement} containerEl
   */
  constructor(containerEl) {
    // Comentario: construye layout y guarda refs
    const { root, listEl } = View.buildLayout(containerEl);
    this.root = root;
    this.listEl = listEl;

    // Comentario: pool de manejadores DnD para limpieza
    this._dndHandles = [];
  }

  /**
   * Renderiza la lista completa con orden: actividades → END (si existe) → nueva entrada.
   * @param {!Array<ScheduleItem>} items
   * @return {void}
   */
  render(items) {
    this.listEl.innerHTML = "";
    const endItem = items.find((i) => i.id === END_ID) || null;
    const activities = items.filter((i) => i.id !== END_ID);

    this.#renderList(this.listEl, activities, { withNewEntry: false });
    if (endItem) this.listEl.appendChild(this.#renderEndItem(endItem));
    this.listEl.appendChild(this.#renderNewItemEntry());

    this.#initDnD(); // Comentario: activa DnD tras render
  }

  // Comentario: inicializa drag & drop en la lista (ignorando END y nueva entrada)
  #initDnD() {
    // Comentario: destruye instancias previas
    this._dndHandles.forEach((h) => {
      try {
        h.destroy?.();
      } catch {}
    });
    this._dndHandles = [];

    const common = {
      // Comentario: ignora filas especiales
      ignoreSelector: "[data-role='new-entry'],[data-role='end']",
      // Comentario: habilita drops en bordes globales
      allowGlobalEdges: true,
      // Comentario: reenvía orden al controlador
      onReorder: (draggedId, toIndex) => this.onReorder?.(draggedId, toIndex),
    };

    this._dndHandles.push(attachListReorder(this.listEl, common));
  }

  // Comentario: renderiza una UL completa
  #renderList(ul, data, { withNewEntry }) {
    const frag = document.createDocumentFragment();
    data.forEach((item) => frag.appendChild(this.#renderItem(item)));
    if (withNewEntry) frag.appendChild(this.#renderNewItemEntry());
    ul.appendChild(frag);
  }

  // Comentario: crea <li> por item estándar
  #renderItem(item) {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
      attrs: { draggable: "true" },
    });
    li.dataset.id = item.id;

    // Comentario: columna que contiene el time y el editor
    const column = el("div", {
      className: "d-flex flex-column flex-grow-1",
    });

    // Comentario: fila de hora
    const timeWrap = el("div", { className: "mb-1" });
    const timeInput = el("input", {
      className: "form-control form-control-plaintext fw-bold p-0",
      attrs: {
        type: "time",
        "aria-label": "Activity time",
        value: item.time || "08:00",
      },
    });
    timeWrap.append(timeInput);

    // Comentario: fila con label + panel de edición (ms-2 para margen)
    const textWrap = el("div", {
      className: "position-relative d-flex align-items-top ms-4",
    });

    const label = el("label", {
      className: "form-label me-auto mb-0",
      attrs: { for: `textarea-for-${item.id}` },
    });
    label.textContent = item.text;

    // Comentario: panel inline inicialmente oculto
    const panel = el("div", { className: "d-flex flex-column ps-1 flex-grow-1 d-none" });

    // Comentario: editor con ARIA para actividad
    const editor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit activity",
        rows: "1",
        id: `textarea-for-${item.id}`,
      },
    });

    // Comentario: acciones 
    const actions = el("div", { className: "d-flex flex-column mt-2 small" });
    const actionDefs = [
      ["save", "Save", "[Enter]"],
      ["discard", "Discard", "[Esc]"],
      ["delete", "Delete", "[Shift+Del]"],
    ];

    actionDefs.forEach(([key, text, hint, icono = false]) => {
      const anchorClassName =
        "text-decoration-none fw-bold mb-2 d-flex justify-content-between";
      const spanClassName = icono ? "app-icono" : "";
      actions.append(
        el("a", {
          className: anchorClassName,
          attrs: { href: "#", "data-action": key },
          html: `<span class="${spanClassName}">${text}</span><span class="text-muted">${hint}</span>`,
        }),
      );
    });

    panel.append(editor, actions);
    textWrap.append(label, panel);

    const btnMove = el("button", {
      className: "btn app-btn-move",
      attrs: {
        type: "button",
        "aria-label": "Move",
        title: "Move",
        "aria-hidden": "true",
        tabindex: "-1",
        draggable: "false",
      },
      html: `<i class="bi bi-arrow-down-up" aria-hidden="true"></i>`,
    });

    column.append(timeWrap, textWrap);
    li.append(column, btnMove);

    // Comentario: listeners de interacción
    // - Cambios de hora
    timeInput.addEventListener("change", () => {
      const next = String(timeInput.value || "").slice(0, 5);
      this.onTimeChange?.(item.id, next);
      // Comentario: realza el item al actualizar hora
      flashBackground(li);
    });

    // - Edición inline del texto
    label.addEventListener("click", () => {
      // Comentario: prepara edición inline
      const currentText = label.textContent.trim();
      visibility.hide(label);
      visibility.show(panel, "d-flex");
      editor.value = currentText || "Editing activity";

      // Comentario: auto-resize
      const autoresize = () => {
        editor.style.height = "auto";
        editor.style.height = editor.scrollHeight + "px";
      };

      // Comentario: sanea saltos de línea → espacios
      const sanitizeNoNewlines = () => {
        const sanitized = editor.value.replace(/\r?\n+/g, " ");
        if (sanitized !== editor.value) {
          const pos = editor.selectionStart;
          editor.value = sanitized;
          editor.selectionStart = editor.selectionEnd = Math.min(
            pos,
            editor.value.length,
          );
        }
      };

      // Comentario: finaliza edición
      const finalize = (mode /* 'commit' | 'cancel' */) => {
        if (finalize._done) return;
        finalize._done = true;

        panel.removeEventListener("pointerdown", onAction);
        panel.removeEventListener("click", onAction);
        editor.removeEventListener("keydown", onKeyDown);
        editor.removeEventListener("input", onInput);
        editor.removeEventListener("blur", onBlur);

        if (mode === "commit") {
          const next = editor.value.trim();
          if (next && next !== currentText) this.onEdit?.(item.id, next);
          if (!next) this.onEdit?.(item.id, ""); // Comentario: vacío → eliminar
        }

        visibility.hide(panel);
        visibility.show(label);
      };

      const onKeyDown = (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
          finalize("commit");
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          finalize("cancel");
        } else if (ke.key === "Delete" && ke.shiftKey) {
          ke.preventDefault();
          editor.value = "";
          finalize("commit");
        }
      };

      const onInput = () => {
        sanitizeNoNewlines();
        autoresize();
      };
      const onBlur = () => finalize("commit");

      const onAction = (ev) => {
        theA: {
          const a = ev.target.closest("a[data-action]");
          if (!a) break theA;
          ev.preventDefault();
          const act = a.dataset.action;
          if (act === "save") finalize("commit");
          else if (act === "discard") finalize("cancel");
          else if (act === "delete") {
            editor.value = "";
            finalize("commit");
          }
        }
      };

      panel.addEventListener("pointerdown", onAction);
      panel.addEventListener("click", onAction);
      editor.addEventListener("keydown", onKeyDown);
      editor.addEventListener("blur", onBlur, { once: true });
      editor.addEventListener("input", onInput);

      // Comentario: foco inicial
      editor.focus();
      const len = editor.value.length;
      editor.setSelectionRange(len, len);
      autoresize();
    });

    return li;
  }

  // Comentario: crea fila especial "End" no arrastrable ni movible, sin acciones, con <input type="time">
  #renderEndItem(item) {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
      attrs: { draggable: "false" },
    });
    li.dataset.role = "end";
    li.dataset.id = item.id;

    // Comentario: columna con input de hora y editor (sin botón mover ni contenedor de acciones)
    const column = el("div", { className: "d-flex flex-column flex-grow-1" });

    // Comentario: fila de hora (igual que otros)
    const timeWrap = el("div", { className: "mb-1" });
    const timeInput = el("input", {
      className: "form-control form-control-plaintext fw-bold p-0",
      attrs: {
        type: "time",
        "aria-label": "Activity time",
        value: item.time || "23:59",
      },
    });
    timeWrap.append(timeInput);

    const textWrap = el("div", {
      className: "position-relative d-flex align-items-top ms-4",
    });

    const label = el("label", {
      className: "form-label flex-grow-1 mb-0",
      attrs: { for: `textarea-for-${item.id}` },
    });
    label.textContent = item.text || "End";

    // Comentario: panel inline sin contenedor de acciones
    const panel = el("div", { className: "d-flex flex-column ps-1 flex-grow-1 d-none" });
    const editor = el("textarea", {
      className: "form-control",
      attrs: {
        "data-role": "inline-editor",
        "aria-label": "Edit activity",
        rows: "1",
        id: `textarea-for-${item.id}`,
      },
    });

    panel.append(editor);
    textWrap.append(label, panel);
    column.append(timeWrap, textWrap);
    li.append(column);

    // Comentario: listeners de interacción
    // - Cambios de hora (END acepta cambios)
    timeInput.addEventListener("change", () => {
      const next = String(timeInput.value || "").slice(0, 5);
      this.onTimeChange?.(item.id, next);
      flashBackground(li);
    });

    // - Edición inline (sin acciones; guarda con Enter o blur, cancela con Esc)
    label.addEventListener("click", () => {
      const currentText = label.textContent.trim();
      visibility.hide(label);
      visibility.show(panel, "d-flex");
      editor.value = currentText || "End";

      const autoresize = () => {
        editor.style.height = "auto";
        editor.style.height = editor.scrollHeight + "px";
      };

      const sanitizeNoNewlines = () => {
        const sanitized = editor.value.replace(/\r?\n+/g, " ");
        if (sanitized !== editor.value) {
          const pos = editor.selectionStart;
          editor.value = sanitized;
          editor.selectionStart = editor.selectionEnd = Math.min(
            pos,
            editor.value.length,
          );
        }
      };

      const finalize = (mode /* 'commit' | 'cancel' */) => {
        if (finalize._done) return;
        finalize._done = true;

        editor.removeEventListener("keydown", onKeyDown);
        editor.removeEventListener("input", onInput);
        editor.removeEventListener("blur", onBlur);

        if (mode === "commit") {
          const next = editor.value.trim();
          this.onEdit?.(item.id, next); // Comentario: el modelo asegura texto por defecto
        }

        visibility.hide(panel);
        visibility.show(label);
      };

      const onKeyDown = (ke) => {
        if (ke.key === "Enter") {
          ke.preventDefault();
        }
        if (ke.key === "Enter") {
          ke.preventDefault();
          finalize("commit");
        } else if (ke.key === "Escape") {
          ke.preventDefault();
          finalize("cancel");
        }
      };

      const onInput = () => {
        sanitizeNoNewlines();
        autoresize();
      };
      const onBlur = () => finalize("commit");

      editor.addEventListener("keydown", onKeyDown);
      editor.addEventListener("blur", onBlur, { once: true });
      editor.addEventListener("input", onInput);

      editor.focus();
      const len = editor.value.length;
      editor.setSelectionRange(len, len);
      autoresize();
    });

    return li;
  }

  // Comentario: crea fila de nueva entrada
  #renderNewItemEntry() {
    const li = el("li", {
      className: "list-group-item p-2 d-flex align-items-center",
    });
    li.dataset.role = "new-entry";
    li.draggable = false;

    // Comentario: input con placeholder/aria/name actualizados
    const input = el("input", {
      className: "form-control",
      attrs: {
        type: "text",
        name: "Add new activity",
        placeholder: "Add activity [Enter]",
        "aria-label": "Add new activity",
        enterkeyhint: "enter",
      },
    });

    const btnAdd = el("button", {
      className: "btn app-btn-add",
      attrs: {
        type: "button",
        title: "Add new activity",
        "aria-label": "Add new activity",
      },
      html: `<i class="bi bi-plus-lg fs-2" aria-hidden="true"></i>`,
    });

    const create = () => {
      const t = input.value.trim();
      if (!t) return;
      this.onCreate?.(t);
      // Comentario: limpia y refocus tras crear
      input.value = "";
      input.focus();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") create();
    });
    btnAdd.addEventListener("click", create);

    li.append(input, btnAdd);
    return li;
  }

  // Comentario: API para enfocar el input de nueva entrada
  focusNewEntryInput() {
    const entry = qs(this.listEl, View.SEL.newEntryInput);
    if (entry) entry.focus({ preventScroll: true });
  }
}

/* ================================
 * Controller
 * ================================ */
class Controller {
  /**
   * @param {!HTMLElement} containerEl
   */
  constructor(containerEl) {
    // Comentario: define y almacena el nombre del componente que controla
    this.COMPONENT_NAME = "schedule";

    // Comentario: instancia modelo y vista
    this.model = new Model(this.COMPONENT_NAME);
    this.view = new View(containerEl);

    // Comentario: banderas para UX de creación
    this.createInFlight = false;
    this.shouldRefocusNewEntry = false;

    // Comentario: render inicial
    this.view.render(this.model.getAll());

    // Comentario: sincroniza vista ante cambios del modelo del mismo componente
    this.model.addEventListener("change", (ev) => {
      const changedName = ev?.detail?.name;
      if (!changedName || changedName === this.COMPONENT_NAME) {
        this.view.render(this.model.getAll());
        if (this.shouldRefocusNewEntry) {
          this.view.focusNewEntryInput();
          this.shouldRefocusNewEntry = false;
        }
        this.createInFlight = false;
      }
    });

    // Comentario: conecta handlers de la vista
    this.view.onCreate = (text) => {
      if (this.createInFlight) return;
      this.createInFlight = true;
      this.shouldRefocusNewEntry = true;
      this.model.add(text);
    };
    this.view.onEdit = (id, text) => {
      if (String(text).trim() === "" && id !== END_ID) {
        this.model.remove(id);
      } else {
        this.model.updateText(id, text);
      }
    };
    this.view.onTimeChange = (id, time) => {
      // Comentario: ahora updateTime también reordena y ajusta END
      this.model.updateTime(id, time);
    };
    this.view.onReorder = (draggedId, toIndex) => {
      // Comentario: usa la versión con recálculo de tiempos post DnD
      this.model.moveToIndexWithReflow(draggedId, toIndex);
    };
  }
}

/* ================================
 * Public API
 * ================================ */

/**
 * renderSchedule(containerEl: HTMLElement)
 * - Called by main.js passing the container where everything must be created.
 * @param {!HTMLElement} containerEl
 * @return {void}
 */
export function renderSchedule(containerEl) {
  // Comentario: valida el contenedor recibido
  if (!containerEl || !(containerEl instanceof HTMLElement)) {
    console.error("[schedule] invalid container element");
    return;
  }
  // Comentario: crea layout y monta controlador sobre el contenedor
  new Controller(containerEl);
}
