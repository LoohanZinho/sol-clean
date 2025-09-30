
'use server';

/**
 * @fileOverview Fluxo para gerar sugestões de conteúdo para campos específicos do Construtor de Agente.
 * Este fluxo usa a IA para ajudar o usuário a preencher campos que podem ser mais subjetivos,
 * como "Erros a Evitar" ou "Gatilhos para Suporte Humano", com base no contexto do negócio.
 */
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import { logSystemFailure, logSystemInfo } from './system-log-helpers';
import type { GenerateFieldSuggestionInput, GenerateFieldSuggestionOutput } from '@/lib/types';
import { GenerateFieldSuggestionInputSchema, GenerateFieldSuggestionOutputSchema } from '@/lib/schemas';


// Um mapa de prompts, onde cada chave corresponde a um campo do formulário
// para o qual queremos gerar sugestões.
const SUGGESTION_PROMPTS: Record<string, string> = {
    commonMistakes: `
        Você é um consultor de negócios experiente. Com base na descrição do negócio e no papel do agente de IA fornecidos, gere uma lista concisa em formato de bullet points (usando '-') com 3 a 5 "Erros Comuns a Evitar".
        As sugestões devem ser práticas e focadas em prevenir problemas de atendimento ao cliente para este tipo de negócio específico.
        
        Exemplo para uma pizzaria:
        - Prometer prazos de entrega que não podem ser cumpridos.
        - Oferecer sabores ou ingredientes que não estão no cardápio.
        - Esquecer de perguntar sobre informações de entrega (endereço, complemento).
        - Dar opiniões pessoais sobre os sabores.

        **Descrição do Negócio:** {{{businessDescription}}}
        **Papel do Agente:** {{{agentRole}}}

        Agora, gere a lista de erros a evitar:
    `,
    humanizationTriggers: `
        Você é um especialista em otimização de atendimento ao cliente. Com base na descrição do negócio e no papel do agente de IA, gere uma lista concisa em formato de bullet points (usando '-') com 3 a 5 "Gatilhos para Suporte Humano".
        As sugestões devem ser situações claras e inequívocas onde a intervenção humana é preferível para garantir a satisfação do cliente ou para lidar com casos complexos.

        Exemplo para um e-commerce de roupas:
        - Cliente menciona um problema com um pedido já realizado (ex: "meu pedido veio errado").
        - Reclamações sobre a qualidade de um produto.
        - Cliente pede para falar diretamente com um gerente ou responsável.
        - Dúvidas sobre devoluções ou trocas que não estão no FAQ.
        - Cliente expressa alta frustração ou irritação.

        **Descrição do Negócio:** {{{businessDescription}}}
        **Papel do Agente:** {{{agentRole}}}

        Agora, gere a lista de gatilhos para suporte humano:
    `,
};


/**
 * Função principal (wrapper) que os componentes do lado do cliente chamam
 * para obter sugestões para um campo.
 * @param {GenerateFieldSuggestionInput} input - Os dados de entrada, incluindo o nome do campo.
 * @returns {Promise<GenerateFieldSuggestionOutput>} O resultado da geração, contendo a sugestão.
 */
export async function generateFieldSuggestion(input: GenerateFieldSuggestionInput): Promise<GenerateFieldSuggestionOutput> {
    return generateFieldSuggestionFlow(input);
}


/**
 * @name generateFieldSuggestionFlow
 * @description O fluxo Genkit que seleciona o prompt correto com base no nome do campo
 * e chama a IA para gerar a sugestão.
 * @param {GenerateFieldSuggestionInput} input - Os dados de entrada do fluxo.
 * @returns {Promise<GenerateFieldSuggestionOutput>} O resultado da operação.
 */
const generateFieldSuggestionFlow = ai.defineFlow(
  {
    name: 'generateFieldSuggestionFlow',
    inputSchema: GenerateFieldSuggestionInputSchema,
    outputSchema: GenerateFieldSuggestionOutputSchema,
  },
  async (input) => {
    const { userId, fieldName, businessDescription, agentRole } = input;
    logSystemInfo(userId, 'generateFieldSuggestion_start', `Iniciando geração de sugestão para o campo: ${fieldName}.`, { fieldName });

    // Seleciona o template de prompt correto do mapa.
    const promptText = SUGGESTION_PROMPTS[fieldName];
    if (!promptText) {
        const errorMsg = `Nenhum prompt definido para o nome do campo: ${fieldName}`;
        logSystemFailure(userId, 'generateFieldSuggestion_error', { message: errorMsg }, {});
        return { success: false, error: errorMsg };
    }

    try {
        // Define um prompt dinamicamente para a tarefa.
        const prompt = ai.definePrompt(
          {
            name: `suggestionPromptFor_${fieldName}`,
            model: googleAI.model('gemini-2.5-flash-lite'),
            input: { schema: z.object({ businessDescription: z.string(), agentRole: z.string() }) },
            output: { schema: z.object({ suggestion: z.string() }) },
            prompt: promptText,
          }
        );

        // Chama a IA com o contexto do negócio.
        const llmResponse = await prompt({ businessDescription, agentRole });
        
        const suggestion = llmResponse.output?.suggestion;

        if (!suggestion) {
            logSystemFailure(userId, 'generateFieldSuggestion_no_output', { message: 'O modelo gerador de sugestão não retornou nenhum resultado.' }, { fieldName });
            return { success: false, error: 'A IA não conseguiu gerar uma sugestão. Tente novamente.' };
        }

        logSystemInfo(userId, 'generateFieldSuggestion_success', `Sugestão para ${fieldName} gerada com sucesso.`);
        return { success: true, suggestion };

    } catch (error: any) {
      logSystemFailure(userId, 'generateFieldSuggestion_failure', { message: error.message, stack: error.stack }, { fieldName });
      return { success: false, error: `Falha ao gerar sugestão: ${error.message}` };
    }
  }
);
