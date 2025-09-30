import { z } from 'zod';
import { UpdateClientInfoSchema } from '@/lib/schemas';
import { updateClientInfo } from '@/actions/conversationActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'updateClientInfoTool';
const description = "Salva ou atualiza informações sobre o cliente. Use o campo 'addressText' para registrar qualquer menção a endereço, mesmo que informal (ex: \"moro na rua X\"). Use 'notes' para salvar preferências ou outras informações relevantes.";

export const updateClientInfoToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: UpdateClientInfoSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof UpdateClientInfoSchema>, context: { userId: string, conversationId: string }) => {
        return await updateClientInfo(context.userId, context.conversationId, input);
    }
};

export const updateClientInfoSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: UpdateClientInfoSchema,
};
