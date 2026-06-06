# Flutter web app — compiled to static assets, served by nginx.
#
# API_URL is a BUILD arg, not a runtime env: Flutter web bakes
# String.fromEnvironment values into the compiled JS, so the backend URL is
# frozen at build time. Rebuild (not restart) to change it.
#
# cirruslabs/flutter is multi-arch (arm64 + amd64), so this builds natively on
# Robin's OCI box.
FROM ghcr.io/cirruslabs/flutter:stable AS build

ARG API_URL=https://gateway.imagineering.cc

WORKDIR /app
COPY pubspec.* ./
RUN flutter pub get
COPY . .
RUN flutter build web --release --dart-define=API_URL="$API_URL"

FROM nginx:alpine
COPY --from=build /app/build/web /usr/share/nginx/html
# SPA fallback so go_router deep links resolve to index.html.
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf
EXPOSE 80
