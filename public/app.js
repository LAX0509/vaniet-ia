// Interfaz del demo: un teléfono con WhatsApp a la izquierda y, a la derecha,
// lo que los agentes hacen detrás (CRM, calendario y registro de actividad).

const $ = (id) => document.getElementById(id);
const TZ = "America/Bogota";

const SUGERENCIAS = [
  "Hola, quiero información",
  "Tengo una clínica dental y pierdo pacientes porque no respondo de noche",
  "¿Cuánto cuesta?",
  "Sí, quiero agendar el diagnóstico",
  "La opción 1",
  "Me llamo Carlos Pérez",
  "carlos.perez@ejemplo.com",
  "Quiero hablar con un asesor",
];

let estado = null;
let telefono = leerLocal("telefono") || nuevoTelefono();
let enviando = false;
let firmaChat = "";
const vistos = { leads: new Map(), eventos: new Set(), primeraCarga: true };
const extras = new Set(JSON.parse(leerLocal("extras") || "[]"));
extras.add(telefono);

function leerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch {} }

function nuevoTelefono() {
  const n = () => Math.floor(Math.random() * 10);
  return `+57 3${n()}${n()} ${n()}${n()}${n()} ${n()}${n()}${n()}${n()}`;
}

// ---------- Utilidades de formato ----------
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CO", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dia = (iso) => new Date(iso).toLocaleDateString("es-CO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function formatoWA(texto) {
  return esc(texto)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/\n/g, "<br>");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("ver");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("ver"), 3500);
}

// ---------- API ----------
async function api(ruta, cuerpo) {
  const r = await fetch(ruta, cuerpo === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || "Error del servidor");
  return datos;
}

async function refrescar() {
  try {
    estado = await api("/api/estado");
    pintar();
  } catch (e) {
    console.error(e);
  }
}

// ---------- Render ----------
function pintar() {
  $("marcaNombre").textContent = estado.negocio.nombre;
  document.title = `${estado.negocio.nombre} · Demo de agentes`;
  $("reloj").textContent = estado.ahoraLegible;
  const modo = $("modo");
  modo.className = "modo " + estado.modo;
  modo.textContent = estado.modo === "ia" ? "● IA REAL" : "● MODO DEMO";
  modo.title = estado.modo === "ia" ? `Respuestas generadas por ${estado.modelo}` : "Sin API key: respuestas guiadas por reglas";

  pintarSelector();
  pintarChat();
  pintarKpis();
  pintarCrm();
  pintarCalendario();
  pintarActividad();
  vistos.primeraCarga = false;
}

function pintarSelector() {
  const sel = $("selChat");
  const telefonos = new Set([...extras, ...estado.leads.map((l) => l.telefono), ...Object.keys(estado.chats)]);
  const opciones = [...telefonos].map((tel) => {
    const lead = estado.leads.find((l) => l.telefono === tel);
    const nombre = lead?.nombre ? `${lead.nombre} · ${tel}` : `${tel} (sin nombre)`;
    return `<option value="${esc(tel)}"${tel === telefono ? " selected" : ""}>${esc(nombre)}</option>`;
  }).join("");
  if (sel.innerHTML !== opciones) sel.innerHTML = opciones;
}

function pintarChat() {
  const mensajes = estado.chats[telefono] || [];
  const firma = `${telefono}|${mensajes.length}|${enviando}`;
  if (firma === firmaChat) return;
  firmaChat = firma;

  const lead = estado.leads.find((l) => l.telefono === telefono);
  $("waNombre").textContent = estado.negocio.nombre;
  $("waEstado").textContent = enviando ? "escribiendo…" : "en línea";

  const chat = $("chat");
  if (mensajes.length === 0 && !enviando) {
    chat.innerHTML = `<div class="vacio-chat">Eres un cliente nuevo${lead?.nombre ? "" : ""} escribiéndole a <b>${esc(estado.negocio.nombre)}</b> por WhatsApp.<br>Escribe un mensaje o usa las sugerencias de abajo 👇</div>`;
    return;
  }
  let ultimoDia = "";
  let html = "";
  for (const m of mensajes) {
    const d = dia(m.ts);
    if (d !== ultimoDia) {
      html += `<div class="dia-sep">${esc(d)}</div>`;
      ultimoDia = d;
    }
    const clase = m.de === "cliente" ? "cliente" : "bot";
    const etiqueta = m.seguimiento ? `<span class="etiqueta">③ Seguimiento automático</span>` : "";
    html += `<div class="burbuja ${clase}${m.seguimiento ? " seguimiento" : ""}">${etiqueta}${formatoWA(m.texto)}<span class="hora">${hora(m.ts)}${clase === "cliente" ? " ✓✓" : ""}</span></div>`;
  }
  if (enviando) html += `<div class="escribiendo"><span></span><span></span><span></span></div>`;
  chat.innerHTML = html;
  chat.scrollTop = chat.scrollHeight;
}

function animarNumero(id, valor) {
  const el = $(id);
  if (el.textContent !== String(valor)) {
    el.textContent = valor;
    if (!vistos.primeraCarga) {
      el.classList.add("cambio");
      setTimeout(() => el.classList.remove("cambio"), 1500);
    }
  }
}

function pintarKpis() {
  const l = estado.leads;
  animarNumero("kLeads", l.length);
  animarNumero("kCotizados", l.filter((x) => x.cotizadoEn).length);
  animarNumero("kCitas", estado.eventos.filter((e) => e.creadoPor?.startsWith("Agente")).length);
  animarNumero("kSeguimientos", l.filter((x) => x.seguimientoEn).length);
}

function pintarCrm() {
  const filas = [...estado.leads].sort((a, b) => (b.actualizado || b.creado).localeCompare(a.actualizado || a.creado));
  const celda = (v) => (v ? esc(v) : `<span class="vacio">—</span>`);
  $("crm").innerHTML = filas.map((l) => {
    const firma = l.actualizado || l.creado;
    const cambio = !vistos.primeraCarga && vistos.leads.get(l.telefono) !== firma;
    vistos.leads.set(l.telefono, firma);
    const clases = [l.telefono === telefono ? "activa" : "", cambio ? "flash" : ""].join(" ");
    return `<tr class="${clases}" data-tel="${esc(l.telefono)}">
      <td class="nombre">${celda(l.nombre)}</td>
      <td>${esc(l.telefono)}</td>
      <td>${celda(l.negocio)}</td>
      <td>${celda(l.servicio)}</td>
      <td>${celda(l.correo)}</td>
      <td><span class="estado ${esc(l.estado)}">${esc(l.estado === "Seguimiento" ? "Seguimiento enviado" : l.estado)}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="vacio">Aún no hay prospectos</td></tr>`;
}

function pintarCalendario() {
  const inicioHoy = new Date(estado.ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const eventos = estado.eventos.filter((e) => new Date(e.fin) >= inicioHoy);
  let ultimo = "";
  let html = "";
  for (const e of eventos) {
    const d = dia(e.inicio);
    if (d !== ultimo) { html += `<div class="cal-dia">${esc(d)}</div>`; ultimo = d; }
    const nuevo = !vistos.primeraCarga && !vistos.eventos.has(e.id);
    vistos.eventos.add(e.id);
    html += `<div class="evento ${e.creadoPor === "Manual" ? "interno" : ""} ${nuevo ? "nuevo" : ""}">
      <div class="h">${hora(e.inicio)}</div>
      <div>
        <div class="t">${esc(e.titulo)}</div>
        <div class="d">${esc(e.invitado)}${e.correo ? " · " + esc(e.correo) : ""}</div>
        ${e.meet ? `<a href="${esc(e.meet)}" target="_blank" rel="noopener">🎥 ${esc(e.meet.replace("https://", ""))}</a>` : ""}
      </div>
    </div>`;
  }
  if (vistos.primeraCarga) estado.eventos.forEach((e) => vistos.eventos.add(e.id));
  $("calendario").innerHTML = html || `<div class="cal-dia">Sin citas próximas</div>`;
}

function pintarActividad() {
  const ultima = estado.actividad.at(-1);
  const firma = `${estado.actividad.length}|${ultima?.ts}|${ultima?.texto}`;
  if (firma === pintarActividad.firma) return; // evita repetir la animación en cada sondeo
  pintarActividad.firma = firma;
  const clase = (a) => (a.startsWith("Agente 1") ? "a1" : a.startsWith("Agente 2") ? "a2" : a.startsWith("Agente 3") ? "a3" : "sis");
  $("actividad").innerHTML = [...estado.actividad].reverse().map((a) => `
    <div class="act ${clase(a.agente)} ${a.tipo === "error" ? "error" : ""}">
      <div class="ts">${hora(a.ts)}</div>
      <div><span class="ag">${esc(a.agente)}</span> · ${esc(a.texto)}</div>
    </div>`).join("");
}

function pintarSugerencias() {
  $("sugerencias").innerHTML =
    `<div class="titulo">Guion sugerido para la demo</div>` +
    SUGERENCIAS.map((s) => `<button type="button">${esc(s)}</button>`).join("");
}

// ---------- Acciones ----------
async function enviar(texto) {
  if (!texto.trim() || enviando) return;
  enviando = true;
  $("entrada").value = "";
  $("form").querySelector("button").disabled = true;
  // Pinta el mensaje del cliente al instante, antes de que responda el agente
  estado.chats[telefono] = [...(estado.chats[telefono] || []), { de: "cliente", texto, ts: estado.ahora }];
  firmaChat = "";
  pintarChat();
  try {
    await api("/api/mensaje", { telefono, texto });
  } catch (e) {
    toast("⚠️ " + e.message);
  } finally {
    enviando = false;
    $("form").querySelector("button").disabled = false;
    firmaChat = "";
    await refrescar();
    $("entrada").focus();
  }
}

function cambiarChat(tel) {
  telefono = tel;
  extras.add(tel);
  guardarLocal("telefono", tel);
  guardarLocal("extras", JSON.stringify([...extras]));
  firmaChat = "";
  pintar();
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  enviar($("entrada").value);
});
$("sugerencias").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") enviar(e.target.textContent);
});
$("selChat").addEventListener("change", (e) => cambiarChat(e.target.value));
$("crm").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-tel]");
  if (fila) cambiarChat(fila.dataset.tel);
});
$("btnNuevo").addEventListener("click", () => cambiarChat(nuevoTelefono()));

async function conBoton(boton, tarea) {
  boton.disabled = true;
  try { await tarea(); } catch (e) { toast("⚠️ " + e.message); } finally { boton.disabled = false; await refrescar(); }
}

$("btnReloj").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
  await api("/api/reloj", { horas: 24 });
  toast("⏩ Pasó un día. Ahora ejecuta el seguimiento automático.");
}));

$("btnSeguimiento").addEventListener("click", (e) => conBoton(e.currentTarget, async () => {
  toast("③ El Agente de Seguimiento está revisando el CRM…");
  const r = await api("/api/seguimiento", {});
  const n = r.enviados.length;
  toast(n ? `③ ${n === 1 ? "Se envió 1 seguimiento" : `Se enviaron ${n} seguimientos`} por WhatsApp` : "③ No hay prospectos pendientes de seguimiento (cotizados hace más de 24 h)");
  if (r.enviados.length && !r.enviados.includes(telefono)) cambiarChat(r.enviados[0]);
}));

$("btnReiniciar").addEventListener("click", (e) => {
  if (!confirm("¿Reiniciar el demo? Se borran los chats, el CRM y las citas creadas.")) return;
  conBoton(e.currentTarget, async () => {
    await api("/api/reiniciar", {});
    extras.clear();
    vistos.leads.clear();
    vistos.eventos.clear();
    vistos.primeraCarga = true;
    cambiarChat(nuevoTelefono());
    toast("Demo reiniciado");
  });
});

guardarLocal("telefono", telefono);
guardarLocal("extras", JSON.stringify([...extras]));
pintarSugerencias();
refrescar();
setInterval(() => { if (!enviando) refrescar(); }, 2500);
