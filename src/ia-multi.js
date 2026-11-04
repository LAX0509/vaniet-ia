// Cadena de proveedores de IA gratuitos: si uno se queda sin cupo o falla, responde el siguiente.
// Cada proveedor es UNA cuenta a tu nombre (Gemini, Groq, OpenRouter, Mistral, Cerebras); no se crean
// cuentas repetidas del mismo proveedor, porque sus términos de uso suelen prohibirlo.
// Si todos fallan, responde el modo guion (reglas) para que el cliente nunca se quede sin respuesta.
// Todos usan la API compatible con OpenAI (chat/completions con herramientas).
//
// IMPORTANTE: en los niveles gratuitos el proveedor puede usar lo que se envía para mejorar sus productos.
// Úsalo solo con el demo y datos de ejemplo. Con clientes reales, claves de pago a nombre del cliente.

import { randomUUID } from "node:crypto";
import { negocio } from "./config.js";
import * as store from "./store.js";
import { definiciones, ejecutar } from "./tools.js";
import { SYSTEM } from "./prompt.js";

// Los modelos gratuitos cambian seguido: ajústalos con las variables *_MODEL del .env
const CATALOGO = [
  { id: "gemini", nombre: "Gemini", env: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", modelo: "gemini-2.5-flash" },
  { id: "groq", nombre: "Groq", env: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", modelo: "llama-3.3-70b-versatile" },
  { id: "openrouter", nombre: "OpenRouter", env: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", modelo: "meta-llama/llama-3.3-70b-instruct:free" },
  { id: "mistral", nombre: "Mistral", env: "MISTRAL_API_KEY", url: "https://api.mistral.ai/v1/chat/completions", modelo: "mistral-small-latest" },
  { id: "cerebras", nombre: "Cerebras", env: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", modelo: "llama-3.3-70b" },
];

const MAX_PASOS = 6;
const TIMEOUT_MS = 25_000;

function proveedoresConfigurados() {
  const orden = (process.env.IA_ORDEN || CATALOGO.map((p) => p.id).join(",")).split(",").map((s) => s.trim().toLowerCase());
  return orden
    .map((id) => CATALOGO.find((p) => p.id === id))
    .filter(Boolean)
    .filter((p) => process.env[p.env])
    .map((p) => ({ ...p, url: process.env[`${p.id.toUpperCase()}_URL`] || p.url, clave: process.env[p.env], modelo: process.env[`${p.id.toUpperCase()}_MODEL`] || p.modelo }));
}

export const hayProveedores = () => proveedoresConfigurados().length > 0;
export const resumenProveedores = () => proveedoresConfigurados().map((p) => `${p.nombre} (${p.modelo})`).join(" → ") || "ninguno";

const bloqueados = new Map(); // id → { hasta, motivo }
let ultimo = null;

function bloquear(p, ms, motivo) {
  bloqueados.set(p.id, { hasta: Date.now() + ms, motivo });
  store.registrar("Sistema", `IA: ${p.nombre} en pausa (${motivo}); pasa al siguiente proveedor`, "alerta");
}

async function llamar(p, cuerpo) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.clave}` },
      body: JSON.stringify({ ...cuerpo, model: p.modelo }),
      signal: ctl.signal,
    });
    if (!r.ok) {
      const err = new Error(`${p.nombre} respondió ${r.status}`);
      err.status = r.status;
      err.retryAfter = Number(r.headers.get("retry-after")) || 0;
      throw err;
    }
    const json = await r.json();
    const mensaje = json.choices?.[0]?.message;
    if (!mensaje) throw new Error(`${p.nombre} devolvió una respuesta vacía`);
    return mensaje;
  } finally {
    clearTimeout(timer);
  }
}

// Prueba los proveedores en orden y devuelve la primera respuesta válida
async function completar(mensajes, { herramientas = true } = {}) {
  const cuerpo = { messages: [{ role: "system", content: SYSTEM }, ...mensajes], temperature: 0.4, max_tokens: 700 };
  if (herramientas) {
    cuerpo.tools = definiciones.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.input_schema } }));
    cuerpo.tool_choice = "auto";
  }
  for (const p of proveedoresConfigurados()) {
    const b = bloqueados.get(p.id);
    if (b && b.hasta > Date.now()) continue;
    try {
      const mensaje = await llamar(p, cuerpo);
      if (ultimo !== p.nombre) {
        store.registrar("Sistema", `IA: responde ${p.nombre}`, "info");
        ultimo = p.nombre;
      }
      return mensaje;
    } catch (e) {
      if ([400, 401, 403, 404].includes(e.status)) bloquear(p, 60 * 60_000, `error ${e.status}: revisa la clave y el modelo`);
      else if (e.status === 429) bloquear(p, Math.max(60, e.retryAfter) * 1000, "sin cupo por ahora");
      else bloquear(p, 30_000, e.name === "AbortError" ? "tardó demasiado" : e.message);
    }
  }
  throw new Error("Ningún proveedor de IA disponible");
}

function contexto(telefono) {
  const lead = store.buscarLead(telefono);
  const datos = lead
    ? `nombre=${lead.nombre || "?"}; correo=${lead.correo || "?"}; negocio=${lead.negocio || "?"}; servicio=${lead.servicio || "?"}; estado=${lead.estado}`
    : "cliente nuevo, sin datos";
  return `[Contexto] Ahora: ${store.formatoLocal(store.ahora())}. Teléfono: ${telefono}. CRM: ${datos}.`;
}

async function guion() {
  return import("./agente-demo.js");
}

export async function responder(telefono, texto) {
  const conv = store.conversacion(telefono);
  conv.historialMulti ||= [];
  const historial = conv.historialMulti;
  const largoInicial = historial.length;
  historial.push({ role: "user", content: `${contexto(telefono)}\n\n${texto}` });

  try {
    for (let paso = 0; paso < MAX_PASOS; paso++) {
      const mensaje = await completar(historial.slice(-24));
      const llamadas = (mensaje.tool_calls || []).map((c) => ({ ...c, id: c.id || `call_${randomUUID().slice(0, 8)}` }));
      historial.push({ role: "assistant", content: mensaje.content || null, ...(llamadas.length ? { tool_calls: llamadas } : {}) });
      if (!llamadas.length) {
        store.guardar();
        const respuesta = (mensaje.content || "").trim();
        if (respuesta) return respuesta;
        throw new Error("Respuesta vacía");
      }
      for (const c of llamadas) {
        let entrada = {};
        try { entrada = JSON.parse(c.function.arguments || "{}"); } catch {}
        const { resultado } = ejecutar(c.function.name, entrada && typeof entrada === "object" ? entrada : {}, telefono);
        historial.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: resultado });
      }
    }
    throw new Error("El agente superó el máximo de pasos");
  } catch (err) {
    // Deja el historial como estaba y responde con el guion para no dejar al cliente sin respuesta
    historial.length = largoInicial;
    store.guardar();
    store.registrar("Sistema", `IA: ${err.message}. Responde el modo guion`, "alerta");
    return (await guion()).responder(telefono, texto);
  }
}

export async function redactarSeguimiento(lead, ultimosMensajes = []) {
  const instruccion = `Redacta UN mensaje corto de WhatsApp (máximo 2 oraciones) para retomar la conversación con un prospecto que recibió una cotización y no volvió a responder. Debe ser personal (menciona su nombre y su negocio o necesidad), amable, sin presionar, y terminar con una pregunta fácil de responder o con la invitación al diagnóstico gratuito. Responde solo con el texto del mensaje.
Prospecto: ${JSON.stringify({ nombre: lead.nombre, negocio: lead.negocio, servicio: lead.servicio, notas: lead.notas })}
Últimos mensajes:
${ultimosMensajes.map((m) => `${m.de}: ${m.texto}`).join("\n")}`;
  try {
    const m = await completar([{ role: "user", content: instruccion }], { herramientas: false });
    const texto = (m.content || "").trim();
    if (texto) return texto;
  } catch {}
  return (await guion()).redactarSeguimiento(lead);
}

export { negocio };
