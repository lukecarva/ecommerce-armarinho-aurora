import { NextResponse } from 'next/server';

/**
 * Ponte entre o navegador e a API.
 *
 * Fica em `/vitrine/`, e não em `/api/`, de propósito: `/api/` no domínio da
 * loja é a API NestJS, encaminhada pelo nginx antes de chegar ao Next. Uma
 * rota do Next ali dentro fica inalcançável em produção e responde 404 vindo
 * do outro serviço — falha que não aparece em `pnpm dev`, onde não há nginx.
 */
const API =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export async function GET(request: Request): Promise<NextResponse> {
  const { search } = new URL(request.url);

  try {
    const resposta = await fetch(`${API}/catalog/products${search}`, {
      next: { revalidate: 60 },
    });

    if (!resposta.ok) {
      return NextResponse.json({ items: [], total: 0 }, { status: 502 });
    }

    return NextResponse.json(await resposta.json());
  } catch {
    // A listagem já mostrou a primeira página; falhar aqui só cancela o
    // "ver mais", sem derrubar a página inteira.
    return NextResponse.json({ items: [], total: 0 }, { status: 502 });
  }
}
