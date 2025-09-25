import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv, loadEnvFiles } from './config/env';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.service';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimitModule } from './common/rate-limit.service';
import { StoreModule } from './store/store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Um .env único na raiz do monorepo — evita divergência entre apps.
      envFilePath: ['.env', '../../.env'],
      validate: (config) => {
        loadEnvFiles();
        return loadEnv({ ...process.env, ...config });
      },
    }),
    PrismaModule,
    MailModule,
    NotificationsModule,
    RateLimitModule,
    AuthModule,
    HealthModule,
    StoreModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    AccountModule,
    MediaModule,
    AdminModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
