# Infraestrutura

Tudo que roda no servidor mora aqui. **Nada é editado direto no VPS** — o que
só existe lá não é versionado, não passa por lint nem teste, e some no próximo
reprovisionamento.

```
infra/
├── deploy.sh                    envia e reinicia
├── nginx/                       blocos de servidor
├── systemd/                     serviços da API e da vitrine
└── site-institucional/          página do domínio principal
```

## O servidor

> ⚠️ **O VPS é compartilhado.** Além da Armarinho Aurora, ele hospeda seis sites em
> produção (três WordPress, um app Node e dois estáticos) em **1 vCPU e 1,9 GB
> de RAM**. Um build sem limite ou um serviço sem teto de memória derruba site
> de cliente que não tem nada a ver com este projeto.
>
> Por isso: serviços com `MemoryMax` e `Nice` no systemd, builds dentro de
> `systemd-run --scope -p MemoryMax=900M --nice=19`, e conferência dos seis
> domínios depois de qualquer mudança no nginx.

|           |                                                      |
| --------- | ---------------------------------------------------- |
| Host      | `203.0.113.10` (Ubuntu 24.04)                        |
| Chave SSH | `~/.ssh/id_ed25519_diag` — a `id_ed25519` é recusada |
| Código    | `/opt/aurora-homolog`                                |
| Banco     | PostgreSQL 16 local, `aurora_stg`                    |
| Segredos  | `/etc/aurora/` (fora do Git)                         |

## Endereços

| URL                              | O quê                                              |
| -------------------------------- | -------------------------------------------------- |
| `armarinhoaurora.com.br`         | Página institucional, pública                      |
| `homolog.armarinhoaurora.com.br` | Vitrine em homologação, atrás de senha e `noindex` |
| `homolog…/painel/`               | Painel administrativo — sem senha do nginx         |
| `homolog…/api/docs`              | Documentação da API                                |

> A senha do nginx protege **apenas a vitrine**, que ainda não foi lançada.
> Painel e API ficam abertos no nginx porque já têm autenticação própria (JWT
> com permissões), mais forte que a senha básica. Somar as duas, além de
> redundante, quebra o `fetch` do painel: o navegador não reenvia credencial
> básica em requisição XHR quando ela veio pela URL.

## Deploy

```bash
./infra/deploy.sh            # verifica, envia, migra, builda e reinicia
./infra/deploy.sh codigo     # só o código
./infra/deploy.sh infra      # só nginx, systemd e página institucional
./infra/deploy.sh migrar     # só as migrations
./infra/deploy.sh status     # estado dos serviços e dos vizinhos
```

O modo completo roda `lint`, `typecheck` e `test` **antes** de enviar. Se algo
falhar, nada sai da máquina.

## Arquivos de marca

Logo, ícones e imagem de compartilhamento **não são versionados** — marca é
conteúdo, não código. O repositório guarda o script que os gera:

```bash
pnpm marca "./logo-principal.png" ./tmp/marca
./infra/deploy.sh marca ./tmp/marca
```

Em produção esses arquivos virão do Cloudflare R2, enviados pelo próprio
painel. Na homologação eles são servidos como estáticos porque o R2 ainda não
está configurado — é a única peça manual do ambiente.

## Configuração do servidor

O `.env` de homologação fica em `/opt/aurora-homolog/.env`, criado a partir
de `.env.example` com os segredos sorteados no próprio servidor. Duas diferenças
importantes em relação ao desenvolvimento:

- `API_INTERNAL_URL=http://127.0.0.1:3333/api` — a renderização no servidor
  chama a API pelo loopback, sem passar por nginx, TLS ou pela senha da
  homologação.
- `CORS_ORIGINS` aponta para o domínio de homologação.

## Primeira instalação

Se for preciso montar o ambiente do zero em outro servidor:

1. `apt install postgresql postgresql-contrib nginx certbot python3-certbot-nginx apache2-utils`
2. `npm i -g pnpm@12`
3. Criar o banco e as extensões (`unaccent`, `pg_trgm`, configuração `pt_unaccent`)
4. Criar `/opt/aurora-homolog` e rodar `./infra/deploy.sh`
5. Emitir os certificados com `certbot certonly --webroot`
6. `htpasswd -c /etc/nginx/.htpasswd-aurora aurora`

## Gerando migrations sem banco local

O Prisma precisa de um banco para calcular o diff. Como o desenvolvimento aqui
não tem Postgres local, usamos o banco sombra do servidor por um túnel SSH — a
migration é **gerada na máquina local** e versionada aqui:

```bash
ssh -i ~/.ssh/id_ed25519_diag -f -N -L 55432:127.0.0.1:5432 root@203.0.113.10
SHADOW="postgresql://aurora_stg:SENHA@127.0.0.1:55432/aurora_shadow"

cd apps/api
DATABASE_URL="$SHADOW" npx prisma migrate diff   --from-migrations prisma/migrations   --to-schema-datamodel prisma/schema.prisma   --shadow-database-url "$SHADOW" --script   > prisma/migrations/AAAAMMDDHHMMSS_nome/migration.sql

pkill -f "55432:127.0.0.1:5432"
```

**Confira sempre se o diff não traz `DROP`.** Índices criados em SQL puro (como
o GIN de similaridade da busca) somem do diff se não estiverem declarados no
`schema.prisma` — foi o que aconteceu com `products_name_trgm`, hoje declarado
com `@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)`.
