import { formatBRL } from '@aurora/types';

/**
 * Gráfico de barras, em SVG escrito à mão.
 *
 * Uma biblioteca de gráficos custaria de 50 a 150 KB no bundle do painel para
 * desenhar retângulos — e o painel é usado no celular da loja, na banda de
 * São Paulo. Trinta linhas de SVG resolvem.
 *
 * Acessibilidade: o gráfico inteiro tem `role="img"` com um resumo em texto, e
 * cada barra tem `<title>`. Quem usa leitor de tela ouve o total e o dia de
 * maior venda, em vez de uma sequência de retângulos sem sentido.
 */
export function BarrasPorDia({
  dados,
  rotulo,
}: {
  dados: Array<{ dia: string; valor: number }>;
  rotulo: string;
}) {
  if (dados.length === 0) {
    return <p className="text-ink-500 text-sm">Sem dados no período.</p>;
  }

  const maior = Math.max(...dados.map((ponto) => ponto.valor), 1);
  const total = dados.reduce((soma, ponto) => soma + ponto.valor, 0);
  const pico = dados.reduce(
    (melhor, ponto) => (ponto.valor > melhor.valor ? ponto : melhor),
    dados[0]!,
  );

  const largura = 100 / dados.length;

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={`${rotulo}: ${formatBRL(total)} no período, com pico em ${curto(pico.dia)}.`}
      >
        {dados.map((ponto, indice) => {
          // Altura mínima de 0,4 para o dia com venda pequena não sumir — e
          // zero continua zero, sem barra nenhuma.
          const altura = ponto.valor === 0 ? 0 : Math.max(0.4, (ponto.valor / maior) * 30);

          return (
            <rect
              key={ponto.dia}
              x={indice * largura + largura * 0.15}
              y={31 - altura}
              width={largura * 0.7}
              height={altura}
              className="fill-brand-500"
            >
              <title>{`${curto(ponto.dia)}: ${formatBRL(ponto.valor)}`}</title>
            </rect>
          );
        })}
        <line x1="0" y1="31" x2="100" y2="31" className="stroke-ink-200" strokeWidth="0.3" />
      </svg>

      <figcaption className="text-ink-500 mt-1 flex justify-between text-xs">
        <span>{curto(dados[0]!.dia)}</span>
        <span>
          Maior dia: {curto(pico.dia)} · {formatBRL(pico.valor)}
        </span>
        <span>{curto(dados[dados.length - 1]!.dia)}</span>
      </figcaption>
    </figure>
  );
}

function curto(dia: string): string {
  const [, mes, diaDoMes] = dia.split('-');
  return `${diaDoMes}/${mes}`;
}

/**
 * O funil, em barras horizontais.
 *
 * Proporcional à etapa do topo: é assim que se enxerga onde as pessoas somem.
 */
export function Funil({
  etapas,
}: {
  etapas: Array<{ nome: string; pedidos: number; detalhe?: string }>;
}) {
  const topo = Math.max(etapas[0]?.pedidos ?? 0, 1);

  return (
    <ul className="space-y-3">
      {etapas.map((etapa) => (
        <li key={etapa.nome}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-ink-700">{etapa.nome}</span>
            <span className="text-ink-900 font-semibold">
              {etapa.pedidos}
              {etapa.detalhe ? (
                <span className="text-ink-500 ml-2 font-normal">{etapa.detalhe}</span>
              ) : null}
            </span>
          </div>
          <div className="bg-ink-100 h-2 overflow-hidden rounded">
            <div
              className="bg-brand-500 h-full rounded"
              style={{ width: `${Math.round((etapa.pedidos / topo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
