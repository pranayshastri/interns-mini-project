/**
 * GraphQL Auth Resolver
 * 
 * ARCHITECTURE ROLE:
 * - Handles the unified login mutation for all three user personas (CUSTOMER, SHOPKEEPER, ADMIN)
 * - Invokes internal AuthService over mTLS gRPC
 * - Persists session in Valkey
 * 
 * TODO: [Intern Task - Auth Resolver Implementation]
 * 1. Inject 'AUTH_PACKAGE' gRPC ClientGrpc and ValkeyService.
 * 2. On onModuleInit(), obtain AuthService stub: this.client.getService('AuthService').
 * 3. Implement mutation `login(email, password)`:
 *    - Call authGrpcService.authenticate({ email, password }) via firstValueFrom().
 *    - Store access token and user claims in Valkey: await valkeyService.setSession(user_id, token).
 *    - Return AuthPayload: { accessToken, user: { id, email, role, shopId } }.
 * 4. Implement query `me` / validateToken (optional) reading from Valkey or AuthService.
 */
