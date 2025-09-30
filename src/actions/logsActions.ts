
'use server';

/**
 * @fileOverview Ações do lado do servidor para limpar coleções de logs no Firestore.
 * Este arquivo fornece funções para apagar todos os documentos de uma subcoleção
 * específica de um usuário (ex: 'webhook_logs', 'ai_logs'), usando exclusão em lote
 * para otimizar a operação.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

/**
 * Apaga todos os documentos em uma subcoleção especificada de um usuário usando escritas em lote.
 * Esta é uma função genérica usada pelas funções de limpeza mais específicas.
 *
 * @param {string} userId - O ID do usuário proprietário dos logs.
 * @param {string} collectionName - O nome da subcoleção a ser limpa (ex: 'webhook_logs').
 * @returns {Promise<{ success: boolean; error?: string }>} Um objeto indicando o sucesso ou a falha da operação.
 */
async function clearLogsByCollection(userId: string, collectionName: string): Promise<{ success: boolean; error?: string }> {
    if (!userId) {
        const errorMessage = `clearLogs chamado sem userId para a coleção ${collectionName}.`;
        return { success: false, error: 'Usuário não autenticado.' };
    }

    try {
        const firestore = getAdminFirestore();
        const collectionPath = `users/${userId}/${collectionName}`;
        const collectionRef = firestore.collection(collectionPath);
        
        // Busca todos os documentos na coleção.
        const querySnapshot = await collectionRef.get();
        
        if (querySnapshot.empty) {
            // Se a coleção já está vazia, não há nada a fazer.
            return { success: true };
        }

        // Cria um lote para apagar todos os documentos em uma única operação atômica.
        const batch = firestore.batch();
        querySnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        const detailedError = error.message || `Ocorreu um erro desconhecido ao limpar os logs de ${collectionName}.`;
        return { success: false, error: detailedError };
    }
}

/**
 * Limpa todos os logs da coleção `webhook_logs` para um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<{ success: boolean; error?: string }>} Resultado da operação.
 */
export async function clearWebhookLogs(userId: string): Promise<{ success: boolean; error?: string }> {
    return await clearLogsByCollection(userId, 'webhook_logs');
}

/**
 * Limpa todos os logs da coleção `ai_logs` para um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<{ success: boolean; error?: string }>} Resultado da operação.
 */
export async function clearAiLogs(userId: string): Promise<{ success: boolean; error?: string }> {
    return await clearLogsByCollection(userId, 'ai_logs');
}

/**
 * Limpa todos os logs da coleção `system_logs` para um usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<{ success: boolean; error?: string }>} Resultado da operação.
 */
export async function clearSystemLogs(userId: string): Promise<{ success: boolean; error?: string }> {
    return await clearLogsByCollection(userId, 'system_logs');
}

/**
 * Apaga uma lista selecionada de itens da coleção de FAQ de um usuário.
 * @param {string} userId - O ID do usuário.
 * @param {string[]} faqItemIds - Um array com os IDs dos documentos de FAQ a serem apagados.
 * @returns {Promise<{ success: boolean; error?: string }>} Resultado da operação.
 */
export async function clearSelectedFaqItems(userId: string, faqItemIds: string[]): Promise<{ success: boolean; error?: string }> {
    if (!userId) {
        return { success: false, error: 'Usuário não autenticado.' };
    }
    if (!faqItemIds || faqItemIds.length === 0) {
        return { success: true }; // Nada a apagar.
    }

    try {
        const firestore = getAdminFirestore();
        const collectionPath = `users/${userId}/faq`;
        const batch = firestore.batch();
        
        // Adiciona cada documento ao lote de exclusão.
        faqItemIds.forEach(id => {
            const docRef = firestore.doc(`${collectionPath}/${id}`);
            batch.delete(docRef);
        });

        await batch.commit();
        
        return { success: true };

    } catch (error: any) {
        const detailedError = error.message || 'Ocorreu um erro desconhecido ao apagar os itens de FAQ.';
        return { success: false, error: detailedError };
    }
}
