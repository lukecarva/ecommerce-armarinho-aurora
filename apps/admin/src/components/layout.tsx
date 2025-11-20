import { Logo } from '@aurora/ui';
import {
  BarChart3,
  Boxes,
  CalendarDays,
  Contact,
  FileDown,
  FileUp,
  GraduationCap,
  Image,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Package,
  Palette,
  Percent,
  ScrollText,
  Settings,
  ShoppingBag,
  Tags,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';

interface NavEntry {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  permission: string;
  /** Módulos que ainda não existem aparecem desabilitados, com a sprint. */
  sprint?: number;
}

const NAV: NavEntry[] = [
  { label: 'Início', to: '/', icon: LayoutDashboard, permission: 'catalogo:ver' },
  { label: 'Pedidos', to: '/pedidos', icon: ShoppingBag, permission: 'pedidos:ver' },
  { label: 'Clientes', to: '/clientes', icon: Contact, permission: 'clientes:ver' },
  { label: 'Cupons', to: '/cupons', icon: Percent, permission: 'cupons:ver' },
  { label: 'Produtos', to: '/produtos', icon: Package, permission: 'catalogo:ver' },
  { label: 'Categorias', to: '/categorias', icon: Tags, permission: 'catalogo:ver' },
  { label: 'Coleções', to: '/colecoes', icon: Boxes, permission: 'catalogo:ver' },
  { label: 'Mídia', to: '/midia', icon: Image, permission: 'midia:ver' },
  { label: 'Importar', to: '/importar', icon: FileUp, permission: 'importacao:ver' },
  { label: 'Exportar', to: '/exportar', icon: FileDown, permission: 'exportacao:ver' },
  { label: 'Identidade visual', to: '/identidade', icon: Palette, permission: 'identidade:ver' },
  { label: 'Cursos', to: '/cursos', icon: GraduationCap, permission: 'cursos:ver' },
  { label: 'Agenda', to: '/agenda', icon: CalendarDays, permission: 'cursos:ver' },
  { label: 'Tarefas', to: '/tarefas', icon: KanbanSquare, permission: 'tarefas:ver' },
  { label: 'Relatórios', to: '/relatorios', icon: BarChart3, permission: 'relatorios:ver' },
  { label: 'Configurações', to: '/configuracoes', icon: Settings, permission: 'configuracoes:ver' },
  { label: 'Usuários', to: '/usuarios', icon: Users, permission: 'usuarios:ver' },
  { label: 'Auditoria', to: '/auditoria', icon: ScrollText, permission: 'usuarios:ver' },
];

export function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  const visible = NAV.filter((entry) => can(entry.permission));

  return (
    <div className="bg-ink-100 flex min-h-dvh">
      <aside className="bg-brand-600 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto px-3 py-4 md:flex">
        <div className="px-2">
          <Logo variant="onDark" />
        </div>

        <nav className="mt-6 flex-1 space-y-0.5">
          {visible.map((entry) => {
            const Icon = entry.icon;
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.to === '/'}
                className={({ isActive }) =>
                  `rounded-button flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-white/15 font-medium text-white'
                      : 'text-brand-100 hover:bg-white/10'
                  }`
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {entry.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="truncate px-3 text-sm font-medium text-white">{user?.name}</p>
          <p className="text-brand-200 truncate px-3 text-xs">{user?.roleName}</p>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="rounded-button text-brand-100 mt-2 flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-white/10"
          >
            <LogOut className="size-4" aria-hidden />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navegação compacta no mobile — o painel é usado no balcão também. */}
        <div className="bg-brand-600 flex items-center gap-2 overflow-x-auto px-3 py-2 md:hidden">
          {visible.map((entry) => (
            <NavLink
              key={entry.to}
              to={entry.to}
              end={entry.to === '/'}
              className={({ isActive }) =>
                `rounded-pill px-3 py-1.5 text-xs whitespace-nowrap ${
                  isActive ? 'bg-white/20 font-medium text-white' : 'text-brand-100'
                }`
              }
            >
              {entry.label}
            </NavLink>
          ))}
        </div>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-ink-900 text-xl font-bold">{title}</h1>
        {description ? <p className="text-ink-500 mt-0.5 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
