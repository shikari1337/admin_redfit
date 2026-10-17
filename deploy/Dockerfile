# The React admin as one nginx image (v2 branch: the Rust API). VITE_* values are PUBLIC identifiers baked at
# build time. Build from the repository root:
#   docker build -f deploy/Dockerfile --build-arg VITE_API_URL=https://api-v2.gc.mw .
FROM node:24-bookworm-slim AS build
WORKDIR /src
ARG VITE_API_URL
ARG VITE_GROWCORD_ID_ISSUER
ARG VITE_GROWCORD_ID_CLIENT_ID=admin
ENV VITE_API_URL=$VITE_API_URL VITE_GROWCORD_ID_ISSUER=${VITE_GROWCORD_ID_ISSUER:-$VITE_API_URL} \
    VITE_GROWCORD_ID_CLIENT_ID=$VITE_GROWCORD_ID_CLIENT_ID
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
