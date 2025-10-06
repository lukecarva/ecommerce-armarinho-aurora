import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global porque e-mail é infraestrutura: pedidos hoje, recuperação de senha e
 * avisos de curso depois. Importar em cada módulo só repetiria a mesma linha.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
