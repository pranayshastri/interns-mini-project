/**
 * Auth Service - App Module
 * 
 * ARCHITECTURE ROLE:
 * - Provides PrismaService (connected to auth_db)
 * - Provides ValkeyService (for session tracking & token revocation)
 * - Provides AuthService & AuthController
 * 
 * TODO: [Intern Task - Module Wiring]
 * 1. Import and register PrismaService, ValkeyService, AuthService in providers.
 * 2. Register AuthController in controllers.
 * 3. Configure JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret', signOptions: { expiresIn: '1h' } }).
 */
