// Reglas de cumplimiento para escribir proactivamente (Colombia).
// Resumen de lo que implementa (confirma con tu abogado cómo aplica a tu caso):
//  - Ley 2300 de 2023 ("Dejen de fregar"): contacto de lunes a viernes de 7:00 a.m. a 7:00 p.m. y
//    sábados de 8:00 a.m. a 3:00 p.m.; nunca domingos ni festivos; por canales autorizados.
//  - Ley 1581 de 2012 (Habeas Data): aviso y autorización en el primer mensaje, y baja cuando el usuario la pida.

const OFFSET_COLOMBIA = -5; // UTC-5, sin horario de verano
const DIA = 24 * 3600 * 1000;

export const AVISO_PRIVACIDAD =
  "_Soy un asistente de IA. Al continuar autorizas el tratamiento de tus datos personales según nuestra política de privacidad. Escribe BAJA si no quieres recibir más mensajes._";

const PALABRAS_BAJA = ["baja", "stop", "no me escriban", "no me escribas", "no quiero mensajes", "no mas mensajes", "dejen de escribirme", "darme de baja"];

export function pideBaja(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  return PALABRAS_BAJA.some((p) => (p.includes(" ") ? t.includes(p) : t === p || t === p + "." || t === p + "!"));
}

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher), como milisegundos UTC
function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(anio, mes - 1, dia);
}

// Ley Emiliani: el festivo se traslada al lunes siguiente (si ya es lunes, se queda)
const alLunes = (ms) => ms + ((8 - new Date(ms).getUTCDay()) % 7) * DIA;

const cacheFestivos = new Map();
export function festivosColombia(anio) {
  if (cacheFestivos.has(anio)) return cacheFestivos.get(anio);
  const p = pascua(anio);
  const fijos = [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]].map(([m, d]) => Date.UTC(anio, m, d));
  const trasladados = [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]].map(([m, d]) => alLunes(Date.UTC(anio, m, d)));
  const religiosos = [p - 3 * DIA, p - 2 * DIA, p + 43 * DIA, p + 64 * DIA, p + 71 * DIA]; // Jueves y Viernes Santo, Ascensión, Corpus Christi, Sagrado Corazón
  const set = new Set([...fijos, ...trasladados, ...religiosos].map((ms) => new Date(ms).toISOString().slice(0, 10)));
  cacheFestivos.set(anio, set);
  return set;
}

// Partes de la fecha en hora de Colombia
export function partesColombia(fecha) {
  const l = new Date(new Date(fecha).getTime() + OFFSET_COLOMBIA * 3600 * 1000);
  return { anio: l.getUTCFullYear(), iso: l.toISOString().slice(0, 10), dow: l.getUTCDay(), horas: l.getUTCHours() + l.getUTCMinutes() / 60 };
}

export const esFestivo = (fecha) => {
  const { anio, iso } = partesColombia(fecha);
  return festivosColombia(anio).has(iso);
};

// ¿Se puede escribir ahora de forma proactiva? Devuelve { ok, motivo }
export function puedeContactar(fecha = new Date()) {
  const { dow, horas } = partesColombia(fecha);
  if (dow === 0) return { ok: false, motivo: "domingo" };
  if (esFestivo(fecha)) return { ok: false, motivo: "festivo" };
  if (dow === 6) return horas >= 8 && horas < 15 ? { ok: true } : { ok: false, motivo: "fuera del horario de sábado (8:00 a.m. a 3:00 p.m.)" };
  return horas >= 7 && horas < 19 ? { ok: true } : { ok: false, motivo: "fuera del horario (7:00 a.m. a 7:00 p.m.)" };
}
