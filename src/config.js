// Todo lo que cambia de un cliente a otro vive aquí: marca, asistente, catálogo y horarios.
// Para adaptar el demo a una clínica, academia, inmobiliaria, etc., solo se edita este archivo.

export const negocio = {
  nombre: "Vaniet IA",
  eslogan: "Infraestructura e Inteligencia Artificial de Alto Impacto",
  ciudad: "Colombia (atención 100% virtual)",
  asistente: "Sofía",
  telefonoWhatsApp: "+57 314 751 8988",
  moneda: "COP",
};

export const servicios = [
  {
    id: "agente-base",
    nombre: "Plan Agente Base",
    precio: 1200000,
    tipo: "pago único",
    incluye: [
      "Agente de IA que atiende tu WhatsApp 24/7",
      "Responde preguntas frecuentes, precios y servicios",
      "Captura nombre, correo e interés de cada cliente en un CRM (Google Sheets)",
      "Entrega en 5 días hábiles",
    ],
  },
  {
    id: "full-automatizacion",
    nombre: "Plan Full Automatización",
    precio: 2200000,
    tipo: "pago único",
    incluye: [
      "Todo lo del Plan Agente Base",
      "Agendamiento automático de citas en Google Calendar con enlace de Meet",
      "Seguimiento automático a clientes que cotizaron y no respondieron",
      "Capacitación al equipo de ventas",
    ],
  },
  {
    id: "mantenimiento",
    nombre: "Mantenimiento y Servidor",
    precio: 250000,
    tipo: "mensual",
    incluye: [
      "Hosting del sistema",
      "Soporte ante caídas",
      "Ajustes de respuestas y prompts",
    ],
  },
];

export const preguntasFrecuentes = [
  ["¿Funciona con mi número actual?", "Sí, se conecta a tu WhatsApp Business actual o a uno nuevo."],
  ["¿Sirve para mi tipo de negocio?", "Sí: clínicas, academias, inmobiliarias, turismo, e-commerce y servicios en general."],
  ["¿Necesito saber programar?", "No. Nosotros lo configuramos y te entregamos todo funcionando."],
  ["¿Qué pasa si el bot no sabe algo?", "Transfiere la conversación a una persona de tu equipo."],
  ["¿Cómo se paga?", "50% al iniciar y 50% al entregar. Transferencia, Nequi o tarjeta."],
];

export const agenda = {
  tituloCita: "Diagnóstico gratuito de automatización",
  duracionMin: 30,
  horaInicio: 9, // 9:00 a.m.
  horaFin: 17, // última cita empieza antes de las 5:00 p.m.
  diasAOfrecer: 3, // días hábiles hacia adelante
  zonaHorariaOffset: -5, // Colombia (UTC-5, sin horario de verano)
};

// Seguimiento automático (Agente 3)
export const seguimiento = {
  horasDesdeCotizacion: 24,
  horaEjecucion: "10:00 a.m.",
};
