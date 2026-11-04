// Agentes 1 y 2 con IA real (Claude). Un solo "cerebro" conversacional que decide
// cuándo vender, cuándo guardar datos en el CRM y cuándo pasar al agendamiento.

import Anthropic from "@anthropic-ai/sdk";
import { agenda, negocio } from "./config.js";
import { SYSTEM } from "./prompt.js";
import * as store from "./store.js";
import { definiciones, ejecutar } from "./tools.js";

export const MODELO = process.env.MODELO_IA || "claude-opus-5-5";
const MAX_PASOS = 6;

const client = new Anthropic();

function contexto(telefono) {
  const lead = store.buscarLead(telefono);
  const datos = lead
    ? `nombre=${lead.nombre || "?"}; correo=${lead.correo || "?"}; negocio=${lead.negocio || "?"}; servicio=${lead.servicio || "?"}; estado=${lead.estado}`
    : "cliente nuevo, sin datos";
  return `[Contexto] Ahora: ${store.formatoLocal(store.ahora())}. Teléfono: ${telefono}. CRM: ${datos}.`;
}

export async function responder(telefono, texto) {
  const conv = store.conversacion(telefono);
  const historial = conv.historialIA;
  const largoInicial = historial.length;

  historial.push({ role: "user", content: `${contexto(telefono)}\n\n${texto}` });

  try {
    for (let paso = 0; paso < MAX_PASOS; paso++) {
      const resp = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: SYSTEM,
        tools: definiciones,
        messages: historial,
        output_config: { effort: "low" }, // chat corto: respuestas rápidas y económicas
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      historial.push({ role: "assistant", content: resp.content });

      if (resp.stop_reason === "refusal") {
        ejecutar("escalar_a_humano", { motivo: "Mensaje fuera de alcance del asistente" }, telefono);
        return "Gracias por tu mensaje 🙏 Un asesor de nuestro equipo te escribirá en breve.";
      }

      const usos = resp.content.filter((b) => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || usos.length === 0) {
        store.guardar();
        return resp.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
      }

      const resultados = usos.map((u) => {
        const input = u.input && typeof u.input === "object" ? u.input : {};
        const { resultado, error } = ejecutar(u.name, input, telefono);
        return { type: "tool_result", tool_use_id: u.id, content: resultado, ...(error ? { is_error: true } : {}) };
      });
      historial.push({ role: "user", content: resultados });
    }
    throw new Error("El agente superó el máximo de pasos");
  } catch (err) {
    // Deja el historial como estaba para que el siguiente mensaje no quede roto
    historial.length = largoInicial;
    store.guardar();
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("La API key de Anthropic no es válida. Revisa el archivo .env");
    }
    throw err;
  }
}

// Agente 3: redacta un mensaje de seguimiento personalizado (una sola llamada, sin herramientas).
export async function redactarSeguimiento(lead, ultimosMensajes) {
  const resp = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 4000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `Eres ${negocio.asistente} de ${negocio.nombre}. Redacta UN mensaje corto de WhatsApp (máximo 2 oraciones) para retomar la conversación con un prospecto que recibió una cotización y no volvió a responder. Debe ser personal (menciona su nombre y su negocio o necesidad), amable, sin presionar, y terminar con una pregunta fácil de responder o con la invitación al diagnóstico gratuito de ${agenda.duracionMin} minutos. Responde solo con el texto del mensaje.`,
    messages: [
      {
        role: "user",
        content: `Prospecto: ${JSON.stringify({
          nombre: lead.nombre,
          negocio: lead.negocio,
          servicio: lead.servicio,
          notas: lead.notas,
        })}\n\nÚltimos mensajes:\n${ultimosMensajes.map((m) => `${m.de}: ${m.texto}`).join("\n")}`,
      },
    ],
  });
  if (resp.stop_reason === "refusal") return null;
  return resp.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
