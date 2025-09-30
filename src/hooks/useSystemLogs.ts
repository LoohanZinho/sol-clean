
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { SystemLog } from '@/lib/types';

/**
 * Hook para buscar e ouvir em tempo real os logs de sistema de um usuário.
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ logs: SystemLog[], loading: boolean, error: Error | null }} Os logs, estado de carregamento e erro.
 */
export function useSystemLogs(userId: string | null) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
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
    const logsRef = collection(firestore, 'users', userId, 'system_logs');
    // Busca os 300 logs mais recentes para fornecer contexto suficiente para depuração.
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(300));

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const logList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SystemLog));
        setLogs(logList);
        setLoading(false);
      },
      (err) => {
        console.error(`Erro ao buscar logs de sistema para o usuário ${userId}:`, err);
        setError(err);
        setLoading(false);
      }
    );

    // Limpa a subscrição ao desmontar.
    return () => unsubscribe();
  }, [userId]);

  return { logs, loading, error };
}
