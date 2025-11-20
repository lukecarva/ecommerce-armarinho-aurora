import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { Layout } from './components/layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { AgendaPage } from './pages/agenda';
import { AuditPage } from './pages/audit';
import { BrandingPage } from './pages/branding';
import { CategoriesPage } from './pages/categories';
import { CollectionsPage } from './pages/collections';
import { CourseDetailPage, CoursesPage, TurmaPage } from './pages/courses';
import { DashboardPage } from './pages/dashboard';
import { ExportPage } from './pages/export';
import { ImportPage } from './pages/import';
import { LoginPage } from './pages/login';
import { MediaPage } from './pages/media';
import { ProductFormPage } from './pages/product-form';
import { CouponFormPage, CouponsPage } from './pages/coupons';
import { CustomerDetailPage, CustomersListPage } from './pages/customers';
import { OrderDetailPage } from './pages/order-detail';
import { OrdersBoardPage, OrdersListPage } from './pages/orders-board';
import { ProductsListPage } from './pages/products-list';
import { ReportsPage } from './pages/reports';
import { SettingsPage } from './pages/settings';
import { TarefasPage } from './pages/tarefas';
import { UsersPage } from './pages/users';

export function App() {
  // O basename acompanha o `base` do Vite: raiz em desenvolvimento, /painel/
  // quando o painel divide o domínio com a vitrine.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="pedidos" element={<OrdersBoardPage />} />
            <Route path="pedidos/lista" element={<OrdersListPage />} />
            <Route path="pedidos/:code" element={<OrderDetailPage />} />
            <Route path="clientes" element={<CustomersListPage />} />
            <Route path="clientes/:id" element={<CustomerDetailPage />} />
            <Route path="cupons" element={<CouponsPage />} />
            <Route path="cupons/:id" element={<CouponFormPage />} />
            <Route path="produtos" element={<ProductsListPage />} />
            <Route path="produtos/:id" element={<ProductFormPage />} />
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="colecoes" element={<CollectionsPage />} />
            <Route path="midia" element={<MediaPage />} />
            <Route path="importar" element={<ImportPage />} />
            <Route path="exportar" element={<ExportPage />} />
            <Route path="identidade" element={<BrandingPage />} />
            <Route path="cursos" element={<CoursesPage />} />
            <Route path="cursos/:id" element={<CourseDetailPage />} />
            <Route path="cursos/:id/turma/:sid" element={<TurmaPage />} />
            <Route path="agenda" element={<AgendaPage />} />
            <Route path="tarefas" element={<TarefasPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="auditoria" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Portão de entrada do painel.
 *
 * Enquanto a sessão é retomada pelo cookie de refresh, mostramos o carregando
 * em vez de mandar para o login — senão todo F5 pareceria um logout.
 */
function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Carregando o painel…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
