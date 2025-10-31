// id.js
// Comentario: genera UUID v4 para asignar al plan.id en la primera carga

export function uuidv4() {
  // Usa Web Crypto si está disponible
  if (crypto && crypto.randomUUID) return crypto.randomUUID();

  // Fallback básico
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

