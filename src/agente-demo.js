// "Modo demo": reproduce el comportamiento de los agentes sin API key, con reglas.
// Ejecuta exactamente las mismas herramientas (CRM y calendario) que el agente con IA
// real, así que el panel se actualiza igual. Sirve para presentar sin conexión.

import { agenda, negocio, servicios } from "./config.js";
import * as store from "./store.js";
import { ejecutar } from "./tools.js";

const pesos = (n) => "$" + n.toLocaleString("es-CO");
const plan = (id) => servicios.find((s) => s.id === id);
const normal = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const capital = (t) => t.split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");

const NEGOCIOS_CON_CITAS = ["clinica", "odonto", "dental", "consultorio", "spa", "veterinaria", "inmobiliaria", "academia", "gimnasio", "salon", "barberia", "medic"];

// Palabra clave → cómo se guarda en el CRM (el primero que coincida gana)
const TIPOS_NEGOCIO = [
  [["dental", "odonto"], "Clínica odontológica"],
  [["veterinari"], "Veterinaria"],
  [["clinica", "consultorio", "medic", "ips"], "Clínica / consultorio"],
  [["spa", "estetica", "salon", "barberia", "peluqueria"], "Spa / estética"],
  [["inmobiliaria", "finca raiz", "arriendo"], "Inmobiliaria"],
  [["academia", "colegio", "instituto", "cursos", "idiomas", "ingles"], "Academia / educación"],
  [["gimnasio", "gym", "crossfit"], "Gimnasio"],
  [["restaurante", "comidas", "cafeteria", "pizzeria"], "Restaurante"],
  [["hotel", "hostal", "turismo", "agencia de viajes", "tours"], "Turismo / hotel"],
  [["tienda", "ecommerce", "e-commerce", "tienda online", "almacen", "ropa"], "Tienda / e-commerce"],
  [["taller", "repuestos"], "Taller"],
];

function extraerNombre(texto) {
  const m = texto.match(/(?:me llamo|mi nombre es|soy)\s+([\p{L}]+(?:\s+[\p{L}]+)?)/iu);
  if (!m) return null;
  const palabras = m[1].split(/\s+/);
  const vetadas = ["de", "del", "el", "la", "un", "una", "dueno", "dueño", "duena", "dueña", "gerente", "y", "muy", "nuevo", "nueva"];
  if (vetadas.includes(normal(palabras[0]))) return null;
  const limpias = palabras.filter((p) => !vetadas.includes(normal(p)));
  return capital(limpias.join(" "));
}

function extraerNegocio(texto) {
  const t = normal(texto);
  // Coincide al inicio de palabra para que "spa" no salte con "espacio"
  const tipo = TIPOS_NEGOCIO.find(([claves]) => claves.some((c) => new RegExp(`(^|[^a-z])${c}`).test(t)));
  return tipo ? tipo[1] : null;
}

const tiene = (t, palabras) => palabras.some((p) => t.includes(p));

function elegirHorario(t, slots) {
  if (!slots?.length) return null;
  if (/\b(1|uno|primer[ao]?)\b/.test(t) || t.includes("opcion 1")) return slots[0];
  if (/\b(2|dos|segund[ao])\b/.test(t) || t.includes("opcion 2")) return slots[1];
  // Coincidencia por día de la semana mencionado
  const dias = ["lunes", "martes", "miercoles", "jueves", "viernes"];
  for (const s of slots) {
    const dia = normal(store.formatoLocal(s)).split(" ")[0];
    if (dias.includes(dia) && t.includes(dia)) return s;
  }
  return null;
}

function ofrecerHorarios(telefono, demo) {
  const r = JSON.parse(ejecutar("consultar_disponibilidad", {}, telefono).resultado);
  const libres = r.horarios;
  if (libres.length === 0) return "En este momento no tengo espacios libres en los próximos días 😕 Te paso con un asesor para buscar otra fecha.";
  // Dos opciones en días distintos
  const primero = libres[0];
  const diaPrimero = store.formatoLocal(primero.inicio, false);
  const segundo = libres.find((h) => store.formatoLocal(h.inicio, false) !== diaPrimero && new Date(h.inicio).getUTCHours() !== new Date(primero.inicio).getUTCHours()) || libres[1];
  demo.slots = [primero.inicio, segundo.inicio];
  return `¡Perfecto! 📅 Tengo estos espacios para el *${agenda.tituloCita}* (${agenda.duracionMin} min por Google Meet):\n\n1️⃣ ${primero.legible}\n2️⃣ ${segundo.legible}\n\n¿Cuál te queda mejor?`;
}

function intentarAgendar(telefono, demo) {
  const lead = store.buscarLead(telefono) || {};
  if (!lead.nombre) {
    demo.esperando = "nombre";
    return "¡Listo, te aparto ese espacio! ¿A nombre de quién agendo la reunión? 😊";
  }
  if (!lead.correo) {
    demo.esperando = "correo";
    return `Gracias, ${lead.nombre.split(" ")[0]}. ¿A qué correo te envío la invitación con el enlace de Meet? 📧`;
  }
  const r = JSON.parse(ejecutar("agendar_cita", { inicio: demo.slotElegido, nombre: lead.nombre, correo: lead.correo }, telefono).resultado);
  demo.slots = null;
  demo.slotElegido = null;
  demo.esperando = null;
  if (!r.ok) return `Uy, ese horario se acaba de ocupar 😅 ${ofrecerHorarios(telefono, demo)}`;
  return `✅ ¡Agendado, ${lead.nombre.split(" ")[0]}!\n\n🗓️ ${r.cuando}\n⏱️ ${r.duracionMin} minutos\n🔗 ${r.meet}\n\nTe llegará la invitación a ${lead.correo}. ¡Nos vemos!`;
}

export async function responder(telefono, texto) {
  const conv = store.conversacion(telefono);
  const demo = conv.demo;
  const t = normal(texto);
  const lead = store.buscarLead(telefono);
  const primerMensaje = !lead;

  // 1. Extraer datos y guardarlos en el CRM (como haría la IA con registrar_lead)
  const datos = {};
  const correo = texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  if (correo) datos.correo = correo.toLowerCase();
  let nombre = extraerNombre(texto);
  if (!nombre && demo.esperando === "nombre" && texto.trim().split(/\s+/).length <= 4 && !correo) {
    nombre = capital(texto.trim().replace(/[.!]/g, ""));
  }
  if (nombre) datos.nombre = nombre;
  const neg = extraerNegocio(texto);
  if (neg) {
    datos.negocio = neg;
    datos.estado = "Calificado";
    if (tiene(t, ["no doy abasto", "no alcanzo", "muchos mensajes", "no respondo", "pierdo", "perdemos", "de noche"])) {
      datos.notas = "Pierde clientes por no responder a tiempo";
    }
  }
  if (Object.keys(datos).length) ejecutar("registrar_lead", datos, telefono);
  else if (primerMensaje) store.upsertLead(telefono, {});

  const actual = store.buscarLead(telefono);
  const primerNombre = actual.nombre ? actual.nombre.split(" ")[0] : "";

  // 2. Si estábamos esperando un dato para agendar, continuar el agendamiento
  if (demo.slotElegido && ((demo.esperando === "nombre" && nombre) || (demo.esperando === "correo" && correo))) {
    return intentarAgendar(telefono, demo);
  }
  if (demo.esperando === "correo" && !correo) {
    return "Para enviarte la invitación necesito un correo válido, por ejemplo nombre@empresa.com 🙏";
  }

  // 3. Intenciones
  if (tiene(t, ["asesor", "humano", "una persona", "alguien real", "hablar con alguien"])) {
    ejecutar("escalar_a_humano", { motivo: "El cliente pidió hablar con un asesor" }, telefono);
    return `¡Claro${primerNombre ? ", " + primerNombre : ""}! 🙌 Ya le avisé a un asesor de nuestro equipo y te escribirá en unos minutos por este mismo chat.`;
  }

  const elegido = elegirHorario(t, demo.slots);
  if (elegido) {
    demo.slotElegido = elegido;
    return intentarAgendar(telefono, demo);
  }

  if (tiene(t, ["agendar", "agenda", "cita", "reunion", "llamada", "diagnostico", "disponib", "horario", "reunirnos", "videollamada", "meet"])) {
    return ofrecerHorarios(telefono, demo);
  }

  if (tiene(t, ["precio", "cuanto", "cuesta", "valor", "plan", "cotiz", "tarifa", "costo", "vale"])) {
    const conCitas = actual.negocio && NEGOCIOS_CON_CITAS.some((n) => normal(actual.negocio).includes(n));
    const recomendado = plan(conCitas ? "full-automatizacion" : "agente-base");
    ejecutar("registrar_cotizacion", { servicio: recomendado.nombre }, telefono);
    const base = plan("agente-base");
    const full = plan("full-automatizacion");
    const mant = plan("mantenimiento");
    return (
      `Con gusto${primerNombre ? ", " + primerNombre : ""} 💡 Estos son nuestros planes:\n\n` +
      `- *${base.nombre}*: ${pesos(base.precio)} (pago único). Bot 24/7 en WhatsApp + CRM.\n` +
      `- *${full.nombre}*: ${pesos(full.precio)} (pago único). Además agenda citas solo y hace seguimiento automático.\n` +
      `- *${mant.nombre}*: ${pesos(mant.precio)}/mes.\n\n` +
      `Para tu caso te recomiendo el *${recomendado.nombre}*. ¿Te gustaría un diagnóstico gratuito de ${agenda.duracionMin} min para verlo aplicado a tu negocio?`
    );
  }

  if (!demo.slots && /\b(si|dale|claro|listo|me interesa|de una|ok|bueno)\b/.test(t) && actual.cotizadoEn) {
    return ofrecerHorarios(telefono, demo);
  }

  if (neg) {
    return `¡Qué bien! 🙌 En un negocio de tipo *${neg.toLowerCase()}* el bot puede responder a tus clientes al instante, registrar a cada interesado y agendar citas sin que tengas que estar pendiente del celular. ¿Quieres que te cuente cuánto cuesta?`;
  }

  if (correo || nombre) {
    return `¡Gracias${primerNombre ? ", " + primerNombre : ""}! Ya guardé tus datos 📝 ¿Qué tipo de negocio tienes?`;
  }

  if (tiene(t, ["gracias", "perfecto", "excelente", "genial"])) {
    return "¡Con mucho gusto! 😊 Si tienes cualquier otra pregunta, aquí estoy 24/7.";
  }

  if (tiene(t, ["hola", "buenas", "buenos dias", "buen dia", "info", "informacion"]) || primerMensaje) {
    return `¡Hola${primerNombre ? " " + primerNombre : ""}! 👋 Soy ${negocio.asistente}, asistente virtual de *${negocio.nombre}*. Ayudamos a negocios a atender por WhatsApp 24/7 con IA, agendar citas solos y no perder clientes. ¿Qué tipo de negocio tienes?`;
  }

  return `Te cuento: creamos asistentes de IA que atienden tu WhatsApp 24/7, registran a cada cliente en tu CRM y agendan citas solos 🤖 ¿Quieres conocer los precios o prefieres agendar un diagnóstico gratuito?`;
}

export async function redactarSeguimiento(lead) {
  const nombre = lead.nombre ? lead.nombre.split(" ")[0] : "";
  const neg = lead.negocio ? ` para *${lead.negocio}*` : "";
  return `¡Hola${nombre ? " " + nombre : ""}! 👋 Soy ${negocio.asistente} de ${negocio.nombre}. Ayer te compartí la propuesta del *${lead.servicio || "asistente de IA"}*${neg}. ¿Te quedó alguna duda? Si quieres, te muestro cómo funcionaría en un diagnóstico gratuito de ${agenda.duracionMin} min 😊`;
}
