FROM node:20-alpine AS build
WORKDIR /app
# Optional: a commit SHA to show in the on-page build badge. The badge's
# timestamp already changes every deploy; this just adds provenance when a
# caller passes --build-arg BUILD_SHA=... (postbuild.mjs reads $BUILD_SHA).
ARG BUILD_SHA=""
ENV BUILD_SHA=$BUILD_SHA
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
