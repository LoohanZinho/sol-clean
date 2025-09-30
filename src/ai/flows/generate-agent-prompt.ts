

/**
 * @fileOverview Fluxo para gerar e validar um prompt de sistema para o agente de IA.
 * Este fluxo atua como um despachante, selecionando o "prompter" especializado correto
 * com base na função do agente definida pelo usuário (ex: agendamento, vendas, SDR).
 * Após a geração, ele valida o prompt usando uma segunda IA para garantir qualidade e segurança.
 */
import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import { logSystemFailure, logSystemInfo } from './system-log-helpers';
import type { GenerateAgentPromptInput, GenerateAgentPromptOutput } from '@/lib/types';
import { GenerateAgentPromptInputSchema, GenerateAgentPromptOutputSchema } from '@/lib/schemas';
import { getPrompter } from '../prompters';


/**
 * Função principal (wrapper) que os componentes do lado do cliente chamam.
 * Ela simplesmente invoca o fluxo Genkit correspondente.
 * @param {GenerateAgentPromptInput} input - As configurações fornecidas pelo usuário no formulário do construtor de agente.
 * @returns {Promise<GenerateAgentPromptOutput>} O resultado da geração, incluindo o prompt, feedback e status.
 */
export async function generateAgentPrompt(input: GenerateAgentPromptInput): Promise<GenerateAgentPromptOutput> {
    // Invoca o fluxo Genkit correspondente.
    return generateAgentPromptFlow(input);
}


// --- Definições do Validador e do Fluxo Genkit ---

/**
 * @name promptValidator
 * @description O segundo cérebro de IA: o "Auditor de Qualidade".
 * Este prompt recebe o prompt que foi gerado por qualquer um dos prompters especializados
 * e sua única tarefa é analisá-lo criticamente, procurando por pontos fracos, ambiguidades ou
 * melhorias de segurança. Ele age como um revisor especialista.
 */
const promptValidator = ai.definePrompt({
    name: 'agentPromptValidator',
    model: googleAI.model('gemini-2.5-flash-lite'), // Usa um modelo mais rápido (Flash) pois a tarefa é mais simples.
    input: { schema: z.object({ generatedPrompt: z.string() }) }, // Recebe o prompt gerado.
    output: { schema: z.object({ feedback: z.string() }) }, // Retorna um feedback em texto.
    prompt: `Você é um Engenheiro de Prompts Sênior e especialista em segurança de IA. Sua tarefa é analisar o "System Prompt" a seguir.

**Regras da Análise:**
1.  **Idioma:** O feedback DEVE ser em português do Brasil.
2.  **Abstração:** Seja abstrato. NÃO mencione nomes de ferramentas ('tool') específicas. Foque na lógica e clareza das regras.
3.  **Análise Crítica:** Identifique pontos fracos, ambiguidades ou regras que podem ser melhoradas para tornar o agente mais seguro e eficaz. Verifique se as regras inegociáveis são claras, especialmente sobre não inventar informações.
4.  **Lógica de Resposta:**
    *   **Se encontrar melhorias:** Forneça um feedback construtivo e conciso em formato de lista (bullet points). O feedback deve ser curto e direto ao ponto. Use no máximo 3-4 bullet points.
    *   **Se o prompt estiver excelente:** Se você analisar e concluir que o prompt está robusto, claro e seguro, sem melhorias óbvias, responda **APENAS** com a frase: "Parabéns! Seu prompt está muito bem configurado e segue as melhores práticas de segurança e clareza."
5.  **Formato:** Não inclua introduções. Responda apenas com a lista de feedback ou com a mensagem de parabéns.

**System Prompt para Analisar:**
\`\`\`markdown
{{{generatedPrompt}}}
\`\`\`

Agora, forneça seu feedback conciso em português:`,
});

/**
 * @name generateAgentPromptFlow
 * @description O fluxo principal que orquestra todo o processo de geração e validação do "cérebro" da IA.
 * Esta função encapsula a lógica de:
 * 1. Selecionar o prompter correto com base na função do agente.
 * 2. Chamar o prompter para construir o prompt principal.
 * 3. Chamar uma segunda IA (`promptValidator`) para auditar a qualidade e segurança do prompt gerado.
 * 4. Retornar o prompt final e o feedback para a interface do usuário.
 *
 * @param {GenerateAgentPromptInput} input - Os dados do formulário preenchido pelo usuário.
 * @returns {Promise<GenerateAgentPromptOutput>} O resultado do fluxo, contendo o prompt gerado e o feedback.
 */
const generateAgentPromptFlow = ai.defineFlow(
  {
    name: 'generateAgentPromptFlow',
    inputSchema: GenerateAgentPromptInputSchema,
    outputSchema: GenerateAgentPromptOutputSchema,
  },
  async (input) => {
    const { userId, agentRole } = input;
    logSystemInfo(userId, 'generateAgentPromptFlow_start', 'Iniciando fluxo de geração de prompt.', { input });

    try {
        // --- Etapa 1: Selecionar e Gerar o prompt principal ---
        const prompter = getPrompter(agentRole);
        logSystemInfo(userId, 'generateAgentPromptFlow_generation_start', `Usando prompter: ${prompter.name}. Iniciando geração do prompt.`);
        
        const generatedPrompt = await prompter.generate(input);

        // Validação: Garante que a IA realmente retornou um prompt.
        if (!generatedPrompt) {
            logSystemFailure(userId, 'generateAgentPromptFlow_no_output', { message: 'O modelo gerador de prompt não retornou nenhum resultado.' }, {});
            return { success: false, error: 'A IA não conseguiu gerar um prompt. Tente novamente com mais detalhes.' };
        }
        logSystemInfo(userId, 'generateAgentPromptFlow_generated', 'Prompt do agente inicial gerado com sucesso.');

        // --- Etapa 2: Validar o prompt gerado ---
        let feedback: string | undefined = undefined;
        try {
            logSystemInfo(userId, 'generateAgentPromptFlow_validation_start', 'Iniciando etapa de validação do prompt.');
            const validationResult = await promptValidator({ generatedPrompt });
            feedback = validationResult.output?.feedback;
            logSystemInfo(userId, 'generateAgentPromptFlow_validation_success', 'Feedback de validação recebido com sucesso.', { feedback });
        } catch (validationError: any) {
            // Se o validador falhar, não quebramos o fluxo. Apenas registramos o erro e continuamos sem o feedback.
            logSystemFailure(userId, 'generateAgentPromptFlow_validation_failure', { message: `A etapa de validação do prompt falhou: ${validationError.message}` }, {});
        }
        
        // Retorna o resultado final para a interface do usuário.
        return { success: true, prompt: generatedPrompt, feedback: feedback };

    } catch (err: any) {
      // Exibe o erro no console do servidor para depuração.
      console.error("[ERRO NO FLUXO DE GERAÇÃO DE PROMPT]:", err);
      
      // Captura e registra qualquer erro não tratado que possa ocorrer durante a geração do prompt.
      await logSystemFailure(userId, 'generateAgentPromptFlow_failure', { message: err.message, stack: err.stack, details: err.details }, { input });
      
      // Retorna uma mensagem de erro amigável para o usuário.
      return { success: false, error: `Falha ao gerar o prompt: ${err.message}` };
    }
  }
);
