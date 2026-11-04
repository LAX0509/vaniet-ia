# Imagen del servidor del bot (webhook de WhatsApp + agentes). Sirve en Railway, Render, Fly.io o un VPS.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
# La base (CRM, citas, chats) vive en /app/data: móntala como volumen persistente o se pierde al redesplegar
VOLUME ["/app/data"]
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:5000/salud || exit 1
CMD ["node", "server.js"]
