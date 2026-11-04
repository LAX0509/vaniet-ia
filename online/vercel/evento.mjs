// Función de Vercel: recibe métricas anónimas de uso del demo (ver /privacidad).
// No guarda IP ni contenido de mensajes. Cada evento queda en los logs de Vercel y, si defines la variable
// EVENTOS_WEBHOOK_URL (Make, n8n, Google Apps Script...), también se reenvía ahí para llevar tu propio registro.

const EVENTOS = new Set(["abrio", "historia_completa", "escribio", "reto_completo", "clic_whatsapp"]);

function leerJson(cuerpo) {
  if (cuerpo && typeof cuerpo === "object") return cuerpo;
  try { return JSON.parse(String(cuerpo || "{}")); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const b = leerJson(req.body);
  const e = String(b.e || "");
  if (!EVENTOS.has(e)) {
    res.status(400).end();
    return;
  }
  const linea = {
    evento: e,
    cliente: String(b.c || "general").replace(/[^\w.~-]/g, "").slice(0, 60),
    sector: String(b.s || "").replace(/[^a-z]/g, "").slice(0, 20),
    ts: new Date().toISOString(),
  };
  console.log("EVENTO", JSON.stringify(linea));
  const hook = process.env.EVENTOS_WEBHOOK_URL;
  if (hook) {
    try {
      await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(linea) });
    } catch {}
  }
  res.status(204).end();
}
