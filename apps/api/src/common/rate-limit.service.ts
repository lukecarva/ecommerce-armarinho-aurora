import { Global, HttpException, HttpStatus, Injectable, Module } from '@nestjs/common';

/**
 * Limite de tentativas por chave, em janela deslizante.
 *
 * Existe para o que se ataca por repetição: login, cadastro, link de entrada
 * e recuperação de senha — na vitrine e no painel. Sem ele, adivinhar a senha
 * de alguém é só uma questão de paciência.
 *
 * **Fica em memória, de propósito.** A API roda num processo só; um Redis
 * para contar tentativas seria mais uma peça no servidor compartilhado para
 * resolver um problema que não temos. O custo é conhecido: reiniciar a API
 * zera os contadores, e com duas instâncias cada uma contaria separado. Se um
 * dia a API escalar horizontalmente, é aqui que se troca.
 */

/** A maior janela em uso. Entradas mais velhas que isso são lixo. */
const JANELA_MAXIMA_MS = 60 * 60 * 1000;

/** A cada tantas chamadas, varre as chaves paradas para a memória não crescer. */
const VARRER_A_CADA = 500;

@Injectable()
export class RateLimitService {
  private readonly tentativas = new Map<string, number[]>();
  private chamadas = 0;

  /**
   * Registra uma tentativa e recusa se passou do limite.
   *
   * A recusa é 429 com o tempo de espera na mensagem: "tente de novo em 12
   * minutos" é o que a pessoa precisa saber, e não um erro genérico.
   */
  consumir(chave: string, limite: number, janelaMs: number): void {
    const agora = Date.now();
    const recentes = (this.tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs);

    if (recentes.length >= limite) {
      this.tentativas.set(chave, recentes);
      const esperaMs = janelaMs - (agora - recentes[0]!);
      const minutos = Math.max(1, Math.ceil(esperaMs / 60_000));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Muitas tentativas. Tente de novo em ${minutos} minuto${minutos > 1 ? 's' : ''}.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentes.push(agora);
    this.tentativas.set(chave, recentes);

    if (++this.chamadas % VARRER_A_CADA === 0) this.varrer(agora);
  }

  /**
   * Zera a chave. Usado depois de um login certo: quem errou a senha duas
   * vezes e acertou na terceira não deve carregar as duas erradas adiante.
   */
  liberar(chave: string): void {
    this.tentativas.delete(chave);
  }

  private varrer(agora: number): void {
    for (const [chave, marcas] of this.tentativas) {
      if (marcas.every((t) => agora - t >= JANELA_MAXIMA_MS)) this.tentativas.delete(chave);
    }
  }
}

/** Global: é infraestrutura, usada pelo painel e pela vitrine. */
@Global()
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}

/** Janelas e limites, num lugar só para ninguém inventar números diferentes. */
export const LIMITES = {
  /** Por IP: barra quem testa muitas contas a partir da mesma máquina. */
  loginPorIp: { limite: 20, janelaMs: 15 * 60 * 1000 },
  /** Por e-mail: barra quem testa muitas senhas na mesma conta, de vários IPs. */
  loginPorEmail: { limite: 8, janelaMs: 15 * 60 * 1000 },
  cadastroPorIp: { limite: 10, janelaMs: 60 * 60 * 1000 },
  /** Link de entrada, recuperação e reenvio de confirmação: cada um manda e-mail. */
  emailPorEndereco: { limite: 3, janelaMs: 15 * 60 * 1000 },
  emailPorIp: { limite: 10, janelaMs: 15 * 60 * 1000 },
} as const;
