import type { StoreInfo } from '@aurora/types';
import { BadgeCheck, HeartHandshake, MapPin, MessageCircle, Phone } from 'lucide-react';
import { cn } from '../lib/cn';
import { Logo } from './logo';

export interface FooterProps {
  store: StoreInfo;
  /** Linhas de horário já formatadas, ex.: ["Seg a sex: 9h às 18h"]. */
  scheduleLines?: string[];
  whatsappUrl: string;
  logoUrl?: string | null;
  className?: string;
}

const DIFERENCIAIS = [
  { icon: BadgeCheck, title: 'Qualidade e variedade', text: 'que você confia' },
  { icon: HeartHandshake, title: 'Tudo para o seu artesanato', text: 'em um só lugar' },
  { icon: MessageCircle, title: 'Atendimento especializado', text: 'sempre com você' },
];

export function Footer({
  store,
  scheduleLines = [],
  whatsappUrl,
  logoUrl,
  className,
}: FooterProps) {
  const { address } = store;

  return (
    <footer className={cn('bg-brand-600 text-brand-100', className)}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div className="space-y-4">
          <Logo src={logoUrl} variant="onDark" className="h-10" />
          <p className="text-sm leading-relaxed">
            O Supermercado do Artesanato em São Paulo. Tecidos, fios, aviamentos, máquinas e
            workshops para as suas criações.
          </p>
        </div>

        <ul className="space-y-4">
          {DIFERENCIAIS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="flex items-start gap-3">
                <Icon className="text-accent-400 mt-0.5 size-5 shrink-0" aria-hidden />
                <span className="text-sm">
                  <strong className="font-semibold text-white">{item.title}</strong>
                  <br />
                  {item.text}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="space-y-3 text-sm">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 font-semibold text-white hover:underline"
          >
            <MessageCircle className="text-whatsapp size-5" aria-hidden />
            {formatPhone(store.whatsapp)}
          </a>

          {store.phone ? (
            <p className="flex items-center gap-2">
              <Phone className="text-accent-400 size-5 shrink-0" aria-hidden />
              {formatPhone(store.phone)}
            </p>
          ) : null}

          <address className="flex items-start gap-2 not-italic">
            <MapPin className="text-accent-400 mt-0.5 size-5 shrink-0" aria-hidden />
            <span>
              {address.street}, {address.number}
              <br />
              {address.district} — {address.city}/{address.uf}
            </span>
          </address>

          {scheduleLines.length > 0 ? (
            <div className="pt-1">
              {scheduleLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="text-brand-200 mx-auto max-w-6xl px-4 py-4 text-xs">
          <p>
            Preços e disponibilidade sujeitos a confirmação no atendimento. Este site não realiza
            pagamentos: a compra é concluída pelo WhatsApp.
          </p>
        </div>
      </div>
    </footer>
  );
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
}
