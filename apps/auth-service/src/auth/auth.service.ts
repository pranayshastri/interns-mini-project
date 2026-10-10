/**
 * AuthService Business Logic
 * 
 * ARCHITECTURE ROLE:
 * - Performs credential verification against PostgreSQL `auth_db` using Prisma ORM
 * - Uses bcrypt for password hash verification
 * - Issues JWTs with user claims (id, role: CUSTOMER | SHOPKEEPER | ADMIN, shopId)
 * - Tracks sessions in Valkey
 * 
 * TODO: [Intern Task - Authentication Logic]
 * 1. Inject PrismaService, JwtService, and ValkeyService.
 * 2. Implement `authenticate(email, password)`:
 *    - Query user by email from PostgreSQL via `this.prisma.user.findUnique({ where: { email } })`.
 *    - If user not found, throw RpcException (NOT_FOUND or UNAUTHENTICATED).
 *    - Verify password hash using `bcrypt.compare(password, user.passwordHash)`.
 *    - If password mismatch, throw RpcException (UNAUTHENTICATED).
 *    - Sign JWT containing payload: { sub: user.id, email: user.email, role: user.role, shopId: user.shopId }.
 *    - Store session in Valkey: `await this.valkey.saveSession(user.id, token, 3600)`.
 *    - Return { access_token, user_id: user.id, role: user.role, shop_id: user.shopId || '' }.
 * 3. Implement `validateToken(token)`:
 *    - Verify JWT signature with JwtService.verify(token).
 *    - Check if session is revoked in Valkey.
 *    - Return { is_valid: true, user_id, role, shop_id }.
 */
