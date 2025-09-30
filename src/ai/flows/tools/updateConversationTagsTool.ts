import { z } from 'zod';
import { UpdateConversationTagsSchema } from '@/lib/schemas';
import { updateConversationTags } from '@/actions/conversationActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'updateConversationTagsTool';
const description = 'Adiciona ou atualiza as etiquetas (tags) de uma conversa para ajudar na organização e classificação. Use para categorizar o assunto principal da conversa (ex: "Agendamento", "Orçamento", "Dúvida de Produto").';

export const updateConversationTagsToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: UpdateConversationTagsSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof UpdateConversationTagsSchema>, context: { userId: string, conversationId: string }) => {
        return await updateConversationTags(context.userId, context.conversationId, input);
    }
};

export const updateConversationTagsSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: UpdateConversationTagsSchema,
};
