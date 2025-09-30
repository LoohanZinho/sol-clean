

'use client';

import { useEffect, useRef } from 'react';
import { useConversations } from './useConversations';
import type { Conversation, AiConfig } from '@/lib/types';
import { useDisplaySettings } from './useDisplaySettings';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';

/**
 * Hook to send browser notifications for critical conversation events.
 * It now handles both interventions (support requests) and new tags added by the routing agent.
 * @param {string | null} userId - The user's ID.
 */
export function useInterventionNotification(userId: string | null) {
  const { conversations } = useConversations(userId);
  const { settings: displaySettings } = useDisplaySettings(userId);
  const previousConversationsRef = useRef<Map<string, Conversation>>(new Map());
  const aiConfigRef = useRef<AiConfig | null>(null);

  useEffect(() => {
    if (!userId) return;

    // Fetch AI config once to know if tag notifications are enabled
    const fetchAiConfig = async () => {
        const firestore = getFirebaseFirestore();
        const docRef = doc(firestore, 'users', userId, 'settings', 'aiConfig');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            aiConfigRef.current = docSnap.data() as AiConfig;
        }
    };
    fetchAiConfig();
  }, [userId]);

  useEffect(() => {
    if (
      typeof window === 'undefined' || 
      !('Notification' in window) || 
      !userId ||
      Notification.permission !== 'granted' ||
      displaySettings.notificationsEnabled === false
    ) {
      return;
    }

    const currentConversationsMap = new Map(conversations.map(c => [c.id, c]));

    currentConversationsMap.forEach((currentConvo, id) => {
      const previousConvo = previousConversationsRef.current.get(id);

      // 1. Check for move to 'support' folder (Intervention)
      if (currentConvo.folder === 'support' && previousConvo?.folder !== 'support') {
        let notificationBody = "Um cliente precisa de atenção na fila de suporte.";
        if (currentConvo.interventionReason === 'technical_failure') {
            notificationBody = "Falha técnica na conversa. Atendimento humano necessário.";
        } else if (currentConvo.interventionReason === 'user_request') {
            notificationBody = "Cliente solicitou atendimento humano.";
        }
        
        const interventionNotification = new Notification(`Suporte: ${currentConvo.preferredName || currentConvo.name}`, {
            body: notificationBody,
            icon: '/icon-192.png',
            badge: '/badge.png',
            tag: `${currentConvo.id}-intervention`,
        });

        interventionNotification.onclick = () => window.focus();
      }
      
      // 2. Check for newly added tags
      if (aiConfigRef.current?.agentRole === 'Roteamento / Triagem' && aiConfigRef.current?.notifyOnTagAdded) {
          const previousTags = new Set(previousConvo?.tags || []);
          const currentTags = new Set(currentConvo.tags || []);
          
          currentTags.forEach(tag => {
              if (!previousTags.has(tag)) {
                  // A new tag was added
                  const tagNotification = new Notification(`Tag Adicionada: ${tag}`, {
                      body: `O lead ${currentConvo.preferredName || currentConvo.name} foi enviado para este setor para continuar o atendimento!`,
                      icon: '/icon-192.png',
                      badge: '/badge.png',
                      tag: `${currentConvo.id}-tag-${tag}`,
                  });
                  tagNotification.onclick = () => window.focus();
              }
          });
      }
    });

    previousConversationsRef.current = currentConversationsMap;
  }, [conversations, displaySettings.notificationsEnabled, userId]);
}
