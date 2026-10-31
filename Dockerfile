# Una sola imagen: la web se compila y el API la sirve. Todo vive tras el
# mismo dominio HTTPS (el micrófono del móvil lo exige) y sin CORS.

# ---------- 1. Compilar la web ----------
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Las rutas del API, para que scripts/rutas-api.mjs compruebe en la build que
# la web no llama a ninguna que no exista.
COPY api/src/rutas /app/api/src/rutas
RUN npm run build

# ---------- 2. Dependencias de producción del API ----------
FROM node:22-alpine AS deps
WORKDIR /app/api
# Se leen del package.json, nunca de una lista copiada a mano (plantilla
# DATOS §9: una lista vieja tumbó happydog al primer import).
COPY api/package*.json ./
RUN npm ci --omit=dev

# ---------- 3. Imagen final ----------
FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache tini \
 && addgroup -g 1001 bambu \
 && adduser -D -u 1001 -G bambu bambu

COPY --from=deps /app/api/node_modules ./api/node_modules
COPY api/package*.json ./api/
COPY api/src ./api/src
COPY api/migrations ./api/migrations
COPY api/plantillas ./api/plantillas
COPY api/comprova-produccio.ts ./api/
COPY --from=web /app/web/dist ./web/dist

# Producción corre con --experimental-strip-types, que no admite enums,
# namespaces ni propiedades en el constructor: pasa el typecheck y revienta al
# arrancar. Esta línea lo caza en la construcción.
RUN cd api && node --experimental-strip-types comprova-produccio.ts

# Adjuntos, audios y fotos de la web viven en un volumen, nunca en la imagen.
RUN mkdir -p /datos && chown -R bambu:bambu /datos /app

ENV NODE_ENV=production \
    RUTA_DATOS=/datos \
    PUERTO_API=8105

USER bambu
EXPOSE 8105

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8105/api/salud || exit 1

# tini como PID 1: sin él, un `docker stop` acaba en SIGKILL y Node no cierra
# el pool de Postgres a tiempo.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--experimental-strip-types", "api/src/servidor.ts"]
