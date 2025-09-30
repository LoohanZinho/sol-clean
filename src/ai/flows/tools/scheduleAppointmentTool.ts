import { ScheduleAppointmentSchema } from '@/lib/schemas';
import { createAppointment } from '@/actions/appointmentActions';
import { z } from 'zod';
import type { ToolDefinition, SerializableToolDefinition } from './index';

const name = 'scheduleAppointmentTool';
const description = 'Use esta ferramenta para agendar um serviço para um cliente. Você deve ter coletado o nome do serviço, o dia e o horário antes de usar. Use o campo `response_after_tool` para definir a mensagem de confirmação que o sistema deve enviar se o agendamento for bem-sucedido. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "amanhã") para o formato absoluto DD/MM/AAAA antes de usar esta ferramenta.';

export const scheduleAppointmentToolDef: ToolDefinition = {
    name,
    description,
    inputSchema: ScheduleAppointmentSchema,
    isSilent: true,
    fn: async (input: z.infer<typeof ScheduleAppointmentSchema>, context: { userId: string, conversationId: string }) => {
        return await createAppointment(context.userId, context.conversationId, input);
    }
};

export const scheduleAppointmentSerializableToolDef: SerializableToolDefinition = {
    name,
    description,
    inputSchema: ScheduleAppointmentSchema,
};
