

// src/app/api/webhook/route.ts

/**
 * @fileoverview Este é o endpoint central que recebe todos os eventos da Evolution API.
 * Focado exclusivamente no evento `messages.upsert` para processar novas mensagens.
 * A lógica foi simplificada para ser mais robusta, com validações explícitas e
 * tratamento de erros para evitar quebras inesperadas.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { AppMessage, Conversation, AutomationSettings } from '@/lib/types';
import { z } from 'zod';
import { logSystemFailure, logSystemInfo, logWebhookCall } from '@/ai/flows/system-log-helpers';
import { processConversationV2 } from '@/ai/flows/process-conversations-v2';
import { transcribeAudio } from '@/ai/flows/transcribe-audio';
import { getProfilePictureUrl, sendTextMessage } from '@/actions/evolutionApiActions';
import { v4 as uuidv4 } from 'uuid';
import { isBusinessOpen } from '@/ai/flows/helpers';
import { findAndTriggerActions } from '@/actions/webhookSender';

// Inicializa o SDK do Firebase Admin para operações de backend.
initializeAdmin();

// --- Zod Schemas para validação de payload ---
const messageKeySchema = z.object({
  remoteJid: z.string().optional(),
  fromMe: z.boolean(),
  id: z.string().min(1, "id não pode estar vazio."),
}).passthrough();

const receivedMessageSchema = z.object({
  conversation: z.string().optional(),
  extendedTextMessage: z.object({ text: z.string() }).optional(),
  imageMessage: z.object({ url: z.string().url().optional(), caption: z.string().optional(), mimetype: z.string().optional() }).passthrough().optional(),
  videoMessage: z.object({ url: z.string().url().optional(), caption: z.string().optional(), mimetype: z.string().optional() }).passthrough().optional(),
  audioMessage: z.object({ url: z.string().optional(), mimetype: z.string().optional(), seconds: z.number().optional() }).passthrough().optional(),
  base64: z.string().optional(),
}).passthrough();

const evolutionWebhookPayloadSchema = z.object({
  instance: z.string(),
  event: z.string(),
  data: z.object({
      key: messageKeySchema.optional(),
      pushName: z.string().optional(),
      message: receivedMessageSchema.nullable().optional(),
      status: z.string().optional(),
      messageTimestamp: z.number().optional(), // Captura o timestamp da mensagem
  }).passthrough(),
}).passthrough();

// --- Debounce Timer para agrupamento de mensagens ---
const debounceTimers = new Map<string, NodeJS.Timeout>();
type MessageMediaType = 'image' | 'video' | 'audio' | 'document';

// --- Funções Auxiliares ---
/**
 * Extrai o ID da conversa (número de telefone) do `remoteJid`.
 * @param {unknown} remoteJid - O campo `remoteJid` do webhook.
 * @returns {string | null} O número de telefone ou nulo se inválido.
 */
function getConversationIdFromRemoteJid(remoteJid: unknown): string | null {
    if (typeof remoteJid !== 'string' || !remoteJid || !remoteJid.includes('@')) {
        return null;
    }
    try {
        const parts = remoteJid.split('@');
        return parts[0] || null;
    } catch (error) {
        console.error('Erro crítico ao processar remoteJid:', error, { remoteJid });
        return null;
    }
}

/**
 * Faz o upload de um arquivo em Base64 para o Firebase Storage.
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {string} base64Data - O dado em formato Data URI.
 * @returns {Promise<string>} A URL pública do arquivo salvo.
 */
async function uploadMediaToStorage(userId: string, conversationId: string, base64Data: string): Promise<string> {
    if (typeof base64Data !== 'string' || !base64Data.startsWith('data:')) {
        throw new Error('Formato de string Base64 inválido ou mime type ausente.');
    }

    const bucket = getStorage().bucket();
    const matches = base64Data.match(/^data:(.*);base64,(.*)$/);
    if (!matches || matches.length < 3) {
        throw new Error('Formato de string Base64 inválido.');
    }

    const mimeType = matches[1];
    const data = matches[2];

    if (!data) {
        throw new Error('Payload Base64 ausente.');
    }
    
    const mimeParts = mimeType.split('/');
    const fileExtension = mimeParts[1] ? mimeParts[1].split(';')[0] : 'bin';
    
    const buffer = Buffer.from(data, 'base64');
    const fileName = `users/${userId}/conversations/${conversationId}/media/${uuidv4()}.${fileExtension}`;
    const file = bucket.file(fileName);

    await file.save(buffer, { metadata: { contentType: mimeType } });
    await file.makePublic();
    return file.publicUrl();
}

/**
 * Obtém o ID do usuário a partir dos parâmetros da URL da requisição.
 * @param {NextRequest} request - A requisição recebida.
 * @returns {Promise<string | null>} O ID do usuário.
 */
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
    const { searchParams } = new URL(request.url);
    return searchParams.get('userId');
}

/**
 * Extrai as informações relevantes de um objeto de mensagem do webhook.
 * @param {object} messageData - O objeto `message` do payload.
 * @returns {{ text: string; mediaType?: MessageMediaType; duration?: string; mimetype?: string, base64?: string }} As informações extraídas.
 */
function getMessageInfo(messageData: z.infer<typeof receivedMessageSchema> | undefined | null): { text: string; mediaType?: MessageMediaType; duration?: string; mimetype?: string, base64?: string } {
    if (!messageData) return { text: 'Mensagem vazia', mimetype: 'text/plain' };
    
    const base64 = messageData.base64;

    if (messageData.conversation) return { text: messageData.conversation, base64, mimetype: 'text/plain' };
    if (messageData.extendedTextMessage?.text) return { text: messageData.extendedTextMessage.text, base64, mimetype: 'text/plain' };
    if (messageData.imageMessage) return { text: messageData.imageMessage.caption || 'Imagem', mediaType: 'image', mimetype: messageData.imageMessage.mimetype, base64 };
    if (messageData.videoMessage) return { text: messageData.videoMessage.caption || 'Vídeo', mediaType: 'video', mimetype: messageData.videoMessage.mimetype, base64 };
    if (messageData.audioMessage) {
        const seconds = messageData.audioMessage.seconds;
        const durationStr = seconds ? `0:${String(seconds).padStart(2, '0')}` : undefined;
        return { text: 'Áudio', mediaType: 'audio', duration: durationStr, mimetype: messageData.audioMessage.mimetype, base64 };
    }
    return { text: 'Nova mensagem de mídia', base64, mimetype: 'application/octet-stream' };
}

/**
 * Adiciona uma mensagem à fila de processamento da IA e gerencia o debounce.
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {AppMessage} messageToProcess - A mensagem a ser processada.
 */
async function triggerAiFlow(userId: string, conversationId: string, messageToProcess: AppMessage) {
    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
    
    const settingsSnap = await adminFirestore.collection('users').doc(userId).collection('settings').doc('automation').get();
    const automationSettings = (settingsSnap.data() || {}) as AutomationSettings;
        
    await conversationRef.update({ 
      pendingMessages: FieldValue.arrayUnion(messageToProcess),
      pendingProcessingAt: Timestamp.now(), 
    });
    
    await logSystemInfo(userId, 'triggerAiFlow_enfileirada', `Mensagem adicionada à fila de processamento.`, { conversationId });

    // The core function that reads the queue and starts the AI flow.
    const processPendingMessages = async () => {
        const convoSnap = await conversationRef.get();
        if (!convoSnap.exists) return;

        const conversation = convoSnap.data() as Conversation;
        if (!conversation.pendingMessages || conversation.pendingMessages.length === 0) {
            logSystemInfo(userId, 'processPendingMessages_no_messages', `Fila de processamento estava vazia. Nenhuma ação tomada.`, { conversationId });
            return;
        }

        // Atomically read and clear the pending messages
        const messagesToProcessNow = [...conversation.pendingMessages];
        await conversationRef.update({ pendingMessages: [] });
        
        logSystemInfo(userId, 'processPendingMessages_start', `Iniciando processamento da IA com ${messagesToProcessNow.length} mensagem(ns).`, { conversationId, count: messagesToProcessNow.length });

        processConversationV2({ userId, conversation, messagesToProcess: messagesToProcessNow });
    };

    if (automationSettings.isMessageGroupingEnabled) {
        // Clear any existing timer to reset the debounce window
        if (debounceTimers.has(conversationId)) {
            clearTimeout(debounceTimers.get(conversationId));
        }

        const intervalSeconds = automationSettings.messageGroupingInterval || 10;
        await logSystemInfo(userId, 'triggerAiFlow_timer_iniciado', `Timer de agrupamento iniciado: ${intervalSeconds} segundos.`, { conversationId, interval: intervalSeconds });

        // Set a new timer
        debounceTimers.set(conversationId, setTimeout(async () => {
            logSystemInfo(userId, 'triggerAiFlow_timer_finalizado', `Timer finalizado. Disparando fluxo da IA.`, { conversationId });
            await processPendingMessages();
            debounceTimers.delete(conversationId);
        }, intervalSeconds * 1000));
    } else {
        // If grouping is disabled, process immediately
        await logSystemInfo(userId, 'triggerAiFlow_execucao_imediata', `Agrupamento desativado. Disparando fluxo da IA imediatamente.`, { conversationId });
        await processPendingMessages();
    }
}


/**
 * Manipula mensagens enviadas PELO BOT (eco), tratando-as como intervenção de operador.
 * @param {string} userId - ID do usuário.
 * @param {object} payload - O payload do webhook.
 */
async function handleSentMessage(userId: string, payload: z.infer<typeof evolutionWebhookPayloadSchema>) {
    if (!payload.data?.key?.id || typeof payload.data.key.remoteJid !== 'string') {
        await logWebhookCall(userId, 'evolution', 'ignorado_chave_invalida_enviada', payload, `ID da mensagem ou remoteJid ausente em mensagem enviada.`);
        return;
    }

    const { remoteJid, id: messageId } = payload.data.key;
    const conversationId = getConversationIdFromRemoteJid(remoteJid);
    if (!conversationId) {
        await logWebhookCall(userId, 'evolution', 'ignorado_jid_invalido_enviada', payload, `Não foi possível extrair o ID da conversa de mensagem enviada.`);
        return;
    }
    
    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const messageRef = conversationRef.collection('messages').doc(messageId);
    
    // Any "fromMe: true" message that generates a webhook is treated as an operator intervention from an external source.
    const { text, mediaType, duration, mimetype } = getMessageInfo(payload.data.message);
    const messageTimestampSeconds = payload.data.messageTimestamp;
    const messageDate = messageTimestampSeconds ? new Date(messageTimestampSeconds * 1000) : new Date();

    const messageData: AppMessage = {
        id: messageId,
        from: 'agent',
        source: 'operator', // Crucially, mark this as from an operator.
        text: text,
        type: mediaType ? 'media' : 'chat',
        status: 'delivered',
        timestamp: Timestamp.fromDate(messageDate),
        apiPayload: payload,
        mediaType: mediaType || null,
        mimetype: mimetype || null,
        duration: duration || null,
    };

    const batch = adminFirestore.batch();
    batch.set(messageRef, messageData, { merge: true }); // Use merge to avoid overwriting if it somehow exists
    
    // Deactivate AI and update last message preview
    const conversationUpdate: Partial<Conversation> = {
        isAiActive: false,
        lastMessage: `Você: ${text}`,
        updatedAt: Timestamp.now(),
        lastMessageMediaType: mediaType || null,
        lastMessageDuration: duration || null,
    };
    batch.set(conversationRef, conversationUpdate, { merge: true });

    // Add a system message to indicate AI deactivation
    const systemMessageRef = conversationRef.collection('messages').doc();
    batch.set(systemMessageRef, {
        text: "IA Desativada: Mensagem de operador detectada via WhatsApp externo",
        from: 'agent',
        source: 'system',
        type: 'system',
        timestamp: Timestamp.now(),
    });
    
    await batch.commit();

    logSystemInfo(userId, 'handleSentMessage_operator_intervention', `IA desativada para ${conversationId} devido a mensagem externa do operador.`, { conversationId });
}


/**
 * Manipula mensagens recebidas DO CLIENTE, salva no DB e aciona a IA.
 * @param {string} userId - ID do usuário.
 * @param {object} payload - O payload do webhook.
 */
async function handleReceivedMessage(userId: string, payload: z.infer<typeof evolutionWebhookPayloadSchema>) {
    if (!payload.data?.key?.id || typeof payload.data.key.remoteJid !== 'string') {
        await logWebhookCall(userId, 'evolution', 'ignorado_chave_invalida_recebida', payload, `ID da mensagem ou remoteJid ausente.`);
        return;
    }

    const { remoteJid, id: messageId } = payload.data.key;
    
    // Explicitly ignore messages from groups
    if (remoteJid.endsWith('@g.us')) {
        await logWebhookCall(userId, 'evolution', 'ignorado_mensagem_de_grupo', payload, 'Mensagem de grupo ignorada.');
        return;
    }

    const conversationId = getConversationIdFromRemoteJid(remoteJid);
    if (!conversationId) {
        await logWebhookCall(userId, 'evolution', 'ignorado_jid_invalido_recebida', payload, `Não foi possível extrair o ID da conversa do remoteJid: '${remoteJid}'.`);
        return;
    }
    
    const messageTimestampSeconds = payload.data.messageTimestamp;
    const messageDate = messageTimestampSeconds ? new Date(messageTimestampSeconds * 1000) : new Date();

    const { text, mediaType, duration, mimetype, base64: rawMediaBase64 } = getMessageInfo(payload.data.message);
    
    let lastMessageText = text;
    if (mediaType === 'audio') lastMessageText = '🎤 Áudio' + (duration ? ` (${duration})` : '');
    else if (mediaType === 'image') lastMessageText = '📷 Imagem' + (text && text !== 'Imagem' ? `: ${text}` : '');
    else if (mediaType) lastMessageText = `[${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}] ${text || ''}`;
    
    const adminFirestore = getAdminFirestore();
    const userDoc = await adminFirestore.collection('users').doc(userId).get();
    const userEmail = userDoc.data()?.email;
    if (!userEmail) {
        logSystemFailure(userId, 'webhook_user_email_not_found', { message: `Email do usuário ${userId} não encontrado para ser usado como instanceName.`}, { conversationId });
        return;
    }

    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
    const messageRef = conversationRef.collection('messages').doc(messageId);

    const messageData: AppMessage = {
        id: messageId,
        from: 'user',
        text: text,
        type: mediaType ? 'media' : 'chat',
        apiPayload: payload,
        mediaUrl: null,
        mediaType: mediaType || null,
        mimetype: mimetype || null,
        timestamp: Timestamp.fromDate(messageDate),
        transcriptionStatus: mediaType === 'audio' ? 'pending' : null,
        duration: duration || null,
    };
    
    const conversationSnap = await conversationRef.get();
    const conversationData = conversationSnap.data() as Conversation | undefined;
    
    const conversationUpdateData: Partial<Conversation> = {
        id: conversationId,
        name: payload.data.pushName || conversationId,
        updatedAt: Timestamp.now(),
        lastMessage: lastMessageText,
        lastMessageMediaType: mediaType || null,
        lastMessageDuration: duration || null,
        unreadCount: FieldValue.increment(1) as any,
    };

    if (!conversationSnap.exists) {
        conversationUpdateData.createdAt = Timestamp.now();
        conversationUpdateData.folder = 'inbox';
        conversationUpdateData.isAiActive = true;
        
        getProfilePictureUrl(userId, conversationId, userEmail).then(picUrl => {
            if (picUrl) {
                conversationRef.set({ profilePicUrl: picUrl }, { merge: true }).catch(err => {
                     logSystemFailure(userId, 'webhook_atualizacao_foto_falhou', { message: err.message }, { conversationId });
                });
            }
        });
        
        findAndTriggerActions(userId, 'conversation_created', {
            conversationId,
            clientData: conversationUpdateData,
            triggeringMessage: messageData,
        });

    } else {
        if (conversationData?.folder === 'archived') {
            conversationUpdateData.folder = 'inbox';
        }
        
        findAndTriggerActions(userId, 'conversation_updated', {
            conversationId,
            clientData: { ...conversationData, ...conversationUpdateData },
            triggeringMessage: messageData,
        });
    }
    
    let mediaBase64: string | null = null;
    let storageUrl: string | null = null;

    if (mediaType && rawMediaBase64) {
        try {
            const dataUri = rawMediaBase64.startsWith('data:') ? rawMediaBase64 : (mimetype ? `data:${mimetype};base64,${rawMediaBase64}` : null);
            if (dataUri) {
                mediaBase64 = dataUri;
                storageUrl = await uploadMediaToStorage(userId, conversationId, mediaBase64);
                messageData.mediaUrl = storageUrl;
            } else {
                 throw new Error("Não foi possível construir o Data URI para a mídia.");
            }
        } catch (storageError: any) {
            logSystemFailure(userId, `webhook_salvar_${mediaType}_falhou`, { message: `Falha ao salvar ${mediaType} no Storage: ${storageError.message}`, stack: storageError.stack }, { conversationId });
            if(mediaType === 'audio') {
                messageData.transcription = '[Falha: Não foi possível salvar o áudio]';
                messageData.transcriptionStatus = 'failed';
            }
        }
    }
    
    if (mediaType === 'image' && mediaBase64) {
        messageData.imageDataUri = mediaBase64;
    }

    const batch = adminFirestore.batch();
    batch.set(conversationRef, conversationUpdateData, { merge: true });
    batch.set(messageRef, messageData);
    await batch.commit();

    findAndTriggerActions(userId, 'message_received', {
        conversationId,
        message: messageData,
    });

    let messageToProcess: AppMessage = messageData;

    if (mediaType === 'audio' && mediaBase64 && messageData.transcriptionStatus !== 'failed') {
         const transcriptionResult = await transcribeAudio({ userId, conversationId, messageId, audioData: mediaBase64 });
         
         if (transcriptionResult.transcription !== null) {
             await messageRef.update({ transcription: transcriptionResult.transcription, transcriptionStatus: 'success' });
             const updatedMessageSnap = await messageRef.get();
             messageToProcess = updatedMessageSnap.data() as AppMessage;
         } else {
             await messageRef.update({ transcriptionStatus: 'failed' });
         }
    }
    
    const currentConversationSnap = await conversationRef.get();
    const currentConversation = currentConversationSnap.data() as Conversation | undefined;
    
    if (!currentConversation) {
        logSystemFailure(userId, 'webhook_conversa_desapareceu', { message: `A conversa ${conversationId} não foi encontrada logo após ser criada/atualizada.`}, { conversationId });
        return;
    }

    if (currentConversation.isAiActive === false) {
        await logSystemInfo(userId, 'webhook_ignorar_resposta_ia', `Fluxo de resposta da IA pulado para a conversa ${conversationId} pois está desativada.`, { conversationId });
        return;
    }
    
    const settingsSnap = await adminFirestore.collection('users').doc(userId).collection('settings').doc('automation').get();
    const automationSettings = (settingsSnap.data() || {}) as AutomationSettings;

    if (automationSettings.isBusinessHoursEnabled) {
        await logSystemInfo(userId, 'webhook_business_hours_check_start', `Iniciando checagem de horário de funcionamento para a mensagem.`, { conversationId, messageTimestamp: messageDate.toISOString() });
        const businessIsOpen = await isBusinessOpen(userId, messageDate);
        if (!businessIsOpen) {
            await logSystemInfo(userId, 'webhook_business_hours_closed', `Fora do horário de funcionamento. Processamento da IA interrompido.`, { conversationId });
            if (automationSettings.sendOutOfHoursMessage && automationSettings.outOfHoursMessage) {
                await logSystemInfo(userId, 'webhook_sending_out_of_hours_message', `Enviando mensagem de fora de expediente.`, { conversationId });
                await sendTextMessage({ userId, phone: conversationId, message: automationSettings.outOfHoursMessage, instanceName: userEmail, source: 'ai' });
            }
            return; 
        } else {
            await logSystemInfo(userId, 'webhook_business_hours_open', `Dentro do horário de funcionamento. O processamento da IA continuará.`, { conversationId });
        }
    }
    
    if (messageToProcess.text || messageToProcess.transcription || messageToProcess.mediaType === 'image') {
        await triggerAiFlow(userId, conversationId, messageToProcess);
    } else {
        await logSystemInfo(userId, 'webhook_sem_conteudo_para_ia', `Mensagem ${messageId} não possui conteúdo de texto, transcrição ou imagem para a IA processar.`, { conversationId });
    }
}

/**
 * @name POST
 * @description O handler principal do webhook.
 * Recebe a requisição, valida o `userId`, e dispara o processamento assíncrono.
 * @param {NextRequest} request - O objeto da requisição Next.js.
 * @returns {NextResponse} Uma resposta imediata de `200 OK` enquanto o processamento ocorre em segundo plano.
 */
export async function POST(request: NextRequest) {
    const userId = await getUserIdFromRequest(request);
    let payload;
    let rawRequestBody = '';

    try {
        rawRequestBody = await request.text();
        if (!userId) {
            console.error("CRÍTICO: Webhook recebido sem um userId no parâmetro da URL.");
            await logSystemFailure('unknown_user', 'webhook_sem_userId', { message: 'Webhook recebido sem um userId.' }, { requestUrl: request.url, headers: Object.fromEntries(request.headers), rawBody: rawRequestBody });
            return NextResponse.json({ message: 'Requisição inválida: userId ausente' }, { status: 400 });
        }
    
        try {
            payload = JSON.parse(rawRequestBody);
        } catch (e) {
            await logWebhookCall(userId, 'evolution', 'erro_parse_body', { rawBody: rawRequestBody }, 'Corpo da requisição não é um JSON válido');
            return NextResponse.json({ message: 'Corpo da requisição não é um JSON válido' }, { status: 400 });
        }
        
        // Responde imediatamente com 200 OK para a API.
        const response = NextResponse.json({ message: 'Webhook recebido' }, { status: 200 });
        
        // Dispara o processamento real da mensagem em segundo plano (fire-and-forget).
        (async () => {
            try {
                // Default to Evolution API
                const validationResult = evolutionWebhookPayloadSchema.safeParse(payload);
                if (!validationResult.success) {
                    await logWebhookCall(userId, 'evolution', 'erro_payload_invalido', payload, JSON.stringify(validationResult.error.flatten().fieldErrors));
                    return;
                }

                const validatedPayload = validationResult.data;
                const { event, data } = validatedPayload;
                
                // Roteador de Eventos: Apenas o evento 'messages.upsert' é processado.
                if (event === 'messages.upsert') {
                    const fromMe = data.key?.fromMe === true;

                    if (fromMe) {
                        // Se a mensagem foi enviada pelo bot, apenas atualiza o status.
                        await logWebhookCall(userId, 'evolution', 'recebida_mensagem_enviada', payload, null);
                        await handleSentMessage(userId, validatedPayload);
                    } else if (data.message) {
                        // Se a mensagem foi recebida do cliente, processa para a IA.
                        await logWebhookCall(userId, 'evolution', 'recebida_nova_mensagem', payload, null);
                        await handleReceivedMessage(userId, validatedPayload);
                    } else if (data.status) {
                        await logWebhookCall(userId, 'evolution', 'recebida_atualizacao_status', payload, null);
                    } else {
                        await logWebhookCall(userId, 'evolution', `ignorado_upsert_desconhecido`, payload, `Evento 'messages.upsert' sem 'message' ou 'status' não é tratado.`);
                    }
                } else {
                    // Qualquer outro evento é ignorado.
                    await logWebhookCall(userId, 'evolution', `ignorado_evento_nao_tratado`, payload, `Tipo de evento '${event}' não é tratado.`);
                }

            } catch (error: any) {
                const conversationId = getConversationIdFromRemoteJid(payload?.data?.key?.remoteJid) || 'desconhecido';
                await logSystemFailure(
                    userId, 
                    'webhook_erro_assincrono', 
                    { message: `Erro não tratado no processamento assíncrono do webhook: ${error.message}`, stack: (error as any).stack || 'N/A' }, 
                    { 
                        conversationId, 
                        payload: payload,
                    }
                );
            }
        })();
        
        return response;
    } catch (outerError: any) {
        const errorContext: any = {
            requestUrl: request.url,
            headers: Object.fromEntries(request.headers),
        };
        if (rawRequestBody) {
            errorContext.rawBody = rawRequestBody;
        }
        await logSystemFailure(
            userId || 'unknown_user_at_outer_catch', 
            'webhook_erro_critico', 
            { message: `Erro crítico não tratado na entrada do webhook!: ${outerError.message}`, stack: outerError.stack || 'N/A' },
            errorContext
        );
        return NextResponse.json({ message: 'Erro Interno do Servidor' }, { status: 500 });
    }
}

    