import { CategoryCard, Container } from '@aurora/ui';
import type { Metadata } from 'next';
import { getCategories } from '@/lib/api';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Categorias',
  description: 'Tecidos, fios, barbantes, aviamentos, máquinas e artesanato na Armarinho Aurora.',
  alternates: { canonical: '/categorias' },
};

export default async function CategoriasPage() {
  const categorias = await getCategories();

  return (
    <Container className="py-5">
      <h1 className="text-ink-900 mb-1 text-xl font-bold">Categorias</h1>
      <p className="text-ink-500 mb-5 text-sm">Tudo para o seu artesanato em um só lugar.</p>

      {categorias.length === 0 ? (
        <p className="rounded-card border-ink-300 text-ink-600 border border-dashed bg-white p-6 text-center text-sm">
          O catálogo está sendo montado.
        </p>
      ) : (
        <div className="space-y-8">
          {categorias.map((categoria) => (
            <section key={categoria.id}>
              <h2 className="text-ink-800 mb-3 text-base font-bold">{categoria.name}</h2>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                <CategoryCard category={categoria} />
                {categoria.children.map((filha) => (
                  <CategoryCard key={filha.id} category={filha} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}
