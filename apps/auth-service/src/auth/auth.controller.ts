/**
 * gRPC Controller for AuthService
 * 
 * ARCHITECTURE ROLE:
 * - Implements protobuf service `shop.auth.v1.AuthService` (proto/auth.proto)
 * 
 * TODO: [Intern Task - gRPC Controller Methods]
 * 1. Annotate class with @Controller().
 * 2. Implement @GrpcMethod('AuthService', 'Authenticate'):
 *    - Receives { email, password }.
 *    - Delegates to authService.authenticate(email, password).
 *    - Returns AuthResponse: { access_token, user_id, role, shop_id }.
 * 3. Implement @GrpcMethod('AuthService', 'ValidateToken'):
 *    - Receives { token }.
 *    - Delegates to authService.validateToken(token).
 *    - Returns ValidateTokenResponse: { is_valid, user_id, role, shop_id }.
 */
