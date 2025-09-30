

'use server';

/**
 * @fileoverview Funções de Serviço para Gerenciamento de Conversas.
 * Este arquivo contém a lógica de negócio para manipular o estado e os dados
 * de uma conversa, como arquivá-la, transferi-la para suporte, sumarizá-la,
 * atualizar dados do cliente ou adicionar etiquetas. Essas funções são chamadas
 * pelas ferramentas da IA.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { findAndTriggerActions } from '@/actions/webhookSender';
import { logSystemInfo, logSystemFailure } from '@/ai/flows/system-log-helpers';
import { getConversationHistory, getAiConfig } from '@/ai/flows/helpers';
import type { AppMessage } from '@/lib/types';
import { z } from 'zod';
import type { EndConversationSchema, RequestHumanSupportSchema, SummarizeConversationSchema, UpdateClientInfoSchema, UpdateConversationTagsSchema } from '@/lib/schemas';

// Define um prompt de IA específico para a tarefa de sumarização genérica.
const genericSummaryPrompt = ai.definePrompt({
    name: 'conversationSummarizerGeneric',
    model: googleAI.model('gemini-2.5-flash-lite'),
    input: { schema: z.object({ conversationHistory: z.string(), operatorNotes: z.string().optional() }) },
    output: { schema: z.object({ summary: z.string() }) },
    prompt: `Você é um especialista em análise de conversas de atendimento. Sua tarefa é ler o histórico e as anotações a seguir para criar um resumo conciso para um atendente humano.

O resumo deve seguir estritamente o seguinte formato de texto simples, usando bullet points (iniciando com '* ').

*   **Assunto Principal:** Qual era o objetivo principal do cliente?
*   **Informações Coletadas (Opcional):** Se o cliente forneceu dados relevantes (interesses, orçamento, etc.), liste-os aqui. NÃO inclua nome ou telefone. Se nenhuma informação relevante foi coletada, omita esta seção.
*   **Resultado:** Onde a conversa parou? O que precisa ser feito a seguir?
*   **Sentimento:** Qual o sentimento geral do cliente (neutro, satisfeito, frustrado, etc.)?

Seja direto e objetivo. Responda APENAS com o texto formatado em bullet points. Não inclua '{' ou '"' ou qualquer outro caractere de código.

**Histórico da Conversa:**
\`\`\`
{{{conversationHistory}}}
\`\`\`

**Anotações Salvas sobre o Cliente:**
\`\`\`
{{{operatorNotes}}}
\`\`\`

Agora, gere o resumo:`,
});


// Define um prompt de IA específico para a tarefa de sumarização de SDR.
const sdrSummaryPrompt = ai.definePrompt({
    name: 'conversationSummarizerSDR',
    model: googleAI.model('gemini-2.5-flash-lite'),
    input: { schema: z.object({ conversationHistory: z.string(), operatorNotes: z.string().optional() }) },
    output: { schema: z.object({ summary: z.string() }) },
    prompt: `Você é um assistente de vendas que analisa interações com leads. Sua tarefa é ler o histórico da conversa e as anotações para criar um "Briefing do Lead" para um vendedor humano.

O resumo deve extrair as respostas do cliente para as perguntas de qualificação que foram feitas. Siga estritamente o formato de texto simples abaixo, usando bullet points.

*   **Nome do Lead:** (Extraia o nome do cliente)
*   **Qualificação:**
    *   **Pergunta 1:** (Escreva a pergunta que a IA fez)
        *   **Resposta:** (Escreva a resposta que o cliente deu)
    *   **Pergunta 2:** (Escreva a pergunta que a IA fez)
        *   **Resposta:** (Escreva a resposta que o cliente deu)
    *   (Continue para todas as perguntas e respostas de qualificação encontradas)
*   **Observações Adicionais:** Se houver alguma informação extra relevante nas anotações (como orçamento, prazo, etc.), liste-a aqui. Se não, omita esta seção.
*   **Status:** Lead Qualificado. Pronto para contato da equipe de vendas.

Seja direto e objetivo. Responda APENAS com o texto formatado.

**Histórico da Conversa:**
\`\`\`
{{{conversationHistory}}}
\`\`\`

**Anotações Salvas sobre o Cliente:**
\`\`\`
{{{operatorNotes}}}
\`\`\`

Agora, gere o "Briefing do Lead":`,
});


/**
 * Finaliza e arquiva uma conversa, movendo-a para a pasta 'archived' no Firestore.
 * Geralmente é chamada pela `endConversationTool`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa a ser finalizada.
 * @param {object} input - Contém o motivo da finalização, vindo da IA.
 * @param {string} [input.reason] - Um breve resumo do porquê a conversa foi finalizada.
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function endConversation(
    userId: string, 
    conversationId: string, 
    { reason }: z.infer<typeof EndConversationSchema>
) {
    try {
        const adminFirestore = getAdminFirestore();
        const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
        
        // Antes de arquivar, gera e salva um resumo da conversa para referência futura.
        const summaryResult = await summarizeConversation(userId, conversationId, {});
        if (!summaryResult.success) {
            logSystemFailure(userId, 'endConversation_summarize_failure', { message: 'Falha ao gerar o resumo antes de arquivar a conversa.' }, { conversationId });
            // Continua o arquivamento mesmo se a sumarização falhar para não bloquear o fluxo.
        }

        const updates: any = {
            folder: 'archived',
        };

        // Se a IA forneceu um motivo/resumo, adiciona-o ao campo de anotações.
        if (reason) {
            updates.systemNotes = FieldValue.arrayUnion(`[Resumo da IA]: ${reason}`);
        }

        // Atualiza a conversa no Firestore.
        await conversationRef.update(updates);
        
        // Dispara uma ação de webhook (se houver) para notificar sistemas externos.
        findAndTriggerActions(userId, 'conversation_ended_by_ai', { conversationId, summary: reason });
        
        return { success: true, message: 'A conversa foi finalizada, resumida e arquivada.' };
    } catch (err: any) {
        logSystemFailure(userId, 'endConversation_service_failure', { message: err.message, stack: err.stack }, { conversationId, reason });
        return { success: false, error: `Falha ao arquivar a conversa: ${err.message}` };
    }
}

/**
 * Solicita suporte humano, movendo a conversa para a pasta 'support' e desativando a IA.
 * Chamada pela `requestHumanSupportTool`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém o motivo da transferência.
 * @param {string} input.reason - O motivo pelo qual o suporte humano é necessário.
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function requestHumanSupport(
    userId: string, 
    conversationId: string, 
    { reason }: z.infer<typeof RequestHumanSupportSchema>
) {
    try {
        const firestore = getAdminFirestore();
        const conversationRef = firestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
        
        // Atualiza a conversa para movê-la para a pasta 'support' e desativa a IA.
        // Adiciona também o motivo da transferência às anotações da conversa.
        await conversationRef.update({ 
            folder: 'support', 
            isAiActive: false, 
            interventionReason: reason,
            systemNotes: FieldValue.arrayUnion(`[Motivo da Transferência]: ${reason}`),
        });
        
        // Dispara um webhook para notificar sistemas externos (ex: um canal no Slack, um sistema de tickets).
        findAndTriggerActions(userId, 'human_support_requested', { conversationId, reason });

        return { success: true, message: 'A conversa foi transferida para um atendente humano.' };
    } catch (err: any) {
        logSystemFailure(userId, 'requestHumanSupport_service_failure', { message: err.message, stack: err.stack }, { conversationId, reason });
        return { success: false, error: `Falha ao transferir a conversa: ${err.message}` };
    }
}

/**
 * Gera e salva um resumo de uma conversa usando um prompt de IA dedicado e condicional ao papel do agente.
 * Chamada pela `summarizeConversationTool`, ou internamente por outras funções como `endConversation`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Schema de entrada (atualmente vazio, mas mantido para extensibilidade).
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function summarizeConversation(
    userId: string, 
    conversationId: string, 
    input: z.infer<typeof SummarizeConversationSchema>
) {
    logSystemInfo(userId, 'summarizeConversation_start', 'Iniciando sumarização da conversa.', { conversationId });
    try {
        const adminFirestore = getAdminFirestore();
        
        // 1. Busca o histórico, as anotações e a configuração do agente em paralelo.
        const [history, conversationSnap, aiConfig] = await Promise.all([
            getConversationHistory(userId, conversationId),
            adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId).get(),
            getAiConfig(userId),
        ]);
        
        if (history.length === 0) {
            return { success: true, message: 'Nenhum histórico para sumarizar.' };
        }

        // 2. Formata o histórico e as anotações em uma string legível para a IA.
        const historyForPrompt = history.map((msg: AppMessage) => {
            const prefix = msg.from === 'user' ? 'Cliente' : 'Assistente';
            const content = msg.transcription || msg.text || `[${msg.mediaType || 'mídia'}]`;
            return `${prefix}: ${content.trim()}`;
        }).join('\n');
        
        const operatorNotes = conversationSnap.data()?.operatorNotes?.join('\n') || 'Nenhuma anotação manual.';

        // 3. Seleciona o prompt de sumarização correto com base no papel do agente.
        const isSdrAgent = aiConfig.agentRole === 'SDR (Qualificar Leads)';
        const summaryPrompt = isSdrAgent ? sdrSummaryPrompt : genericSummaryPrompt;
        logSystemInfo(userId, 'summarizeConversation_prompt_selection', `Prompt selecionado: ${isSdrAgent ? 'SDR' : 'Genérico'}.`, { conversationId, agentRole: aiConfig.agentRole });

        // 4. Chama o prompt de sumarização com o histórico e as anotações.
        const { output } = await summaryPrompt({ 
            conversationHistory: historyForPrompt,
            operatorNotes: operatorNotes,
        });
        const summary = output?.summary;
        
        if (!summary) {
            throw new Error("O modelo de sumarização retornou uma resposta vazia.");
        }

        // 5. Salva o resumo gerado no campo 'aiSummary' da conversa no Firestore.
        const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
        await conversationRef.update({ aiSummary: summary });

        logSystemInfo(userId, 'summarizeConversation_success', 'Resumo da conversa salvo com sucesso.', { conversationId });
        return { success: true, message: 'Resumo salvo com sucesso.' };

    } catch (error: any) {
        logSystemFailure(userId, 'summarizeConversation_failure', { message: `Falha ao sumarizar a conversa: ${error.message}`, stack: error.stack }, { conversationId });
        return { success: false, error: `Falha ao sumarizar: ${error.message}` };
    }
}


/**
 * Atualiza os dados de um cliente (conversa) no Firestore.
 * Chamada pela `updateClientInfoTool` para persistir informações coletadas pela IA.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém os dados do cliente a serem atualizados (nome, endereço, notas).
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function updateClientInfo(
    userId: string, 
    conversationId: string, 
    input: z.infer<typeof UpdateClientInfoSchema>
) {
    try {
        const { preferredName, addressText, notes } = input;
        const firestore = getAdminFirestore();
        const conversationRef = firestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
        
        const updates: any = {};
        const savedValues: string[] = [];
        
        // Atualiza o nome preferido diretamente.
        if (preferredName) {
            updates.preferredName = preferredName;
            savedValues.push(`Nome Preferido='${preferredName}'`);
        }

        // Coleta todas as anotações (endereço e notas gerais) para uma única atualização de array.
        const notesToAdd: string[] = [];
        if (addressText) {
            notesToAdd.push(`Endereço fornecido: ${addressText}`);
            savedValues.push(`Endereço='${addressText}'`);
        }
        if (notes) {
            notesToAdd.push(notes);
            savedValues.push(`Anotações='${notes}'`);
        }
        
        // Se houver anotações, usa FieldValue.arrayUnion para adicioná-las ao array existente sem criar duplicatas.
        if (notesToAdd.length > 0) {
            updates.operatorNotes = FieldValue.arrayUnion(...notesToAdd);
        }

        // Executa a atualização no Firestore apenas se houver dados a serem atualizados.
        if (Object.keys(updates).length > 0) {
            await conversationRef.set(updates, { merge: true });
            const successMessage = `Dados do cliente foram salvos no sistema: ${savedValues.join(', ')}.`;
            logSystemInfo(userId, 'updateClientInfoTool_success', successMessage, { conversationId, updates });
            
            return { success: true, message: successMessage };
        }

        return { success: true, message: 'Nenhum dado novo para salvar foi fornecido.' };
    } catch (err: any) {
        logSystemFailure(userId, 'updateClientInfoTool_failure', { message: err.message, stack: err.stack }, { conversationId, input });
        return { success: false, error: `Falha ao salvar informações do cliente: ${err.message}` };
    }
}

/**
 * Adiciona ou atualiza etiquetas (tags) a uma conversa.
 * Chamada pela `updateConversationTagsTool`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém a lista de tags a serem adicionadas.
 * @param {string[]} input.tags - Um array de strings com as etiquetas a serem adicionadas.
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function updateConversationTags(
    userId: string, 
    conversationId: string, 
    { tags }: z.infer<typeof UpdateConversationTagsSchema>
) {
    if (!tags || tags.length === 0) {
        return { success: true, message: 'Nenhuma etiqueta para adicionar.' };
    }

    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
    
    try {
        // Usa FieldValue.arrayUnion para adicionar as novas tags ao array 'tags' sem criar duplicatas.
        await conversationRef.update({
            tags: FieldValue.arrayUnion(...tags),
        });

        // Após salvar, busca os dados atualizados da conversa.
        const conversationSnap = await conversationRef.get();
        const conversationData = conversationSnap.data();

        // Para cada tag adicionada, dispara uma ação de webhook (se configurada).
        tags.forEach(tag => {
            findAndTriggerActions(userId, 'tag_added', { conversationId, clientData: conversationData, tag: tag })
                .catch(err => logSystemFailure(userId, 'action_trigger_failed_tag_added', { message: err.message }, { conversationId, tag }));
        });

        return { success: true, message: 'As etiquetas foram salvas com sucesso na conversa.' };
        
    } catch (error: any) {
        logSystemFailure(userId, 'updateConversationTagsTool_critical', { message: error.message, stack: error.stack }, { conversationId, tags });
        return { success: false, error: `Ocorreu um erro interno ao tentar salvar as etiquetas: ${error.message}` };
    }
}
