
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { AiLog } from '@/lib/types';

/**
 * Hook personalizado para ouvir em tempo real os logs de interações da IA no Firestore.
 * @param {string | null} userId - O ID do usuário para o qual os logs devem ser buscados.
 * @returns {{ logs: AiLog[], loading: boolean, error: Error | null }} Um objeto contendo a lista de logs, o estado de carregamento e qualquer erro.
 */
export function useAiLogs(userId: string | null) {
  const [logs, setLogs] = useState<AiLog[]>([]);
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
    const logsRef = collection(firestore, 'users', userId, 'ai_logs');
    // Busca os 50 logs mais recentes, ordenados por data/hora.
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(50));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const logList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as AiLog));
        setLogs(logList);
        setLoading(false);
      },
      (err) => {
        console.error(`Erro ao buscar logs de IA para o usuário ${userId}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    // Limpa a subscrição ao desmontar o componente para evitar vazamentos de memória.
    return () => unsubscribe();
  }, [userId]);

  return { logs, loading, error };
}
