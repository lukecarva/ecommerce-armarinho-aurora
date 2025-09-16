'use client';

import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react';

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type LinkComponent = (props: LinkProps) => ReactNode;

const DefaultLink: LinkComponent = (props) => <a {...props} />;

const LinkContext = createContext<LinkComponent>(DefaultLink);

/**
 * Permite que cada app injete seu próprio componente de link
 * (`next/link` na vitrine, o router do TanStack no admin) sem que o
 * design system precise conhecer o framework de rotas.
 */
export function LinkProvider({
  component,
  children,
}: {
  component: LinkComponent;
  children: ReactNode;
}) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>;
}

export function useLinkComponent(): LinkComponent {
  return useContext(LinkContext);
}
