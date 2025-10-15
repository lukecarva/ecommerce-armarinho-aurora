import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';
import { AdminCatalogController } from './catalog/admin-catalog.controller';
import { AdminCategoriesService } from './catalog/admin-categories.service';
import { AdminCollectionsService } from './catalog/admin-collections.service';
import { AdminProductsService } from './catalog/admin-products.service';
import { StockService } from './catalog/stock.service';
import { AdminCouponsController } from './coupons/admin-coupons.controller';
import { AdminCouponsService } from './coupons/admin-coupons.service';
import { AdminCoursesController } from './courses/admin-courses.controller';
import { AdminCoursesService } from './courses/admin-courses.service';
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCustomersService } from './customers/admin-customers.service';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';
import { AdminReportsController } from './reports/admin-reports.controller';
import { AdminReportsService } from './reports/admin-reports.service';
import { AdminTasksController } from './tasks/admin-tasks.controller';
import { AdminTasksService } from './tasks/admin-tasks.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { AdminUsersController } from './users/users.controller';

@Module({
  imports: [MediaModule, ImportModule, ExportModule],
  controllers: [
    AdminCatalogController,
    AdminCoursesController,
    AdminOrdersController,
    AdminCustomersController,
    AdminCouponsController,
    AdminReportsController,
    AdminTasksController,
    SettingsController,
    AdminUsersController,
  ],
  providers: [
    AdminCategoriesService,
    AdminCollectionsService,
    AdminProductsService,
    StockService,
    AdminCoursesService,
    AdminOrdersService,
    AdminCustomersService,
    AdminCouponsService,
    AdminReportsService,
    AdminTasksService,
    SettingsService,
  ],
  exports: [SettingsService],
})
export class AdminModule {}
