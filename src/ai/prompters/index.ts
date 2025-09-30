import { defaultPrompter } from './default-prompter';
import { schedulingPrompter } from './scheduling-prompter';
import { sdrPrompter } from './sdr-prompter';
import { supportPrompter } from './support-prompter';
import { routingPrompter } from './routing-prompter';
import type { GenerateAgentPromptInput } from '@/lib/types';

export interface Prompter {
    name: string;
    generate: (input: GenerateAgentPromptInput) => Promise<string | undefined>;
}

const prompters: Record<string, Prompter> = {
    'Agendar / Marcar Horários': schedulingPrompter,
    'SDR (Qualificar Leads)': sdrPrompter,
    'Suporte / Tirar Dúvidas': supportPrompter,
    'Roteamento / Triagem': routingPrompter,
};

/**
 * Seleciona e retorna o prompter especializado com base na função do agente.
 * Se nenhuma correspondência for encontrada, retorna o prompter padrão.
 * @param {string | undefined} agentRole - A função do agente.
 * @returns {Prompter} O prompter correspondente.
 */
export function getPrompter(agentRole: string | undefined): Prompter {
    if (agentRole && prompters[agentRole]) {
        return prompters[agentRole];
    }
    return defaultPrompter;
}
