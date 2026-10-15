import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ValkeyService } from './session/valkey.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';

@Module({ providers: [PrismaService, ValkeyService, AuthService], controllers: [AuthController] })
export class AppModule {}
