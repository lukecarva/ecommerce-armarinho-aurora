import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { AccountAuthController, AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AddressesService } from './addresses.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerGuard } from './customer.guard';

@Module({
  imports: [CartModule],
  controllers: [AccountAuthController, AccountController],
  providers: [CustomerAuthService, CustomerGuard, AccountService, AddressesService],
  // Pedidos precisa saber quem está logado para ligar o pedido à conta.
  exports: [CustomerAuthService],
})
export class AccountModule {}
