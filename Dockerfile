FROM node:20 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV STORAGE_DIR=/storage
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/apps/storage-server ./dist/apps/storage-server
COPY --from=builder /app/dist/apps/web ./dist/apps/web

EXPOSE 3000
VOLUME ["/storage"]

CMD ["node", "dist/apps/storage-server/main.js"]
