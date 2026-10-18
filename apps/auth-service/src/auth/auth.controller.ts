import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({ code: status.UNAVAILABLE, message: 'Account service is temporarily unavailable.' });
    }
  }
  @GrpcMethod('AuthService', 'Register') register(data: any) { return this.safe(() => this.auth.register(data)); }
  @GrpcMethod('AuthService', 'Authenticate') authenticate(data: any) { return this.safe(() => this.auth.authenticate(data)); }
  @GrpcMethod('AuthService', 'ValidateToken') validate(data: any) { return this.safe(() => this.auth.validateToken(data)); }
  @GrpcMethod('AuthService', 'GetProfile') profile(data: any) { return this.safe(() => this.auth.getProfile(data)); }
  @GrpcMethod('AuthService', 'UpdateProfile') update(data: any) { return this.safe(() => this.auth.updateProfile(data)); }
  @GrpcMethod('AuthService', 'AdminUsers') adminUsers(data: any) { return this.safe(() => this.auth.adminUsers(data)); }
  @GrpcMethod('AuthService', 'AdminUser') adminUser(data: any) { return this.safe(() => this.auth.adminUser(data)); }
  @GrpcMethod('AuthService', 'AdminSetStatus') adminStatus(data: any) { return this.safe(() => this.auth.adminSetStatus(data)); }
  @GrpcMethod('AuthService', 'AdminOverview') adminOverview(data: any) { return this.safe(() => this.auth.adminOverview(data)); }
  @GrpcMethod('AuthService', 'AdminActivity') adminActivity(data: any) { return this.safe(() => this.auth.adminActivity(data)); }
  @GrpcMethod('AuthService', 'AdminCreateSeller') adminCreateSeller(data: any) { return this.safe(() => this.auth.adminCreateSeller(data)); }
  @GrpcMethod('AuthService', 'AdminShop') adminShop(data: any) { return this.safe(() => this.auth.adminShop(data)); }
  @GrpcMethod('AuthService', 'AdminHealth') adminHealth(data: any) { return this.safe(() => this.auth.adminHealth(data)); }
  @GrpcMethod('AuthService', 'ListAddresses') addresses(data: any) { return this.safe(() => this.auth.listAddresses(data)); }
  @GrpcMethod('AuthService', 'SaveAddress') saveAddress(data: any) { return this.safe(() => this.auth.changeAddress(data, 'save')); }
  @GrpcMethod('AuthService', 'DeleteAddress') deleteAddress(data: any) { return this.safe(() => this.auth.changeAddress(data, 'delete')); }
  @GrpcMethod('AuthService', 'SetDefaultAddress') defaultAddress(data: any) { return this.safe(() => this.auth.changeAddress(data, 'default')); }
  @GrpcMethod('AuthService', 'Logout') logout(data: any) { return this.safe(() => this.auth.logout(data)); }
}
