import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from '../common/audit.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuditService,
    // Guard global: toda rota é protegida por padrão, e o que é público
    // precisa dizer isso explicitamente com @Public(). Esquecer o decorator
    // fecha a rota — o erro seguro.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, AuditService],
})
export class AuthModule {}
