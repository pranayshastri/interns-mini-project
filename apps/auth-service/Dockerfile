FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service
RUN npm install
RUN npm run build --workspace=auth-service

FROM node:26-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 50051
CMD ["node", "apps/auth-service/dist/main"]
