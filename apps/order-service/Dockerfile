FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/order-service ./apps/order-service
RUN npm install
RUN npm run build --workspace=order-service

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50053
CMD ["node", "apps/order-service/dist/main"]
