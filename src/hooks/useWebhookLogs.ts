
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { WebhookLog } from '@/lib/types';

/**
 * Hook para buscar e ouvir em tempo real os logs de webhook de um usuário.
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ logs: WebhookLog[], loading: boolean, error: Error | null }} Os logs, estado de carregamento e erro.
 */
export function useWebhookLogs(userId: string | null) {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const logsRef = collection(firestore, 'users', userId, 'webhook_logs');
    // Busca os 50 logs mais recentes.
    const q = query(logsRef, orderBy('receivedAt', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const logList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as WebhookLog));
        setLogs(logList);
        setLoading(false);
      },
      (err) => {
        console.error(`Erro ao buscar logs de webhook para o usuário ${userId}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    // Limpa a subscrição ao desmontar.
    return () => unsubscribe();
  }, [userId]);

  return { logs, loading, error };
}
