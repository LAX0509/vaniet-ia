// Prueba el servidor completo con el webhook de WhatsApp (modo simulado: no se envía nada real).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraerMensajes } from "../src/whatsapp.js";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO = 5700 + Math.floor(Math.random() * 200);
const SECRETO = "secreto-de-prueba";
const BASE = `http://127.0.0.1:${PUERTO}`;
let proc, salida = "";

const payload = (id, de, texto) => ({
  entry: [{ changes: [{ value: { contacts: [{ wa_id: de, profile: { name: "Pedro" } }], messages: [{ id, from: de, type: "text", text: { body: texto } }] } }] }],
});
const firmar = (cuerpo) => "sha256=" + crypto.createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
const publicar = (cuerpo, firma) => fetch(`${BASE}/webhook/whatsapp`, { method: "POST", headers: { "Content-Type": "application/json", ...(firma ? { "x-hub-signature-256": firma } : {}) }, body: cuerpo });
const esperar = async (cond, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

before(async () => {
  proc = spawn(process.execPath, ["server.js"], {
    cwd: raiz,
    env: { ...process.env, PORT: String(PUERTO), MODO: "demo", WA_SIMULAR: "1", WA_VERIFY_TOKEN: "abc", WA_APP_SECRET: SECRETO, DB_FILE: path.join(os.tmpdir(), `vaniet-test-${process.pid}-wa.json`) },
  });
  proc.stdout.on("data", (d) => (salida += d));
  proc.stderr.on("data", (d) => (salida += d));
  assert.ok(await esperar(() => salida.includes("WhatsApp:")), "el servidor no arrancó: " + salida);
});
after(() => proc?.kill());

test("extrae mensajes de texto y botones del webhook", () => {
  const m = extraerMensajes(payload("w1", "573001112222", "hola"));
  assert.deepEqual(m, [{ id: "w1", de: "573001112222", nombre: "Pedro", tipo: "text", texto: "hola" }]);
  const audio = extraerMensajes({ entry: [{ changes: [{ value: { messages: [{ id: "w2", from: "57300", type: "audio" }] } }] }] });
  assert.equal(audio[0].texto, null);
});

test("verificación del webhook", async () => {
  const ok = await fetch(`${BASE}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=12345`);
  assert.equal(await ok.text(), "12345");
  const mal = await fetch(`${BASE}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`);
  assert.equal(mal.status, 403);
});

test("rechaza mensajes sin firma válida", async () => {
  const cuerpo = JSON.stringify(payload("x1", "573009998888", "hola"));
  assert.equal((await publicar(cuerpo)).status, 401);
  assert.equal((await publicar(cuerpo, "sha256=" + "0".repeat(64))).status, 401);
});

test("mensaje real: responde, registra consentimiento, avisa que es IA y no duplica", async () => {
  const cuerpo = JSON.stringify(payload("w-1", "573001112222", "Hola, tengo un gimnasio"));
  assert.equal((await publicar(cuerpo, firmar(cuerpo))).status, 200);
  assert.ok(await esperar(() => salida.includes("[WhatsApp simulado] → 573001112222")), salida);
  assert.match(salida, /asistente de IA/);
  await publicar(cuerpo, firmar(cuerpo)); // reintento de Meta con el mismo id
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(salida.split("[WhatsApp simulado] → 573001112222").length - 1, 1, "no debe responder dos veces el mismo mensaje");
  const est = await (await fetch(`${BASE}/api/estado`)).json();
  const lead = est.leads.find((l) => l.telefono === "+573001112222");
  assert.equal(lead.consentimiento, true);
  assert.equal(lead.canal, "whatsapp");
});

test("BAJA: confirma y marca que no se le debe escribir", async () => {
  const cuerpo = JSON.stringify(payload("w-2", "573001112222", "BAJA"));
  await publicar(cuerpo, firmar(cuerpo));
  assert.ok(await esperar(async () => (await (await fetch(`${BASE}/api/estado`)).json()).leads.find((l) => l.telefono === "+573001112222")?.consentimiento === false));
  assert.match(salida, /no te escribiremos más/);
});
