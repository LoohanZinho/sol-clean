

'use server';

/**
 * @fileoverview Funções de Serviço para Agendamentos (Appointment Service Functions).
 * Este arquivo centraliza toda a lógica de negócio para interagir com a API do Google Calendar.
 * As funções aqui são "burras" em relação à IA; elas apenas recebem dados estruturados,
 * executam a lógica de negócio (chamar a API do Google, interagir com o Firestore)
 * e retornam um resultado de sucesso ou falha. Elas são projetadas para serem chamadas
 * pelas "ferramentas-ponte" da IA (os `ToolDefinition` em `src/ai/flows/tools/`).
 */

import { google } from 'googleapis';
import { getAuthClient } from '@/actions/google-auth-actions';
import { findAndTriggerActions } from '@/actions/webhookSender';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import type { Conversation } from '@/lib/types';
import type { z } from 'zod';
import type { CancelAppointmentSchema, GetAvailableSlotsSchema, ListEventsSchema, ScheduleAppointmentSchema } from '@/lib/schemas';

/**
 * @typedef {object} DaySchedule
 * @property {boolean} enabled - Se o dia de trabalho está ativo para agendamentos.
 * @property {Array<{start: string, end: string}>} slots - Os múltiplos intervalos de tempo de trabalho para aquele dia.
 */
type DaySchedule = {
    enabled: boolean;
    slots: { start: string; end: string }[];
};

/**
 * Função auxiliar para buscar as configurações de horário de funcionamento do Firestore.
 * Esses horários são configurados pelo usuário no painel de 'Ajustes > Horários' e definem
 * os períodos em que a IA pode marcar compromissos.
 *
 * @param {string} userId - O ID do usuário para buscar as configurações.
 * @returns {Promise<Record<string, DaySchedule>>} Um objeto onde cada chave é um dia da semana
 *   (ex: 'segunda') e o valor é o `DaySchedule` correspondente. Retorna um objeto vazio se
 *   nenhuma configuração for encontrada, o que implica funcionamento 24/7.
 */
async function getBusinessHours(userId: string): Promise<Record<string, DaySchedule>> {
    const firestore = getAdminFirestore();
    const docRef = firestore.collection('users').doc(userId).collection('settings').doc('businessHours');
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return docSnap.data() as Record<string, DaySchedule>;
    }
    // Se não estiver configurado, retorna um objeto vazio, indicando que a empresa funciona 24/7.
    return {};
}

/**
 * Cria um novo agendamento no Google Calendar.
 * Esta função é chamada pela `scheduleAppointmentTool` quando a IA decide criar um evento.
 *
 * @param {string} userId - O ID do usuário dono da agenda.
 * @param {string} conversationId - O ID da conversa onde o agendamento foi solicitado.
 * @param {object} appointmentDetails - Um objeto com os detalhes do agendamento (serviço, data, hora)
 *   coletados pela IA, validados pelo `ScheduleAppointmentSchema`.
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 *   `message` é retornado em caso de sucesso, e `error` em caso de falha.
 */
export async function createAppointment(
    userId: string, 
    conversationId: string, 
    appointmentDetails: z.infer<typeof ScheduleAppointmentSchema>
) {
    try {
        const { serviceName, appointmentDate, appointmentTime, clientFullName, description } = appointmentDetails;
        
        // 1. Obter um cliente autenticado da API do Google, que lida com a atualização de tokens.
        const authClient = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth: authClient });

        // 2. Converter a data e hora recebidas (DD/MM/AAAA e HH:mm) para o formato ISO 8601,
        //    considerando o fuso horário de São Paulo para consistência.
        const [day, month, year] = appointmentDate.split('/').map(Number);
        const [hours, minutes] = appointmentTime.split(':').map(Number);
        
        // Cria o objeto Date em UTC e ajusta para o fuso horário de São Paulo (UTC-3).
        const eventStartTime = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes));

        // Define a duração do evento como 1 hora.
        const eventEndTime = new Date(eventStartTime.getTime() + 60 * 60 * 1000);
        
        // 3. Buscar o nome do cliente no perfil da conversa como fallback, caso a IA não tenha fornecido.
        const firestore = getAdminFirestore();
        const conversationRef = firestore.collection('users').doc(userId).collection('conversations').doc(conversationId);
        const convoSnap = await conversationRef.get();
        const conversationData = convoSnap.data() as Conversation;
        const finalClientName = clientFullName || conversationData?.preferredName || conversationData?.name || 'Cliente';

        // 4. Inserir o evento na agenda primária do usuário.
        const createdEvent = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: `${serviceName} - ${finalClientName}`,
                description: description || `Agendamento criado via assistente de IA. Cliente: ${finalClientName}.`,
                start: { dateTime: eventStartTime.toISOString(), timeZone: 'America/Sao_Paulo' },
                end: { dateTime: eventEndTime.toISOString(), timeZone: 'America/Sao_Paulo' },
            },
        });
        
        // 5. Disparar uma ação de webhook (se configurada) para notificar sistemas externos sobre o novo agendamento.
        findAndTriggerActions(userId, 'appointment_scheduled', { 
            conversationId, 
            appointment: { 
                eventId: createdEvent.data.id, 
                ...appointmentDetails, 
                clientFullName: finalClientName 
            } 
        });

        // Retorna sucesso para a ferramenta da IA.
        return { success: true, message: 'Agendamento salvo com sucesso no sistema.' };
    } catch (err: any) {
        logSystemFailure(userId, 'createAppointment_service_failure', { message: err.message, stack: err.stack }, { conversationId, appointmentDetails });
        return { success: false, error: `Falha ao criar o evento na agenda: ${err.message}` };
    }
}


/**
 * Cancela um agendamento existente no Google Calendar.
 * Chamada pela `cancelAppointmentTool`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém o ID do evento a ser cancelado.
 * @returns {Promise<{success: boolean, message?: string, error?: string}>} O resultado da operação.
 */
export async function cancelAppointment(
    userId: string, 
    conversationId: string, 
    { eventId }: z.infer<typeof CancelAppointmentSchema>
) {
    try {
        const authClient = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth: authClient });
        
        // Medida de segurança: verifica se o evento existe antes de tentar deletá-lo.
        try {
            await calendar.events.get({ calendarId: 'primary', eventId });
        } catch (e: any) {
             // Se o erro for 404, significa que o evento não foi encontrado (talvez já cancelado).
             if (e.code === 404) {
                return { success: false, error: "O evento não foi encontrado ou já foi cancelado." };
            }
            throw e; // Relança outros erros para o bloco catch principal.
        }
        
        // Deleta o evento.
        await calendar.events.delete({ calendarId: 'primary', eventId: eventId });
        
        // Dispara uma ação de webhook para notificar sobre o cancelamento.
        findAndTriggerActions(userId, 'appointment_rescheduled_or_canceled', { conversationId, eventId, action: 'canceled' });
        
        return { success: true, message: "O agendamento foi cancelado com sucesso." };
    } catch (err: any) {
        logSystemFailure(userId, 'cancelAppointment_service_failure', { message: err.message, stack: err.stack }, { conversationId, eventId });
        return { success: false, error: `Falha ao cancelar o evento: ${err.message}` };
    }
}


/**
 * Lista os eventos de um período no Google Calendar.
 * Chamada pela `listEventsTool`. Usada principalmente para que o cliente possa
 * confirmar qual evento deseja cancelar ou reagendar.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém as datas de início e fim da busca, no formato DD/MM/AAAA.
 * @returns {Promise<{success: boolean, events?: object[], error?: string}>} Uma lista de eventos
 *   formatados ou um erro em caso de falha.
 */
export async function listCalendarEvents(
    userId: string, 
    conversationId: string, 
    { startDate, endDate }: z.infer<typeof ListEventsSchema>
) {
    try {
        const authClient = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth: authClient });

        // Valida e converte as datas do formato DD/MM/AAAA para objetos Date.
        const parseDate = (dateStr: string, fieldName: string) => {
            if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
                throw new Error(`Formato de data inválido para '${fieldName}'. Esperado é DD/MM/AAAA.`);
            }
            const [day, month, year] = dateStr.split('/').map(Number);
            return new Date(Date.UTC(year, month - 1, day));
        };

        const timeMin = parseDate(startDate, 'startDate');
        const timeMax = parseDate(endDate, 'endDate');
        timeMax.setUTCHours(23, 59, 59); // Garante que a busca inclua o dia todo.

        // Busca os eventos na API do Google Calendar.
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: 'America/Sao_Paulo',
        });

        const calendarEvents = response.data.items;
        if (!calendarEvents || calendarEvents.length === 0) {
            return { success: true, events: [] };
        }
        
        // Formata a data/hora para um formato legível em português.
        const formatDateTime = (dateTimeStr: string | null | undefined) => {
            if (!dateTimeStr) return 'Data/hora não especificada';
             return new Date(dateTimeStr).toLocaleString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
            });
        }

        // Mapeia os eventos para um formato limpo, protegendo a privacidade.
        const events = calendarEvents.map(event => ({
            id: event.id || 'N/A',
            // PRIVACIDADE: Nunca retorna o título real do evento para a IA.
            // A IA só precisa saber que o horário está ocupado e ter o ID para ações futuras.
            summary: 'Compromisso Ocupado', 
            start: formatDateTime(event.start?.dateTime || event.start?.date),
            end: formatDateTime(event.end?.dateTime || event.end?.date),
        }));

        return { success: true, events };

    } catch (error: any) {
        logSystemFailure(userId, 'listCalendarEvents_service_failure', { message: error.message, stack: error.stack }, { conversationId, startDate, endDate });
        return { success: false, error: error.message };
    }
}


/**
 * Verifica a disponibilidade em um período na agenda do usuário.
 * Chamada pela `getAvailableSlotsTool`.
 *
 * @param {string} userId - ID do usuário.
 * @param {string} conversationId - ID da conversa.
 * @param {object} input - Contém as datas de início e fim a serem verificadas, no formato DD/MM/AAAA.
 * @returns {Promise<{success: boolean, days?: object[], error?: string}>}
 *   Retorna uma lista de dias com seus respectivos horários de funcionamento e horários já ocupados.
 */
export async function checkAvailability(
    userId: string,
    conversationId: string,
    { startDate, endDate }: z.infer<typeof GetAvailableSlotsSchema>
) {
    const parseDate = (dateStr: string, fieldName: string) => {
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            throw new Error(`Formato de data inválido para '${fieldName}'. Esperado é DD/MM/AAAA.`);
        }
        const [day, month, year] = dateStr.split('/').map(Number);
        return new Date(Date.UTC(year, month - 1, day));
    };

    try {
        const timeMin = parseDate(startDate, 'startDate');
        const timeMax = parseDate(endDate, 'endDate');
        timeMax.setUTCHours(23, 59, 59, 999);

        const authClient = await getAuthClient(userId);
        const calendar = google.calendar({ version: 'v3', auth: authClient });

        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            timeZone: 'America/Sao_Paulo',
        });

        const allBusinessHours = await getBusinessHours(userId);
        const daysOfWeek = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

        const availabilityByDay: Record<string, { businessHours: string; busySlots: { start: string; end: string }[] }> = {};

        // Inicializa todos os dias no intervalo
        for (let d = new Date(timeMin); d <= timeMax; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateKey = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const dayOfWeekName = daysOfWeek[d.getUTCDay()];
            const daySchedule = allBusinessHours[dayOfWeekName];

            let businessHoursString = 'Aberto o dia todo';
            if (daySchedule) {
                if (!daySchedule.enabled || !daySchedule.slots || daySchedule.slots.length === 0) {
                    businessHoursString = 'Fechado';
                } else {
                    businessHoursString = daySchedule.slots.map(s => `${s.start}-${s.end}`).join(', ');
                }
            }
            availabilityByDay[dateKey] = { businessHours: businessHoursString, busySlots: [] };
        }

        // Preenche os horários ocupados
        response.data.items?.forEach(event => {
            const start = event.start?.dateTime || event.start?.date;
            if (!start) return;

            const eventDate = new Date(start);
            const dateKey = eventDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

            if (availabilityByDay[dateKey]) {
                const formatTime = (dt: string | null | undefined) => {
                    if (!dt) return 'All-day';
                    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                };

                const slot = {
                    start: formatTime(event.start?.dateTime),
                    end: formatTime(event.end?.dateTime),
                };
                
                if (slot.start !== 'All-day') {
                    availabilityByDay[dateKey].busySlots.push(slot);
                }
            }
        });
        
        const resultDays = Object.entries(availabilityByDay).map(([date, data]) => ({
             date,
             ...data,
        }));

        return { success: true, days: resultDays };

    } catch (error: any) {
        logSystemFailure(userId, 'checkAvailability_service_failure', { message: error.message, stack: error.stack }, { conversationId, startDate, endDate });
        return { success: false, error: error.message };
    }
}
