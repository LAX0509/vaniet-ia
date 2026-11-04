// Conexión con la API oficial de WhatsApp Business (Cloud API de Meta, directa o vía un proveedor como 360dialog).
// Entrada: Meta llama a nuestro webhook con cada mensaje. Salida: respondemos con la misma API.
//
// Reglas de Meta que condicionan el diseño:
//  - Dentro de las 24 h posteriores al último mensaje del cliente se puede responder con texto libre.
//  - Pasadas las 24 h (el seguimiento del Agente 3) solo se pueden enviar PLANTILLAS aprobadas por Meta.
//  - El usuario debe haber aceptado recibir mensajes y poder darse de baja.
//
// Variables (.env):
//   WA_PROVEEDOR=meta|360dialog   WA_TOKEN=...   WA_PHONE_ID=...   WA_VERIFY_TOKEN=...   WA_APP_SECRET=...
//   WA_PLANTILLA_SEGUIMIENTO=nombre_de_la_plantilla   WA_PLANTILLA_IDIOMA=es
//   WA_SIMULAR=1  → no envía nada real; escribe los mensajes en la consola (para probar sin cuenta de Meta)

import crypto from "node:crypto";

const proveedor = () => (process.env.WA_PROVEEDOR || "meta").toLowerCase();
export const simulado = () => process.env.WA_SIMULAR === "1";
export const configurado = () => simulado() || Boolean(process.env.WA_TOKEN && (process.env.WA_PHONE_ID || proveedor() === "360dialog"));

// Verificación inicial del webhook (Meta hace un GET con hub.* y espera el "challenge")
export function verificarWebhook(url) {
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const esperado = process.env.WA_VERIFY_TOKEN;
  if (modo === "subscribe" && esperado && token === esperado) return { ok: true, challenge: url.searchParams.get("hub.challenge") || "" };
  return { ok: false };
}

// Firma X-Hub-Signature-256: comprueba que el mensaje realmente viene de Meta
export function firmaValida(cuerpoCrudo, cabecera) {
  const secreto = process.env.WA_APP_SECRET;
  if (!secreto) return true; // sin secreto configurado (solo desarrollo)
  if (!cabecera?.startsWith("sha256=")) return false;
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");
  const recibida = cabecera.slice(7);
  return recibida.length === esperada.length && crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
}

// Extrae los mensajes entrantes del JSON del webhook
export function extraerMensajes(cuerpo) {
  const salida = [];
  for (const entrada of cuerpo?.entry || []) {
    for (const cambio of entrada.changes || []) {
      const v = cambio.value || {};
      const nombres = new Map((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const m of v.messages || []) {
        let texto = null;
        if (m.type === "text") texto = m.text?.body ?? null;
        else if (m.type === "button") texto = m.button?.text ?? null;
        else if (m.type === "interactive") texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        salida.push({ id: m.id, de: m.from, nombre: nombres.get(m.from) || "", tipo: m.type, texto });
      }
    }
  }
  return salida;
}

async function enviar(cuerpo) {
  if (simulado()) {
    console.log(`  [WhatsApp simulado] → ${cuerpo.to}: ${cuerpo.type === "template" ? `(plantilla ${cuerpo.template.name}) ${JSON.stringify(cuerpo.template.components)}` : cuerpo.text.body}`);
    return;
  }
  if (!configurado()) throw new Error("WhatsApp no está configurado: faltan WA_TOKEN y WA_PHONE_ID en el .env");
  const es360 = proveedor() === "360dialog";
  const url = es360 ? process.env.WA_API_URL || "https://waba-v2.360dialog.io/messages" : `${process.env.WA_API_URL || "https://graph.facebook.com/v21.0"}/${process.env.WA_PHONE_ID}/messages`;
  const cabeceras = { "Content-Type": "application/json", ...(es360 ? { "D360-API-KEY": process.env.WA_TOKEN } : { Authorization: `Bearer ${process.env.WA_TOKEN}` }) };
  const r = await fetch(url, { method: "POST", headers: cabeceras, body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }) });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const soloDigitos = (tel) => String(tel).replace(/\D/g, "");

export const enviarTexto = (para, texto) => enviar({ to: soloDigitos(para), type: "text", text: { body: texto.slice(0, 4000), preview_url: true } });

// Mensaje fuera de la ventana de 24 h: requiere una plantilla aprobada. Variables: {{1}} nombre, {{2}} servicio
export const enviarPlantilla = (para, nombre, idioma, variables) =>
  enviar({
    to: soloDigitos(para),
    type: "template",
    template: { name: nombre, language: { code: idioma }, components: [{ type: "body", parameters: variables.map((t) => ({ type: "text", text: String(t).slice(0, 60) })) }] },
  });
