FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway
RUN npm install
RUN npm run build --workspace=api-gateway

FROM node:26-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 4000
CMD ["node", "apps/api-gateway/dist/main"]
