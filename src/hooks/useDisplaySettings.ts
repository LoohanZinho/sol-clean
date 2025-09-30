
"use client";

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { DisplaySettings } from '@/lib/types';

const defaultSettings: DisplaySettings = {
    chatFontSize: 14,
    activeTheme: 'default',
    notificationsEnabled: true, // Padrão é true, mas será controlado pela permissão do navegador.
};

/**
 * Hook para gerenciar as configurações de exibição do usuário (tema, tamanho da fonte).
 * @param {string | null} userId - O ID do usuário.
 * @returns {{ settings: DisplaySettings, loading: boolean, updateSetting: (newSettings: Partial<DisplaySettings>) => Promise<void> }}
 *   As configurações, o estado de carregamento e uma função para atualizá-las.
 */
export function useDisplaySettings(userId: string | null) {
  const [settings, setSettings] = useState<DisplaySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const firestore = getFirebaseFirestore();
    const docRef = doc(firestore, 'users', userId, 'settings', 'displaySettings');
    const unsubscribe = onSnapshot(docRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          setSettings({ ...defaultSettings, ...docSnap.data() });
        } else {
          // Se for o primeiro login, salva as configurações padrão no DB.
          setDoc(docRef, defaultSettings);
          setSettings(defaultSettings);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Erro ao buscar configurações de exibição:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  /**
   * Atualiza uma ou mais configurações de exibição no Firestore.
   * @param {Partial<DisplaySettings>} newSettings - Um objeto com as configurações a serem atualizadas.
   */
  const updateSetting = async (newSettings: Partial<DisplaySettings>) => {
    if (!userId) return;
    const firestore = getFirebaseFirestore();
    const docRef = doc(firestore, 'users', userId, 'settings', 'displaySettings');
    try {
      await setDoc(docRef, newSettings, { merge: true });
    } catch (error) {
      console.error("Erro ao atualizar configurações de exibição:", error);
    }
  };

  return { settings, loading, updateSetting };
}
