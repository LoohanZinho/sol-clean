
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { ConnectionStatus } from '@/lib/types';

/**
 * Hook para monitorar o estado da conexão com a Evolution API em tempo real.
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ connectionStatus: ConnectionStatus, loading: boolean }} O estado atual da conexão e o status de carregamento.
 */
export function useConnectionStatus(userId: string | null) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ status: 'connecting', reason: 'initial' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setConnectionStatus({ status: 'disconnected', reason: 'error' });
      return;
    }

    setLoading(true);
    const firestore = getFirebaseFirestore();
    const docRef = doc(firestore, 'users', userId, 'settings', 'connectionStatus');
    
    // Ouve as alterações no documento 'connectionStatus'.
    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setConnectionStatus(docSnap.data() as ConnectionStatus);
        } else {
          // Se o documento não existe, assume-se que está desconectado.
          setConnectionStatus({ status: 'disconnected', reason: 'initial' });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao buscar o estado da conexão:", error);
        setConnectionStatus({ status: 'disconnected', reason: 'error' });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { connectionStatus, loading };
}
