# Despliegue de Vaniet IA: demo, bot, dominio y disponibilidad

Los precios y las pantallas de cada proveedor cambian: confírmalos al hacer cada paso.

## Arquitectura

```
demo.vaniet.co  ──►  Cloudflare Pages   (el demo: archivo estático, sin servidor)
api.vaniet.co   ──►  Servidor del bot    (Railway, Render, Fly.io o un VPS) ──► API oficial de WhatsApp
                                          └─ IA gratuita en cadena (5 proveedores) y, luego, Supabase
```

- **El demo** no tiene servidor que pueda caerse: Cloudflare lo reparte desde su red global. Eso ya es alta disponibilidad.
- **El bot** sí necesita cuidado: es lo que atiende a clientes reales.

## Orden recomendado

### 1. Dominio (30 min)
1. Verifica en la SIC (marca) y en el registrador que `vaniet.co` o `vaniet.com` estén libres.
2. Cómpralo en Cloudflare Registrar (vende al costo; sale a tu nombre de persona natural, está bien por ahora).
3. Crea correo `hola@vaniet.co` (Cloudflare Email Routing reenvía gratis a tu correo personal).

### 2. Demo en Vercel (10 min) — la ruta elegida
Vercel no tiene "arrastrar y soltar": se publica con su herramienta de línea de comandos (o conectando un repositorio de GitHub).

```bash
cd online/deploy
npx vercel login
npx vercel --prod
```

Respuestas la primera vez: *Set up and deploy?* sí · *Scope:* tu cuenta · *Link to existing project?* no · *Project name:* `vaniet` · *Directory:* `./` · *Override settings?* no. Vercel te entrega una URL (idealmente `https://vaniet.vercel.app`).

1. **Si la URL no es `vaniet.vercel.app`** (el nombre ya estaba tomado), reconstruye con la URL real para que la vista previa al compartir (imagen y título) funcione, y vuelve a publicar:
   `SITIO_URL=https://TU-URL.vercel.app node online/build.mjs` y luego `npx vercel --prod` otra vez.
2. **Métricas:** en Vercel → proyecto → Logs verás líneas `EVENTO {...}` (abrió, escribió, completó el reto, tocó WhatsApp, con el nombre del enlace). Los logs duran poco; para guardar un registro propio crea una variable `EVENTOS_WEBHOOK_URL` (Make, n8n o Google Apps Script) y cada evento se reenvía ahí.
3. **Plan:** revisa en la página de precios de Vercel si el plan gratuito (Hobby) permite uso comercial; si no, usa el plan de pago o Cloudflare Pages.
4. **Dominio propio, después:** Vercel → proyecto → Domains. No hay que rehacer nada; vuelve a construir con `SITIO_URL` del dominio nuevo.
5. Prueba: abre `https://TU-URL/?negocio=clinica#nombre-del-cliente`, escribe un mensaje y toca el botón de WhatsApp. Revisa que `/privacidad` y `/terminos` abran.
6. Cada cambio en `vaniet-demo.html`: `node online/build.mjs` y `npx vercel --prod` desde `online/deploy`.

### 2b. Alternativa: Cloudflare Pages (15 min)
1. `node online/build.mjs` genera `online/deploy/` con `index.html` y `_headers` (seguridad).
2. Cloudflare → Workers y Pages → Crear → Pages → **Subir recursos (Direct Upload)** → arrastra la carpeta `online/deploy`.
3. En el proyecto → Dominios personalizados → `demo.vaniet.co`.
4. Revisa que `https://demo.vaniet.co/#nombre-del-cliente` abra el demo.
5. Cada cambio: `node online/build.mjs` y subir la carpeta de nuevo.

### 3. Claves de IA (una cuenta por proveedor, a tu nombre)
| Proveedor | Dónde se crea la clave | Variable |
| --- | --- | --- |
| Google Gemini | aistudio.google.com | `GEMINI_API_KEY` |
| Groq | console.groq.com | `GROQ_API_KEY` |
| OpenRouter | openrouter.ai | `OPENROUTER_API_KEY` |
| Mistral | console.mistral.ai | `MISTRAL_API_KEY` |
| Cerebras | cloud.cerebras.ai | `CEREBRAS_API_KEY` |

Los niveles gratuitos pueden usar lo que se envía para mejorar sus productos: solo para el demo y con datos de ejemplo. Los modelos gratuitos cambian: si un proveedor da error 404, cambia su `*_MODEL` en las variables.

### 4. Servidor del bot (1 hora)
1. Sube este proyecto a un repositorio **privado en tu GitHub personal** (no en cuentas de tu empresa).
2. En Railway o Render: nuevo servicio desde el repositorio (usa el `Dockerfile` incluido).
3. Variables: las del `.env.example` (claves de IA, `WA_*`, `SEGUIMIENTO_AUTO=1`, `WA_APP_SECRET`).
4. **Volumen persistente** montado en `/app/data`: ahí vive la base. Sin volumen, cada redespliegue la borra.
5. Dominio `api.vaniet.co` apuntando al servicio (CNAME en Cloudflare).
6. Healthcheck en `/salud` (debe responder `{"ok":true,...}`).
7. En Meta, webhook: `https://api.vaniet.co/webhook/whatsapp`.

### 5. Disponibilidad: lo realista para empezar
| Nivel | Qué incluye | Costo aprox. | Cuándo |
| --- | --- | --- | --- |
| **1 (ahora)** | 1 instancia con reinicio automático, healthcheck, monitor externo y copia diaria de la base | USD 5-10/mes | Demo y primer piloto |
| 2 | Base en Supabase (no depende del disco), 2 instancias y cola de mensajes | USD 25-50/mes | Con 2-3 clientes de pago |
| 3 | Varias regiones, alertas 24/7, soporte con SLA | Más alto | Clientes grandes |

Con el nivel 1:
- **Monitor externo:** UptimeRobot o Uptime Kuma llamando a `https://api.vaniet.co/salud` cada 5 minutos, con alerta a tu correo y a tu WhatsApp personal.
- **Reintentos de Meta:** si el servidor cae unos minutos, Meta vuelve a enviar los mensajes que no recibió, y el servidor ignora los repetidos.
- **Respaldo de IA:** 5 proveedores en cadena y, si todos fallan, el modo guion.
- **Copia de seguridad:** descarga `data/db.json` cada día (programa una tarea) hasta pasar a Supabase.

No prometas "99.9%" en un contrato todavía: pacta tiempos de respuesta ante caídas y "mejor esfuerzo".

### 6. WhatsApp
Sigue la sección "Conectar WhatsApp real" del README: chip nuevo, Meta Business, plantilla de seguimiento y webhook.

## Lista para salir
- [ ] Dominio comprado y `demo.vaniet.co` funcionando
- [ ] Política de privacidad publicada (ej. `vaniet.co/privacidad`) y enlazada en el aviso del bot
- [ ] Número real de WhatsApp en `NEGOCIO.telefonoWhatsApp` del demo y `node online/build.mjs`
- [ ] Servidor con volumen y `/salud` verde, y monitor activo
- [ ] Plantilla de seguimiento aprobada por Meta
- [ ] Prueba completa: escribir al número, recibir respuesta, escribir BAJA, ver el CRM
- [ ] Contrato y RUT listos antes del primer cobro

## Costo mensual estimado (aproximado)
Dominio ~USD 1-6 · Pages USD 0 · Servidor USD 5-10 · IA del demo USD 0 · Chip y mensajes de WhatsApp según uso y tarifa de Meta · Monitor USD 0.
