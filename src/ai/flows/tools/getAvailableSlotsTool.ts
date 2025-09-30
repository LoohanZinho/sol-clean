import { z } from 'zod';
import { GetAvailableSlotsSchema } from '@/lib/schemas';
import { checkAvailability } from '@/actions/appointmentActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'getAvailableSlotsTool';
const description = 'Verifica a agenda do Google Calendar para um período de datas e retorna os horários de funcionamento e uma lista de horários já ocupados para cada dia. Essencial para verificar a disponibilidade antes de marcar um novo compromisso. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "amanhã" ou "próxima semana") para o formato absoluto DD/MM/AAAA antes de usar esta ferramenta.';

export const getAvailableSlotsToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: GetAvailableSlotsSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof GetAvailableSlotsSchema>, context: { userId: string, conversationId: string }) => {
        return await checkAvailability(context.userId, context.conversationId, input);
    }
};

export const getAvailableSlotsSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: GetAvailableSlotsSchema,
};
