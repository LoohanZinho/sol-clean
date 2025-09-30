import { z } from 'zod';
import { ListEventsSchema } from '@/lib/schemas';
import { listCalendarEvents } from '@/actions/appointmentActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'listEventsTool';
const description = 'Busca e lista os compromissos existentes na agenda do Google Calendar dentro de um período de datas específico. Retorna os detalhes de cada evento, incluindo o ID necessário para cancelamento ou reagendamento. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "hoje", "esta semana" ou "próximo mês") para um intervalo com data de início e fim no formato absoluto DD/MM/AAAA antes de usar esta ferramenta.';

export const listEventsToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: ListEventsSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof ListEventsSchema>, context: { userId: string, conversationId: string }) => {
        return await listCalendarEvents(context.userId, context.conversationId, input);
    }
};

export const listEventsSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: ListEventsSchema,
};
