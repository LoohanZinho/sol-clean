

'use server';

/**
 * @fileOverview Cliente da Evolution API para enviar mensagens de WhatsApp.
 * Este arquivo abstrai as chamadas para a Evolution API, tratando da autenticação,
 * construção do corpo da requisição, envio e tratamento de erros, incluindo um sistema
 * de retentativas para falhas de rede.
 */
import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { Timestamp } from 'firebase-admin/firestore';
import type { AppMessage, Conversation } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';

// Garante que o SDK do Firebase Admin seja inicializado.
initializeAdmin();

/**
 * Função utilitária para criar um atraso (delay) em milissegundos.
 * @param {number} ms - O tempo de atraso em milissegundos.
 * @returns {Promise<void>} Uma promessa que resolve após o tempo especificado.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Interface para o resultado de uma operação de envio da Evolution API.
 * @property {boolean} success - Se a operação foi bem-sucedida.
 * @property {string} [messageId] - O ID da mensagem, se o envio foi bem-sucedido.
 * @property {any} [apiResponse] - A resposta bruta da API.
 * @property {string} [error] - A mensagem de erro, se a operação falhou.
 */
interface EvolutionApiSendResult {
    success: boolean;
    messageId?: string;
    apiResponse?: any;
    error?: string;
}

/**
 * Verifica se um erro de rede é "retryable" (pode ser tentado novamente).
 * @param {any} error - O objeto de erro.
 * @returns {boolean} `true` se o erro for de rede ou um erro de servidor (5xx), `false` caso contrário.
 */
function isRetryableError(error: any): boolean {
    if (!error) return false;
    // Erros de Axios (biblioteca HTTP)
    if (error.isAxiosError) {
        const axiosError = error as AxiosError;
        // Erros de conexão de rede
        if (
            axiosError.code &&
            ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED'].includes(axiosError.code)
        ) {
            return true;
        }
        // Mensagens de erro de socket
        if (axiosError.message && (axiosError.message.toLowerCase().includes('socket hang up') || axiosError.message.toLowerCase().includes('socket disconnected'))) {
            return true;
        }
        // Erros de servidor (5xx)
        if (axiosError.response && axiosError.response.status >= 500) {
            return true;
        }
    }
    // Erro genérico de fetch que pode ocorrer em alguns ambientes
    if (error.message && error.message.toLowerCase().includes('fetch failed')) {
        return true;
    }
    return false;
}

interface AxiosWithRetryResult {
    data: any;
    status: number;
    request: {
        method: string;
        url: string;
        headers: any;
        data?: any;
    };
    responseHeaders: any;
}


async function axiosWithRetry(url: string, options: AxiosRequestConfig, retries = 4): Promise<AxiosWithRetryResult> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios({
                url,
                method: options.method || 'GET',
                headers: options.headers,
                data: options.data,
                timeout: 25000, 
            });
            return {
                data: response.data,
                status: response.status,
                request: {
                    method: (response.config.method || 'GET').toUpperCase(),
                    url: response.config.url || url,
                    headers: response.config.headers,
                    data: response.config.data ? JSON.parse(response.config.data) : undefined,
                },
                responseHeaders: response.headers,
            };
        } catch (error: any) {
            lastError = error;
            if (isRetryableError(error)) {
                if (attempt < retries) {
                    await delay(3000); // Espera 3 segundos antes de tentar novamente
                }
            } else {
                if (error.isAxiosError) {
                    const axiosError = error as AxiosError;
                     if (axiosError.response) {
                        const errorBody = axiosError.response.data || axiosError.message;
                        const errorToThrow = new Error(`Erro do Cliente da API: ${axiosError.response.status} - ${JSON.stringify(errorBody)}`);
                        (errorToThrow as any).response = {
                            status: axiosError.response.status,
                            data: errorBody,
                            request: {
                                method: (axiosError.config?.method || 'GET').toUpperCase(),
                                url: axiosError.config?.url || url,
                                headers: axiosError.config?.headers,
                                data: axiosError.config?.data ? JSON.parse(axiosError.config.data) : undefined,
                            }
                        };
                        throw errorToThrow;
                    } else {
                        throw new Error(`Erro de Rede do Cliente da API: ${axiosError.message}`);
                    }
                }
                throw lastError;
            }
        }
    }
    throw new Error(`A requisição para a URL ${url} falhou após ${retries} tentativas. Último erro: ${lastError?.message}`);
}



async function getUserEvolutionApiCredentials(userId: string): Promise<{ apiUrl: string; apiKey: string; instanceName: string } | null> {
    const adminFirestore = getAdminFirestore();
    const docRef = adminFirestore.collection('users').doc(userId).collection('settings').doc('evolutionApiCredentials');
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.apiUrl && data.apiKey && data.instanceName) {
            return {
                apiUrl: data.apiUrl,
                apiKey: data.apiKey,
                instanceName: data.instanceName,
            };
        }
    }
    return null;
}

export async function getGlobalEvolutionCredentials(): Promise<{ apiUrl: string; apiKey: string } | null> {
    const firestore = getAdminFirestore();
    const docRef = firestore.collection('system_settings').doc('evolutionApi');
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.apiUrl && data.apiKey) {
            return {
                apiUrl: data.apiUrl,
                apiKey: data.apiKey,
            };
        }
    }
    return null;
}

export async function checkInstanceConnectionState(instanceName: string, userId: string): Promise<{ state: 'open' | 'close' | 'connecting' | 'ERROR', error?: string }> {
    try {
        const globalCredentials = await getGlobalEvolutionCredentials();
        if (!globalCredentials) throw new Error('Credenciais globais da Evolution API não estão configuradas.');

        const { apiUrl, apiKey } = globalCredentials;
        const url = `${apiUrl.replace(/\/$/, '')}/instance/connectionState/${instanceName}`;
        
        const { data } = await axios.get(url, { headers: { 'apikey': apiKey }});

        return { state: data.instance.state };
    } catch (error: any) {
        let errorMessage = 'Falha ao verificar o estado da instância.';
        if (axios.isAxiosError(error) && error.response?.data) {
             errorMessage = JSON.stringify(error.response.data, null, 2);
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        await logSystemFailure(userId, 'checkInstanceConnectionState_failure', { message: errorMessage, stack: (error as any).stack }, { instanceName });
        return { state: 'ERROR', error: errorMessage };
    }
}

export async function fetchAndSaveInstanceApiKey(userId: string, instanceName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const globalCredentials = await getGlobalEvolutionCredentials();
        if (!globalCredentials) throw new Error('Credenciais globais da Evolution API não estão configuradas.');

        const { apiUrl, apiKey: globalApiKey } = globalCredentials;
        
        const fetchUrl = `${apiUrl.replace(/\/$/, '')}/instance/fetchInstances?instanceName=${instanceName}`;
        const { data: instanceDetails } = await axios.get(fetchUrl, { headers: { 'apikey': globalApiKey } });

        if (instanceDetails && instanceDetails.apikey) {
            const firestore = getAdminFirestore();
            const userCredentialsRef = firestore.collection('users').doc(userId).collection('settings').doc('evolutionApiCredentials');
            
            await userCredentialsRef.set({
                apiUrl: apiUrl,
                apiKey: instanceDetails.apikey,
                instanceName: instanceName,
            }, { merge: true });
            
            await logSystemInfo(userId, 'fetchAndSaveInstanceApiKey_success', 'Credenciais específicas da instância salvas com sucesso.', { instanceName });
            return { success: true };
        } else {
            throw new Error('A chave de API da instância não foi encontrada na resposta da API.');
        }

    } catch (error: any) {
        let errorMessage = 'Falha ao buscar e salvar a chave de API da instância.';
        if (axios.isAxiosError(error) && error.response?.data) {
             errorMessage = JSON.stringify(error.response.data, null, 2);
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        await logSystemFailure(userId, 'fetchAndSaveInstanceApiKey_failure', { message: errorMessage, stack: (error as any).stack }, { instanceName });
        return { success: false, error: errorMessage };
    }
}



/**
 * Busca a URL da foto de perfil de um contato do WhatsApp através da Evolution API.
 * @param {string} userId - O ID do usuário.
 * @param {string} phone - O número de telefone do contato.
 * @returns {Promise<string | null>} A URL da foto de perfil ou `null` se não for encontrada ou ocorrer um erro.
 */
export async function getProfilePictureUrl(userId: string, phone: string, instanceName: string): Promise<string | null> {
    try {
        if (!phone || typeof phone !== 'string') {
            logSystemInfo(userId, 'getProfilePictureUrl_invalid_phone', 'Número de telefone inválido fornecido.', { phone });
            return null;
        }
        const credentials = await getUserEvolutionApiCredentials(userId);
        if (!credentials) {
            logSystemFailure(userId, 'getProfilePictureUrl_no_creds', 'Credenciais da Evolution API não configuradas para o usuário.', {});
            return null;
        }
        const { apiUrl, apiKey } = credentials;
        if (typeof apiUrl !== 'string' || !apiUrl.startsWith('http')) {
            logSystemFailure(userId, 'getProfilePictureUrl_invalid_apiUrl', 'URL da API inválida.', { apiUrl });
            return null;
        }
        const url = `${apiUrl.replace(/\/$/, '')}/chat/fetchProfilePictureUrl/${instanceName}`;
        const body = { number: `${phone}@s.whatsapp.net` };

        const { data: responseData } = await axiosWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            data: body,
        });

        if (responseData && typeof responseData.profilePictureUrl === 'string') {
            logSystemInfo(userId, 'getProfilePictureUrl_success', `Foto de perfil para ${phone} obtida com sucesso.`, { phone });
            return responseData.profilePictureUrl;
        } else {
            logSystemInfo(userId, 'getProfilePictureUrl_no_picture_in_response', `API respondeu OK, mas sem URL para ${phone}.`, { phone, response: responseData });
            return null;
        }
    } catch (error: any) {
        const stackTrace = error instanceof Error && error.stack ? error.stack : 'N/A';
        logSystemFailure(userId, 'getProfilePictureUrl_fetch_error', { message: `Falha na fetch do perfil para ${phone}. Razão: ${error.message}`, stack: stackTrace }, { phone });
        return null;
    }
}

/**
 * Salva uma mensagem enviada (pelo sistema) no banco de dados.
 * @param {string} userId - O ID do usuário.
 * @param {string} phone - O número do destinatário (ID da conversa).
 * @param {AppMessage} messageData - O objeto da mensagem a ser salvo.
 */
async function saveMessageToDb(
    userId: string,
    phone: string,
    messageData: AppMessage,
): Promise<void> {
    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(phone);
    const messageRef = conversationRef.collection('messages').doc(messageData.id);
    try {
        const batch = adminFirestore.batch();
        batch.set(messageRef, messageData);
        // Atualiza a visualização da última mensagem na lista de conversas.
        const conversationUpdate: Partial<Conversation> = {
            updatedAt: Timestamp.now(),
        };

        const prefix = messageData.source === 'ai' ? 'IA' : 'Você';
        let lastMessageText = messageData.text || '';

        if (messageData.mediaType === 'image') {
            lastMessageText = `📷 Imagem${messageData.text ? `: ${messageData.text}` : ''}`;
        } else if (messageData.mediaType === 'audio') {
            lastMessageText = `🎤 Áudio${messageData.duration ? ` (${messageData.duration})` : ''}`;
        } else if (messageData.mediaType) {
             lastMessageText = `[Mídia] ${messageData.text || ''}`;
        }

        conversationUpdate.lastMessage = `${prefix}: ${lastMessageText}`;
        conversationUpdate.lastMessageMediaType = messageData.mediaType || null;
        conversationUpdate.lastMessageDuration = messageData.duration || null;
        

        batch.set(conversationRef, conversationUpdate, { merge: true });
        await batch.commit();
    } catch (dbError: any) {
        await logSystemFailure(userId, 'evolution-save-message-failure', { message: `Falha ao salvar mensagem no DB: ${dbError.message}` }, { phone, messageId: messageData.id });
    }
}

/**
 * Atualiza o status de uma mensagem no Firestore ('sent', 'delivered', 'failed').
 * @param {string} userId - O ID do usuário.
 * @param {string} phone - O ID da conversa.
 * @param {string} messageId - O ID da mensagem a ser atualizada.
 * @param {'sent' | 'delivered' | 'failed'} status - O novo status.
 * @param {any} [errorDetails] - Detalhes do erro, se o status for 'failed'.
 */
async function updateMessageStatus(
    userId: string,
    phone: string,
    messageId: string,
    status: 'sent' | 'delivered' | 'failed',
    apiResponse?: any
): Promise<void> {
    const adminFirestore = getAdminFirestore();
    const messageRef = adminFirestore
        .collection('users')
        .doc(userId)
        .collection('conversations')
        .doc(phone)
        .collection('messages')
        .doc(messageId);
    try {
        const updateData: any = { status, apiResponse: apiResponse ? { success: true, ...apiResponse } : null };
        if (status === 'failed' && apiResponse) {
            updateData.apiResponse = apiResponse;
        }
        await messageRef.update(updateData);
    } catch (updateError: any) {
        // Se a atualização do status falhar, registra um erro, mas não quebra a aplicação.
        // A falha pode ser devido a um objeto de resposta complexo que o Firestore não pode serializar.
        // Registra um log mais simples para evitar um loop de falhas.
        if ((updateError.message || '').includes('invalid nested')) {
            await messageRef.update({ status, apiResponse: { error: "Falha ao serializar a resposta da API.", details: updateError.message } });
        } else {
             await logSystemFailure(userId, 'updateMessageStatus_error', {
                message: `Não foi possível atualizar status da mensagem ${messageId} para ${status}.`,
                originalError: apiResponse,
                updateError: updateError.message,
            }, { phone });
        }
    }
}

/**
 * Envia um status de presença para o chat (ex: 'digitando...', 'gravando áudio...').
 * @param {object} params - Parâmetros da função.
 * @returns {Promise<boolean>} `true` se o envio for bem-sucedido, `false` caso contrário.
 */
export async function sendPresence(params: {
    userId: string;
    phone: string;
    presence: 'composing' | 'recording' | 'paused' | 'available' | 'unavailable';
    delay?: number;
    instanceName: string;
}): Promise<boolean> {
    const { userId, phone, presence, delay: presenceDelay = 0, instanceName } = params;
    const credentials = await getUserEvolutionApiCredentials(userId);
    if (!credentials) {
        logSystemFailure(userId, 'sendPresence_no_creds', { message: `Credenciais faltando para presence de ${phone}.` }, { phone, presence });
        return false;
    }
    try {
        const { apiUrl, apiKey } = credentials;
        const url = `${apiUrl.replace(/\/$/, '')}/chat/sendPresence/${instanceName}`;
        // Estrutura do corpo correta conforme a documentação da Evolution API.
        const body = {
            number: `${phone}@s.whatsapp.net`,
            presence,
            delay: presenceDelay
        };
        // Usa Axios sem retentativa para uma operação rápida e não crítica.
        await axios({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            data: body,
            timeout: 5000,
        });
        return true;
    } catch (error: any) {
        await logSystemFailure(userId, 'sendPresence_failure', { message: `Falha ao enviar presença '${presence}' para ${phone}. Razão: ${error.message}` }, { phone, presence });
        return false;
    }
}

/**
 * Orquestra o envio de uma mensagem de texto, incluindo salvamento no banco de dados e atualização de status.
 * @param {object} params - Parâmetros da função.
 * @returns {Promise<EvolutionApiSendResult>} O resultado da operação de envio.
 */
export async function sendTextMessage(params: {
    userId: string;
    phone: string;
    message: string;
    instanceName?: string;
    saveToHistory?: boolean;
    source?: 'ai' | 'operator' | 'system';
    operatorEmail?: string;
    quotedMessage?: AppMessage | null;
    linkPreview?: boolean;
}): Promise<EvolutionApiSendResult> {
    const {
        userId,
        phone,
        message,
        instanceName,
        saveToHistory = true,
        source = 'system',
        operatorEmail,
        quotedMessage,
        linkPreview,
    } = params;

    if (!message || !message.trim()) {
        const error = `sendTextMessage chamado com mensagem vazia para telefone ${phone}. Abortando.`;
        await logSystemFailure(userId, 'sendTextMessage-empty-message', { message: error }, { phone });
        return { success: false, error };
    }

    const messageId = uuidv4().replace(/-/g, '').toUpperCase();
    
    const body: any = {
      number: phone,
      text: message,
      options: {
        delay: 1200,
        presence: 'composing',
      },
    };

    if (quotedMessage?.apiPayload?.data?.key && quotedMessage?.apiPayload?.data?.message) {
        body.options.quoted = {
          key: quotedMessage.apiPayload.data.key,
          message: quotedMessage.apiPayload.data.message
        };
    }
    
    if (linkPreview !== undefined) {
        body.options.linkPreview = linkPreview;
    }

    const credentials = await getUserEvolutionApiCredentials(userId);
    if (!credentials) {
        const error = 'Credenciais da Evolution API do usuário não encontradas.';
        await logSystemFailure(userId, 'sendTextMessage_no_creds_final', { message: error }, { phone });
        return { success: false, error };
    }
    const { apiUrl, apiKey, instanceName: userInstanceName } = credentials;
    const finalInstanceName = instanceName || userInstanceName;
    const url = `${apiUrl.replace(/\/$/, '')}/message/sendText/${finalInstanceName}`;

    if (saveToHistory) {
        const messageData: AppMessage = {
            id: messageId,
            from: 'agent',
            source,
            type: 'chat',
            text: message,
            timestamp: Timestamp.now(),
            status: 'sending', // Inicia com o status 'enviando'.
        };
        if (source === 'operator' && operatorEmail) {
            messageData.operatorEmail = operatorEmail;
        }
        await saveMessageToDb(userId, phone, messageData);
    }
    
    try {
        const { data: responseData } = await axiosWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            data: body,
        });

        const sentMessageId = responseData?.key?.id || messageId;
        
        if (saveToHistory) {
            await updateMessageStatus(userId, phone, messageId, 'delivered', responseData);
        }

        await logSystemInfo(userId, 'evolution-send-text-success', `Mensagem enviada para ${phone}`, {
            phone,
            messageId: sentMessageId,
            response: responseData
        });
        return { success: true, messageId: sentMessageId, apiResponse: responseData };

    } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao enviar mensagem.';
        const maskedApiKey = `...${apiKey.slice(-4)}`;
        const failureRequestDetails = { url, method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': maskedApiKey }, data: body };
        const stackTrace = error instanceof Error && error.stack ? error.stack : 'N/A';
        await logSystemFailure(userId, 'evolution-send-text-failure', { message: errorMessage, stack: stackTrace, apiResponse: failureRequestDetails }, { phone, request: failureRequestDetails });

        if (saveToHistory) {
            await updateMessageStatus(userId, phone, messageId, 'failed', failureRequestDetails );
        }

        return { success: false, error: errorMessage, apiResponse: failureRequestDetails };
    }
}


/**
 * Orquestra o envio de uma ou mais mensagens de mídia de forma robusta.
 * Se várias URLs forem fornecidas, envia cada uma como uma mensagem separada em sequência.
 * Utiliza o padrão "salvar-enviar-atualizar" para garantir a consistência dos dados.
 * @param {object} params - Parâmetros da função.
 * @returns {Promise<EvolutionApiSendResult>} O resultado da operação de envio da *última* mídia.
 */
export async function sendMediaMessage(params: {
    userId: string;
    phone: string;
    instanceName?: string;
    mediatype: 'image' | 'video' | 'audio' | 'document';
    mediaUrls: string[];
    caption?: string;
    mimetype?: string;
    fileName?: string;
}): Promise<EvolutionApiSendResult> {
    const { userId, phone, instanceName, mediatype, mediaUrls, caption, mimetype, fileName } = params;

    if (!mediaUrls || mediaUrls.length === 0) {
        return { success: false, error: 'Nenhuma URL de mídia fornecida.' };
    }
    
    const credentials = await getUserEvolutionApiCredentials(userId);
    if (!credentials) {
        return { success: false, error: 'Credenciais da Evolution API do usuário não configuradas.' };
    }
    
    const { apiUrl, apiKey, instanceName: userInstanceName } = credentials;
    const finalInstanceName = instanceName || userInstanceName;
    const url = `${apiUrl.replace(/\/$/, '')}/message/sendMedia/${finalInstanceName}`;
    
    let lastResult: EvolutionApiSendResult = { success: false, error: 'Nenhuma mídia foi enviada.' };

    for (let i = 0; i < mediaUrls.length; i++) {
        const mediaData = mediaUrls[i];
        const isFirst = i === 0;
        
        const temporaryId = uuidv4();
        
        const messageData: AppMessage = {
            id: temporaryId,
            from: 'agent',
            source: 'ai',
            type: 'media',
            text: isFirst ? caption || '' : '',
            timestamp: Timestamp.now(),
            status: 'sending',
            mediaType: mediatype,
            mediaUrl: mediaData.startsWith('http') ? mediaData : null, // Only store URL if it is one
            mimetype: mimetype || null,
        };
        await saveMessageToDb(userId, phone, messageData);
        
        const body: any = {
            number: phone,
            mediatype,
            media: mediaData,
            delay: 1200,
        };

        if(isFirst && caption) body.caption = caption;
        if(fileName) body.fileName = fileName;
        if(mimetype) body.mimetype = mimetype;

        try {
            const { data: responseData } = await axiosWithRetry(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
                data: body,
            });

            const sentMessageId = responseData?.key?.id;

            const adminFirestore = getAdminFirestore();
            const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(phone);
            
            // Atomically replace temporary message with the final one
            const batch = adminFirestore.batch();
            const tempMessageRef = conversationRef.collection('messages').doc(temporaryId);

            const simplifiedResponse = {
                success: true,
                id: sentMessageId,
                remoteJid: responseData?.key?.remoteJid,
            };

            if (sentMessageId) {
                const finalMessageRef = conversationRef.collection('messages').doc(sentMessageId);
                batch.delete(tempMessageRef);
                batch.set(finalMessageRef, { ...messageData, id: sentMessageId, status: 'delivered', apiResponse: simplifiedResponse });
            } else {
                 batch.update(tempMessageRef, { status: 'delivered', apiResponse: simplifiedResponse });
            }
            await batch.commit();
            
            await logSystemInfo(userId, 'evolution-send-media-success', `Mídia enviada para ${phone}`, { phone, messageId: sentMessageId, mediaType: mediatype });
            lastResult = { success: true, messageId: sentMessageId, apiResponse: responseData };
            
            if (i < mediaUrls.length - 1) {
                await delay(1500); 
            }
            
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao enviar mídia.';
            const errorResponse = (error as any).response?.data || { detail: 'Sem resposta da API' };
            
            await updateMessageStatus(userId, phone, temporaryId, 'failed', { error: errorMessage, response: errorResponse });
            await logSystemFailure(userId, 'evolution-send-media-failure', { message: errorMessage, stack: (error as Error).stack }, { phone, mediaUrl: mediaData, response: errorResponse });
            
            // Return on the first failure
            return { success: false, error: errorMessage, apiResponse: errorResponse };
        }
    }

    return lastResult;
}
    
    

    

    






    


    

    

    









    



    

    

    

