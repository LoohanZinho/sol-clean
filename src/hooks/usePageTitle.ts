
'use client';

import { useEffect } from 'react';
import { useConversations } from './useConversations';

/**
 * Hook para atualizar dinamicamente o título da página (aba do navegador).
 * Adiciona uma contagem de conversas que precisam de intervenção.
 * @param {string | null} userId - O ID do usuário.
 * @param {string} defaultTitle - O título padrão da página.
 * @param {string} [interventionTitlePrefix='Intervenção'] - O prefixo para o título quando há intervenções.
 */
export function usePageTitle(
  userId: string | null,
  defaultTitle: string,
  interventionTitlePrefix: string = 'Intervenção'
) {
  const { conversations, loading } = useConversations(userId);

  useEffect(() => {
    if (typeof document === 'undefined' || loading) {
      return;
    }

    const supportConversations = conversations.filter(c => c.folder === 'support');

    if (supportConversations.length > 0) {
      // Ex: (2) Intervenção | Painel de Atendimento
      document.title = `(${supportConversations.length}) ${interventionTitlePrefix} | ${defaultTitle}`;
    } else {
      document.title = defaultTitle;
    }
    
    // Reseta o título ao desmontar o componente.
    return () => {
        document.title = defaultTitle;
    };

  }, [conversations, loading, defaultTitle, interventionTitlePrefix]);
}
