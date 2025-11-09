import { buildContactUrl, formatCep, formatPhoneBR } from '@aurora/types';
import { buttonVariants } from '@aurora/ui';
import { MessageCircle } from 'lucide-react';
import { AreaDaConta } from '@/components/conta-ui';
import { getStore } from '@/lib/api';

/**
 * Ajuda e suporte.
 *
 * A resposta de quase toda dúvida desta loja é "fale com a gente no
 * WhatsApp" — então o botão vem primeiro, e as perguntas frequentes depois,
 * para quem prefere ler antes de chamar.
 */

const PERGUNTAS = [
  {
    pergunta: 'Como funciona o pedido pelo site?',
    resposta:
      'Você monta o carrinho, escolhe como quer receber e finaliza. O pedido chega pronto no WhatsApp da loja, e é na conversa que combinamos pagamento e entrega. Não há pagamento pelo site.',
  },
  {
    pergunta: 'Quais formas de pagamento vocês aceitam?',
    resposta: 'As combinadas na conversa pelo WhatsApp — a atendente explica as opções do dia.',
  },
  {
    pergunta: 'Vocês entregam?',
    resposta:
      'Sim, por motoboy. O valor depende do bairro e é combinado no WhatsApp. Se preferir, retire na loja sem custo.',
  },
  {
    pergunta: 'O preço do site é o preço final?',
    resposta:
      'É a referência. Preço e disponibilidade são confirmados no atendimento — o estoque da loja física muda ao longo do dia.',
  },
  {
    pergunta: 'Como troco ou devolvo um produto?',
    resposta: 'Fale com a gente pelo WhatsApp com o número do pedido que resolvemos juntos.',
  },
  {
    pergunta: 'Como vejo ou apago meus dados?',
    resposta:
      'Seus dados estão em "Meus dados". Para receber uma cópia de tudo que a loja guarda ou pedir para apagar, fale com a gente pelo WhatsApp.',
  },
];

export default async function AjudaPage() {
  const store = await getStore();
  const endereco = store.info.address;

  return (
    <AreaDaConta titulo="Ajuda e suporte">
      <div className="max-w-lg space-y-5">
        <div className="rounded-card space-y-3 bg-white p-4">
          <p className="text-ink-700 text-sm">{store.status.message}</p>
          <a
            href={buildContactUrl(store.info.whatsapp, 'Olá! Preciso de ajuda com a loja online.')}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'whatsapp', full: true })}
          >
            <MessageCircle className="size-5" aria-hidden />
            Falar no WhatsApp
          </a>

          <dl className="text-ink-600 space-y-1 text-sm">
            <div>
              <dt className="text-ink-800 font-semibold">Horário</dt>
              {store.scheduleLines.map((linha) => (
                <dd key={linha}>{linha}</dd>
              ))}
            </div>
            {store.info.phone ? (
              <div>
                <dt className="text-ink-800 font-semibold">Telefone</dt>
                <dd>{formatPhoneBR(store.info.phone)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink-800 font-semibold">Endereço</dt>
              <dd>
                {endereco.street}, {endereco.number} — {endereco.district}, {endereco.city}/
                {endereco.uf}
                {endereco.cep ? ` · CEP ${formatCep(endereco.cep)}` : ''}
              </dd>
            </div>
          </dl>
        </div>

        <section>
          <h2 className="text-ink-900 mb-2 font-bold">Perguntas frequentes</h2>
          <div className="rounded-card divide-ink-100 divide-y bg-white">
            {PERGUNTAS.map((item) => (
              <details key={item.pergunta} className="group p-4">
                <summary className="text-ink-800 cursor-pointer text-sm font-semibold">
                  {item.pergunta}
                </summary>
                <p className="text-ink-600 mt-2 text-sm">{item.resposta}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </AreaDaConta>
  );
}
