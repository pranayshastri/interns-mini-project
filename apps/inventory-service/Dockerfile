FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/inventory-service ./apps/inventory-service
RUN npm install
RUN npm run build --workspace=inventory-service

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50054
CMD ["node", "apps/inventory-service/dist/main"]
