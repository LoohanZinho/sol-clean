
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { Conversation } from '@/lib/types';

/**
 * Hook para buscar e ouvir em tempo real todas as conversas de um usuário.
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ conversations: Conversation[], loading: boolean, error: Error | null }} Um objeto com a lista de conversas, estado de carregamento e erros.
 */
export function useConversations(userId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const conversationsRef = collection(firestore, 'users', userId, 'conversations');
    // Ordena as conversas pela data de última atualização, da mais recente para a mais antiga.
    const q = query(conversationsRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const convos = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Conversation));
        setConversations(convos);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    // Limpa a subscrição ao desmontar.
    return () => unsubscribe();
  }, [userId]);

  return { conversations, loading, error };
}
