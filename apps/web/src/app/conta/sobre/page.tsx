import { AreaDaConta } from '@/components/conta-ui';
import { getStore } from '@/lib/api';

/**
 * Sobre a loja.
 *
 * Texto curto e factual — quem abre esta tela quer saber quem está do outro
 * lado do WhatsApp, não ler um manifesto.
 */
export default async function SobrePage() {
  const store = await getStore();
  const endereco = store.info.address;

  return (
    <AreaDaConta titulo="Sobre">
      <div className="rounded-card text-ink-700 max-w-lg space-y-3 bg-white p-4 text-sm leading-relaxed">
        <p>
          A <strong>{store.info.name}</strong> é uma franquia oficial da rede Armarinho Aurora — o
          Supermercado do Artesanato.
        </p>
        <p>
          Tecidos, fios, barbantes, aviamentos, máquinas e acessórios para quem costura, borda, faz
          crochê e cria. Também oferecemos cursos presenciais na loja.
        </p>
        <p>
          A loja física fica na {endereco.street}, {endereco.number}, {endereco.district} —{' '}
          {endereco.city}/{endereco.uf}. O site mostra o catálogo; o pedido é fechado com a gente
          pelo WhatsApp, do jeito que você já conhece.
        </p>
        <p className="text-ink-500 text-xs">
          Preços e disponibilidade podem mudar e são confirmados no atendimento.
        </p>
      </div>
    </AreaDaConta>
  );
}
