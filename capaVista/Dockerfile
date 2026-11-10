# syntax=docker/dockerfile:1
ARG NODE_BASE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
ARG NGINX_BASE=nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
FROM ${NODE_BASE} AS dependencies
WORKDIR /app/capaVista
COPY capaVista/package*.json ./
RUN npm ci

FROM dependencies AS development
COPY --chown=node:node capaVista/ ./
COPY --chown=node:node shared /app/shared
COPY --chown=node:node deploy/40-runtime-config.sh /app/deploy/40-runtime-config.sh
RUN chown -R node:node /app
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM dependencies AS build
ARG APP_VERSION=development
COPY capaVista/ ./
COPY shared /app/shared
# The web image does not package Keycloak themes; run Vite without the npm prebuild theme sync.
RUN ./node_modules/.bin/vite build && node -e "require('fs').writeFileSync('dist/version.json',JSON.stringify({version:process.argv[1]}))" "$APP_VERSION"

FROM ${NGINX_BASE} AS production
ARG APP_VERSION=development
ARG NODE_BASE
ARG NGINX_BASE
LABEL io.itecsa.base.runtime=$NGINX_BASE io.itecsa.base.build=$NODE_BASE
LABEL org.opencontainers.image.source="https://github.com/Grupo10ingsoftware/itecsa-app"
LABEL org.opencontainers.image.revision=$APP_VERSION
USER root
RUN apk add --no-cache jq
COPY --from=build /app/capaVista/dist /usr/share/nginx/html
COPY shared/loading/indicator.css /usr/share/itecsa/loading.css
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/version.json || exit 1
