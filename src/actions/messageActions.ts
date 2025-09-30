'use server';

/**
 * @fileOverview Ações do lado do servidor relacionadas ao envio de mensagens por um operador.
 * Este arquivo serve como um ponto de entrada seguro para os componentes do cliente
 * interagirem com a lógica de envio de mensagens do servidor. A principal responsabilidade
 * desta ação é desativar a IA quando um operador intervém e, em seguida, chamar o
 * serviço de envio de mensagens.
 */
import type { SenderInput, SenderOutput } from '@/lib/types';
import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { sendTextMessage } from '@/actions/evolutionApiActions';
import { v4 as uuidv4 } from 'uuid';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { SenderInputSchema } from '@/lib/schemas';
import { Timestamp } from 'firebase-admin/firestore';
import { findAndTriggerActions } from './webhookSender';


// Garante que o Firebase Admin esteja inicializado.
initializeAdmin();

/**
 * Uma Server Action para enviar uma mensagem via Evolution API em nome de um operador.
 * Esta função fornece um ponto de entrada limpo e seguro para os componentes do cliente.
 * Uma regra de negócio crucial é implementada aqui: quando um operador envia uma mensagem,
 * a IA é automaticamente desativada para aquela conversa, para evitar respostas conflitantes.
 *
 * @param {SenderInput} input - O objeto contendo os detalhes da mensagem (destinatário, conteúdo, etc.).
 * @returns {Promise<SenderOutput>} O resultado da operação de envio, indicando sucesso ou falha.
 */
export async function sendMessageAction(input: SenderInput): Promise<SenderOutput> {
    
    // Valida a entrada para garantir a integridade dos dados.
    const { userId, phone, message, source, operatorEmail } = SenderInputSchema.parse(input);

    if (!message || !message.trim()) {
        const error = 'sendMessageAction foi chamada com uma mensagem vazia.';
        await logSystemFailure(userId, 'sendMessageAction_empty_message', { message: error }, { phone });
        return { success: false, error };
    }
    
    if (!operatorEmail) {
        const error = 'sendMessageAction requer um email de operador para determinar a instância.';
        await logSystemFailure(userId, 'sendMessageAction_no_email', { message: error }, { phone });
        return { success: false, error };
    }

    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(phone);
    
    try {
        // Se a mensagem vem de um operador, desativa a IA.
        if (source === 'operator') {
            const batch = adminFirestore.batch();
            
            // 1. Desativa a IA na conversa.
            batch.update(conversationRef, { isAiActive: false, lastAiResponse: null });
            
            // 2. Adiciona uma mensagem de sistema no histórico do chat para registrar a ação.
            const systemMessageRef = conversationRef.collection('messages').doc();
            batch.set(systemMessageRef, {
                text: "IA Desativada pelo operador do painel",
                from: 'agent',
                source: 'system',
                type: 'system',
                timestamp: Timestamp.now(),
            });

            await batch.commit();

            await logSystemInfo(userId, 'sendMessageAction', `IA desativada pelo sistema devido à mensagem do operador.`, { conversationId: phone, operator: operatorEmail || 'N/A' });
        }
        
        // Delega o envio real da mensagem para a função especializada.
        // A função sendTextMessage agora usará as credenciais específicas do usuário.
        const sendResult = await sendTextMessage({
            userId,
            phone,
            message,
            saveToHistory: true, // Garante que a mensagem do operador seja salva no histórico.
            source: source || 'operator',
            operatorEmail: operatorEmail,
        });

        if (!sendResult.success) {
            throw new Error(sendResult.error || 'Falha ao enviar mensagem para a Evolution API.');
        }
        
        // Dispara a notificação de 'mensagem enviada'
        findAndTriggerActions(userId, 'message_sent', { 
            conversationId: phone, 
            message: { 
                id: sendResult.messageId, 
                text: message,
                from: 'agent',
                source: source || 'operator' 
            } 
        });
        
        return { success: true, messageId: sendResult.messageId };

    } catch (error: any) {
        // Captura e registra qualquer erro não tratado durante o processo.
        await logSystemFailure(
            userId, 
            'sendMessageAction_failure', 
            { message: error.message, stack: error.stack }, 
            { phone, operatorEmail: operatorEmail || 'N/A' }
        );

        return { success: false, error: error.message };
    }
}
