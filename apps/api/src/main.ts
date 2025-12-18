import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv, loadEnvFiles } from './config/env';

async function bootstrap(): Promise<void> {
  loadEnvFiles();
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  // O refresh token trafega em cookie httpOnly, então o painel precisa de
  // credenciais liberadas para a origem dele.
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix(env.API_PREFIX);
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Armarinho Aurora — API')
    .setDescription(
      [
        'API do e-commerce de catálogo com checkout via WhatsApp.',
        '',
        'A loja não processa pagamentos: o pedido é registrado aqui e a venda é',
        'concluída pelo WhatsApp. Por isso não existem endpoints de pagamento,',
        'e o cálculo de frete não faz parte do escopo — a entrega por motoboy é',
        'sempre "consultar valor".',
        '',
        'Rotas sob `/admin` exigem autenticação e permissão do papel do usuário.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin')
    .addTag('Infraestrutura', 'Healthcheck e diagnóstico')
    .addTag('Loja', 'Dados cadastrais, horário, identidade visual e entrega')
    .addTag('Catálogo', 'Categorias, produtos e busca')
    .addTag('Carrinho', 'Carrinho do visitante, identificado por cookie')
    .addTag('Pedidos', 'Criação do pedido, página pública e clique no WhatsApp')
    .addTag('Conta do cliente', 'Cadastro, entrada, endereços, favoritos, avisos e cupons')
    .addTag('Autenticação', 'Login, refresh e sessão do painel')
    .addTag('Admin — Catálogo', 'Produtos, variações, categorias e coleções')
    .addTag('Admin — Pedidos', 'Lista, kanban, linha do tempo e relatório')
    .addTag('Admin — Clientes', 'Ficha, grupo e direitos da LGPD')
    .addTag('Admin — Cupons', 'Cadastro e relatório de uso')
    .addTag('Admin — Mídia', 'Upload e biblioteca de imagens')
    .addTag('Admin — Configurações', 'Loja, horários, identidade visual')
    .addTag('Admin — Usuários', 'Usuários, papéis e permissões')
    .build();

  // A documentação expõe toda a superfície da API — só fora de produção.
  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${env.API_PREFIX}/docs`, app, document, {
      customSiteTitle: 'Armarinho Aurora — API',
    });
  }

  await app.listen(env.API_PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API em http://localhost:${env.API_PORT}/${env.API_PREFIX}`);
  logger.log(`Documentação em http://localhost:${env.API_PORT}/${env.API_PREFIX}/docs`);
}

void bootstrap();
