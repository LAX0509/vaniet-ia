import test from "node:test";
import assert from "node:assert/strict";
import { festivosColombia, puedeContactar, pideBaja, esFestivo } from "../src/cumplimiento.js";

// Hora de Colombia → instante UTC
const co = (iso, h = 10, m = 0) => new Date(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-05:00`);

test("festivos de Colombia 2026 (Ley Emiliani y Semana Santa)", () => {
  const esperados = [
    "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18",
    "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12",
    "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
  ];
  assert.deepEqual([...festivosColombia(2026)].sort(), esperados);
});

test("lunes a viernes de 7:00 a.m. a 7:00 p.m.", () => {
  assert.equal(puedeContactar(co("2026-10-27", 10)).ok, true); // martes
  assert.equal(puedeContactar(co("2026-10-27", 6, 59)).ok, false);
  assert.equal(puedeContactar(co("2026-10-27", 19, 0)).ok, false);
  assert.equal(puedeContactar(co("2026-10-27", 18, 59)).ok, true);
});

test("sábados de 8:00 a.m. a 3:00 p.m.; domingos y festivos nunca", () => {
  assert.equal(puedeContactar(co("2026-10-31", 9)).ok, true); // sábado
  assert.equal(puedeContactar(co("2026-10-31", 16)).ok, false);
  assert.equal(puedeContactar(co("2026-11-01", 10)).motivo, "domingo");
  assert.equal(puedeContactar(co("2026-11-02", 10)).motivo, "festivo"); // Todos los Santos trasladado
  assert.equal(esFestivo(co("2026-11-03", 10)), false);
});

test("pedir la baja", () => {
  for (const t of ["BAJA", "baja.", "Stop", "no me escriban más", "quiero darme de baja"]) assert.equal(pideBaja(t), true, t);
  for (const t of ["hola", "cuánto cuesta", "la baja California"]) assert.equal(pideBaja(t), false, t);
});
