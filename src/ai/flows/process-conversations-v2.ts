

'use server';

/**
 * @fileoverview Fluxo principal de processamento de conversas v2.
 * Esta versão utiliza uma heurística de chamada de ferramenta baseada em JSON,
 * onde a IA é instruída a retornar um objeto JSON contendo sua "razão" e a "ferramenta"
 * a ser chamada, em vez de usar o `tool` nativo do Genkit. Isso nos dá mais controle
 * e visibilidade sobre o processo de decisão.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import type { Conversation, AppMessage, AiConfig, AutomationSettings } from '@/lib/types';
import { type Part } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { Document } from '@genkit-ai/ai';


import Handlebars from 'handlebars';

import { allToolDefs } from './tools';
import { silentTools } from '@/lib/schemas';


import {
  getConversationHistory,
  handleAiMessageSend,
  getKnowledgeBase,
} from './helpers';
import { logAiResponse, logSystemFailure, logSystemInfo } from './system-log-helpers';
import { getAiProviderSettings } from '@/actions/aiProviderActions';
import { ProcessConversationInputSchema } from '@/lib/schemas';


export interface ProcessConversationWithMessagesInput {
    userId: string;
    conversation: Conversation;
    messagesToProcess: AppMessage[];
}

const ProcessConversationWithMessagesSchema = ProcessConversationInputSchema.extend({
    messagesToProcess: z.array(z.any()),
});

// Define o schema Zod para o formato de saída JSON esperado da IA.
const HeuristicResponseSchema = z.object({
    reasoning: z.string().describe("Seu raciocínio passo a passo. Se uma ferramenta for necessária, explique por quê. Se não, explique a resposta direta."),
    response_to_client: z.string().optional().describe("A resposta de texto a ser enviada para o cliente ANTES de executar a ferramenta, ou se NENHUMA ferramenta for necessária. Se precisar de uma ferramenta, esta é a mensagem de 'espera' (ex: 'só um momento')."),
    tool_request: z.object({
        name: z.string().optional().describe("O nome da ferramenta a ser usada."),
        args: z.any().describe("Um objeto contendo os argumentos para a ferramenta, correspondendo ao seu inputSchema."),
    }).nullable().optional().describe("A ferramenta a ser executada pelo sistema."),
});


export async function processConversationV2(input: ProcessConversationWithMessagesInput): Promise<void> {
    const firestore = getAdminFirestore();
    const conversationRef = firestore.collection('users').doc(input.userId).collection('conversations').doc(input.conversation.id);

    try {
        await processConversationFlowV2(input);
    } catch (flowError: any) {
        logSystemFailure(input.userId, 'processConversationV2_uncaught_error', { message: flowError.message, stack: flowError.stack }, { conversationId: input.conversation.id });
        await conversationRef.update({ isAiThinking: false });
    }
}

async function getAiSettings(userId: string): Promise<Partial<AiConfig>> {
    const firestore = getAdminFirestore();
    const docRef = firestore.collection('users').doc(userId).collection('settings').doc('aiConfig');
    const docSnap = await docRef.get();
    return (docSnap.exists ? docSnap.data() : { fullPrompt: 'Você é um assistente.' }) as AiConfig;
}

// Lista de todos os modelos disponíveis para garantir que o fallback funcione
const ALL_CONVERSATION_MODELS = [
  googleAI.model('gemini-2.5-pro'),
  googleAI.model('gemini-2.5-flash'),
  googleAI.model('gemini-2.5-flash-lite'),
  googleAI.model('gemini-2.0-flash'),
  googleAI.model('gemini-2.0-flash-lite'),
];

// Função que executa a ferramenta solicitada pela IA.
async function executeTool(userId: string, conversationId: string, toolRequest: any): Promise<any> {
    const toolDefinition = allToolDefs.find(t => t.name === toolRequest.name);
    if (!toolDefinition) {
        throw new Error(`Ferramenta desconhecida solicitada: ${toolRequest.name}`);
    }

    logSystemInfo(userId, 'executeTool_start', `Executando ferramenta: ${toolRequest.name}`, { conversationId, args: toolRequest.args });

    try {
        const output = await toolDefinition.fn(toolRequest.args, { userId, conversationId });

        // Logica de log aprimorada para refletir o resultado real da ferramenta
        if (output?.success === false) {
            logSystemFailure(userId, 'executeTool_failure', { message: `Ferramenta ${toolDefinition.name} executada, mas retornou falha.`, error: output.error }, { conversationId, result: output });
        } else {
            logSystemInfo(userId, 'executeTool_success', `Ferramenta ${toolDefinition.name} executada com sucesso.`, { conversationId, result: output });
        }

        return output;
    } catch (error: any) {
        logSystemFailure(userId, 'executeTool_exception', { message: `Exceção ao executar a ferramenta ${toolDefinition.name}: ${error.message}`, stack: error.stack }, { conversationId, toolRequest });
        return { success: false, error: `Exceção na ferramenta: ${error.message}` };
    }
}


/**
 * Orquestra a chamada para o modelo de linguagem em um loop de turnos.
 * Constrói o prompt, gerencia o histórico, chama a IA e envia a resposta.
 */
async function callConversationAI(
  userId: string,
  conversation: Conversation,
  messagesToProcess: AppMessage[],
  automationSettings: Partial<AutomationSettings>,
  aiConfig: Partial<AiConfig>,
  initialToolFailureContext: string | null = null,
) {
  const conversationId = conversation.id;
  const firestore = getAdminFirestore();
  const conversationRef = firestore.collection('users').doc(userId).collection('conversations').doc(conversationId);

  if (!messagesToProcess || messagesToProcess.length === 0) {
      logSystemInfo(userId, 'callConversationAI_no_messages', 'Nenhuma mensagem nova para processar.', { conversationId });
      return;
  }
  
  const lastMessage = messagesToProcess[messagesToProcess.length - 1];
  const initialHistory = await getConversationHistory(userId, conversationId);
  
  const historyText = initialHistory.map((msg: AppMessage, index: number) => {
    if (!msg) return '';

    let prefix = '';
    if (msg.from === 'user') {
      prefix = 'Cliente:';
    } else if (msg.from === 'agent') {
      if (msg.source === 'ai') {
        prefix = 'Assistente IA:';
      } else if (msg.source === 'operator') {
        prefix = 'Operador Humano:';
      }
    }

    const textContent = msg.transcription || msg.text || (msg.mediaType ? `[Mídia: ${msg.mediaType}]` : '');

    if (prefix && textContent) {
      return `${prefix} ${textContent}`;
    }

    if (msg.source === 'tool' && msg.toolResponses) {
        const toolResponse = msg.toolResponses[0];
        if (toolResponse) {
            let resultText = `RESULTADO DA FERRAMENTA ${toolResponse.request.name}: ${JSON.stringify(toolResponse.response)}`;
            // A instrução só é adicionada à última mensagem do histórico que seja de uma ferramenta
            if (index === initialHistory.length - 1) {
                resultText += "\nCom base nisso, sua prioridade é formular uma resposta para o cliente. NÃO IGNORE ESSE RESULTADO.";
            }
            return resultText;
        }
    }
    return '';
  }).filter(Boolean).join('\n');

  const knowledgeBase = await getKnowledgeBase(userId);
  

  const imageUri = messagesToProcess.find(msg => msg.imageDataUri)?.imageDataUri;
  const logContext = { conversationId, customerMessage: lastMessage.text, hasImage: !!imageUri };
  
  const fullPrompt: Part[] = [];

  if (imageUri) {
      fullPrompt.push({ media: { url: imageUri } });
  }

  const baseSystemPrompt = aiConfig.fullPrompt || 'Você é um assistente de atendimento.';
  const customerNotesSection = (Array.isArray(conversation.operatorNotes) && conversation.operatorNotes.length > 0) ? `--- ANOTAÇÕES SOBRE ESTE CLIENTE ---\n${conversation.operatorNotes.join('\n')}\n---` : '';
  const now = new Date();
  const formattedDateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(now);
  
  const nameRule = `\n- **Nome do Cliente:** Use o nome \`{{conversation.preferredName}}\` para se dirigir ao cliente. Se estiver vazio, use \`{{conversation.name}}\`.`;

  let availableTools = allToolDefs;

  const toolsDocumentation = availableTools.map(tool => {
    const shape = (tool.inputSchema as z.ZodObject<any>).shape;
    const schemaForPrompt = JSON.stringify(shape, (key, value) => {
        if (value && value._def) {
            return { type: value._def.typeName, description: value._def.description };
        }
        return value;
    }, 2);
    
    let toolSpecificInstructions = '';
    
    if (silentTools.includes(tool.name)) {
        toolSpecificInstructions += '\n- Comportamento: Esta é uma ferramenta silenciosa. NÃO gere uma resposta para o cliente antes de usá-la, pois sua resposta será ignorada.';
    }

    return `### ${tool.name}\n- Descrição: ${tool.description}\n- Parâmetros (inputSchema): ${schemaForPrompt}${toolSpecificInstructions}`;
  }).join('\n\n');

  let roleSpecificSection = '';

  const systemPromptTemplate = `
${baseSystemPrompt}${nameRule}
${roleSpecificSection}
--- CONTEXTO ATUAL ---
DATA E HORA ATUAL: ${formattedDateTime}.
DADOS DO CLIENTE:
- Nome Original (WhatsApp): {{conversation.name}}
- Nome Preferido (Editado no Painel): {{conversation.preferredName}}
- Endereço Cadastrado: {{conversation.address.street}}, {{conversation.address.number}}, {{conversation.address.neighborhood}}

BASE DE CONHECIMENTO (FAQ E PRODUTOS):
${knowledgeBase}
${customerNotesSection}

{{#if previousReasoning}}
--- SEU RACIOCÍNIO ANTERIOR (APENAS PARA SEU CONTEXTO) ---
"{{previousReasoning}}"
---
{{/if}}

{{#if toolFailureContext}}
--- ERRO CRÍTICO / ALERTA DE REPETIÇÃO ---
A ferramenta que você tentou usar falhou. Sua tarefa AGORA é:
1.  **Analisar o motivo da falha:** "{{toolFailureContext}}".
2.  **Verificar o histórico:** Se você já viu essa mesma mensagem de erro neste turno de conversa, o problema é persistente. NÃO TENTE NOVAMENTE.
3.  **Ação Imediata (Erro Repetido):** Se o erro for repetido, informe ao cliente que houve um problema técnico e use IMEDIATAMENTE a ferramenta \`requestHumanSupportTool\` para que um humano possa ajudar.
4.  **Ação Imediata (Primeiro Erro):** Se for a primeira vez que você vê este erro, tente uma abordagem diferente, se possível. Se não houver alternativa, siga o passo 3.
---
{{/if}}

--- FERRAMENTAS DISPONÍVEIS ---
${toolsDocumentation}

--- REGRAS DE SAÍDA ---
VOCÊ DEVE RESPONDER ESTRITAMENTE NO SEGUINTE FORMATO JSON. NÃO ADICIONE NENHUM TEXTO ANTES OU DEPOIS DO JSON.
\`\`\`json
{
  "reasoning": "Seu raciocínio passo a passo. Se uma ferramenta for necessária, explique por quê. Se não, explique a resposta direta.",
  "response_to_client": "O texto para enviar ao cliente. Se você solicitar uma ferramenta, esta é uma mensagem de espera (ex: 'Vou verificar no sistema'). Se nenhuma ferramenta for usada, esta é a resposta final.",
  "tool_request": {
    "name": "nome_da_ferramenta",
    "args": { "parametro1": "valor1" }
  }
}
\`\`\`
Se NENHUMA ferramenta for necessária, use null para o campo "tool_request".
`;
  
  const template = Handlebars.compile(systemPromptTemplate);
  
  const providerSettings = await getAiProviderSettings(userId);
  const userApiKey = providerSettings?.apiKey;
  let userModel = providerSettings?.primaryModel || 'gemini-2.5-flash-lite';
  const isFallbackEnabled = providerSettings?.isFallbackEnabled ?? true;
  
  const primaryModelExists = ALL_CONVERSATION_MODELS.find(m => m.name.includes(userModel));
  if (!primaryModelExists) userModel = 'gemini-2.5-flash-lite';

  if (!userApiKey) {
    logSystemFailure(userId, 'callConversationAI_no_apikey', { message: 'Chave de API não encontrada.' }, logContext);
    return;
  }
  const userDoc = await firestore.collection('users').doc(userId).get();
  const userEmail = userDoc.data()?.email;
  if (!userEmail) {
      logSystemFailure(userId, 'callConversationAI_no_email', { message: `Email do usuário ${userId} não encontrado para usar como instanceName.`}, logContext);
      return;
  }

  let modelsToTry = ALL_CONVERSATION_MODELS;
  const primary = ALL_CONVERSATION_MODELS.find(m => m.name.includes(userModel));
  if (primary) {
      modelsToTry = isFallbackEnabled
          ? [primary, ...ALL_CONVERSATION_MODELS.filter(m => m.name !== primary.name)]
          : [primary];
  }
  
  let turn = 0;
  const userMessageContent = messagesToProcess.map(msg => msg.transcription || msg.text || '').join(' \n ');
  let currentPrompt: Part[] = [{ text: `${historyText}\nCliente: ${userMessageContent}` }];
  let previousReasoning: string | null = null;
  let currentToolFailureContext = initialToolFailureContext;
  
  while (turn < 6) {
      turn++;
      logSystemInfo(userId, 'callConversationAI_turn_start', `Iniciando turno de pensamento da IA: ${turn}`, { ...logContext, turn, promptHistoryLength: currentPrompt.length, previousReasoning });

      let modelUsed: string | undefined;
      let rawAiOutput: string | undefined = undefined;
      let resultJson: any = null;
      let modelError: any = null;
      
      const systemPrompt = template({ conversation, history: historyText, previousReasoning, toolFailureContext: currentToolFailureContext });
      currentToolFailureContext = null; // Clear the failure context after using it once

      for (const model of modelsToTry) {
          modelUsed = model.name;
          try {
              logSystemInfo(userId, 'callConversationAI_attempt', `Tentativa com ${modelUsed}`, { ...logContext, model: modelUsed });
              
              const result = await ai.generate({
                  model,
                  prompt: currentPrompt,
                  system: systemPrompt,
                  output: { format: 'json' },
                  config: { apiKey: userApiKey, temperature: automationSettings.aiTemperature ?? 0.2 },
              });
              
              rawAiOutput = result.text;
              if (rawAiOutput) {
                  modelError = null;
                  break; 
              }
              
          } catch (error: any) {
              modelError = error;
              const errorMessage = error.message || 'Erro desconhecido';
              const isRetryable = errorMessage.includes('fetch failed') || ['500', '503', '502', 'ECONNRESET'].some(code => errorMessage.includes(code)) || errorMessage.includes('[GoogleGenerativeAI Error]');
              
              logSystemFailure(userId, 'callConversationAI_model_failure', { message: `Falha com ${modelUsed}: ${errorMessage}`, stack: error.stack, isRetryable }, { ...logContext, });

              if (!isRetryable || modelsToTry.indexOf(model) === modelsToTry.length - 1) {
                  logSystemFailure(userId, 'callConversationAI_unretryable_stop', { message: 'Erro não recuperável ou todas as tentativas de fallback falharam.' }, logContext);
                  await conversationRef.update({ isAiThinking: false });
                  return; 
              }
          }
      }

       if (rawAiOutput) {
           try {
              const cleanedJsonString = rawAiOutput.replace(/```json/g, '').replace(/```/g, '').trim();
              resultJson = JSON.parse(cleanedJsonString);
              await logAiResponse(userId, 'heuristic_agent_executed', { system: systemPrompt, prompt: currentPrompt }, resultJson, logContext, modelUsed || 'unknown_model', null);
          } catch (parseError: any) {
              await logAiResponse(userId, 'heuristic_agent_failed_parse', { system: systemPrompt, prompt: currentPrompt }, { error: 'JSON Parse Failed', rawResponse: rawAiOutput }, logContext, modelUsed || 'unknown_model', parseError);
              await conversationRef.update({ isAiThinking: false });
              return;
          }
      } else {
           await logAiResponse(userId, 'heuristic_agent_empty_response', { system: systemPrompt, prompt: currentPrompt }, { error: 'Empty response from all models' }, logContext, modelUsed || 'unknown_model', modelError);
           await conversationRef.update({ isAiThinking: false });
           return;
      }
    
      const { reasoning, response_to_client, tool_request } = HeuristicResponseSchema.parse(resultJson);
      previousReasoning = reasoning;
      
      const useSilentTool = tool_request?.name && silentTools.includes(tool_request.name);

      if (response_to_client && !useSilentTool) {
          logSystemInfo(userId, 'callConversationAI_text_before_tool', `Enviando resposta de texto.`, { ...logContext, response: response_to_client });
          await handleAiMessageSend(userId, conversationId, userEmail, response_to_client, lastMessage);
          currentPrompt.push({text: `\nAssistente IA: ${response_to_client}`})
      } else if (response_to_client && useSilentTool) {
          logSystemInfo(userId, 'callConversationAI_text_omitted', `Resposta de texto foi omitida devido ao uso de ferramenta silenciosa '${tool_request.name}'.`, { ...logContext, omittedResponse: response_to_client });
      }

      if (tool_request && tool_request.name) {
            logSystemInfo(userId, 'callConversationAI_tool_request', `IA solicitou uso da ferramenta: ${tool_request.name}`, { ...logContext, tool_request });

            const toolResult = await executeTool(userId, conversationId, tool_request);
            
            // ALWAYS add tool result to history, so the AI knows what happened.
            const toolResultText = `RESULTADO DA FERRAMENTA ${tool_request.name}: ${JSON.stringify(toolResult)}`;
            
            if (toolResult?.success === false) {
                 logSystemFailure(userId, 'callConversationAI_tool_failure', { message: `Ferramenta ${tool_request.name} falhou. Reiniciando ciclo de IA para tratamento de erro.` }, logContext);
                 currentToolFailureContext = toolResult?.error || `A ferramenta ${tool_request.name} falhou ao ser executada.`;
            }

            if (tool_request.name === 'scheduleAppointmentTool') {
                if (toolResult?.success && tool_request.args?.response_after_tool) {
                    logSystemInfo(userId, 'callConversationAI_schedule_success_break', 'Agendamento realizado com sucesso, enviando resposta pós-ferramenta.', logContext);
                    await handleAiMessageSend(userId, conversationId, userEmail, tool_request.args.response_after_tool, lastMessage);
                    break;
                }
            }


            if (tool_request.name === 'sendMediaMessageTool') {
                if (toolResult?.success && tool_request.args?.response_after_tool) {
                    logSystemInfo(userId, 'callConversationAI_media_success_break', 'Mídia enviada, agora enviando resposta de texto pós-ferramenta.', logContext);
                    await handleAiMessageSend(userId, conversationId, userEmail, tool_request.args.response_after_tool, lastMessage);
                    break; 
                }
            }
             if (tool_request.name === 'requestHumanSupportTool' && toolResult?.success) {
                logSystemInfo(userId, `callConversationAI_flow_break_after_tool`, `Ferramenta ${tool_request.name} executada com sucesso. Finalizando ciclo de pensamento.`, logContext);
                break;
            }
            if (tool_request.name === 'endConversationTool' && toolResult?.success) {
                logSystemInfo(userId, `callConversationAI_flow_break_after_tool`, `Ferramenta ${tool_request.name} executada com sucesso. Finalizando ciclo de pensamento.`, logContext);
                break;
            }
            
            const finalToolResultText = `${toolResultText}\nCom base nisso, sua prioridade é formular uma resposta para o cliente. NÃO IGNORE ESSE RESULTADO.`;
            currentPrompt = [...currentPrompt.slice(0, -1), { text: `${(currentPrompt.slice(-1)[0] as any).text}\n${finalToolResultText}` }];


      } else {
          logSystemInfo(userId, 'callConversationAI_no_tool_request', 'IA não solicitou ferramentas. Finalizando ciclo de pensamento.', logContext);
          break;
      }
  }
}

/**
 * O fluxo principal do Genkit que orquestra todo o processo de resposta a uma mensagem.
 */
const processConversationFlowV2 = ai.defineFlow(
  {
    name: 'processConversationFlowV2',
    inputSchema: ProcessConversationWithMessagesSchema,
    outputSchema: z.void(),
  },
  async (input: ProcessConversationWithMessagesInput) => {
    const { userId, conversation, messagesToProcess } = input;
    const conversationId = conversation.id;
    const adminFirestore = getAdminFirestore();
    const conversationRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId);

    logSystemInfo(userId, 'processConversationFlowV2_start', 'Flow started', { conversationId });
    try {
        await conversationRef.update({ isAiThinking: true });

        const currentConvoSnap = await conversationRef.get();
        if (!currentConvoSnap.exists) {
            throw new Error(`A conversa ${conversationId} não foi encontrada.`);
        }
        
        if (!messagesToProcess || messagesToProcess.length === 0) {
            logSystemInfo(userId, 'processConversationFlowV2_no_pending_messages', 'Nenhuma mensagem pendente encontrada. O fluxo será encerrado.', { conversationId });
            return;
        }

        logSystemInfo(userId, 'processConversationFlowV2_context_fetch_start', 'Iniciando coleta de contexto para o fluxo da IA.', { conversationId });
        
        const [automationSettings, aiConfig] = await Promise.all([
            adminFirestore.collection('users').doc(userId).collection('settings').doc('automation').get().then(doc => (doc.data() || {}) as Partial<AutomationSettings>),
            getAiSettings(userId)
        ]);
        logSystemInfo(userId, 'processConversationFlowV2_context_fetch_end', 'Coleta de contexto finalizada.', { conversationId });

        await callConversationAI(userId, currentConvoSnap.data() as Conversation, messagesToProcess, automationSettings, aiConfig);

    } catch (err: any) {
      logSystemFailure(userId, 'processConversationFlowV2_critical', { message: err.message, stack: err.stack }, { conversationId });
      await conversationRef.update({ folder: 'support', isAiActive: false, interventionReason: 'technical_failure' });
    } finally {
      await conversationRef.update({ isAiThinking: false });
      logSystemInfo(userId, 'processConversationFlowV2_end', 'Flow finished', { conversationId });
    }
  }
);
