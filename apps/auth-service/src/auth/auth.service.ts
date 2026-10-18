import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ValkeyService } from '../session/valkey.service';

const fail = (code: number, message: string): never => { throw new RpcException({ code, message }); };
const SESSION_SECONDS = 3600;

@Injectable()
export class AuthService {
  private readonly jwt: JwtService;
  private readonly dummyHash = bcrypt.hashSync('invalid-credential-placeholder', 12);
  constructor(private readonly prisma: PrismaService, private readonly sessions: ValkeyService) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
    this.jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256', issuer: 'shop-auth', audience: 'shop-app' } });
  }
  private email(value: unknown) {
    if (typeof value !== 'string') fail(status.INVALID_ARGUMENT, 'Enter a valid email address.');
    const email = (value as string).trim().toLowerCase();
    if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(status.INVALID_ARGUMENT, 'Enter a valid email address.');
    return email;
  }
  private name(value: unknown) {
    if (typeof value !== 'string') fail(status.INVALID_ARGUMENT, 'Enter your full name.');
    const name = (value as string).trim().replace(/\s+/g, ' ');
    if (!name || name.length > 128 || /[\x00-\x1f\x7f]/.test(name)) fail(status.INVALID_ARGUMENT, 'Full name must contain 1–128 characters.');
    return name;
  }
  private password(value: unknown, registering = false) {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 72 || !value.length || (registering && [...value].length < 8)) {
      fail(status.INVALID_ARGUMENT, registering ? 'Password must be at least 8 characters and at most 72 bytes.' : 'Invalid password.');
    }
    return value as string;
  }
  private profile(user: any) {
    return { id: user.id, email: user.email, full_name: user.fullName, role: user.role, shop_id: user.shopId ?? '', status: user.status, phone: user.phone };
  }
  private async issue(user: any) {
    const jti = randomUUID();
    const token = this.jwt.sign({ sub: user.id, role: user.role, shopId: user.shopId ?? '', sessionVersion: user.sessionVersion, jti }, { expiresIn: SESSION_SECONDS });
    await this.sessions.saveSession(jti, user.id, SESSION_SECONDS);
    return { access_token: token, user_id: user.id, role: user.role, shop_id: user.shopId ?? '', user: this.profile(user) };
  }
  async register(data: any) {
    const email = this.email(data.email);
    const fullName = this.name(data.full_name);
    const password = this.password(data.password, true);
    await this.sessions.limit('register', email, 10, 900);
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.user.create({ data: { email, fullName, passwordHash, role: 'CUSTOMER' } });
      // Registration creates an account only. Authentication issues the session.
      return { access_token: '', user_id: user.id, role: user.role, shop_id: user.shopId ?? '', user: this.profile(user) };
    } catch (error) {
      if ((error as any).code === 'P2002') fail(status.ALREADY_EXISTS, 'An account with this email already exists.');
      throw error;
    }
  }
  async authenticate(data: any) {
    const email = this.email(data.email);
    const password = this.password(data.password);
    await this.sessions.limit('login', email, 20, 900);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const matches = await bcrypt.compare(password, user?.passwordHash ?? this.dummyHash);
    if (!user || !matches || user.status !== 'ACTIVE') fail(status.UNAUTHENTICATED, 'Email or password is incorrect.');
    return this.issue(user);
  }
  private async current(token: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(token, { algorithms: ['HS256'], issuer: 'shop-auth', audience: 'shop-app' });
      if (!payload.sub || !payload.jti) throw new Error();
    } catch { fail(status.UNAUTHENTICATED, 'Please sign in again.'); }
    if (!await this.sessions.isSessionValid(payload.jti, payload.sub)) fail(status.UNAUTHENTICATED, 'Please sign in again.');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE' || (payload.sessionVersion ?? 0) !== user.sessionVersion) return fail(status.UNAUTHENTICATED, 'Please sign in again.');
    return { user, jti: payload.jti };
  }
  async validateToken({ token }: any) {
    try {
      const { user } = await this.current(token);
      return { is_valid: true, user_id: user.id, role: user.role, shop_id: user.shopId ?? '' };
    } catch (error) {
      if (error instanceof RpcException && (error.getError() as any).code === status.UNAUTHENTICATED) return { is_valid: false };
      throw error;
    }
  }
  async getProfile({ token }: any) { return this.profile((await this.current(token)).user); }
  async updateProfile({ token, full_name, phone, update_phone }: any) {
    const { user } = await this.current(token);
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { fullName: this.name(full_name), ...(update_phone ? { phone: this.phone(phone, true) } : {}) } });
    return this.profile(updated);
  }
  private text(value: unknown, label: string, max: number, optional = false) {
    if (typeof value !== 'string') return fail(status.INVALID_ARGUMENT, `${label} must be text.`);
    const clean = value.trim();
    if ((!optional && !clean) || clean.length > max || /[\x00-\x1f\x7f]/.test(clean)) return fail(status.INVALID_ARGUMENT, `Enter a valid ${label.toLowerCase()} (up to ${max} characters).`);
    return clean;
  }
  private phone(value: unknown, optional = false) {
    const phone = this.text(value, 'Phone number', 32, optional);
    if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) return fail(status.INVALID_ARGUMENT, 'Enter a phone number with 7–15 digits, including country code if needed.');
    return phone;
  }
  private addressView(address: any) {
    return { id: address.id, label: address.label, recipient: address.recipient, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, postal: address.postal, country: address.country, is_default: address.isDefault };
  }
  async listAddresses({ token }: any) {
    const { user } = await this.current(token);
    const addresses = await this.prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return { addresses: addresses.map(address => this.addressView(address)) };
  }
  async changeAddress(data: any, operation: 'save' | 'delete' | 'default') {
    const { user } = await this.current(data.token);
    const input = data.address || {};
    const id = operation === 'save' ? (input.id ? this.uuid(input.id) : '') : this.uuid(data.id);
    const values = operation === 'save' ? {
      label: this.text(input.label, 'Address label', 80), recipient: this.name(input.recipient),
      phone: this.phone(input.phone), line1: this.text(input.line1, 'Address line 1', 200),
      line2: this.text(input.line2 || '', 'Address line 2', 200, true), city: this.text(input.city, 'City', 100),
      state: this.text(input.state, 'State / region', 100), postal: this.text(input.postal, 'Postal code', 32),
      country: this.text(input.country, 'Country', 100),
    } : undefined;
    return this.prisma.$transaction(async tx => {
      // Every address write for this user takes the same row lock, across replicas.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.status !== 'ACTIVE' || current.sessionVersion !== user.sessionVersion) return fail(status.UNAUTHENTICATED, 'Please sign in again.');
      const existing = id ? await tx.address.findFirst({ where: { id, userId: user.id } }) : null;
      if (id && !existing) return fail(status.NOT_FOUND, 'Address not found.');
      if (operation === 'save') {
        const count = await tx.address.count({ where: { userId: user.id } });
        if (!id && count >= 20) return fail(status.FAILED_PRECONDITION, 'You can save up to 20 addresses.');
        const isDefault = count === 0 || Boolean(input.is_default) || Boolean(existing?.isDefault);
        if (isDefault) await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
        if (id) await tx.address.update({ where: { id }, data: { ...values!, isDefault } });
        else await tx.address.create({ data: { ...values!, userId: user.id, isDefault } });
      } else if (operation === 'default') {
        await tx.address.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
        await tx.address.update({ where: { id }, data: { isDefault: true } });
      } else {
        await tx.address.delete({ where: { id } });
        if (existing!.isDefault) {
          const first = await tx.address.findFirst({ where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
          if (first) await tx.address.update({ where: { id: first.id }, data: { isDefault: true } });
        }
      }
      const addresses = await tx.address.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      return { addresses: addresses.map(address => this.addressView(address)) };
    });
  }
  async logout({ token }: any) {
    const { jti } = await this.current(token);
    await this.sessions.revokeSession(jti);
    return { success: true };
  }
  private async administrator(token: string) {
    const { user } = await this.current(token);
    if (user.role !== 'ADMIN') fail(status.PERMISSION_DENIED, 'Administrator access is required.');
    return user;
  }
  private uuid(value: unknown) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(status.INVALID_ARGUMENT, 'Invalid account ID.');
    return value as string;
  }
  private pagination(data: any) {
    const page = data.page || 1, limit = data.limit || 20;
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) fail(status.INVALID_ARGUMENT, 'Invalid page or page size.');
    return { page, limit };
  }
  async adminUsers(data: any) {
    await this.administrator(data.token);
    const { page, limit } = this.pagination(data);
    const search = (data.search || '').trim();
    if (search.length > 128) fail(status.INVALID_ARGUMENT, 'Search must be at most 128 characters.');
    if (data.role && !['CUSTOMER', 'SHOPKEEPER', 'ADMIN'].includes(data.role)) fail(status.INVALID_ARGUMENT, 'Invalid role filter.');
    if (data.status && !['ACTIVE', 'SUSPENDED'].includes(data.status)) fail(status.INVALID_ARGUMENT, 'Invalid status filter.');
    const where: any = { ...(data.role ? { role: data.role } : {}), ...(data.status ? { status: data.status } : {}), ...(search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.user.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    return { users: users.map(user => this.profile(user)), total, page, limit };
  }
  async adminUser(data: any) {
    await this.administrator(data.token);
    const user = await this.prisma.user.findUnique({ where: { id: this.uuid(data.id) } });
    if (!user) return fail(status.NOT_FOUND, 'Account not found.');
    return this.profile(user);
  }
  async adminOverview({ token }: any) {
    await this.administrator(token);
    const [customers, sellers, admins, suspended] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }), this.prisma.user.count({ where: { role: 'SHOPKEEPER' } }),
      this.prisma.user.count({ where: { role: 'ADMIN' } }), this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
    ], { isolationLevel: 'RepeatableRead' });
    return { customers, sellers, admins, suspended };
  }
  async adminSetStatus(data: any) {
    const actor = await this.administrator(data.token);
    const id = this.uuid(data.id);
    if (!['ACTIVE', 'SUSPENDED'].includes(data.status) || !['ACTIVE', 'SUSPENDED'].includes(data.expected_status)) fail(status.INVALID_ARGUMENT, 'Invalid account status.');
    const reason = (data.reason || '').trim();
    if (reason.length < 5 || reason.length > 500 || /[\x00-\x1f\x7f]/.test(reason)) fail(status.INVALID_ARGUMENT, 'Provide a reason of 5–500 characters.');
    const updated = await this.prisma.$transaction(async tx => {
      // Serialize access changes, including last-admin checks, across service replicas.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72015001)`;
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
      if (!currentActor || currentActor.role !== 'ADMIN' || currentActor.status !== 'ACTIVE' || currentActor.sessionVersion !== actor.sessionVersion) return fail(status.UNAUTHENTICATED, 'Please sign in again.');
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) return fail(status.NOT_FOUND, 'Account not found.');
      if (id === actor.id) return fail(status.PERMISSION_DENIED, 'You cannot change your own account access.');
      if (target.status === data.status) return target; // Safe replay; no duplicate audit or version bump.
      if (target.status !== data.expected_status) return fail(status.ABORTED, 'Account changed. Refresh its details and try again.');
      if (target.role === 'ADMIN' && data.status === 'SUSPENDED' && await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }) <= 1) return fail(status.FAILED_PRECONDITION, 'The last active administrator cannot be suspended.');
      const user = await tx.user.update({ where: { id }, data: { status: data.status, sessionVersion: { increment: 1 } } });
      await tx.adminAuditEvent.create({ data: { actorId: actor.id, actorName: currentActor.fullName, targetId: id, targetEmail: target.email, action: data.status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_REACTIVATED', reason, previousStatus: target.status, newStatus: data.status } });
      return user;
    });
    return this.profile(updated);
  }
  async adminActivity(data: any) {
    await this.administrator(data.token);
    const { page, limit } = this.pagination(data);
    const [events, total] = await this.prisma.$transaction([
      this.prisma.adminAuditEvent.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.adminAuditEvent.count(),
    ], { isolationLevel: 'RepeatableRead' });
    return { events: events.map(e => ({ id: e.id, actor_id: e.actorId, actor_name: e.actorName, target_id: e.targetId, target_email: e.targetEmail, action: e.action, reason: e.reason, previous_status: e.previousStatus, new_status: e.newStatus, created_at: e.createdAt.toISOString() })), total, page, limit };
  }
  async adminCreateSeller(data: any) {
    const actor = await this.administrator(data.token);
    const email = this.email(data.email), fullName = this.name(data.full_name);
    const shopName = this.name(data.shop_name);
    const description = (data.description || '').trim();
    if (description.length > 1000 || /[\x00-\x1f\x7f]/.test(description)) fail(status.INVALID_ARGUMENT, 'Shop description must be at most 1000 characters without control characters.');
    const passwordHash = await bcrypt.hash(this.password(data.password, true), 12);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(72015001)`;
        const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
        if (!currentActor || currentActor.role !== 'ADMIN' || currentActor.status !== 'ACTIVE' || currentActor.sessionVersion !== actor.sessionVersion) return fail(status.UNAUTHENTICATED, 'Please sign in again.');
        const shopId = randomUUID();
        const user = await tx.user.create({ data: { email, fullName, passwordHash, role: 'SHOPKEEPER', shopId } });
        const shop = await tx.shop.create({ data: { id: shopId, ownerId: user.id, name: shopName, description } });
        await tx.adminAuditEvent.create({ data: { actorId: actor.id, actorName: currentActor.fullName, targetId: user.id, targetEmail: email, action: 'SELLER_CREATED', reason: 'Seller account and shop created', previousStatus: '', newStatus: 'ACTIVE' } });
        return { user: this.profile(user), shop: { id: shop.id, owner_id: shop.ownerId, name: shop.name, description: shop.description, created_at: shop.createdAt.toISOString() } };
      });
    } catch (error) {
      if ((error as any).code === 'P2002') return fail(status.ALREADY_EXISTS, 'An account with this email already exists.');
      throw error;
    }
  }
  async adminShop(data: any) {
    await this.administrator(data.token);
    const shop = await this.prisma.shop.findUnique({ where: { id: this.uuid(data.id) } });
    if (!shop) return fail(status.NOT_FOUND, 'Shop details are not registered in this account service.');
    return { id: shop.id, owner_id: shop.ownerId, name: shop.name, description: shop.description, created_at: shop.createdAt.toISOString() };
  }
  async adminHealth({ token }: any) {
    await this.administrator(token);
    await this.prisma.$queryRaw`SELECT 1`;
    return { checked_at: new Date().toISOString(), database: true, sessions: await this.sessions.ping() };
  }

}
