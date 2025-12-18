/**
 * Ambiente mínimo para os testes.
 *
 * Vários serviços leem a configuração no construtor. Os testes não carregam o
 * `.env` de quem está rodando — e no CI ele nem existe —, então os valores vêm
 * daqui: fictícios, só válidos o bastante para o esquema aceitar. Nada aqui
 * conecta em lugar nenhum. Variável já definida no ambiente não é tocada.
 */
const AMBIENTE_DE_TESTE: Record<string, string> = {
  DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
  JWT_ACCESS_SECRET: 'segredo-de-teste-access-000000000000',
  JWT_REFRESH_SECRET: 'segredo-de-teste-refresh-00000000000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'teste',
  S3_SECRET_ACCESS_KEY: 'teste',
  S3_PUBLIC_URL: 'http://localhost:9000/teste',
  CORS_ORIGINS: 'http://localhost:3000',
  SITE_URL: 'http://localhost:3000',
};

for (const [chave, valor] of Object.entries(AMBIENTE_DE_TESTE)) {
  process.env[chave] ??= valor;
}
