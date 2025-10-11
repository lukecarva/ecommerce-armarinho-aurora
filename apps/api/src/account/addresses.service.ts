import { isValidCep, normalizeCep } from '@aurora/types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Endereços do cliente e consulta de CEP.
 *
 * O endereço existe para adiantar o trabalho da atendente, não para calcular
 * frete: entrega por motoboy é sempre "consultar valor".
 */

export interface DadosDoEndereco {
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  uf: string;
  reference: string | null;
  isDefault?: boolean;
}

export interface EnderecoDoCep {
  street: string;
  district: string;
  city: string;
  uf: string;
}

/**
 * Tempo máximo esperando o ViaCEP.
 *
 * O preenchimento é conveniência: se o serviço demorar, a pessoa digita o
 * endereço à mão. Esperar mais que isso só trava o formulário.
 */
const CEP_TIMEOUT_MS = 4000;

/** CEP não muda de rua. Guardar os consultados poupa o ViaCEP e a espera. */
const CACHE_MAXIMO = 500;

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);
  private readonly cache = new Map<string, EnderecoDoCep | null>();

  constructor(private readonly prisma: PrismaService) {}

  listar(customerId: string) {
    return this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Cria o endereço. O primeiro vira o padrão sozinho — ninguém deveria ter
   * que marcar "padrão" no único endereço que tem.
   */
  async criar(customerId: string, dados: DadosDoEndereco) {
    const quantos = await this.prisma.address.count({ where: { customerId } });
    const padrao = quantos === 0 || Boolean(dados.isDefault);

    return this.prisma.$transaction(async (tx) => {
      if (padrao) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }

      return tx.address.create({
        data: { ...dados, cep: normalizeCep(dados.cep), customerId, isDefault: padrao },
      });
    });
  }

  async atualizar(customerId: string, id: string, dados: DadosDoEndereco) {
    await this.doCliente(customerId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dados.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }

      return tx.address.update({
        where: { id },
        data: {
          ...dados,
          cep: normalizeCep(dados.cep),
          // Desmarcar o padrão não se faz editando: se faz marcando outro.
          // Sem isso a cliente ficaria sem endereço padrão nenhum.
          isDefault: dados.isDefault ? true : undefined,
        },
      });
    });
  }

  /** Remove. Se era o padrão, o mais recente dos que sobraram assume. */
  async remover(customerId: string, id: string): Promise<void> {
    const endereco = await this.doCliente(customerId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (endereco.isDefault) {
        const proximo = await tx.address.findFirst({
          where: { customerId },
          orderBy: { updatedAt: 'desc' },
        });

        if (proximo) {
          await tx.address.update({ where: { id: proximo.id }, data: { isDefault: true } });
        }
      }
    });
  }

  async tornarPadrao(customerId: string, id: string) {
    await this.doCliente(customerId, id);

    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return this.listar(customerId);
  }

  /**
   * Rua, bairro e cidade a partir do CEP, via ViaCEP.
   *
   * A consulta sai do servidor, e não do navegador: o ViaCEP fica sabendo que
   * a loja procurou um CEP, e não o IP de quem está preenchendo. Qualquer
   * falha — CEP inexistente, serviço fora, lentidão — devolve `null`, e a
   * tela segue com o preenchimento à mão.
   */
  async buscarCep(cepBruto: string): Promise<EnderecoDoCep | null> {
    if (!isValidCep(cepBruto)) return null;

    const cep = normalizeCep(cepBruto);
    if (this.cache.has(cep)) return this.cache.get(cep) ?? null;

    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(CEP_TIMEOUT_MS),
      });

      if (!resposta.ok) return null;

      const dados = (await resposta.json()) as {
        erro?: boolean | string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      const endereco =
        dados.erro || !dados.localidade
          ? null
          : {
              street: dados.logradouro ?? '',
              district: dados.bairro ?? '',
              city: dados.localidade,
              uf: dados.uf ?? '',
            };

      this.guardar(cep, endereco);
      return endereco;
    } catch (erro) {
      this.logger.warn(`ViaCEP não respondeu para ${cep}: ${String(erro)}`);
      return null;
    }
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  /**
   * O endereço, desde que seja deste cliente.
   *
   * Buscar pelo id junto com o `customerId` é o que impede alguém de editar o
   * endereço de outra pessoa chutando ids.
   */
  private async doCliente(customerId: string, id: string) {
    const endereco = await this.prisma.address.findFirst({ where: { id, customerId } });
    if (!endereco) throw new NotFoundException('Endereço não encontrado.');

    return endereco;
  }

  private guardar(cep: string, endereco: EnderecoDoCep | null): void {
    if (this.cache.size >= CACHE_MAXIMO) {
      // O mais antigo sai: `Map` guarda a ordem de inserção.
      const primeiro = this.cache.keys().next().value;
      if (primeiro !== undefined) this.cache.delete(primeiro);
    }

    this.cache.set(cep, endereco);
  }
}
