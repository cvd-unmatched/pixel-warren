FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

ENV PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

EXPOSE 8080
VOLUME ["/app/data"]

CMD ["node", "server.js"]
