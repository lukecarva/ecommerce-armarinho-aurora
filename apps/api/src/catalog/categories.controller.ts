import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/permissions.decorator';
import { CategoriesService } from './categories.service';

@ApiTags('Catálogo')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({ description: 'Árvore de categorias ativas da vitrine.' })
  tree() {
    return this.categories.tree();
  }
}
