/**
 * NestJS API Gateway - Main Entry Point
 * 
 * ARCHITECTURE ROLE:
 * - Edge GraphQL API Gateway running on Port 4000
 * - Serves single /graphql endpoint to Frontend (Next.js)
 * 
 * TODO: [Intern Task - Main Bootstrap]
 * 1. Import NestFactory from '@nestjs/core' and AppModule from './app.module'.
 * 2. Create the application instance using NestFactory.create(AppModule).
 * 3. Enable CORS for the Next.js frontend (origin: http://localhost:3000).
 * 4. Read port from process.env.PORT || 4000 and start listening: await app.listen(port).
 * 5. Log confirmation message that GraphQL gateway is ready at http://localhost:4000/graphql.
 */
