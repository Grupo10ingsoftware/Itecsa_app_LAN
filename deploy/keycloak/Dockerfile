ARG NODE_BASE=node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
ARG KEYCLOAK_BASE=quay.io/keycloak/keycloak@sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b
FROM ${NODE_BASE} AS theme
WORKDIR /source
COPY scripts/prepare-keycloak-theme.mjs scripts/prepare-keycloak-theme.mjs
COPY shared/loading/indicator.css shared/loading/indicator.css
COPY deploy/keycloak/themes/itecsa deploy/keycloak/themes/itecsa
RUN node scripts/prepare-keycloak-theme.mjs --version 26.8.1 --output /prepared/itecsa

FROM ${KEYCLOAK_BASE} AS builder
ENV KC_DB=mysql KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true
COPY --from=theme /prepared/itecsa /opt/keycloak/themes/itecsa
COPY deploy/keycloak/themes/itecsa-pin-recovery /opt/keycloak/themes/itecsa-pin-recovery
RUN /opt/keycloak/bin/kc.sh build

FROM ${KEYCLOAK_BASE}
ARG APP_VERSION=development
ARG NODE_BASE
ARG KEYCLOAK_BASE
LABEL io.itecsa.base.runtime=$KEYCLOAK_BASE io.itecsa.base.build=$NODE_BASE
LABEL org.opencontainers.image.revision=$APP_VERSION
COPY --from=builder /opt/keycloak /opt/keycloak
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
