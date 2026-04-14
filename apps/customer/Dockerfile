FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/customer/package.json ./apps/customer/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL
RUN pnpm --filter @halokonobar/customer build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/customer/dist /usr/share/nginx/html
COPY apps/customer/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
