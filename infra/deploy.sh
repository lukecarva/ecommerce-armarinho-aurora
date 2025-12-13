#!/usr/bin/env bash
#
# Deploy da Armarinho Aurora para o servidor de homologação.
#
# Regra do projeto: toda alteração é feita e verificada no repositório e só
# então enviada. Nada é editado direto no servidor.
#
# Uso:
#   ./infra/deploy.sh              # sincroniza o código, builda e reinicia
#   ./infra/deploy.sh infra        # só nginx, systemd e site institucional
#   ./infra/deploy.sh marca ./tmp/marca   # envia os arquivos de marca
#   ./infra/deploy.sh status       # estado dos serviços
#
# ATENÇÃO: este servidor hospeda outros seis sites em produção. Builds rodam
# com teto de memória e prioridade baixa para nunca derrubar os vizinhos.

set -euo pipefail

HOST="${CP_HOST:-root@203.0.113.10}"
KEY="${CP_KEY:-$HOME/.ssh/id_ed25519_diag}"
REMOTO="/opt/aurora-homolog"
PUBLICO="/var/www/armarinhoaurora.com.br/public"
DOMINIO="https://homolog.armarinhoaurora.com.br"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

ssh_() { ssh -i "$KEY" -o BatchMode=yes "$HOST" "$@"; }
scp_() { scp -i "$KEY" -q "$@"; }

titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

# ─────────────────────────────────────────────────────────────────────────────

verificar_local() {
  titulo "Verificando o repositório antes de enviar"
  pnpm lint
  pnpm typecheck
  pnpm test
  echo "  repositório íntegro"
}

enviar_codigo() {
  titulo "Enviando o código"
  tar czf - \
    --exclude=node_modules --exclude=.next --exclude=dist --exclude=.turbo \
    --exclude=.git --exclude=tmp --exclude='*.log' \
    apps packages scripts package.json pnpm-lock.yaml pnpm-workspace.yaml \
    turbo.json tsconfig.base.json \
    | ssh_ "tar xzf - -C $REMOTO"
  echo "  código sincronizado"

  titulo "Instalando dependências"
  ssh_ "cd $REMOTO && nice -n 19 pnpm install --frozen-lockfile 2>&1 | tail -3"
}

buildar() {
  titulo "Build no servidor (com teto de memória)"

  # Os pacotes compartilhados vêm primeiro: a API e os fronts importam de
  # `@aurora/types`, e um dist velho quebra o build com erro de tipo
  # que não aparece na máquina de quem já compilou antes.
  ssh_ "cd $REMOTO && nice -n 19 pnpm --filter @aurora/types build 2>&1 | tail -2"

  ssh_ "cd $REMOTO && VITE_BASE=/painel/ VITE_API_URL=$DOMINIO/api VITE_SITE_URL=$DOMINIO \
        nice -n 19 pnpm --filter @aurora/admin build 2>&1 | grep -E 'built in|error' | tail -2"

  ssh_ "cd $REMOTO && systemd-run --scope -q -p MemoryMax=900M --nice=19 \
        env NODE_OPTIONS=--max-old-space-size=700 \
            API_INTERNAL_URL=http://127.0.0.1:3333/api \
            NEXT_PUBLIC_API_URL=$DOMINIO/api NEXT_PUBLIC_SITE_URL=$DOMINIO \
        pnpm --filter @aurora/web build 2>&1 | grep -E 'Compiled|error|Killed' | tail -2"

  # `migrate deploy` aplica o SQL mas NÃO regenera o client do Prisma, e o
  # `pnpm install` pula o postinstall quando não há dependência nova. Sem este
  # passo, toda mudança de schema quebra o build da API no servidor com um
  # erro de tipo que não existe na máquina de quem já rodou `prisma generate`.
  ssh_ "cd $REMOTO && nice -n 19 pnpm --filter @aurora/api exec prisma generate 2>&1 | grep -E 'Generated|Error' | tail -2"

  ssh_ "cd $REMOTO && nice -n 19 pnpm --filter @aurora/api build 2>&1 | grep -E 'error|Error|Killed' | head -5; true"
}

migrar() {
  titulo "Migrations"
  ssh_ "cd $REMOTO && nice -n 19 pnpm --filter @aurora/api run db:deploy 2>&1 | grep -E 'migration|applied|error' | tail -4"
}

reiniciar() {
  titulo "Reiniciando os serviços"
  ssh_ "systemctl restart aurora-api aurora-web && sleep 12 && \
        for s in aurora-api aurora-web; do printf '  %-18s %s\n' \$s \$(systemctl is-active \$s); done"
}

enviar_infra() {
  titulo "Enviando nginx, systemd e site institucional"

  scp_ infra/systemd/*.service "$HOST:/etc/systemd/system/"
  scp_ infra/nginx/armarinhoaurora.com.br.conf \
      "$HOST:/etc/nginx/sites-available/armarinhoaurora.com.br"
  scp_ infra/nginx/homolog.armarinhoaurora.com.br.conf \
      "$HOST:/etc/nginx/sites-available/homolog.armarinhoaurora.com.br"
  scp_ infra/site-institucional/index.html "$HOST:$PUBLICO/index.html"

  # A foto de antes é tirada antes de qualquer reload: é ela que separa o
  # vizinho que este deploy derrubou do que já estava fora.
  local antes depois
  antes=$(status_dos_vizinhos)

  # Backup antes de recarregar: seis sites de terceiros dependem deste nginx.
  ssh_ "mkdir -p /root/backups && tar czf /root/backups/nginx-\$(date +%Y%m%d-%H%M%S).tar.gz /etc/nginx 2>/dev/null
        chown www-data:www-data $PUBLICO/index.html
        systemctl daemon-reload
        nginx -t && systemctl reload nginx && echo '  nginx recarregado'"

  depois=$(status_dos_vizinhos)
  comparar_vizinhos "$antes" "$depois"
}

enviar_marca() {
  local origem="${1:-./tmp/marca}"
  titulo "Enviando os arquivos de marca de $origem"

  [ -d "$origem" ] || { echo "Pasta não encontrada. Rode antes: pnpm marca <logo>"; exit 1; }

  ssh_ "mkdir -p $PUBLICO/marca"
  scp_ "$origem"/*.png "$HOST:$PUBLICO/marca/"
  ssh_ "chown -R www-data:www-data $PUBLICO/marca && ls $PUBLICO/marca | tr '\n' ' '"
  echo
}

VIZINHOS="kluzanmoda.com.br novo.kluzanmoda.com.br ctvt.simplisolucoes.com.br
          bloom.kluzanmoda.com.br simplisolucoes.com.br malves.simplisolucoes.com.br
          armarinhoaurora.com.br"

# Uma linha "domínio código" por site. 000 é "não respondeu": DNS, TLS ou
# conexão — o curl não distingue, e para esta checagem não precisa.
status_dos_vizinhos() {
  for d in $VIZINHOS; do
    printf '%s %s\n' "$d" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "https://$d/" || true)"
  done
}

no_ar() { case "$1" in 2??|3??) return 0 ;; *) return 1 ;; esac; }

# Compara antes e depois do reload.
#
# Num servidor compartilhado, a pergunta que importa não é "está tudo no ar?",
# e sim "este deploy derrubou alguém?". Um site que já estava fora antes não é
# efeito do deploy — e tratá-lo como se fosse soa o mesmo alarme do site que o
# deploy de fato quebrou, escondendo um no meio do outro. Foi o que aconteceu
# em 11/09, quando dois vizinhos desativados pelos donos pareceram vítimas.
comparar_vizinhos() {
  local antes="$1" depois="$2" quebrou=0 d codigo_antes codigo_depois veredito
  titulo "Os outros sites do servidor continuam no ar?"

  while read -r d codigo_antes; do
    [ -z "$d" ] && continue
    codigo_depois=$(printf '%s\n' "$depois" | awk -v d="$d" '$1 == d { print $2 }')

    if no_ar "$codigo_antes" && ! no_ar "$codigo_depois"; then
      veredito='QUEBROU NESTE DEPLOY'
      quebrou=1
    elif ! no_ar "$codigo_antes"; then
      veredito='já estava fora antes do deploy'
    else
      veredito='ok'
    fi

    printf '  %-34s antes %-4s depois %-4s %s\n' "$d" "$codigo_antes" "$codigo_depois" "$veredito"
  done <<< "$antes"

  if [ "$quebrou" = 1 ]; then
    echo
    echo "  ATENÇÃO: um vizinho saiu do ar com este deploy. O nginx de antes do"
    echo "  reload está no backup mais recente em /root/backups/nginx-*.tar.gz."
    exit 1
  fi
}

# Foto do momento, sem comparação — é o que o `status` mostra.
verificar_vizinhos() {
  titulo "Os outros sites do servidor estão no ar?"
  status_dos_vizinhos | while read -r d codigo; do
    printf '  %-38s %s\n' "$d" "$(no_ar "$codigo" && echo "$codigo" || echo "$codigo fora")"
  done
}

estado() {
  titulo "Serviços"
  ssh_ "for s in aurora-api aurora-web postgresql nginx; do
          printf '  %-18s %s\n' \$s \$(systemctl is-active \$s); done
        free -h | awk '/Mem:/ {print \"  RAM: \" \$3 \" usada, \" \$7 \" livre\"}'"
  verificar_vizinhos
}

# ─────────────────────────────────────────────────────────────────────────────

case "${1:-tudo}" in
  tudo)
    verificar_local
    enviar_codigo
    migrar
    buildar
    enviar_infra
    reiniciar
    estado
    ;;
  codigo)  enviar_codigo; buildar; reiniciar ;;
  infra)   enviar_infra ;;
  marca)   enviar_marca "${2:-./tmp/marca}" ;;
  migrar)  migrar; reiniciar ;;
  status)  estado ;;
  *)
    echo "Uso: $0 [tudo|codigo|infra|marca <pasta>|migrar|status]"
    exit 1
    ;;
esac
