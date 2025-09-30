
'use server';

import { getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { AutomationSettings } from '@/lib/types';


export async function shouldLogInfo(userId: string): Promise<boolean> {
    try {
        const docRef = getAdminFirestore().collection('users').doc(userId).collection('settings').doc('automation');
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const settings = docSnap.data() as AutomationSettings;
            return settings.isDevModeEnabled === true;
        }
    } catch (error) {
        // Fallback in case of error reading settings
        console.error("Critical: Could not read automation settings to determine logging level.", error);
    }
    return false; // Por padrão, não registrar informações se as configurações não existirem ou falharem.
}


async function logToSystem(userId: string, component: string, level: 'error' | 'info', details: any, context: object) {
    // Para logs de nível 'info', verifica se o modo dev está habilitado antes de prosseguir.
    if (level === 'info') {
        const canLogInfo = await shouldLogInfo(userId);
        if (!canLogInfo) {
            return; // Suprime o log de informação.
        }
    }
    
    const logsRef = getAdminFirestore().collection('users').doc(userId).collection('system_logs');
    try {
        const logEntry: any = {
            component,
            level,
            context,
            timestamp: Timestamp.now(),
        };

        if (level === 'error') {
            logEntry.error = {
                message: details.message,
                stack: details.stack,
                details: details.details || 'Sem detalhes adicionais',
            };
        } else {
            logEntry.message = details.message;
        }

        await logsRef.add(logEntry);
    } catch (logError: any) {
        // Este é o único lugar onde DEVEMOS usar console.error, pois é o último recurso.
        console.error("CRÍTICO: Falha ao escrever em system_logs.", {
            originalError: details,
            loggingError: logError.message,
        });
    }
}

export async function logSystemFailure(userId: string, component: string, errorDetails: any, context: object = {}) {
    await logToSystem(userId, component, 'error', errorDetails, context);
}

export async function logSystemInfo(userId: string, component: string, message: string, context: object = {}) {
    await logToSystem(userId, component, 'info', { message }, context);
}


/**
 * Salva um registro detalhado de uma interação com a IA no Firestore.
 * Esta função é a "caixa-preta" para depuração, capturando exatamente o que a IA
 * recebeu como entrada e o que ela produziu como saída.
 * @param userId O ID do usuário proprietário do log.
 * @param flow Uma string que identifica o fluxo ou o tipo de interação (ex: 'heuristic_agent_executed').
 * @param promptData Um objeto contendo o `system` prompt e o `prompt` da conversa enviados à IA.
 * @param response O objeto de resposta completo (geralmente JSON) retornado pela IA.
 * @param context Informações adicionais sobre o contexto da chamada (ex: ID da conversa).
 * @param modelName O nome do modelo de IA que foi usado na geração.
 * @param error Qualquer erro que tenha ocorrido durante o processo (opcional).
 */
export async function logAiResponse(
    userId: string, 
    flow: string, 
    promptData: { system?: string; prompt: any; }, 
    response: any,
    context: object, 
    modelName: string, 
    error: any = null
) {
    // AI logs are critical and should always be saved, regardless of dev mode.
    const logsRef = getAdminFirestore().collection('users').doc(userId).collection('ai_logs');
    try {
        const logData: any = {
            flow,
            prompt: promptData.prompt,
            systemPrompt: promptData.system,
            response,
            context,
            modelName,
            error,
            timestamp: Timestamp.now(),
        };

        if (flow.startsWith('heuristic_') && typeof response === 'object' && response !== null) {
            logData.reasoning = response.reasoning;
            logData.responseText = response.response_to_client;
            logData.toolRequests = response.tool_request ? [response.tool_request] : [];
        }

        await logsRef.add(logData);
    } catch (logError) {
        console.error("CRÍTICO: Falha ao escrever em ai_logs.", logError);
    }
}


export async function logWebhookCall(userId: string, source: 'evolution' | 'mercadopago' | 'google', status: string, payload: any, error: string | null = null) {
    if (!userId) {
        console.error("logWebhookCall invocado sem um userId.");
        return;
    }
    const logsRef = getAdminFirestore().collection('users').doc(userId).collection('webhook_logs');
    try {
        await logsRef.add({
            source,
            status,
            payload,
            error,
            receivedAt: Timestamp.now(),
        });
    } catch (logError) {
        // Log de fallback.
        console.error("CRÍTICO: Falha ao escrever em webhook_logs.", logError);
    }
}

    

    