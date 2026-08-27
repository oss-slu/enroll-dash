FROM node:20-alpine AS builder

WORKDIR /api

COPY api/package*.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /api

RUN apk add --no-cache curl

COPY api/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /api/dist ./dist

CMD ["node", "dist/main.js"]

EXPOSE 9876
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 CMD [ "curl", "-f", "http://localhost:9876/health" ]
