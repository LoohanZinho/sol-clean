'use server';

/**
 * @fileOverview Ações do lado do servidor para a página de testes.
 * Este arquivo busca e formata as definições das ferramentas da IA para serem
 * exibidas com segurança em um Componente de Cliente, sem vazar
 * dependências do lado do servidor para o cliente.
 */

import { allSerializableToolDefs, type SerializableToolDefinition } from '@/ai/flows/tools';
import { z } from 'zod';

// Define um tipo serializável para a forma do schema Zod.
export interface SerializableSchemaField {
    type: string;
    description: string | undefined;
    isOptional: boolean;
}

// Renomeia a interface para evitar conflito e corresponder ao uso.
export interface SerializableToolDefinitionForClient {
    name: string;
    description: string;
    inputSchema: Record<string, SerializableSchemaField>;
    isSilent: boolean;
}

export type CategorizedTools = Record<string, SerializableToolDefinitionForClient[]>;

/**
 * Serializa a definição completa de uma ferramenta, incluindo seu schema Zod,
 * para um formato seguro que pode ser enviado para o cliente.
 *
 * @param tool A definição da ferramenta a ser serializada.
 * @returns A definição da ferramenta pronta para o cliente.
 */
function serializeToolForClient(tool: SerializableToolDefinition & { isSilent: boolean }): SerializableToolDefinitionForClient {
    const shape = tool.inputSchema.shape;
    const serializableSchema: Record<string, SerializableSchemaField> = {};

    for (const key in shape) {
        const field = shape[key] as z.ZodTypeAny;
        serializableSchema[key] = {
            type: (field._def as any).typeName,
            description: field.description,
            isOptional: field.isOptional(),
        };
    }

    return {
        name: tool.name,
        description: tool.description,
        inputSchema: serializableSchema, // Agora passamos o objeto serializado.
        isSilent: tool.isSilent,
    };
}


/**
 * Uma Ação de Servidor que busca todas as definições de ferramentas da IA,
 * as categoriza por função e as formata em um objeto serializável.
 *
 * @returns {Promise<CategorizedTools>} Um objeto onde cada chave é uma categoria de agente
 * e o valor é uma lista de ferramentas prontas para o cliente.
 */
export async function getToolDefinitions(): Promise<CategorizedTools> {
    const categorized: CategorizedTools = {
        'Agendamento': [],
        'Gerenciamento de Conversa': [],
        'Geral': [],
    };
    
    const toolToCategory: Record<string, keyof CategorizedTools> = {
        'getAvailableSlotsTool': 'Agendamento',
        'scheduleAppointmentTool': 'Agendamento',
        'listEventsTool': 'Agendamento',
        'cancelAppointmentTool': 'Agendamento',
        'endConversationTool': 'Gerenciamento de Conversa',
        'requestHumanSupportTool': 'Gerenciamento de Conversa',
        'summarizeConversationTool': 'Gerenciamento de Conversa',
        'updateClientInfoTool': 'Geral',
        'updateConversationTagsTool': 'Geral',
        'sendMediaMessageTool': 'Geral',
    };

    allSerializableToolDefs.forEach((tool) => {
        const category = toolToCategory[tool.name] || 'Geral';
        categorized[category].push(serializeToolForClient(tool));
    });

    return categorized;
}
