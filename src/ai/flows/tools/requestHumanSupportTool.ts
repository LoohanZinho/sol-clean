import { z } from 'zod';
import { RequestHumanSupportSchema } from '@/lib/schemas';
import { requestHumanSupport } from '@/actions/conversationActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'requestHumanSupportTool';
const description = 'Use esta ferramenta SEMPRE que o cliente pedir para falar com um humano, se mostrar muito irritado, ou se você for incapaz de ajudar após tentar entender duas vezes. Isso irá transferir a conversa para um atendente humano.';

export const requestHumanSupportToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: RequestHumanSupportSchema,
    isSilent: false,
    fn: async (input: z.infer<typeof RequestHumanSupportSchema>, context: { userId: string, conversationId: string }) => {
        return await requestHumanSupport(context.userId, context.conversationId, input);
    }
};

export const requestHumanSupportSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: RequestHumanSupportSchema,
};
