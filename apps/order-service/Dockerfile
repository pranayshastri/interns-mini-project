FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/order-service ./apps/order-service

RUN npm install --global npm@11.17.0
RUN npm install
RUN npm run prisma:generate --workspace=order-service
RUN npm run build --workspace=order-service

FROM node:26-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50053
CMD ["node", "apps/order-service/dist/main"]
