
'use server';

/**
 * @fileOverview Ações do lado do servidor para gerenciar as configurações do provedor de IA.
 * Este arquivo lida com o armazenamento e a recuperação das configurações relacionadas
 * ao modelo de linguagem (LLM), como a chave de API do usuário.
 */

import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { z } from 'zod';
import type { AiProviderSettings, ConnectionStatus } from '@/lib/types';

// Garante que o SDK do Firebase Admin seja inicializado.
initializeAdmin();

// Schema Zod para validar os dados de configuração do provedor de IA.
const AiProviderSettingsSchema = z.object({
    apiKey: z.string().optional(),
});


/**
 * Salva as configurações do provedor de IA para um usuário específico no Firestore.
 * Esta função recebe um objeto com as configurações e as salva de forma segura.
 *
 * @param {object} params - Os parâmetros da função.
 * @param {string} params.userId - O ID do usuário para o qual as configurações serão salvas.
 * @param {string} [params.apiKey] - A chave de API do Gemini a ser salva (opcional).
 * @returns {Promise<{success: boolean; error?: string}>} Um objeto indicando o sucesso ou a falha da operação.
 */
export async function saveAiProviderSettings({ userId, apiKey }: { userId: string, apiKey?: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const firestore = getAdminFirestore();
        const settingsRef = firestore.collection('users').doc(userId).collection('settings').doc('aiProvider');
        
        // Constrói um objeto apenas com as configurações fornecidas para evitar sobrescrever campos não intencionalmente.
        const settingsToSave: Partial<AiProviderSettings> = {};
        if (apiKey !== undefined) {
            settingsToSave.apiKey = apiKey;
        }
       
        // Salva as configurações no Firestore usando 'merge: true' para atualizar apenas os campos fornecidos.
        await settingsRef.set(settingsToSave, { merge: true });
        
        // Registra um log de sistema informando o sucesso da operação.
        await logSystemInfo(userId, 'saveAiProviderSettings', 'Configurações do provedor de IA salvas.', {});
        
        // Lógica para ativar a IA automaticamente
        if (apiKey && apiKey.trim() !== "") {
            const connectionStatusRef = firestore.collection('users').doc(userId).collection('settings').doc('connectionStatus');
            const connectionStatusSnap = await connectionStatusRef.get();

            if (connectionStatusSnap.exists && (connectionStatusSnap.data() as ConnectionStatus).status === 'connected') {
                const automationRef = firestore.collection('users').doc(userId).collection('settings').doc('automation');
                const aiConfigRef = firestore.collection('users').doc(userId).collection('settings').doc('aiConfig');
                
                const aiConfigSnap = await aiConfigRef.get();
                if (aiConfigSnap.exists && aiConfigSnap.data()?.fullPrompt) {
                     await automationRef.set({ isAiActive: true }, { merge: true });
                     await logSystemInfo(userId, 'autoEnableAI', 'IA ativada automaticamente após salvar a chave de API com o WhatsApp conectado.', {});
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        // Em caso de falha, registra um log de erro detalhado.
        await logSystemFailure(userId, 'saveAiProviderSettings_failure', { message: error.message, stack: error.stack }, {});
        return { success: false, error: 'Falha ao salvar as configurações do provedor de IA.' };
    }
}

/**
 * Busca as configurações do provedor de IA de um usuário específico no Firestore.
 *
 * @param {string} userId - O ID do usuário cujas configurações devem ser recuperadas.
 * @returns {Promise<AiProviderSettings | null>} Um objeto com as configurações do provedor de IA, ou `null` se não forem encontradas ou se ocorrer um erro.
 */
export async function getAiProviderSettings(userId: string): Promise<AiProviderSettings | null> {
    try {
        const firestore = getAdminFirestore();
        const settingsRef = firestore.collection('users').doc(userId).collection('settings').doc('aiProvider');
        const docSnap = await settingsRef.get();
        
        if (docSnap.exists) {
            // Retorna os dados do documento se ele existir.
            return docSnap.data() as AiProviderSettings;
        }
        // Retorna nulo se não houver configurações salvas.
        return null;
    } catch (error: any) {
        // Em caso de falha, registra um log de erro e retorna nulo.
        await logSystemFailure(userId, 'getAiProviderSettings_failure', { message: error.message, stack: error.stack }, {});
        return null;
    }
}
