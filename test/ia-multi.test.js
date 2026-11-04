// Prueba la cadena de proveedores con servidores falsos compatibles con OpenAI (sin gastar nada).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";

process.env.DB_FILE = path.join(os.tmpdir(), `vaniet-test-${process.pid}-multi.json`);

function falso(manejador) {
  const llamadas = [];
  const srv = http.createServer(async (req, res) => {
    let cuerpo = "";
    for await (const t of req) cuerpo += t;
    const json = JSON.parse(cuerpo);
    llamadas.push(json);
    const [codigo, datos] = manejador(json, llamadas.length);
    res.writeHead(codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(datos));
  });
  return new Promise((ok) => srv.listen(0, () => ok({ srv, llamadas, url: `http://127.0.0.1:${srv.address().port}/v1/chat/completions` })));
}
const texto = (t) => [200, { choices: [{ message: { role: "assistant", content: t } }] }];

test("si el primer proveedor se queda sin cupo (429) responde el siguiente, usando herramientas", async () => {
  const gemini = await falso(() => [429, { error: "cuota" }]);
  const groq = await falso((cuerpo, n) =>
    n === 1
      ? [200, { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "registrar_lead", arguments: JSON.stringify({ nombre: "Pedro Gil", negocio: "Gimnasio" }) } }] } }] }]
      : texto("¡Hola Pedro! Soy Sofía 😊 ¿Cuántos mensajes recibes al día?"),
  );
  process.env.GEMINI_API_KEY = "a"; process.env.GEMINI_URL = gemini.url;
  process.env.GROQ_API_KEY = "b"; process.env.GROQ_URL = groq.url;
  process.env.IA_ORDEN = "gemini,groq";

  const store = await import("../src/store.js");
  store.cargar();
  const multi = await import("../src/ia-multi.js");
  assert.equal(multi.hayProveedores(), true);

  const r = await multi.responder("+57 300 111 2222", "Hola, tengo un gimnasio");
  assert.match(r, /Hola Pedro/);
  const lead = store.buscarLead("+57 300 111 2222");
  assert.equal(lead.nombre, "Pedro Gil");
  assert.equal(lead.negocio, "Gimnasio");
  assert.equal(gemini.llamadas.length, 1, "Gemini se intentó una vez y quedó en pausa");

  // Mientras Gemini está en pausa, el siguiente mensaje va directo a Groq
  await multi.responder("+57 300 111 2222", "¿Cuánto cuesta?");
  assert.equal(gemini.llamadas.length, 1);
  assert.ok(groq.llamadas.length >= 3);
  assert.ok(store.getDb().actividad.some((a) => /Gemini en pausa/.test(a.texto)));
  gemini.srv.close(); groq.srv.close();
});

test("si todos los proveedores fallan, responde el modo guion", async () => {
  const caido = await falso(() => [500, { error: "caído" }]);
  process.env.GEMINI_URL = caido.url; process.env.GROQ_URL = caido.url;
  const multi = await import("../src/ia-multi.js?otra");
  // Los proveedores quedaron en pausa del test anterior en el otro módulo; este es una instancia nueva
  const r = await multi.responder("+57 300 333 4444", "Hola");
  assert.match(r, /Sofía/);
  caido.srv.close();
});
