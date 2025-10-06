import { formatBRL, formatQuantity, type SaleUnit } from '@aurora/types';
import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env';

/**
 * E-mail transacional.
 *
 * Dois transportes:
 *
 * - `log` (padrão) não envia nada: escreve a mensagem inteira no log do
 *   serviço. É o que roda hoje, porque a loja ainda não tem e-mail oficial
 *   nem servidor SMTP. O fluxo do pedido fica completo e verificável, e ligar
 *   o envio de verdade é trocar variável de ambiente, não mudar código.
 * - `smtp` envia.
 *
 * **Com `MAIL_CATCH_ALL` preenchido, todo destinatário é substituído por ele.**
 * É a trava que impede um teste em homologação de cair na caixa de uma
 * cliente real — com o catálogo em construção, esse e-mail seria pior que
 * nenhum.
 *
 * A trava é uma variável explícita, e não `NODE_ENV`: o servidor de
 * homologação roda com `NODE_ENV=production` (é o modo em que Nest e Next
 * servem de verdade), então deduzir o ambiente daí mandaria e-mail para
 * cliente real justamente onde não se deve. Produção simplesmente não define
 * `MAIL_CATCH_ALL`.
 */

export interface Destinatario {
  email: string;
  nome: string;
}

export interface PedidoParaEmail {
  code: string;
  customer: { name: string; phone: string; email: string | null };
  delivery: { label: string; note: string | null };
  items: Array<Record<string, unknown> & { qty: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  discount: number;
  total: number;
  orderUrl: string;
  storeOpen: boolean;
  storeStatusMessage: string;
}

@Injectable()
export class MailService {
  private readonly env = loadEnv();
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  /**
   * Confirmação para o cliente e aviso para a equipe.
   *
   * Devolve para quem realmente saiu mensagem — a linha do tempo do pedido não
   * pode dizer "e-mail enviado" quando a cliente não deixou endereço.
   */
  async pedidoCriado(pedido: PedidoParaEmail): Promise<string[]> {
    const enviados: string[] = [];
    const linhas = pedido.items.map((item) => {
      const nome = String(item.name ?? 'Item');
      const variacao = item.variantName ? ` (${String(item.variantName)})` : '';
      const quantidade = formatQuantity(item.qty, item.unit as SaleUnit);

      return `- ${nome}${variacao}: ${quantidade} × ${formatBRL(item.unitPrice)} = ${formatBRL(item.lineTotal)}`;
    });

    const corpo = [
      `Olá, ${pedido.customer.name}!`,
      '',
      `Recebemos seu pedido ${pedido.code}. Ele ainda não é uma compra fechada:`,
      'a gente conversa pelo WhatsApp para combinar pagamento e entrega.',
      '',
      ...linhas,
      '',
      `Subtotal: ${formatBRL(pedido.subtotal)}`,
      ...(pedido.discount > 0 ? [`Desconto: -${formatBRL(pedido.discount)}`] : []),
      `Total estimado: ${formatBRL(pedido.total)}`,
      `Entrega: ${pedido.delivery.label}${pedido.delivery.note ? ` (${pedido.delivery.note})` : ''}`,
      '',
      ...(pedido.storeOpen ? [] : [pedido.storeStatusMessage, '']),
      `Acompanhe em: ${pedido.orderUrl}`,
      '',
      this.env.STORE_NAME,
    ].join('\n');

    if (pedido.customer.email) {
      enviados.push(
        await this.enviar({
          para: pedido.customer.email,
          assunto: `Seu pedido ${pedido.code} — ${this.env.STORE_NAME}`,
          corpo,
        }),
      );
    }

    if (this.env.MAIL_TEAM) {
      enviados.push(
        await this.enviar({
          para: this.env.MAIL_TEAM,
          assunto: `Novo pedido ${pedido.code} — ${formatBRL(pedido.total)}`,
          corpo: [
            `Pedido ${pedido.code}`,
            `Cliente: ${pedido.customer.name} — ${pedido.customer.phone}`,
            `Entrega: ${pedido.delivery.label}${pedido.delivery.note ? ` (${pedido.delivery.note})` : ''}`,
            '',
            ...linhas,
            '',
            `Total estimado: ${formatBRL(pedido.total)}`,
          ].join('\n'),
        }),
      );
    }

    return enviados;
  }

  // ─────────────────────────────── Conta ───────────────────────────────────
  //
  // Os e-mails abaixo carregam links que dão acesso à conta. Com o transporte
  // `log`, o link inteiro vai para o arquivo de log do serviço — aceitável em
  // homologação, onde o log só é lido por root, mas é uma razão a mais para
  // produção nunca rodar com `log`.

  entrarComLink(destino: Destinatario, link: string): Promise<string> {
    return this.enviar({
      para: destino.email,
      assunto: `Seu link de acesso — ${this.env.STORE_NAME}`,
      corpo: [
        `Olá, ${destino.nome}!`,
        '',
        'Use o link abaixo para entrar na sua conta. Ele vale por 15 minutos e só',
        'funciona uma vez:',
        '',
        link,
        '',
        'Se não foi você que pediu, pode ignorar este e-mail — ninguém entra sem ele.',
      ].join('\n'),
    });
  }

  redefinirSenha(destino: Destinatario, link: string): Promise<string> {
    return this.enviar({
      para: destino.email,
      assunto: `Redefinir sua senha — ${this.env.STORE_NAME}`,
      corpo: [
        `Olá, ${destino.nome}!`,
        '',
        'Recebemos um pedido para trocar a senha da sua conta. O link vale por uma',
        'hora e só funciona uma vez:',
        '',
        link,
        '',
        'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
      ].join('\n'),
    });
  }

  confirmarEmail(destino: Destinatario, link: string): Promise<string> {
    return this.enviar({
      para: destino.email,
      assunto: `Confirme seu e-mail — ${this.env.STORE_NAME}`,
      corpo: [
        `Olá, ${destino.nome}!`,
        '',
        'Sua conta na Armarinho Aurora está pronta. Confirme que este e-mail é seu:',
        '',
        link,
        '',
        this.env.STORE_NAME,
      ].join('\n'),
    });
  }

  pedidoAtualizado(
    destino: Destinatario,
    pedido: { code: string; status: string; link: string },
  ): Promise<string> {
    return this.enviar({
      para: destino.email,
      assunto: `Pedido ${pedido.code}: ${pedido.status}`,
      corpo: [
        `Olá, ${destino.nome}!`,
        '',
        `Seu pedido ${pedido.code} agora está: ${pedido.status}.`,
        '',
        `Acompanhe em: ${pedido.link}`,
        '',
        this.env.STORE_NAME,
      ].join('\n'),
    });
  }

  /**
   * Aviso de cupom novo.
   *
   * É e-mail de marketing: quem chama só pode mandar para quem aceitou
   * receber novidades. A regra está em quem chama, não aqui, porque só quem
   * chama sabe a lista de destinatários.
   */
  cupomNovo(
    destino: Destinatario,
    cupom: { code: string; description: string | null },
  ): Promise<string> {
    return this.enviar({
      para: destino.email,
      assunto: `Cupom novo: ${cupom.code} — ${this.env.STORE_NAME}`,
      corpo: [
        `Olá, ${destino.nome}!`,
        '',
        cupom.description ?? 'Tem cupom novo esperando por você na loja.',
        '',
        `Use o código ${cupom.code} no carrinho.`,
        '',
        `${this.env.SITE_URL}/conta/cupons`,
        '',
        'Você recebe este e-mail porque aceitou receber novidades. Para parar,',
        `desmarque a opção em ${this.env.SITE_URL}/conta/dados.`,
      ].join('\n'),
    });
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  /** Envia e devolve para onde a mensagem realmente foi. */
  private async enviar(mensagem: {
    para: string;
    assunto: string;
    corpo: string;
  }): Promise<string> {
    const destino = this.destinatario(mensagem.para);

    if (this.env.MAIL_TRANSPORT === 'log') {
      this.logger.log(
        [
          '───────── e-mail (transporte "log", nada foi enviado) ─────────',
          `Para: ${destino}`,
          `Assunto: ${mensagem.assunto}`,
          '',
          mensagem.corpo,
          '───────────────────────────────────────────────────────────────',
        ].join('\n'),
      );
      return destino;
    }

    await this.smtp().sendMail({
      from: this.env.MAIL_FROM,
      to: destino,
      subject: mensagem.assunto,
      text: mensagem.corpo,
    });

    return destino;
  }

  /**
   * Para quem o e-mail vai de verdade.
   *
   * `MAIL_CATCH_ALL` preenchido desvia tudo para lá. Vazio, a mensagem segue
   * para quem deveria receber — é o que produção faz.
   */
  private destinatario(pretendido: string): string {
    return this.env.MAIL_CATCH_ALL || pretendido;
  }

  private smtp(): Transporter {
    this.transporter ??= createTransport({
      host: this.env.MAIL_HOST,
      port: this.env.MAIL_PORT,
      secure: this.env.MAIL_PORT === 465,
      auth: this.env.MAIL_USER ? { user: this.env.MAIL_USER, pass: this.env.MAIL_PASS } : undefined,
    });

    return this.transporter;
  }
}
