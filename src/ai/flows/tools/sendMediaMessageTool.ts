
import { z } from 'zod';
import { sendMediaMessage } from '@/actions/evolutionApiActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';
import { SendMediaMessageSchema } from '@/lib/schemas';
import { getAdminFirestore } from '@/lib/firebase-admin';


const name = 'sendMediaMessageTool';
const description = 'Envia uma mensagem com mídia (imagem, vídeo, PDF, etc.) para o cliente. Use esta ferramenta quando a base de conhecimento indicar uma ou mais URLs de mídia para um produto ou serviço solicitado. Você pode usar o campo `response_after_tool` para definir uma mensagem de texto que será enviada após o sucesso do envio da mídia, para continuar a conversa.';

export const sendMediaMessageToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: SendMediaMessageSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof SendMediaMessageSchema>, context: { userId: string, conversationId: string }) => {
        const firestore = getAdminFirestore();
        const userDoc = await firestore.collection('users').doc(context.userId).get();
        const instanceName = userDoc.data()?.email;

        if (!instanceName) {
            throw new Error(`Email do usuário (instanceName) não encontrado para userId: ${context.userId}`);
        }

        return await sendMediaMessage({
            userId: context.userId,
            phone: context.conversationId,
            instanceName,
            ...input,
        });
    }
};

export const sendMediaMessageSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: SendMediaMessageSchema,
};

    