FROM node:20-alpine AS builder

WORKDIR /api

COPY api/package*.json ./
RUN npm ci

COPY api/tsconfig.json ./
COPY api/src ./src

RUN npm run build

FROM node:20-alpine

WORKDIR /api

COPY api/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /api/dist ./dist

CMD ["node", "dist/main.js"]