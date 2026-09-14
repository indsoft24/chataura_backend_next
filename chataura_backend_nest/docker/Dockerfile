# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=1200

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

USER node

CMD ["node", "dist/main.js"]
