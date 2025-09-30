
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { AppMessage } from '@/lib/types';

/**
 * Hook para buscar e ouvir em tempo real as mensagens de uma conversa específica.
 * @param {string | null} userId - O ID do usuário.
 * @param {string | null} conversationId - O ID da conversa selecionada.
 * @returns {{ messages: AppMessage[], loading: boolean, error: Error | null }} Um objeto com a lista de mensagens, estado de carregamento e erro.
 */
export function useMessages(userId: string | null, conversationId: string | null) {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Não faz nada se o ID do usuário ou da conversa não for fornecido.
    if (!userId || !conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const messagesRef = collection(firestore, 'users', userId, 'conversations', conversationId, 'messages');
    // Ordena as mensagens por data/hora, da mais antiga para a mais recente, para exibição correta.
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AppMessage));
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.error(`Erro ao buscar mensagens para a conversa ${conversationId} do usuário ${userId}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    // Limpa a subscrição ao desmontar.
    return () => unsubscribe();
  }, [userId, conversationId]);

  return { messages, loading, error };
}
