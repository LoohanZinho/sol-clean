import { z } from 'zod';
import { SummarizeConversationSchema } from '@/lib/schemas';
import { summarizeConversation } from '@/actions/conversationActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'summarizeConversationTool';
const description = 'Analisa um histórico de conversa e salva um resumo no perfil do cliente. Não deve ser chamado diretamente pela IA principal.';

export const summarizeConversationToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: SummarizeConversationSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof SummarizeConversationSchema>, context: { userId: string, conversationId: string }) => {
        return await summarizeConversation(context.userId, context.conversationId, input);
    }
};

export const summarizeConversationSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: SummarizeConversationSchema,
};
