# Demo 01 · Ecosistema de 3 agentes de IA para WhatsApp

Demo comercial de **Vaniet IA**: un asistente que atiende WhatsApp 24/7,
califica prospectos, cotiza, agenda citas y hace seguimiento automático. En pantalla se ve
el chat del cliente y, al lado, lo que los agentes hacen "detrás": el CRM (Google Sheets),
el calendario (Google Calendar) y el registro de actividad.

| Agente | Qué hace | En producción se conecta a |
|---|---|---|
| ① Vendedor 24/7 | Responde dudas, recomienda plan, guarda datos en el CRM, cotiza | WhatsApp API + Google Sheets |
| ② Agendador | Consulta horarios libres, ofrece 2 opciones, crea la cita con enlace de Meet | Google Calendar |
| ③ Seguimiento | Cada día revisa quién cotizó hace 24 h y no respondió, y le escribe | Cron diario 10:00 a.m. |

## Versión en línea (la que se envía a los clientes)

[online/vaniet-demo.html](online/vaniet-demo.html) es el demo completo en un solo archivo, sin servidor.
Todo corre en el navegador de quien lo abre.

Es una sola experiencia: la historia y el chat en vivo comparten la misma línea de tiempo.

- **La historia (▶):** una clienta llega de noche, cotiza, se enfría, recibe seguimiento automático
  y agenda, en 36 horas y 11 pasos explicados con lo que gana el negocio en cada uno.
- **Chat en vivo:** el prospecto escribe cuando quiera, incluso con la historia corriendo. Su chat
  queda en la línea de tiempo (puntos verdes) y los agentes lo atienden junto a los demás: el
  seguimiento de las 10:00 a.m. también le escribe a él.
- **En vivo · Tu prueba:** después de cada mensaje, el panel explica qué hicieron los agentes detrás. A la derecha, un solo panel con pestañas (CRM, Calendario, Actividad) salta al sistema donde actuó cada agente.
- **Reto de los 3 agentes:** 4 pasos con progreso (contar el negocio, cotizar, dejar pasar el tiempo
  y recibir seguimiento, agendar), con un botón para adelantar al seguimiento y cierre con WhatsApp.
- Sugerencias que cambian según el punto de la conversación, bienvenida al abrir y botón
  **Escríbenos por WhatsApp** con mensaje prellenado (usa `NEGOCIO.telefonoWhatsApp`).

### Parámetros del enlace

- `?negocio=clinica|gimnasio|inmobiliaria` adapta la historia al sector del prospecto.
- `?presenta=1` abre el **modo presentación** (sin reto ni ayudas, ideal para reuniones y Loom).
- `#nombre-del-cliente` pone su nombre y guarda su prueba aparte.

Ejemplo: `https://TU-DOMINIO/?negocio=gimnasio#gimnasio-fuerza`

### Un enlace por cliente

Agrega `#nombre-del-cliente` al final del enlace:

```
https://TU-DOMINIO/#clinica-sonrie
```

El demo muestra "Demo preparada para Clinica Sonrie" y guarda esa prueba aparte.
Los datos viven solo en el navegador de quien abre el enlace, así que nunca se cruzan con otro
prospecto. El mismo prospecto en otro equipo empieza de cero.

### Publicarlo en tu propio dominio (recomendado)

```bash
node online/build.mjs
```

Genera `online/deploy/` completo: demo con vista previa al compartir, `/privacidad`, `/terminos`, función de
métricas anónimas (`api/evento.mjs`) y `vercel.json` con cabeceras de seguridad. Para Vercel, los pasos
exactos están en [DESPLIEGUE.md](DESPLIEGUE.md). Sirve en cualquier hosting estático
gratuito: Netlify (arrastrar la carpeta en app.netlify.com/drop), Cloudflare Pages, Vercel o
GitHub Pages. Cada vez que cambies `vaniet-demo.html`, vuelve a correr el comando y a subir la carpeta.

Para probarlo en local, usa la configuración `demo-online` (http://localhost:5050).

### Copia en Claude

https://claude.ai/artifact/RrPxfHKSwrWrXGjEMfBHsK. Es privada hasta que la compartas desde el menú
Compartir. Ahí, quien tenga sesión de Claude ve además el modo **IA REAL**. En el hosting propio
ese modo no aparece y el demo funciona solo con el guion.

## Versión local con servidor (la primera versión, sin línea de tiempo)

Requisitos: Node.js 22 o superior.

```bash
npm install
npm start
```

Abre http://localhost:5000

- **Sin API key** corre en **MODO DEMO**: respuestas guiadas por reglas, ideal para presentar sin internet.
- **Con IA real**: copia `.env.example` como `.env`, pon tu `ANTHROPIC_API_KEY` (https://console.anthropic.com) y reinicia. La insignia cambia a **IA REAL** y las conversaciones se vuelven libres.

## Conectar WhatsApp real (API oficial)

El servidor ya recibe y responde mensajes reales en `/webhook/whatsapp`. Úsalo con la **API oficial de
Meta** (directa o vía un proveedor como 360dialog), **no** con herramientas no oficiales sobre tu app:
Meta puede bloquear el número. Recomendado: un chip nuevo exclusivo para el bot.

1. Prueba primero sin cuenta de Meta: `WA_SIMULAR=1 WA_VERIFY_TOKEN=abc npm start` y envía un POST de
   prueba a `/webhook/whatsapp` (ver `test/whatsapp.test.js`). Los mensajes salen en la consola.
2. Crea la cuenta de Meta Business, verifica el negocio y registra el número en la API (RUT y soporte).
3. Copia `.env.example` como `.env` y completa `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN` (lo inventas tú)
   y `WA_APP_SECRET` (valida que los mensajes vengan de Meta).
4. Publica el servidor con HTTPS (un VPS, Railway o Render; para pruebas, un túnel de Cloudflare).
5. En Meta, configura el webhook `https://TU-SERVIDOR/webhook/whatsapp` con tu verify token y suscríbete a `messages`.
6. **Plantilla de seguimiento:** pasadas 24 h solo se puede escribir con una plantilla aprobada por Meta.
   Crea una con este cuerpo y ponle su nombre en `WA_PLANTILLA_SEGUIMIENTO`:
   `Hola {{1}}, soy Sofía de Vaniet IA. Hace poco te compartí la propuesta del {{2}}. ¿Te quedó alguna duda? Responde este mensaje y con gusto te ayudo.`
7. Activa `SEGUIMIENTO_AUTO=1` para el cron real del Agente 3.

Qué hace el servidor por cumplimiento (Ley 2300 de 2023 y Habeas Data; confirma con tu abogado):
- Primer mensaje: avisa que es un asistente de IA, registra la autorización con fecha y ofrece **BAJA**.
- Quien escribe BAJA no vuelve a recibir mensajes proactivos.
- El seguimiento real solo corre de lunes a viernes de 7:00 a.m. a 7:00 p.m. y sábados de 8:00 a.m. a
  3:00 p.m., nunca domingos ni festivos de Colombia (se calculan solos), y solo a quien autorizó.
- Se valida la firma de Meta y se ignoran mensajes repetidos.

### IA gratuita en cadena

Define en `.env` las claves que tengas (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`,
`MISTRAL_API_KEY`, `CEREBRAS_API_KEY`): una cuenta por proveedor. Si uno falla o se queda sin cupo, responde
el siguiente; si fallan todos, responde el modo guion. Los niveles gratuitos pueden usar lo que se envía para
mejorar sus productos: solo para el demo y con datos de ejemplo. Con clientes de pago, claves del cliente.
Los modelos gratuitos cambian: ajusta `*_MODEL` si un proveedor devuelve error 404.

Pruebas automáticas: `npm test`.

## Guion de presentación (2 minutos, ideal para grabar en Loom)

1. **Contexto (10 s):** "Así se ve tu WhatsApp atendido por IA. A la derecha está lo que pasa detrás."
2. **Agente 1 (40 s):** usa las sugerencias de abajo del teléfono: saludo → "Tengo una clínica dental…" → "¿Cuánto cuesta?".
   Muestra cómo la fila del CRM se llena sola y cambia a *Cotizado*.
3. **Agente 2 (40 s):** "Sí, quiero agendar" → "La opción 1" → nombre → correo.
   Muestra la cita nueva en el calendario con su enlace de Meet.
4. **Agente 3 (30 s):** en la versión en línea, botón **⏩ Adelantar** del reto (o arrastrar la línea
   de tiempo). En la versión local, **⏩ +24 h** y luego **▶ Ejecutar seguimiento**.
5. **Cierre:** "Esto mismo, con tus servicios y tu agenda, en 5 días hábiles."

**↺** reinicia el demo antes de cada presentación.

## Adaptarlo a otro negocio

Todo lo que cambia entre clientes está en [src/config.js](src/config.js): nombre, asistente,
servicios y precios, preguntas frecuentes, horario de citas y reglas de seguimiento.

## Estructura

```
server.js              API y servidor web
src/config.js          Datos del negocio (lo único que se edita por cliente)
src/agente-claude.js   Agentes 1-2-3 con IA real (Claude + herramientas)
src/agente-demo.js     Mismos agentes en modo demo (reglas, sin API key)
src/ia-multi.js        Cadena de 5 proveedores de IA gratuitos con respaldo
src/whatsapp.js        WhatsApp oficial: webhook, firma, texto y plantillas
src/cumplimiento.js    Ley 2300 (horarios y festivos), baja y aviso de IA
src/prompt.js          Prompt compartido por todas las IA
test/                  Pruebas automáticas (npm test)
src/tools.js           Herramientas: CRM, calendario, escalar a humano
src/store.js           Base simulada (CRM, calendario, chats) y reloj del demo
public/                Interfaz (teléfono + panel)
```

## Pendiente para llevarlo a producción

- Cambiar `store.js` (archivo JSON) por Supabase y Google Calendar reales con una cuenta de servicio.
- Publicar el servidor con HTTPS y un disco persistente (o ya con Supabase).
- Crear y aprobar en Meta la plantilla de seguimiento y verificar el negocio.
- Política de privacidad publicada en el sitio y revisada por un abogado.
