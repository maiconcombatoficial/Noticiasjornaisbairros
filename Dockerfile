FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY web ./web
ENV PORT=3000 DB_PATH=/app/data/noticias.db INTERVALO_MIN=20 NODE_ENV=production
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/servidor.js"]
