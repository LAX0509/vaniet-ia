// Prueba que el panel y /api/* quedan protegidos en un servidor público, y que /salud y el webhook siguen abiertos.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const procesos = [];
const esperar = async (cond, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

async function arrancar(env) {
  const puerto = 5900 + Math.floor(Math.random() * 90);
  let salida = "";
  const proc = spawn(process.execPath, ["server.js"], {
    cwd: raiz,
    env: { ...process.env, PORT: String(puerto), MODO: "demo", WA_SIMULAR: "1", DB_FILE: path.join(os.tmpdir(), `vaniet-test-${process.pid}-${puerto}.json`), ...env },
  });
  proc.stdout.on("data", (d) => (salida += d));
  proc.stderr.on("data", (d) => (salida += d));
  procesos.push(proc);
  assert.ok(await esperar(() => salida.includes("WhatsApp:")), "el servidor no arrancó: " + salida);
  return `http://127.0.0.1:${puerto}`;
}
after(() => procesos.forEach((p) => p.kill()));

const basic = (clave) => ({ Authorization: "Basic " + Buffer.from(`admin:${clave}`).toString("base64") });

test("con ADMIN_TOKEN: panel y API piden clave; /salud y webhook siguen abiertos", async () => {
  const base = await arrancar({ NODE_ENV: "production", ADMIN_TOKEN: "clave-larga-de-prueba", WA_VERIFY_TOKEN: "abc" });
  assert.equal((await fetch(`${base}/api/estado`)).status, 401);
  assert.equal((await fetch(`${base}/`)).status, 401);
  assert.equal((await fetch(`${base}/api/reiniciar`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${base}/api/estado`, { headers: basic("otra-clave-de-pruebas") })).status, 401);
  assert.equal((await fetch(`${base}/api/estado`, { headers: basic("clave-larga-de-prueba") })).status, 200);
  assert.equal((await fetch(`${base}/salud`)).status, 200);
  const v = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=42`);
  assert.equal(await v.text(), "42");
});

test("en producción sin ADMIN_TOKEN el panel queda cerrado", async () => {
  const base = await arrancar({ NODE_ENV: "production", ADMIN_TOKEN: "" });
  assert.equal((await fetch(`${base}/api/estado`)).status, 403);
  assert.equal((await fetch(`${base}/salud`)).status, 200);
});
