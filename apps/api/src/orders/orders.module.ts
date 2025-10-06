import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { CartModule } from '../cart/cart.module';
import { StoreModule } from '../store/store.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CartModule, StoreModule, AccountModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
