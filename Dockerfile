# Imagen del servidor del bot (webhook de WhatsApp + agentes). Sirve en Railway, Render, Fly.io o un VPS.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
# La base (CRM, citas, chats) vive en /app/data: monta ahí un volumen persistente desde el panel del hosting
# (Railway no admite la instrucción VOLUME) o se pierde al redesplegar
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-5000}/salud || exit 1
CMD ["node", "server.js"]
