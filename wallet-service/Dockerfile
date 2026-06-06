# Wallet service — signs/submits transactions with managed keys (port 3001).
# Flutter never holds private keys; this microservice does.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3001
ENV PORT=3001

CMD ["node", "src/index.js"]
