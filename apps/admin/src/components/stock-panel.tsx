import { AVAILABILITY_LABELS, formatQuantity, type SaleUnit } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, History } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';
import { Card, Field, Input, Select, Spinner } from './ui';

/**
 * Estoque do produto: situação atual, ajuste e histórico.
 *
 * O motivo do ajuste é obrigatório. Quando a contagem não bate, a pergunta é
 * sempre "quem mexeu, quando e por quê" — e a resposta precisa estar aqui, e
 * não na memória de quem estava no balcão.
 */
export function StockPanel({ productId, unit }: { productId: string; unit: SaleUnit }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [modo, setModo] = useState<'definir' | 'ajustar'>('definir');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');

  const estoque = useQuery({
    queryKey: ['estoque', productId],
    queryFn: () => api.estoque.detalhe(productId),
  });

  const motivos = useQuery({ queryKey: ['estoque-motivos'], queryFn: api.estoque.motivos });

  const ajustar = useMutation({
    mutationFn: () =>
      api.estoque.ajustar(productId, {
        modo,
        quantidade: Number(quantidade.replace(',', '.')),
        motivo,
      }),
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({ queryKey: ['estoque', productId] });
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      await queryClient.invalidateQueries({ queryKey: ['estoque-alertas'] });
      toast.success(
        `Estoque de ${resultado.anterior} para ${resultado.atual} ${AVAILABILITY_LABELS[
          resultado.availability as keyof typeof AVAILABILITY_LABELS
        ].toLowerCase()}.`,
      );
      setQuantidade('');
      setMotivo('');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const podeAjustar = can('estoque:editar');
  const valido = quantidade.trim() !== '' && motivo.trim().length >= 3;

  if (estoque.isLoading) {
    return (
      <Card title="Estoque">
        <Spinner />
      </Card>
    );
  }

  const dados = estoque.data;

  return (
    <Card
      title="Estoque"
      description={
        dados?.updatedAt ? `Última alteração em ${formatDateTime(dados.updatedAt)}` : undefined
      }
    >
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-ink-900 text-2xl font-bold">
          {formatQuantity(dados?.qty ?? 0, unit)}
        </span>
        <Badge
          tone={
            dados?.availability === 'em_estoque'
              ? 'stock'
              : dados?.availability === 'ultimas_unidades'
                ? 'warning'
                : 'neutral'
          }
        >
          {AVAILABILITY_LABELS[dados?.availability ?? 'sob_consulta']}
        </Badge>
      </div>

      {podeAjustar ? (
        <div className="border-ink-200 space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de ajuste">
              <Select
                value={modo}
                onChange={(evento) => setModo(evento.target.value as 'definir' | 'ajustar')}
              >
                <option value="definir">Definir a quantidade contada</option>
                <option value="ajustar">Somar ou subtrair</option>
              </Select>
            </Field>

            <Field
              label={modo === 'definir' ? 'Quantidade contada' : 'Quanto entrou ou saiu'}
              hint={modo === 'ajustar' ? 'Use número negativo para saída' : undefined}
            >
              <Input
                inputMode="decimal"
                value={quantidade}
                onChange={(evento) => setQuantidade(evento.target.value)}
                placeholder={modo === 'definir' ? '120' : '-3'}
              />
            </Field>
          </div>

          <Field label="Motivo" required hint="Fica registrado no histórico com o seu nome">
            <Input
              list="motivos-estoque"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Contagem de inventário"
            />
            <datalist id="motivos-estoque">
              {(motivos.data ?? []).map((sugestao) => (
                <option key={sugestao} value={sugestao} />
              ))}
            </datalist>
          </Field>

          <Button
            type="button"
            full
            disabled={!valido || ajustar.isPending}
            onClick={() => ajustar.mutate()}
          >
            {ajustar.isPending ? 'Registrando…' : 'Registrar ajuste'}
          </Button>
        </div>
      ) : null}

      {(dados?.movimentacoes.length ?? 0) > 0 ? (
        <div className="border-ink-200 mt-5 border-t pt-4">
          <p className="text-ink-500 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <History className="size-3.5" aria-hidden />
            Movimentações
          </p>

          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(dados?.movimentacoes ?? []).map((movimento) => (
              <li key={movimento.id} className="flex items-start gap-2 text-sm">
                {movimento.delta >= 0 ? (
                  <ArrowUpRight className="text-stock-500 mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <ArrowDownRight className="text-price-500 mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-ink-800">
                    <strong>
                      {movimento.delta > 0 ? '+' : ''}
                      {movimento.delta}
                    </strong>{' '}
                    · {movimento.reason}
                  </p>
                  <p className="text-ink-500 text-xs">
                    {formatDateTime(movimento.createdAt)}
                    {movimento.autor ? ` · ${movimento.autor}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
