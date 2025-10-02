import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/permissions.decorator';
import { StoreService } from './store.service';

@ApiTags('Loja')
@Public()
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Dados da loja, identidade visual, horário de funcionamento, status (aberta/fechada) e opções de entrega.',
  })
  getStore() {
    return this.store.getStore();
  }
}
