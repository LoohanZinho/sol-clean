import { z } from 'zod';
import { CancelAppointmentSchema } from '@/lib/schemas';
import { cancelAppointment } from '@/actions/appointmentActions';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'cancelAppointmentTool';
const description = 'Cancela um compromisso existente no Google Calendar. Use esta ferramenta APÓS ter confirmado com o cliente qual evento ele deseja cancelar, usando a `listEventsTool` para obter o `eventId`.';

export const cancelAppointmentToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: CancelAppointmentSchema,
    isSilent: false,
    fn: async (input: z.infer<typeof CancelAppointmentSchema>, context: { userId: string, conversationId: string }) => {
        return await cancelAppointment(context.userId, context.conversationId, input);
    }
};

export const cancelAppointmentSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: CancelAppointmentSchema,
};
