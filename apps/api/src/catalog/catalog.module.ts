import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { PublicCatalogController } from './products.controller';
import { PublicProductsService } from './products.service';
import { SearchService } from './search.service';

@Module({
  controllers: [CategoriesController, PublicCatalogController],
  providers: [CategoriesService, PublicProductsService, SearchService],
  exports: [CategoriesService, PublicProductsService, SearchService],
})
export class CatalogModule {}
