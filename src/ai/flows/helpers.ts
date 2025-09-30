
'use server';

/**
 * @fileOverview Funções auxiliares (helpers) para os fluxos de IA.
 * Este arquivo centraliza a lógica de acesso a dados (Firestore),
 * formatação e envio de mensagens, tornando os fluxos principais mais limpos e focados
 * na lógica de conversação.
 */

import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import type { Conversation, AppMessage, AiConfig, AutomationSettings, KnowledgeBaseItem } from '@/lib/types';
import { logSystemFailure, logSystemInfo } from './system-log-helpers';
import { sendTextMessage, sendPresence } from '@/actions/evolutionApiActions';
import { Timestamp } from 'firebase-admin/firestore';

// Inicializa o Firebase Admin para garantir que o Firestore esteja disponível.
initializeAdmin();

/**
 * Função utilitária simples para criar um atraso (delay) em milissegundos.
 * @param {number} ms - O tempo de atraso em milissegundos.
 * @returns {Promise<void>} Uma promessa que resolve após o tempo especificado.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));


/**
 * Busca o histórico recente de mensagens de uma conversa no Firestore.
 * Esta versão é mais robusta, garantindo que mesmo mensagens salvas incorretamente
 * como strings JSON sejam parseadas e retornadas como objetos.
 *
 * @param {string} userId - O ID do usuário (proprietário da conversa).
 * @param {string} conversationId - O ID da conversa (geralmente o número de telefone do cliente).
 * @returns {Promise<AppMessage[]>} Uma promessa que resolve para um array de `AppMessage`,
 *   ordenado do mais antigo para o mais recente.
 */
export async function getConversationHistory(userId: string, conversationId: string): Promise<AppMessage[]> {
    const adminFirestore = getAdminFirestore();
    const messagesSnap = await adminFirestore
        .collection('users').doc(userId)
        .collection('conversations').doc(conversationId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(30) // Limita a 30 mensagens para manter o prompt da IA conciso e economizar tokens.
        .get();
        
    const messages = messagesSnap.docs.map(doc => {
        let data = doc.data();
        // Tratamento defensivo: se a mensagem foi salva como string, tenta parsear.
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                logSystemFailure(userId, 'getConversationHistory_parse_error', { message: `Falha ao parsear mensagem stringficada: ${e}` }, { conversationId, messageId: doc.id });
                return null; // Ignora a mensagem mal formada.
            }
        }
        return data as AppMessage;
    }).filter(Boolean) as AppMessage[]; // Filtra quaisquer mensagens nulas.

    // Inverte a ordem para que as mensagens fiquem cronológicas (mais antigas primeiro),
    // que é o formato esperado pela IA.
    return messages.reverse();
}


/**
 * Busca a configuração da IA (prompt do agente) do Firestore.
 * @param {string} userId - O ID do usuário para o qual a configuração deve ser buscada.
 * @returns {Promise<Partial<AiConfig>>} Uma promessa que resolve para o objeto de configuração da IA (`AiConfig`).
 *   Retorna um objeto vazio como fallback se nenhuma configuração for encontrada.
 */
export async function getAiConfig(userId: string): Promise<Partial<AiConfig>> {
    const adminFirestore = getAdminFirestore();
    const docSnap = await adminFirestore
        .collection('users').doc(userId)
        .collection('settings').doc('aiConfig')
        .get();
    return (docSnap.data() as Partial<AiConfig>) || {};
}


/**
 * Busca as configurações de automação do usuário no Firestore.
 * Isso inclui configurações de follow-up, modo de desenvolvimento, etc.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Partial<AutomationSettings>>} Uma promessa que resolve para o objeto
 *   de configurações de automação. Retorna um objeto vazio como fallback.
 */
export async function getAutomationSettings(userId: string): Promise<Partial<AutomationSettings>> {
    const adminFirestore = getAdminFirestore();
    const docSnap = await adminFirestore
        .collection('users').doc(userId)
        .collection('settings').doc('automation')
        .get();
    return (docSnap.data() as Partial<AutomationSettings>) || {};
}

/**
 * Busca os dados completos de uma única conversa.
 * @param {string} userId - O ID do usuário.
 * @param {string} conversationId - O ID da conversa.
 * @returns {Promise<Conversation | null>} Uma promessa que resolve para o objeto `Conversation` ou `null` se não for encontrado.
 */
export async function getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
    const adminFirestore = getAdminFirestore();
    const conversationSnap = await adminFirestore
        .collection('users').doc(userId)
        .collection('conversations').doc(conversationId)
        .get();
    
    if (!conversationSnap.exists) {
        logSystemFailure(userId, 'getConversation', { message: `Conversa ${conversationId} não encontrada.` }, { conversationId });
        return null;
    }
    return conversationSnap.data() as Conversation;
}

/**
 * Busca todos os itens de FAQ e Produtos/Serviços e os formata em uma string única.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<string>} Uma string com a base de conhecimento estática formatada.
 */
export async function getKnowledgeBase(userId: string): Promise<string> {
    const adminFirestore = getAdminFirestore();
    let knowledgeBase = '';

    try {
        const [faqSnap, productSnap] = await Promise.all([
            adminFirestore.collection('users').doc(userId).collection('knowledge_base').where('type', '==', 'faq').get(),
            adminFirestore.collection('users').doc(userId).collection('knowledge_base').where('type', '==', 'product').get(),
        ]);

        if (!faqSnap.empty) {
            const faqSection = faqSnap.docs
                .map(doc => {
                    const item = doc.data() as { question: string, answer: string };
                    return `Pergunta: ${item.question}\nResposta: ${item.answer}`;
                })
                .join('\n---\n');
            knowledgeBase += '--- INÍCIO DA SEÇÃO DE PERGUNTAS E RESPOSTAS ---\n' + faqSection + '\n--- FIM DA SEÇÃO DE PERGUNTAS E RESPOSTAS ---\n\n';
        }

        if (!productSnap.empty) {
            const productSection = productSnap.docs
                .map(doc => {
                    const item = { id: doc.id, ...doc.data() } as KnowledgeBaseItem;
                    let productString = `ID do Produto/Serviço: ${item.id}\nProduto/Serviço: ${item.name}\nDescrição: ${item.description}`;
                    if (item.price !== undefined) {
                        productString += `\nPreço: ${item.price.toFixed(2).replace('.', ',')}`;
                    }
                     if (item.imageUrls) {
                        const urls = Array.isArray(item.imageUrls) ? item.imageUrls : [item.imageUrls];
                        productString += `\n(URLs das Imagens para envio: ${urls.join(', ')})`;
                    }
                    return productString;
                })
                .join('\n---\n');
            knowledgeBase += '--- INÍCIO DA SEÇÃO DE PRODUTOS E SERVIÇOS ---\n(Para anotar um pedido, você DEVE usar o "ID do Produto/Serviço")\n' + productSection + '\n--- FIM DA SEÇÃO DE PRODUTOS E SERVIÇOS ---\n';
        }

        return knowledgeBase || "Nenhuma informação de base de conhecimento disponível.";

    } catch (error: any) {
        await logSystemFailure(userId, 'getKnowledgeBase', { message: `Falha ao buscar a base de conhecimento: ${error.message}` }, {});
        return "Erro ao carregar a base de conhecimento.";
    }
}


/**
 * Divide uma mensagem longa em pedaços menores para simular uma digitação mais natural.
 * A lógica prioriza a quebra por novas linhas e depois por sentenças, evitando quebrar URLs e códigos PIX.
 * @param {string} message - O texto completo a ser dividido.
 * @returns {string[]} Um array de strings, onde cada string é um pedaço da mensagem.
 */
function splitMessageIntoChunks(message: string): string[] {
    if (!message) return [];
    
    // Regex para encontrar URLs e códigos PIX para evitar que sejam quebrados.
    const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+[^\s]*)/g;
    const pixRegex = /000201[0-9a-zA-Z]{50,}/g; // Regex simplificado para PIX Copia e Cola
    
    const placeholders: string[] = [];
    const placeholderPrefix = "___PLACEHOLDER___";

    // 1. Substitui URLs e códigos PIX por placeholders para protegê-los.
    const messageWithPlaceholders = message
        .replace(pixRegex, (match) => {
            placeholders.push(match);
            return `${placeholderPrefix}${placeholders.length - 1}___`;
        })
        .replace(urlRegex, (match) => {
            // Evita que o PIX seja capturado pela regex de URL novamente
            if (placeholders.includes(match)) return match;
            placeholders.push(match);
            return `${placeholderPrefix}${placeholders.length - 1}___`;
        });
    
    // 2. Divide a mensagem. Primeiro por quebras de linha, depois por sentenças.
    const preliminaryChunks = messageWithPlaceholders.trim().split(/\n+/).flatMap(paragraph => {
        if (!paragraph.trim()) return [];
        // Não quebra parágrafos que contêm placeholders (PIX ou URL)
        if (paragraph.includes(placeholderPrefix)) {
            return [paragraph];
        }
        return paragraph.match(/[^.!?]+[.!?]?/g) || [paragraph];
    }).map(chunk => chunk.trim()).filter(Boolean);

    // 3. Re-junta pedaços muito pequenos.
    const mergedChunks: string[] = [];
    preliminaryChunks.forEach(chunk => {
        if (mergedChunks.length > 0 && chunk.length < 20 && !chunk.includes(placeholderPrefix)) {
            mergedChunks[mergedChunks.length - 1] += ` ${chunk}`;
        } else {
            mergedChunks.push(chunk);
        }
    });

    // 4. Restaura os placeholders.
    const finalChunks = mergedChunks.map(chunk => {
        let restoredChunk = chunk;
        placeholders.forEach((placeholder, index) => {
            const tag = `${placeholderPrefix}${index}___`;
            if (restoredChunk.includes(tag)) {
                restoredChunk = restoredChunk.replace(tag, placeholder);
            }
        });
        return restoredChunk;
    });

    return finalChunks;
}

/**
 * Orquestra o envio da resposta da IA para o cliente de forma "humanizada".
 * Simula digitação, envia a mensagem em pedaços e agenda follow-ups.
 *
 * @param {string} userId - O ID do usuário.
 * @param {string} conversationId - O ID da conversa.
 * @param {string} instanceName - O nome da instância da Evolution API (email do usuário).
 * @param {object} aiOutput - O objeto de saída da IA, contendo a resposta de texto completa.
 * @param {string} aiOutput.response - O texto a ser enviado.
 * @param {AppMessage} [messageToReplyTo] - A mensagem do cliente à qual a IA está respondendo (para citação).
 * @returns {Promise<boolean>} Uma promessa que resolve para `true` se o envio for bem-sucedido, `false` caso contrário.
 */
export async function handleAiMessageSend(
    userId: string,
    conversationId: string,
    instanceName: string,
    aiOutput: { response: string },
    messageToReplyTo?: AppMessage
): Promise<boolean> {
    const { response: fullResponse } = aiOutput;
    
    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
    
    try {
        if (!fullResponse || !fullResponse.trim()) {
            await logSystemInfo(userId, 'handleAiMessageSend_empty', `Sem conteúdo para enviar para ${conversationId}. A IA pode ter usado uma ferramenta sem gerar texto.`, { conversationId, aiOutput });
            return true;
        }

        // Divide a resposta completa em pedaços menores para uma entrega mais natural.
        const messageChunks = splitMessageIntoChunks(fullResponse);
        const shouldQuote = !!messageToReplyTo;

        // Itera sobre cada pedaço, simula digitação e envia.
        for (let i = 0; i < messageChunks.length; i++) {
            const chunk = messageChunks[i];
            if (!chunk || !chunk.trim()) continue;

            const isFirstChunk = i === 0;
            const quotedMessage = isFirstChunk && shouldQuote ? messageToReplyTo : null;

            // Simula o status "digitando...".
            await sendPresence({ userId, phone: conversationId, presence: 'composing', instanceName });
            await delay(1000); // Atraso para simular o tempo de digitação.

            const result = await sendTextMessage({
              userId,
              phone: conversationId,
              message: chunk,
              instanceName,
              source: 'ai',
              quotedMessage: quotedMessage, // Cita a mensagem original apenas no primeiro pedaço.
            });
            
            if (!result.success) {
                // Se um pedaço falhar, registra o erro e interrompe o envio dos demais.
                await logSystemFailure(
                    userId, 
                    'handleAiMessageSend_chunk_failure', 
                    { message: `Falha ao enviar um pedaço da mensagem da IA para ${conversationId}. Erro: ${result.error || 'Desconhecido'}` }, 
                    { conversationId, failedChunk: chunk }
                );
                
                // Se for um erro grave de rede, move a conversa para suporte humano.
                if (result.error?.includes('Failed request')) {
                    await conversationRef.update({
                        folder: 'support',
                        isAiActive: false,
                        interventionReason: 'technical_failure',
                    });
                     await logSystemFailure(
                        userId, 
                        'handleAiMessageSend_escalation', 
                        { message: `Conversa ${conversationId} movida para suporte devido a falha persistente de rede.` }, 
                        { conversationId }
                    );
                }
                
                return false; 
            }

            await delay(500); // Pequeno atraso entre o envio de cada pedaço.
        }
        
        // Finaliza a simulação, mostrando o status como "online".
        await sendPresence({ userId, phone: conversationId, presence: 'available', instanceName });
        
        const automationSettings = await getAutomationSettings(userId);
        const updateData: Partial<Conversation> = {
            lastAiResponse: fullResponse,
            followUpState: null, // Reseta o estado de follow-up por padrão.
        };

        // Verifica se o follow-up automático está ativado e agenda o próximo passo,
        // a menos que a IA tenha enviado uma mensagem de finalização.
        const lowerCaseResponse = fullResponse.toLowerCase();
        const finalizationKeywords = ['obrigado', 'obrigada', 'agradeço', 'tchau', 'até logo', 'qualquer outra dúvida', 'precisar, é só chamar'];
        const isFinalizing = finalizationKeywords.some(keyword => lowerCaseResponse.includes(keyword));

        if (automationSettings.isFollowUpEnabled && automationSettings.followUps?.first.enabled && !isFinalizing) {
            const now = new Date();
            now.setHours(now.getHours() + automationSettings.followUps.first.intervalHours);
            updateData.followUpState = {
                nextFollowUpAt: Timestamp.fromDate(now),
                step: 'first',
            };
             logSystemInfo(userId, 'handleAiMessageSend_followup_scheduled', `Follow-up agendado para a conversa ${conversationId}.`, { conversationId });
        } else if (isFinalizing) {
             logSystemInfo(userId, 'handleAiMessageSend_followup_skipped', `Follow-up pulado para a conversa ${conversationId} devido à resposta de finalização.`, { conversationId, response: fullResponse });
        }

        // Atualiza a conversa com a última resposta da IA e o estado do follow-up.
        await conversationRef.update(updateData);

        return true;

    } catch (error: any) {
        await logSystemFailure(userId, 'handleAiMessageSend_critical_failure', { message: error.message, stack: error.stack }, { conversationId });
        return false;
    }
}

/**
 * Verifica se a empresa está aberta com base no horário de funcionamento configurado no painel.
 * Esta função agora lida com múltiplos slots de tempo por dia.
 * @param {string} userId - O ID do usuário.
 * @param {Date} [checkTime] - A data/hora a ser verificada (opcional, usa a hora atual se não fornecido).
 * @returns {Promise<boolean>} Uma promessa que resolve para `true` se estiver aberto, `false` caso contrário.
 */
export async function isBusinessOpen(userId: string, checkTime?: Date): Promise<boolean> {
    const adminFirestore = getAdminFirestore();
    const settingsRef = adminFirestore.collection('users').doc(userId).collection('settings').doc('businessHours');
    const settingsSnap = await settingsRef.get();

    // Se não houver configuração, assume-se que está sempre aberto.
    if (!settingsSnap.exists) return true; 

    const schedule = settingsSnap.data() as any;
    if (!schedule) return true;

    const referenceDate = checkTime || new Date();
    
    // Converte a hora atual para o fuso horário de São Paulo para consistência.
    const saoPauloTimeString = referenceDate.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const saoPauloTime = new Date(saoPauloTimeString);
    
    const dayOfWeekIndex = saoPauloTime.getUTCDay();
    const daysMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dayOfWeekName = daysMap[dayOfWeekIndex];

    const daySchedule = schedule[dayOfWeekName];

    // Se o dia está explicitamente desativado no painel, retorna fechado.
    if (!daySchedule || !daySchedule.enabled) {
        return false;
    }
    
    // Se não há slots definidos para um dia ativo, assume-se aberto o dia todo.
    if (!daySchedule.slots || daySchedule.slots.length === 0) {
        return true;
    }

    // Verifica se a hora atual está dentro de algum dos intervalos (slots) configurados para o dia.
    const currentTimeInMinutes = saoPauloTime.getUTCHours() * 60 + saoPauloTime.getUTCMinutes();
    for (const slot of daySchedule.slots) {
        if (slot.start && slot.end) {
            const [startHour, startMinute] = slot.start.split(':').map(Number);
            const startTimeInMinutes = startHour * 60 + startMinute;

            const [endHour, endMinute] = slot.end.split(':').map(Number);
            const endTimeInMinutes = endHour * 60 + endMinute;

            if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes) {
                return true; // Encontrou um slot válido, está aberto.
            }
        }
    }

    // Se não encontrou nenhum intervalo correspondente, está fechado.
    return false;
}

    