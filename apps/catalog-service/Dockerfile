FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/catalog-service ./apps/catalog-service
RUN npm install
RUN npm run build --workspace=catalog-service

FROM node:24-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50052
CMD ["node", "apps/catalog-service/dist/main"]
