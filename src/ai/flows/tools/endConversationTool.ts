import { z } from 'zod';
import { EndConversationSchema } from '@/lib/schemas';
import { endConversation } from '@/actions/conversationActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'endConversationTool';
const description = 'Use esta ferramenta para finalizar e arquivar uma conversa quando o objetivo principal do cliente for completamente resolvido.';

export const endConversationToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: EndConversationSchema,
    isSilent: false,
    fn: async (input: z.infer<typeof EndConversationSchema>, context: { userId: string, conversationId: string }) => {
        return await endConversation(context.userId, context.conversationId, input);
    }
};

export const endConversationSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: EndConversationSchema,
};
