
'use server';

/**
 * @fileOverview Ações do lado do servidor para manipulação da configuração do agente de IA.
 * Este arquivo atua como uma ponte entre os componentes do lado do cliente (React)
 * e os fluxos de IA (Genkit), garantindo que a lógica de negócio principal permaneça
 * no servidor e que as chaves de API sejam manuseadas de forma segura.
 */

import { generateAgentPrompt } from '@/ai/flows/generate-agent-prompt';
import type { GenerateAgentPromptInput, GenerateAgentPromptOutput } from '@/lib/types';
import { GenerateAgentPromptInputSchema } from '@/lib/schemas';


/**
 * Uma Ação de Servidor que invoca o fluxo Genkit `generateAgentPrompt`.
 * A principal vantagem de usar uma Server Action aqui é a segurança: o fluxo de IA
 * usará a `GEMINI_API_KEY` configurada no ambiente do servidor (seja do .env local ou
 * do Secret Manager em produção), em vez de exigir que o cliente a forneça.
 *
 * @param {GenerateAgentPromptInput} input - O objeto contendo todos os detalhes de configuração
 *   fornecidos pelo usuário na página do Construtor de Agente.
 * @returns {Promise<GenerateAgentPromptOutput>} Uma promessa que resolve para o resultado da
 *   geração do prompt, incluindo o prompt gerado, feedback da IA, e um status de sucesso ou falha.
 */
export async function generateAgentPromptAction(input: GenerateAgentPromptInput): Promise<GenerateAgentPromptOutput> {
    // Valida o objeto de entrada com o schema Zod para garantir a integridade dos tipos.
    // Se a validação falhar, ela lançará um erro, que será capturado pelo Next.js.
    GenerateAgentPromptInputSchema.parse(input);
    
    // Chama o fluxo Genkit e retorna seu resultado diretamente para o cliente.
    return await generateAgentPrompt(input);
}
