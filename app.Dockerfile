FROM node:20-alpine AS builder

WORKDIR /app

COPY app/package*.json ./
RUN npm ci

COPY app/tsconfig.json app/vite.config.ts app/index.html ./
COPY app/src ./src
COPY app/css ./css

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf
