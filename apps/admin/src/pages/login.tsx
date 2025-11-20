import { Button, Logo } from '@aurora/ui';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Field, Input } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível entrar. Verifique se a API está no ar.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-brand-600 flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo variant="onDark" className="h-12" />
        </div>

        <form onSubmit={handleSubmit} className="rounded-card shadow-card space-y-4 bg-white p-6">
          <div>
            <h1 className="text-ink-900 text-lg font-bold">Painel administrativo</h1>
            <p className="text-ink-500 mt-0.5 text-sm">Entre para gerenciar a loja.</p>
          </div>

          <Field label="E-mail" required>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Senha" required>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-button bg-price-50 text-price-600 px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="secondary" full disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="text-brand-200 mt-4 text-center text-xs">
          Armarinho Aurora — acesso restrito à equipe.
        </p>
      </div>
    </div>
  );
}
