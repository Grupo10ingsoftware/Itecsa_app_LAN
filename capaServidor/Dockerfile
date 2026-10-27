# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/tooling/prisma
COPY tooling/prisma/package*.json ./
RUN npm ci
WORKDIR /app/capaServidor
RUN mkdir -p /app/capaServidor/certs
COPY capaServidor/package*.json ./
RUN npm ci
COPY capaServidor/prisma ./prisma
COPY capaServidor/prisma.config.ts ./
COPY capaServidor/src/database/connectionConfig.js ./src/database/connectionConfig.js
# The CLI detects its TLS platform during generation and the development predev hook.
RUN npm run prisma:generate

FROM dependencies AS development
COPY --chown=node:node capaServidor/src ./src
COPY --chown=node:node capaServidor/data ./data
COPY --chown=node:node capaServidor/scripts ./scripts
COPY --chown=node:node shared /app/shared
RUN chown -R node:node /app
USER node
ENV APP_ENV=development NODE_ENV=development PORT=3000
ENV ITECSA_DOCKER_DEVELOPMENT=true NODE_OPTIONS="--import=/app/capaServidor/scripts/dockerDevelopmentEnvironment.mjs"
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM dependencies AS database-tools
ARG APP_VERSION=development
LABEL org.opencontainers.image.source="https://github.com/Grupo10ingsoftware/itecsa-app"
LABEL org.opencontainers.image.revision=$APP_VERSION
ENV APP_ENV=production NODE_ENV=production APP_VERSION=$APP_VERSION
RUN printf '%s\n' "$APP_VERSION" > /app/capaServidor/.database-tools-version
RUN apt-get update \
    && apt-get install --no-install-recommends -y default-mysql-client \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node capaServidor/src ./src
COPY --chown=node:node capaServidor/data ./data
COPY --chown=node:node capaServidor/scripts ./scripts
COPY --chown=node:node shared /app/shared
USER node
CMD ["node", "--version"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS production
ARG APP_VERSION=development
LABEL org.opencontainers.image.source="https://github.com/Grupo10ingsoftware/itecsa-app"
LABEL org.opencontainers.image.revision=$APP_VERSION
WORKDIR /app/capaServidor
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
ENV APP_ENV=production NODE_ENV=production PORT=3000 APP_VERSION=$APP_VERSION
COPY --from=production-dependencies /app/capaServidor/node_modules ./node_modules
# Keep the generated client even if npm pruning removes generated/extraneous files.
COPY --from=dependencies /app/capaServidor/node_modules/.prisma ./node_modules/.prisma
COPY capaServidor/package*.json ./
COPY capaServidor/src ./src
COPY capaServidor/data ./data
COPY shared /app/shared
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/app/app.js"]
