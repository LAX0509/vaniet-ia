// Genera online/deploy/: el sitio listo para publicar en Vercel (también sirve en Cloudflare Pages o Netlify).
//   index.html        el demo (vaniet-demo.html) con vista previa al compartir (Open Graph) y enlaces legales
//   privacidad.html   política de tratamiento de datos (Ley 1581 de 2012)
//   terminos.html     términos de uso del demo
//   favicon.svg       ícono
//   og.png            imagen de la vista previa (si existe online/og.png)
//   api/evento.mjs    función de Vercel que recibe métricas anónimas de uso
//   vercel.json       cabeceras de seguridad y URLs limpias (/privacidad)
//   _headers          lo mismo para Cloudflare Pages / Netlify
// Uso: node online/build.mjs        (SITIO_URL=https://tu-dominio node online/build.mjs para fijar la URL pública)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const salida = path.join(here, "deploy");
const SITIO_URL = (process.env.SITIO_URL || "https://vaniet.vercel.app").replace(/\/$/, "");
const CONTACTO = "Juan.nietoar@gmail.com";
const MARCA = "Vaniet IA";
const ACTUALIZADO = "31 de octubre de 2026";
const TITULO = `${MARCA} · Demo interactiva`;
const DESCRIPCION = "Mira cómo 3 agentes de IA atienden tu WhatsApp, agendan citas y hacen seguimiento. Pruébalo tú mismo.";

const escribir = (nombre, contenido) => {
  const destino = path.join(salida, nombre);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
};

// ---------- Demo ----------
const fuente = fs.readFileSync(path.join(here, "vaniet-demo.html"), "utf8")
  .replace('<span id="enlacesLegales"></span>', ' · <a href="/privacidad">Privacidad</a> · <a href="/terminos">Términos</a>');
const tieneOg = fs.existsSync(path.join(here, "og.png"));

escribir("index.html", `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="description" content="${DESCRIPCION}">
<meta name="theme-color" content="#0D0F12">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CO">
<meta property="og:site_name" content="${MARCA}">
<meta property="og:title" content="${TITULO}">
<meta property="og:description" content="${DESCRIPCION}">
<meta property="og:url" content="${SITIO_URL}/">
${tieneOg ? `<meta property="og:image" content="${SITIO_URL}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITIO_URL}/og.png">` : ""}
</head>
<body>
${fuente}
</body>
</html>
`);

escribir("favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#93C5FD"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs><rect x=".5" y=".5" width="39" height="39" rx="11" fill="#15181D"/><path d="M11 12.5 20 28l9-15.5" fill="none" stroke="url(#g)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="12.5" r="2.6" fill="#fff"/></svg>
`);
if (tieneOg) fs.copyFileSync(path.join(here, "og.png"), path.join(salida, "og.png"));

// ---------- Páginas legales ----------
const pagina = (titulo, cuerpo) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${titulo} · ${MARCA}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root { color-scheme: light dark; --fondo: #F5F6F8; --texto: #2A2F37; --tinta: #0D0F12; --suave: #6B7280; --borde: #E6E8EC; --enlace: #2563EB; --tarjeta: #fff; }
@media (prefers-color-scheme: dark) { :root { --fondo: #0D0F12; --texto: #C3C9D2; --tinta: #fff; --suave: #8B93A1; --borde: #1E2228; --enlace: #60A5FA; --tarjeta: #15181D; } }
body { margin: 0; background: var(--fondo); color: var(--texto); font: 16px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 40px 20px 64px; }
.tarjeta { background: var(--tarjeta); border: 1px solid var(--borde); border-radius: 16px; padding: 28px; }
h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -.02em; color: var(--tinta); }
h2 { margin: 28px 0 8px; font-size: 18px; color: var(--tinta); }
p, li { margin: 8px 0; }
a { color: var(--enlace); }
.fecha, .volver { color: var(--suave); font-size: 14px; }
</style>
</head>
<body>
<main>
<p class="volver"><a href="/">← Volver al demo</a></p>
<div class="tarjeta">
${cuerpo}
</div>
</main>
</body>
</html>
`;

escribir("privacidad.html", pagina("Política de privacidad", `
<h1>Política de tratamiento de datos personales</h1>
<p class="fecha">Última actualización: ${ACTUALIZADO}</p>

<h2>1. Quién es el responsable</h2>
<p><b>${MARCA}</b>, Medellín, Colombia. Contacto para cualquier solicitud sobre tus datos: <a href="mailto:${CONTACTO}">${CONTACTO}</a>.</p>

<h2>2. Qué pasa con lo que escribes en el demo</h2>
<ul>
<li>El chat de ejemplo, el CRM y el calendario del demo funcionan <b>en tu navegador</b>. Lo que escribes se guarda solo en tu dispositivo (almacenamiento local) y no se envía a nuestros servidores ni a terceros.</li>
<li>Puedes borrarlo con el botón <b>Reiniciar</b> o borrando los datos del sitio en tu navegador.</li>
<li>Te pedimos no escribir información sensible (datos de salud, documentos de identidad, contraseñas o tarjetas) en el demo.</li>
</ul>

<h2>3. Métricas de uso</h2>
<p>Registramos eventos anónimos para saber si el demo es útil: que se abrió, que se vio la historia completa, que se escribió un mensaje (sin su contenido), que se completó el reto y que se tocó el botón de WhatsApp. Cada evento incluye la fecha, el sector y el identificador del enlace (por ejemplo, el nombre del negocio). No guardamos tu dirección IP ni el contenido de tus mensajes.</p>

<h2>4. Servicios de terceros</h2>
<ul>
<li>El sitio se aloja en Vercel, que puede registrar datos técnicos de conexión (como la dirección IP) para operar el servicio.</li>
<li>Las tipografías se cargan desde Google Fonts, lo que implica una conexión con Google.</li>
</ul>

<h2>5. Si nos escribes por WhatsApp o correo</h2>
<p>Usaremos tus datos de contacto y el contenido de tu mensaje únicamente para responderte y, si lo pides, enviarte una propuesta del servicio. Al continuar la conversación autorizas ese tratamiento. Puedes escribir <b>BAJA</b> en cualquier momento para no recibir más mensajes.</p>
<p>Cuando hablas con el asistente por WhatsApp, estás hablando con un sistema de inteligencia artificial. Tus mensajes se procesan con proveedores de IA que pueden estar ubicados fuera de Colombia, solo para generar la respuesta.</p>

<h2>6. Tus derechos</h2>
<p>Conforme a la Ley 1581 de 2012 puedes conocer, actualizar y rectificar tus datos, pedir su supresión, revocar la autorización y consultar cómo los usamos. Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a>; respondemos las consultas en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles. También puedes acudir a la Superintendencia de Industria y Comercio.</p>

<h2>7. Cambios</h2>
<p>Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha.</p>
`));

escribir("terminos.html", pagina("Términos de uso", `
<h1>Términos de uso del demo</h1>
<p class="fecha">Última actualización: ${ACTUALIZADO}</p>

<h2>1. Qué es este sitio</h2>
<p>Es una demostración interactiva de ${MARCA}, un servicio de asistentes de inteligencia artificial para WhatsApp. Los negocios, nombres, clientes, precios, horarios y resultados que ves son <b>datos de ejemplo</b> con fines ilustrativos.</p>

<h2>2. Sin oferta vinculante</h2>
<p>Lo que muestra el demo no es una oferta, cotización ni garantía de resultados. Cualquier servicio se acuerda por escrito, con alcance, precio y condiciones propios.</p>

<h2>3. Uso adecuado</h2>
<ul>
<li>No escribas datos sensibles ni de terceros en el demo.</li>
<li>No intentes alterar, copiar masivamente o interferir con el funcionamiento del sitio.</li>
</ul>

<h2>4. Propiedad intelectual</h2>
<p>El diseño, los textos, el código y la marca ${MARCA} pertenecen a su titular. No puedes reproducirlos o usarlos con fines comerciales sin autorización por escrito.</p>

<h2>5. Responsabilidad</h2>
<p>El demo se ofrece "tal cual", sin garantía de disponibilidad continua. No respondemos por decisiones tomadas con base en los datos de ejemplo.</p>

<h2>6. Datos personales</h2>
<p>El tratamiento de datos se rige por la <a href="/privacidad">política de privacidad</a>.</p>

<h2>7. Ley aplicable y contacto</h2>
<p>Estos términos se rigen por las leyes de Colombia. Para cualquier consulta: <a href="mailto:${CONTACTO}">${CONTACTO}</a>.</p>
`));

// ---------- Métricas anónimas (función de Vercel) ----------
escribir("api/evento.mjs", fs.readFileSync(path.join(here, "vercel", "evento.mjs"), "utf8"));

// ---------- Cabeceras de seguridad ----------
// Todo corre en el navegador; solo se llama a /api/evento (mismo sitio), así que connect-src queda en 'self'.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const cabeceras = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Robots-Tag": "noindex",
};
escribir("vercel.json", JSON.stringify({
  cleanUrls: true,
  headers: [{ source: "/(.*)", headers: Object.entries(cabeceras).map(([key, value]) => ({ key, value })) }],
}, null, 2) + "\n");
escribir("_headers", `/*\n${Object.entries(cabeceras).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`);

console.log(`Listo: online/deploy/ (index, privacidad, terminos, favicon${tieneOg ? ", og.png" : ""}, api/evento.mjs, vercel.json, _headers) · URL pública: ${SITIO_URL}`);
