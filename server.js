// Servidor del demo. Expone:
//   GET  /api/estado        → CRM, calendario, chats y actividad (para el panel)
//   POST /api/mensaje       → mensaje entrante de WhatsApp (equivale al webhook)
//   POST /api/seguimiento   → ejecuta el Agente 3 (en producción: cron diario 10:00 a.m.)
//   POST /api/reloj         → adelanta el reloj simulado (para la presentación)
//   POST /api/reiniciar     → deja el demo como nuevo
//   GET/POST /webhook/whatsapp → WhatsApp Business real (API oficial de Meta o un proveedor oficial)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { negocio, seguimiento } from "./src/config.js";
import * as store from "./src/store.js";
import { AGENTE_1, AGENTE_3 } from "./src/tools.js";
import { AVISO_PRIVACIDAD, partesColombia, pideBaja, puedeContactar } from "./src/cumplimiento.js";
import * as wa from "./src/whatsapp.js";
import * as multi from "./src/ia-multi.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT || 5000);

// Prioridad: Claude (de pago) → cadena de IA gratuita → modo demo (reglas)
const tieneCredenciales = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const claudeActivo = tieneCredenciales && process.env.MODO !== "demo";
const multiActivo = !claudeActivo && multi.hayProveedores() && process.env.MODO !== "demo";
const modoIA = claudeActivo || multiActivo;
const agente = claudeActivo ? await import("./src/agente-claude.js") : multiActivo ? multi : await import("./src/agente-demo.js");
const nombreModelo = claudeActivo ? agente.MODELO : multiActivo ? multi.resumenProveedores() : null;

store.cargar();

// Un mensaje a la vez por número de teléfono (como una cola por chat)
const colas = new Map();
function enCola(telefono, tarea) {
  const previa = colas.get(telefono) || Promise.resolve();
  const siguiente = previa.catch(() => {}).then(tarea);
  colas.set(telefono, siguiente);
  return siguiente;
}

async function mensajeEntrante(telefono, texto, { canal = "web" } = {}) {
  const esNuevo = !store.buscarLead(telefono);
  store.agregarMensaje(telefono, "cliente", texto);
  store.registrar(AGENTE_1, `Mensaje recibido de ${store.buscarLead(telefono)?.nombre || telefono}`, "whatsapp");

  // Habeas Data: quien pide la baja no vuelve a recibir mensajes proactivos
  if (pideBaja(texto)) {
    store.upsertLead(telefono, { consentimiento: false, canal });
    const baja = "Listo, no te escribiremos más mensajes. Si cambias de opinión, escríbenos cuando quieras 🙌";
    store.agregarMensaje(telefono, "bot", baja);
    store.registrar("Sistema", `Baja solicitada por ${telefono}: no recibirá seguimientos`, "alerta");
    return baja;
  }
  // Primer mensaje: queda registrada la autorización (con fecha) y se avisa que es un asistente de IA
  if (esNuevo) store.upsertLead(telefono, { consentimiento: true, consentimientoEn: store.ahora().toISOString(), canal });

  let respuesta = await agente.responder(telefono, texto);
  if (esNuevo) respuesta += `\n\n${AVISO_PRIVACIDAD}`;
  store.agregarMensaje(telefono, "bot", respuesta);
  return respuesta;
}

// ---------- WhatsApp real ----------
const procesados = new Set(); // Meta reintenta si no respondemos rápido: evita duplicados
async function procesarWhatsApp(m) {
  if (procesados.has(m.id)) return;
  procesados.add(m.id);
  if (procesados.size > 500) procesados.delete(procesados.values().next().value);
  const telefono = "+" + m.de;
  try {
    if (!m.texto) {
      await wa.enviarTexto(telefono, "Por ahora solo puedo leer mensajes de texto 🙏 ¿Me cuentas por escrito en qué te ayudo?");
      return;
    }
    const respuesta = await enCola(telefono, () => mensajeEntrante(telefono, m.texto.trim().slice(0, 2000), { canal: "whatsapp" }));
    await wa.enviarTexto(telefono, respuesta);
  } catch (err) {
    console.error(err);
    store.registrar("Sistema", `Error con WhatsApp (${telefono}): ${err.message}`, "error");
  }
}

// ---------- Agente 3: seguimiento ----------
const TEXTO_PLANTILLA = (nombre, servicio) =>
  `Hola ${nombre}, soy ${negocio.asistente} de ${negocio.nombre}. Hace poco te compartí la propuesta del ${servicio}. ¿Te quedó alguna duda? Responde este mensaje y con gusto te ayudo.`;

// automatico=true es el cron real: respeta la Ley 2300 (horario, domingos y festivos) y solo escribe
// a quien autorizó. El botón del demo (automatico=false) sigue funcionando con el reloj simulado.
async function ejecutarSeguimiento({ automatico = false } = {}) {
  if (automatico) {
    const v = puedeContactar(new Date());
    if (!v.ok) {
      store.registrar(AGENTE_3, `Revisión pospuesta: hoy no se contacta (${v.motivo}, Ley 2300)`, "cron");
      return [];
    }
  }
  const db = store.getDb();
  const limite = store.ahora().getTime() - seguimiento.horasDesdeCotizacion * 3600 * 1000;
  const pendientes = db.leads.filter(
    (l) =>
      l.estado === "Cotizado" && l.cotizadoEn && new Date(l.cotizadoEn).getTime() <= limite && !l.seguimientoEn &&
      l.consentimiento !== false && (!automatico || l.consentimiento === true),
  );
  store.registrar(
    AGENTE_3,
    `Revisión diaria (${seguimiento.horaEjecucion}): ${pendientes.length} prospecto(s) cotizados hace más de ${seguimiento.horasDesdeCotizacion} h sin respuesta`,
    "cron",
  );
  const enviados = [];
  for (const lead of pendientes) {
    await enCola(lead.telefono, async () => {
      const conv = store.conversacion(lead.telefono);
      let texto;
      if (lead.canal === "whatsapp") {
        // Fuera de las 24 h de Meta solo se puede enviar una plantilla aprobada
        const plantilla = process.env.WA_PLANTILLA_SEGUIMIENTO;
        if (!plantilla && !wa.simulado()) {
          store.registrar(AGENTE_3, "Falta WA_PLANTILLA_SEGUIMIENTO: crea y aprueba la plantilla en Meta antes de activar seguimientos", "error");
          return;
        }
        const nombre = lead.nombre ? lead.nombre.split(" ")[0] : "";
        const servicio = lead.servicio || "asistente de IA";
        await wa.enviarPlantilla(lead.telefono, plantilla || "seguimiento_simulado", process.env.WA_PLANTILLA_IDIOMA || "es", [nombre || "hola", servicio]);
        texto = TEXTO_PLANTILLA(nombre || "hola", servicio);
      } else {
        texto = await agente.redactarSeguimiento(lead, conv.mensajes.slice(-6));
        if (!texto) return;
      }
      store.agregarMensaje(lead.telefono, "bot", texto, { seguimiento: true });
      conv.historialIA.push({ role: "assistant", content: texto });
      store.upsertLead(lead.telefono, { estado: "Seguimiento", seguimientoEn: store.ahora().toISOString() });
      store.registrar(AGENTE_3, `Seguimiento enviado por WhatsApp a ${lead.nombre || lead.telefono}`, "whatsapp");
      enviados.push(lead.telefono);
    });
  }
  return enviados;
}

// Cron real (SEGUIMIENTO_AUTO=1): una vez al día, a partir de las 10:00 a.m. hora de Colombia
async function revisarSeguimientoAutomatico() {
  const { iso, horas } = partesColombia(new Date());
  const db = store.getDb();
  if (horas < 10 || db.ultimoSeguimientoAuto === iso) return;
  db.ultimoSeguimientoAuto = iso;
  store.guardar();
  await ejecutarSeguimiento({ automatico: true });
}

function estado() {
  const db = store.getDb();
  const chats = Object.fromEntries(Object.entries(db.conversaciones).map(([tel, c]) => [tel, c.mensajes]));
  return {
    modo: modoIA ? "ia" : "demo",
    modelo: nombreModelo,
    negocio,
    ahora: store.ahora().toISOString(),
    ahoraLegible: store.formatoLocal(store.ahora()),
    leads: db.leads,
    eventos: [...db.eventos].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    actividad: db.actividad.slice(-80),
    chats,
  };
}

// ---------- HTTP ----------
const tipos = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

function json(res, codigo, datos) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(datos));
}

async function leerCrudo(req) {
  let cuerpo = "";
  for await (const trozo of req) {
    cuerpo += trozo;
    if (cuerpo.length > 1e6) throw new Error("Cuerpo demasiado grande");
  }
  return cuerpo;
}
async function leerCuerpo(req) {
  const cuerpo = await leerCrudo(req);
  return cuerpo ? JSON.parse(cuerpo) : {};
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/api/estado") return json(res, 200, estado());

    // Para el monitor de disponibilidad (Uptime Kuma, UptimeRobot) y el healthcheck del hosting
    if (req.method === "GET" && url.pathname === "/salud") {
      return json(res, 200, { ok: true, modo: modoIA ? "ia" : "demo", whatsapp: wa.configurado(), uptimeSeg: Math.round(process.uptime()) });
    }

    if (url.pathname === "/webhook/whatsapp") {
      if (req.method === "GET") {
        const v = wa.verificarWebhook(url);
        res.writeHead(v.ok ? 200 : 403, { "Content-Type": "text/plain" });
        return res.end(v.ok ? v.challenge : "Token inválido");
      }
      if (req.method === "POST") {
        const crudo = await leerCrudo(req);
        if (!wa.firmaValida(crudo, req.headers["x-hub-signature-256"])) {
          res.writeHead(401);
          return res.end();
        }
        res.writeHead(200); // responde ya: Meta reintenta si tardamos
        res.end();
        let cuerpo = {};
        try { cuerpo = JSON.parse(crudo); } catch {}
        for (const m of wa.extraerMensajes(cuerpo)) procesarWhatsApp(m);
        return;
      }
    }

    if (req.method === "POST" && url.pathname === "/api/mensaje") {
      const { telefono, texto } = await leerCuerpo(req);
      if (!telefono || !texto?.trim()) return json(res, 400, { error: "Faltan teléfono o texto" });
      const respuesta = await enCola(telefono, () => mensajeEntrante(telefono, texto.trim().slice(0, 2000)));
      return json(res, 200, { respuesta });
    }

    if (req.method === "POST" && url.pathname === "/api/seguimiento") {
      const enviados = await ejecutarSeguimiento({ automatico: false });
      return json(res, 200, { enviados });
    }

    if (req.method === "POST" && url.pathname === "/api/reloj") {
      const { horas } = await leerCuerpo(req);
      const h = Math.max(1, Math.min(72, Number(horas) || 24));
      store.adelantarReloj(h);
      store.registrar("Sistema", `⏩ Reloj adelantado ${h} horas → ${store.formatoLocal(store.ahora())}`, "info");
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/reiniciar") {
      store.reiniciar();
      colas.clear();
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET") {
      const archivo = path.normalize(path.join(here, "public", url.pathname === "/" ? "index.html" : url.pathname));
      if (!archivo.startsWith(path.join(here, "public")) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
        res.writeHead(404);
        return res.end("No encontrado");
      }
      res.writeHead(200, { "Content-Type": tipos[path.extname(archivo)] || "application/octet-stream" });
      return fs.createReadStream(archivo).pipe(res);
    }

    res.writeHead(405);
    res.end();
  } catch (err) {
    console.error(err);
    store.registrar("Sistema", `Error: ${err.message}`, "error");
    json(res, 500, { error: err.message });
  }
});

servidor.listen(PUERTO, () => {
  console.log(`\n  ${negocio.nombre} · Demo de agentes de IA`);
  console.log(`  → http://localhost:${PUERTO}`);
  console.log(`  Modo: ${claudeActivo ? `IA real (${agente.MODELO})` : multiActivo ? `IA gratuita en cadena: ${nombreModelo}` : "DEMO sin API key (respuestas guiadas)"}`);
  console.log(`  WhatsApp: ${wa.simulado() ? "SIMULADO (WA_SIMULAR=1)" : wa.configurado() ? "conectado a la API oficial" : "sin configurar (solo demo web)"}`);
  if (process.env.SEGUIMIENTO_AUTO === "1") {
    console.log("  Seguimiento automático: activo (a partir de las 10:00 a.m., Ley 2300)");
    setInterval(() => revisarSeguimientoAutomatico().catch((e) => console.error(e)), 10 * 60 * 1000);
  }
  console.log("");
});
