// Herramientas (function calling) que los agentes pueden ejecutar.
// En producción cada una se conecta a Google Sheets / Google Calendar;
// aquí escriben en la base simulada, con la misma forma de datos.

import { agenda, servicios } from "./config.js";
import * as store from "./store.js";

export const AGENTE_1 = "Agente 1 · Vendedor";
export const AGENTE_2 = "Agente 2 · Agendador";
export const AGENTE_3 = "Agente 3 · Seguimiento";

const ESTADOS = ["Nuevo", "Calificado", "Cotizado", "Agendado", "Escalado"];

export const definiciones = [
  {
    name: "registrar_lead",
    description:
      "Guarda o actualiza los datos del cliente en el CRM (Google Sheets). Úsala cada vez que el cliente comparta su nombre, correo, nombre/tipo de negocio, el servicio que le interesa o una necesidad relevante. Solo envía los campos que conozcas.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del cliente" },
        correo: { type: "string", description: "Correo electrónico" },
        negocio: { type: "string", description: "Nombre o tipo de negocio del cliente" },
        servicio: { type: "string", description: "Servicio o plan de interés" },
        notas: { type: "string", description: "Necesidad o dolor principal, en una frase" },
        estado: { type: "string", enum: ["Nuevo", "Calificado"], description: "Calificado cuando ya se conoce su negocio y su necesidad" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "registrar_cotizacion",
    description: "Marca en el CRM que al cliente se le dio un precio. Úsala justo cuando le compartas el valor de uno o más planes.",
    input_schema: {
      type: "object",
      properties: {
        servicio: { type: "string", enum: servicios.map((s) => s.nombre), description: "Plan cotizado" },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_disponibilidad",
    description: `Consulta en Google Calendar los horarios libres de los próximos ${agenda.diasAOfrecer} días hábiles para la reunión "${agenda.tituloCita}" (${agenda.duracionMin} min). Úsala cuando el cliente quiera agendar, reunirse o hablar con alguien.`,
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "agendar_cita",
    description:
      "Crea el evento en Google Calendar con enlace de Google Meet. Úsala solo cuando el cliente haya elegido uno de los horarios ofrecidos y ya tengas su nombre y correo.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Fecha y hora de inicio exactamente como la devolvió consultar_disponibilidad (ISO 8601)" },
        nombre: { type: "string" },
        correo: { type: "string" },
      },
      required: ["inicio", "nombre", "correo"],
      additionalProperties: false,
    },
  },
  {
    name: "escalar_a_humano",
    description:
      "Transfiere la conversación a un asesor humano. Úsala si el cliente lo pide, está molesto o pregunta algo que no está en tu información.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

// Ejecuta una herramienta y devuelve { resultado: string, agente } para el registro.
export function ejecutar(nombre, input, telefono) {
  switch (nombre) {
    case "registrar_lead": {
      const cambios = { ...input };
      if (cambios.estado && !ESTADOS.includes(cambios.estado)) delete cambios.estado;
      const actual = store.buscarLead(telefono);
      // No degradar un lead que ya avanzó en el embudo
      if (actual && ["Cotizado", "Agendado", "Escalado"].includes(actual.estado)) delete cambios.estado;
      const lead = store.upsertLead(telefono, cambios);
      const campos = Object.keys(input).filter((k) => input[k]).join(", ");
      store.registrar(AGENTE_1, `CRM actualizado (${campos || "sin cambios"}) → ${lead.nombre || telefono}`, "crm");
      return { agente: AGENTE_1, resultado: JSON.stringify({ ok: true, lead }) };
    }
    case "registrar_cotizacion": {
      const actual = store.buscarLead(telefono);
      const cambios = { servicio: input.servicio, cotizadoEn: store.ahora().toISOString() };
      if (!actual || !["Agendado", "Escalado"].includes(actual.estado)) cambios.estado = "Cotizado";
      const lead = store.upsertLead(telefono, cambios);
      store.registrar(AGENTE_1, `Cotización enviada: ${input.servicio} → ${lead.nombre || telefono}`, "crm");
      return { agente: AGENTE_1, resultado: JSON.stringify({ ok: true }) };
    }
    case "consultar_disponibilidad": {
      const libres = store.horariosDisponibles();
      store.registrar(AGENTE_2, `Consultó Google Calendar: ${libres.length} horarios libres en los próximos ${agenda.diasAOfrecer} días hábiles`, "calendario");
      const lista = libres.map((iso) => ({ inicio: iso, legible: store.formatoLocal(iso) }));
      return {
        agente: AGENTE_2,
        resultado: JSON.stringify({
          horarios: lista,
          instruccion: "Ofrece solo 2 opciones al cliente, en días distintos si es posible.",
        }),
      };
    }
    case "agendar_cita": {
      try {
        const ev = store.crearEvento({
          inicio: input.inicio,
          titulo: agenda.tituloCita,
          invitado: input.nombre,
          correo: input.correo,
          telefono,
        });
        store.upsertLead(telefono, { nombre: input.nombre, correo: input.correo, estado: "Agendado" });
        store.registrar(AGENTE_2, `Cita creada en Google Calendar: ${store.formatoLocal(ev.inicio)} · ${input.nombre}`, "calendario");
        return {
          agente: AGENTE_2,
          resultado: JSON.stringify({ ok: true, cuando: store.formatoLocal(ev.inicio), duracionMin: agenda.duracionMin, meet: ev.meet }),
        };
      } catch (e) {
        store.registrar(AGENTE_2, `No se pudo agendar: ${e.message}`, "error");
        return { agente: AGENTE_2, resultado: JSON.stringify({ ok: false, error: e.message }), error: true };
      }
    }
    case "escalar_a_humano": {
      const lead = store.upsertLead(telefono, { estado: "Escalado", notas: input.motivo });
      store.registrar(AGENTE_1, `Conversación escalada a un asesor humano: ${input.motivo} (${lead.nombre || telefono})`, "alerta");
      return { agente: AGENTE_1, resultado: JSON.stringify({ ok: true, mensaje: "Un asesor fue notificado y responderá pronto." }) };
    }
    default:
      return { agente: "Sistema", resultado: JSON.stringify({ ok: false, error: "Herramienta desconocida" }), error: true };
  }
}
