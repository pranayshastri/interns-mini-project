FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/notification-service ./apps/notification-service
RUN npm install
RUN npx prisma generate --schema=apps/notification-service/prisma/schema.prisma
RUN npm run build --workspace=notification-service

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50055
CMD ["node", "apps/notification-service/dist/main"]
