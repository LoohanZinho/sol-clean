

'use server';

/**
 * @fileoverview Gerenciador de Ações e Disparo de Webhooks/Notificações.
 * Este arquivo centraliza a lógica para:
 * 1. Salvar, atualizar e apagar configurações de "Ações" (webhooks ou mensagens de WhatsApp).
 * 2. Encontrar e disparar as ações apropriadas quando um evento específico ocorre no sistema
 *    (ex: `appointment_scheduled`, `human_support_requested`).
 * 3. Formatar e enviar os payloads para os endpoints configurados.
 */

import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import type { ActionConfig, WebhookEvent, Conversation } from '@/lib/types';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { z } from 'zod';
import crypto from 'crypto';
import axios from 'axios';
import { Timestamp } from 'firebase-admin/firestore';
import { sendTextMessage } from './evolutionApiActions';
import Handlebars from 'handlebars';

// Garante que o Firebase Admin SDK esteja inicializado.
initializeAdmin();

// Schema Zod para validar a configuração de uma ação.
const ActionConfigSchema = z.object({
    name: z.string(),
    type: z.enum(['webhook', 'whatsapp']),
    event: z.nativeEnum({
        'conversation_created': 'conversation_created',
        'conversation_updated': 'conversation_updated',
        'message_received': 'message_received',
        'message_sent': 'message_sent',
        'human_support_requested': 'human_support_requested',
        'appointment_scheduled': 'appointment_scheduled',
        'appointment_rescheduled_or_canceled': 'appointment_rescheduled_or_canceled',
        'client_info_updated': 'client_info_updated',
        'lead_qualified': 'lead_qualified',
        'ai_knowledge_miss': 'ai_knowledge_miss',
        'conversation_ended_by_ai': 'conversation_ended_by_ai',
        'tag_added': 'tag_added',
        'test_event': 'test_event',
    }),
    isActive: z.boolean(),
    url: z.string().url().optional(),
    secret: z.string().optional(),
    phoneNumber: z.string().optional(),
    messageTemplate: z.string().optional(),
    triggerTags: z.array(z.string()).optional(), // Usado apenas para o evento 'tag_added'.
    createdAt: z.any().optional(), // Permite que o timestamp exista para validação.
});

// Schema para a Server Action que salva a configuração.
const SaveActionConfigSchema = z.object({
    userId: z.string(),
    action: z.enum(['create', 'update', 'delete']),
    configId: z.string().optional(),
    config: ActionConfigSchema.partial().optional(),
});

/**
 * Cria, atualiza ou apaga uma configuração de ação (webhook/notificação de WhatsApp).
 * @param {object} input - Os dados para a operação, validados pelo `SaveActionConfigSchema`.
 * @returns {Promise<{ success: boolean; error?: string }>} O resultado da operação.
 */
export async function saveActionConfig(input: z.infer<typeof SaveActionConfigSchema>): Promise<{ success: boolean; error?: string }> {
    try {
        const { userId, action, configId, config } = SaveActionConfigSchema.parse(input);
        const firestore = getAdminFirestore();
        const actionsRef = firestore.collection('users').doc(userId).collection('actions');

        if (action === 'delete') {
            if (!configId) throw new Error("O ID da configuração é necessário para apagar.");
            await actionsRef.doc(configId).delete();
            await logSystemInfo(userId, 'saveActionConfig', `Ação ${configId} apagada.`, { configId });
            return { success: true };
        }
        
        if (!config) throw new Error("O objeto de configuração é necessário para criar/atualizar.");

        if (action === 'create') {
            const newConfig = { ...config, createdAt: Timestamp.now() };
            if (newConfig.type === 'webhook' && !newConfig.url) throw new Error("A URL é obrigatória para o tipo webhook.");
            if (newConfig.type === 'whatsapp' && (!newConfig.phoneNumber || !newConfig.messageTemplate)) throw new Error("Número de telefone e modelo de mensagem são obrigatórios para o tipo WhatsApp.");
            await actionsRef.add(newConfig);
            await logSystemInfo(userId, 'saveActionConfig', `Ação criada: ${config.name}`, { config });
        } else if (action === 'update') {
            if (!configId) throw new Error("O ID da configuração é necessário para atualizar.");
            const { createdAt, ...updateData } = config; // Exclui `createdAt` para evitar que seja alterado.
            await actionsRef.doc(configId).update(updateData);
            await logSystemInfo(userId, 'saveAction-config', `Ação ${configId} atualizada.`, { configId, config: updateData });
        }

        return { success: true };
    } catch (error: any) {
        console.error("Erro em saveActionConfig:", error);
        await logSystemFailure('system', 'saveActionConfig_failure', { message: error.message, stack: error.stack }, { input });
        return { success: false, error: error.message };
    }
}

/**
 * Envia uma ação de teste para verificar se a configuração está funcionando.
 * @param {object} params - Parâmetros da função.
 * @param {string} params.userId - O ID do usuário.
 * @param {Partial<ActionConfig>} params.config - A configuração a ser testada.
 * @returns {Promise<{ success: boolean; message: string }>} O resultado do teste.
 */
export async function sendTestAction({ userId, config }: { userId: string; config: Partial<ActionConfig> }): Promise<{ success: boolean; message: string }> {
    try {
        const event = config.event || 'test_event';
        // Cria um payload de exemplo com dados de todos os tipos de eventos para teste.
        const payload = {
            event: event,
            timestamp: new Date().toISOString(),
            userId,
            data: {
                message: 'Este é um evento de teste do painel de configuração de ações.',
                clientData: { name: 'Cliente Teste' },
                appointment: { date: '25/12/2024', time: '10:00', serviceName: 'Serviço de Teste' },
                clientQuestion: 'Qual o valor do produto X?',
                tag: config.triggerTags?.[0] || 'TagDeExemplo',
            },
        };

        if (config.type === 'webhook') {
            if (!config.url) return { success: false, message: 'URL não fornecida.' };
            await triggerWebhook(userId, event, payload, { customUrl: config.url, customSecret: config.secret });
            return { success: true, message: "Webhook de teste enviado com sucesso!" };
        } else if (config.type === 'whatsapp') {
            if (!config.phoneNumber || !config.messageTemplate) return { success: false, message: 'Número de telefone e modelo de mensagem não fornecidos.' };
            await triggerWhatsAppMessage(userId, payload, config.phoneNumber, config.messageTemplate);
            return { success: true, message: "Mensagem de teste enviada com sucesso!" };
        }
        
        return { success: false, message: 'Tipo de ação inválido.' };
        
    } catch (error: any) {
        return { success: false, message: `Falha no envio: ${error.message}` };
    }
}

/**
 * Função utilitária para converter recursivamente Timestamps do Firestore em strings ISO.
 * Isso é crucial para evitar erros de serialização ao enviar dados para a API ou webhooks.
 * @param {any} obj - O objeto a ser sanitizado.
 * @returns {any} Um novo objeto com Timestamps convertidos para strings.
 */
function sanitizeTimestamps(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj.hasOwnProperty('seconds') && obj.hasOwnProperty('nanoseconds') && typeof obj.toDate === 'function') {
        return obj.toDate().toISOString();
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeTimestamps);
    }

    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = sanitizeTimestamps(obj[key]);
        }
    }
    return newObj;
}


/**
 * Encontra e dispara todas as ações ativas para um determinado evento.
 * Esta função é o "coração" do sistema de automação.
 * @param {string} userId - O ID do usuário.
 * @param {WebhookEvent} event - O evento que ocorreu (ex: 'appointment_scheduled').
 * @param {any} payloadData - Os dados brutos relacionados ao evento.
 */
export async function findAndTriggerActions(userId: string, event: WebhookEvent, payloadData: any) {
    try {
        const firestore = getAdminFirestore();
        // Busca no Firestore por ações ativas que correspondam ao evento.
        let actionsQuery = firestore.collection('users').doc(userId).collection('actions')
            .where('event', '==', event)
            .where('isActive', '==', true);
        
        const actionsSnap = await actionsQuery.get();

        if (actionsSnap.empty) {
            return; // Nenhuma ação configurada para este evento.
        }

        // Busca os dados completos da conversa para enriquecer o payload.
        let fullClientData: Conversation | null = null;
        if (payloadData.conversationId) {
            const convoRef = firestore.collection('users').doc(userId).collection('conversations').doc(payloadData.conversationId);
            const convoSnap = await convoRef.get();
            if (convoSnap.exists) {
                fullClientData = convoSnap.data() as Conversation;
            }
        }
        
        // Sanitiza o payload para remover Timestamps.
        const sanitizedEventData = sanitizeTimestamps(payloadData);
        const sanitizedClientData = fullClientData ? sanitizeTimestamps(fullClientData) : null;
        
        // Monta o payload completo a ser enviado.
        const fullPayload = {
            event,
            timestamp: new Date().toISOString(),
            userId,
            data: {
                ...sanitizedEventData, // Dados específicos do evento
                clientData: sanitizedClientData, // Dados completos da conversa
            },
        };
        
        // Filtra as ações a serem disparadas (lógica específica para 'tag_added').
        const actionsToTrigger = actionsSnap.docs.filter(doc => {
            const config = doc.data() as ActionConfig;
            // Se o evento é 'tag_added', verifica se a tag específica está na lista de gatilhos.
            if (event === 'tag_added') {
                const addedTag = sanitizedEventData.tag;
                // Se a lista de gatilhos estiver vazia, dispara para qualquer tag.
                if (!config.triggerTags || config.triggerTags.length === 0) {
                    return true; 
                }
                // Caso contrário, verifica se a tag adicionada está na lista (case-insensitive).
                return config.triggerTags.some(t => t.toLowerCase() === addedTag.toLowerCase());
            }
            // Para todos os outros eventos, dispara se a ação for encontrada.
            return true;
        });

        if (actionsToTrigger.length === 0) return;
        
        logSystemInfo(userId, 'findAndTriggerActions', `Encontradas ${actionsToTrigger.length} ações para o evento '${event}'.`, { event, payload: fullPayload });
        
        // Dispara todas as ações em paralelo.
        const triggerPromises = actionsToTrigger.map(doc => {
            const config = doc.data() as ActionConfig;
            if (config.type === 'webhook') {
                return triggerWebhook(userId, event, fullPayload, { config });
            } else if (config.type === 'whatsapp' && config.phoneNumber && config.messageTemplate) {
                return triggerWhatsAppMessage(userId, fullPayload, config.phoneNumber, config.messageTemplate);
            }
            return Promise.resolve(); // Ignora configurações inválidas.
        });
        
        await Promise.allSettled(triggerPromises);

    } catch (error: any) {
        await logSystemFailure(userId, 'findAndTriggerActions_failure', { message: error.message, stack: error.stack }, { event });
    }
}

interface TriggerOptions {
    config?: ActionConfig;
    customUrl?: string;
    customSecret?: string;
}

/**
 * Envia uma única requisição de webhook.
 * @param {string} userId - O ID do usuário.
 * @param {WebhookEvent} event - O evento que disparou o webhook.
 * @param {any} payload - O payload completo a ser enviado.
 * @param {TriggerOptions} options - As opções de configuração (URL, segredo).
 */
async function triggerWebhook(userId: string, event: WebhookEvent, payload: any, options: TriggerOptions) {
    const { config, customUrl, customSecret } = options;
    const url = customUrl || config?.url;
    const secret = customSecret || config?.secret;

    if (!url) {
        await logSystemFailure(userId, 'triggerWebhook_error', { message: "URL do Webhook não encontrada." }, { event });
        return;
    }

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Studio-Webhook-Sender/1.0',
    };

    // Se um segredo for fornecido, cria uma assinatura HMAC-SHA256 e a adiciona ao cabeçalho.
    if (secret) {
        const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
        headers['x-hub-signature-256'] = `sha256=${signature}`;
    }

    try {
        await axios.post(url, body, { headers, timeout: 15000 });
        await logSystemInfo(userId, 'triggerWebhook_success', `Webhook para o evento '${event}' enviado com sucesso para ${url}.`, { event, url });
    } catch (error: any) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        await logSystemFailure(userId, 'triggerWebhook_failure', { message: `Falha ao enviar webhook para ${url}: ${errorMessage}`, stack: error.stack }, { event, url });
        throw new Error(`Falha ao enviar webhook para ${url}: ${errorMessage}`);
    }
}

/**
 * Envia uma única mensagem de WhatsApp baseada em um modelo Handlebars.
 * @param {string} userId - O ID do usuário.
 * @param {any} payload - O payload do evento, usado para preencher o modelo.
 * @param {string} phoneNumber - O número de destino.
 * @param {string} messageTemplate - O modelo Handlebars da mensagem.
 */
async function triggerWhatsAppMessage(userId: string, payload: any, phoneNumber: string, messageTemplate: string) {
    try {
        const firestore = getAdminFirestore();
        const userDoc = await firestore.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error(`Usuário ${userId} não encontrado para enviar notificação por WhatsApp.`);
        }
        const userEmail = userDoc.data()?.email;
        if (!userEmail) {
            throw new Error(`Email do usuário ${userId} não encontrado.`);
        }

        // Compila o modelo Handlebars e preenche com os dados do payload.
        const template = Handlebars.compile(messageTemplate, { noEscape: true });
        const formattedMessage = template(payload);

        await sendTextMessage({
            userId,
            phone: phoneNumber,
            message: formattedMessage,
            instanceName: userEmail,
            saveToHistory: false, // Não salva essas notificações no histórico de nenhuma conversa.
            source: 'system',
        });
        await logSystemInfo(userId, 'triggerWhatsAppMessage_success', `Mensagem de WhatsApp para o evento '${payload.event}' enviada para ${phoneNumber}.`, { event: payload.event, phoneNumber });

    } catch (error: any) {
        await logSystemFailure(userId, 'triggerWhatsAppMessage_failure', { message: `Falha ao enviar mensagem de WhatsApp para ${phoneNumber}: ${error.message}`, stack: error.stack }, { event: payload.event, phoneNumber });
        throw new Error(`Falha ao enviar mensagem de WhatsApp para ${phoneNumber}: ${error.message}`);
    }
}
