// "Base de datos" del demo: un archivo JSON que simula Google Sheets (CRM),
// Google Calendar, el historial de WhatsApp (Supabase/Postgres en producción)
// y un reloj simulado que permite "adelantar el tiempo" durante la presentación.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agenda } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.join(here, "..", "data", "db.json");

const HORA = 60 * 60 * 1000;
let db = null;

// ---------- Reloj simulado ----------
export function ahora() {
  return new Date(Date.now() + (db?.relojOffsetMs ?? 0));
}

export function adelantarReloj(horas) {
  db.relojOffsetMs += horas * HORA;
  guardar();
}

// Fecha/hora en Colombia, legible: "martes 21 de octubre, 3:30 p. m."
export function formatoLocal(fecha, conHora = true) {
  const opciones = { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" };
  if (conHora) Object.assign(opciones, { hour: "numeric", minute: "2-digit" });
  return new Date(fecha).toLocaleString("es-CO", opciones);
}

// ---------- Persistencia ----------
export function cargar() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } else {
    db = semilla();
    guardar();
  }
  return db;
}

export function guardar() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function reiniciar() {
  db = semilla();
  guardar();
}

export function getDb() {
  return db;
}

// ---------- CRM (Google Sheets) ----------
export function buscarLead(telefono) {
  return db.leads.find((l) => l.telefono === telefono);
}

export function upsertLead(telefono, cambios) {
  let lead = buscarLead(telefono);
  if (!lead) {
    lead = {
      telefono,
      nombre: "",
      correo: "",
      negocio: "",
      servicio: "",
      estado: "Nuevo",
      creado: ahora().toISOString(),
      cotizadoEn: null,
      seguimientoEn: null,
      notas: "",
    };
    db.leads.push(lead);
  }
  for (const [k, v] of Object.entries(cambios)) {
    if (v !== undefined && v !== null && v !== "") lead[k] = v;
  }
  lead.actualizado = ahora().toISOString();
  guardar();
  return lead;
}

// ---------- Calendario (Google Calendar) ----------
// Convierte "día local + hora local" de Colombia a un instante UTC.
function instanteLocal(fechaBase, hora, minuto = 0) {
  const off = agenda.zonaHorariaOffset;
  const local = new Date(fechaBase.getTime() + off * HORA);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hora - off, minuto));
}

export function horariosDisponibles() {
  const libres = [];
  const ocupado = (inicio) =>
    db.eventos.some((e) => {
      const ei = new Date(e.inicio).getTime();
      const ef = new Date(e.fin).getTime();
      const fin = inicio.getTime() + agenda.duracionMin * 60000;
      return inicio.getTime() < ef && fin > ei;
    });

  let dia = new Date(ahora().getTime());
  let diasHabiles = 0;
  while (diasHabiles < agenda.diasAOfrecer) {
    dia = new Date(dia.getTime() + 24 * HORA);
    const diaSemana = new Date(dia.getTime() + agenda.zonaHorariaOffset * HORA).getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // sin fines de semana
    diasHabiles++;
    for (let h = agenda.horaInicio; h < agenda.horaFin; h++) {
      const inicio = instanteLocal(dia, h);
      if (!ocupado(inicio)) libres.push(inicio.toISOString());
    }
  }
  return libres;
}

export function crearEvento({ inicio, titulo, invitado, correo, telefono }) {
  const ini = new Date(inicio);
  if (isNaN(ini)) throw new Error("Fecha inválida");
  if (!horariosDisponibles().includes(ini.toISOString())) {
    throw new Error("Ese horario ya no está disponible");
  }
  const letras = () => Math.random().toString(36).replace(/[^a-z]/g, "").padEnd(4, "x");
  const evento = {
    id: "ev_" + Math.random().toString(36).slice(2, 9),
    titulo,
    inicio: ini.toISOString(),
    fin: new Date(ini.getTime() + agenda.duracionMin * 60000).toISOString(),
    invitado,
    correo,
    telefono,
    meet: `https://meet.google.com/${letras().slice(0, 3)}-${letras().slice(0, 4)}-${letras().slice(0, 3)}`,
    creadoPor: "Agente 2 · Agendador",
  };
  db.eventos.push(evento);
  guardar();
  return evento;
}

// ---------- Conversaciones (memoria por número de teléfono) ----------
export function conversacion(telefono) {
  if (!db.conversaciones[telefono]) {
    db.conversaciones[telefono] = { historialIA: [], mensajes: [], demo: {} };
  }
  return db.conversaciones[telefono];
}

export function agregarMensaje(telefono, de, texto, extra = {}) {
  const conv = conversacion(telefono);
  const msg = { de, texto, ts: ahora().toISOString(), ...extra };
  conv.mensajes.push(msg);
  guardar();
  return msg;
}

// ---------- Registro de actividad de los agentes ----------
export function registrar(agente, texto, tipo = "info") {
  db.actividad.push({ ts: ahora().toISOString(), agente, texto, tipo });
  if (db.actividad.length > 200) db.actividad.shift();
  guardar();
}

// ---------- Datos de arranque ----------
function semilla() {
  const t = Date.now();
  const tmp = { relojOffsetMs: 0, leads: [], eventos: [], conversaciones: {}, actividad: [] };
  db = tmp;

  // Citas ya ocupadas para que el calendario se vea real
  const manana = new Date(t + 24 * HORA);
  const pasado = new Date(t + 48 * HORA);
  tmp.eventos.push(
    {
      id: "ev_seed1",
      titulo: "Diagnóstico gratuito de automatización",
      inicio: instanteLocal(manana, 10).toISOString(),
      fin: instanteLocal(manana, 10, 30).toISOString(),
      invitado: "Laura Gómez · Clínica Dental Sonríe",
      correo: "laura@ejemplo.com",
      telefono: "+57 310 555 0101",
      meet: "https://meet.google.com/abc-defg-hij",
      creadoPor: "Agente 2 · Agendador",
    },
    {
      id: "ev_seed2",
      titulo: "Reunión interna de equipo",
      inicio: instanteLocal(pasado, 14).toISOString(),
      fin: instanteLocal(pasado, 15).toISOString(),
      invitado: "Equipo Vaniet IA",
      correo: "",
      telefono: "",
      meet: "",
      creadoPor: "Manual",
    },
  );

  tmp.leads.push(
    {
      telefono: "+57 310 555 0101",
      nombre: "Laura Gómez",
      correo: "laura@ejemplo.com",
      negocio: "Clínica Dental Sonríe",
      servicio: "Plan Full Automatización",
      estado: "Agendado",
      creado: new Date(t - 50 * HORA).toISOString(),
      actualizado: new Date(t - 49 * HORA).toISOString(),
      cotizadoEn: new Date(t - 50 * HORA).toISOString(),
      seguimientoEn: null,
      notas: "Pierde citas por no responder de noche",
    },
    {
      telefono: "+57 315 555 0202",
      nombre: "Andrés Rojas",
      correo: "andres@ejemplo.com",
      negocio: "Academia de Inglés FastTalk",
      servicio: "Plan Agente Base",
      estado: "Cotizado",
      creado: new Date(t - 30 * HORA).toISOString(),
      actualizado: new Date(t - 30 * HORA).toISOString(),
      cotizadoEn: new Date(t - 30 * HORA).toISOString(),
      seguimientoEn: null,
      notas: "Recibe ~80 mensajes diarios de interesados",
    },
  );

  const convAndres = {
    historialIA: [
      { role: "user", content: "Hola, tengo una academia de inglés y no doy abasto con los mensajes. ¿Cuánto cuesta el bot?" },
      {
        role: "assistant",
        content:
          "¡Hola Andrés! 😊 El Plan Agente Base cuesta $1.200.000 COP (pago único) y atiende tu WhatsApp 24/7, responde dudas y guarda cada interesado en tu CRM. ¿Te gustaría agendar un diagnóstico gratuito de 30 minutos?",
      },
      { role: "user", content: "Déjame lo pienso y te aviso" },
      { role: "assistant", content: "¡Claro que sí! Aquí estaré cuando lo necesites. 🙌" },
    ],
    mensajes: [],
    demo: {},
  };
  convAndres.mensajes = convAndres.historialIA.map((m, i) => ({
    de: m.role === "user" ? "cliente" : "bot",
    texto: m.content,
    ts: new Date(t - 30 * HORA + i * 60000).toISOString(),
  }));
  tmp.conversaciones["+57 315 555 0202"] = convAndres;

  tmp.actividad.push({
    ts: new Date(t).toISOString(),
    agente: "Sistema",
    texto: "Demo iniciado. CRM con 2 leads y calendario con 2 eventos de ejemplo.",
    tipo: "info",
  });
  return tmp;
}
