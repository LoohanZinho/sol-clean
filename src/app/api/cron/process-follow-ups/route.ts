

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { AutomationSettings, Conversation, FollowUpStep, AppMessage } from '@/lib/types';
import { sendTextMessage } from '@/actions/evolutionApiActions';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { isBusinessOpen } from '@/ai/flows/helpers';

/**
 * @fileoverview Endpoint para o trabalho agendado (cron job) que processa follow-ups automáticos.
 * Este endpoint é acionado periodicamente (ex: a cada hora) pelo App Engine Cron
 * para verificar conversas que estão aguardando um acompanhamento.
 */

initializeAdmin();

const APP_CHECK_HEADER = 'x-app-check-token';

/**
 * Manipula a requisição GET do Cron Job.
 * A função itera sobre todos os usuários, verifica suas configurações de automação,
 * e envia as mensagens de follow-up para as conversas elegíveis.
 *
 * @param {NextRequest} request - O objeto da requisição, que deve conter um token do App Check em produção.
 * @returns {NextResponse} Uma resposta JSON indicando o sucesso ou a falha da operação.
 */
export async function GET(request: NextRequest) {
    const appCheckToken = request.headers.get(APP_CHECK_HEADER);

    // Em produção, exige um token do App Check para segurança.
    if (process.env.NODE_ENV === 'production' && !appCheckToken) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const firestore = getAdminFirestore();
    const now = Timestamp.now();
    let processedCount = 0;

    try {
        const usersSnapshot = await firestore.collection('users').get();

        // Itera sobre todos os usuários do sistema.
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const settingsRef = firestore.collection('users').doc(userId).collection('settings').doc('automation');
            const settingsSnap = await settingsRef.get();
            const settings = settingsSnap.data() as AutomationSettings | undefined;

            // Pula para o próximo usuário se o follow-up não estiver ativado.
            if (!settings?.isFollowUpEnabled || !settings.followUps) {
                continue;
            }
            
            // Verifica o horário de funcionamento ANTES de buscar as conversas.
            if (settings.isBusinessHoursEnabled) {
                const businessIsOpen = await isBusinessOpen(userId);
                if (!businessIsOpen) {
                    logSystemInfo(userId, 'processFollowUps_skipped_closed', `Cron de follow-up pulado para o usuário ${userId} por estar fora do horário.`, {});
                    continue; // Pula para o próximo usuário se o negócio estiver fechado.
                }
            }


            // Busca por conversas que estão na caixa de entrada e têm um `nextFollowUpAt` no passado.
            const conversationsRef = firestore.collection('users').doc(userId).collection('conversations');
            const followUpQuery = conversationsRef
                .where('followUpState.nextFollowUpAt', '<=', now)
                .where('folder', '==', 'inbox');

            const snapshot = await followUpQuery.get();
            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const conversation = doc.data() as Conversation;

                // Verificação final: busca a última mensagem para garantir que o cliente não respondeu.
                const lastMessageQuery = await doc.ref.collection('messages').orderBy('timestamp', 'desc').limit(1).get();
                if (lastMessageQuery.empty) {
                    await doc.ref.update({ followUpState: FieldValue.delete() });
                    continue;
                }

                const lastMessage = lastMessageQuery.docs[0].data() as AppMessage;
                // Se a última mensagem for do usuário, cancela a sequência de follow-up.
                if (lastMessage.from === 'user') {
                    await doc.ref.update({ followUpState: FieldValue.delete() });
                    logSystemInfo(userId, 'processFollowUps_aborted', `Follow-up para ${conversation.id} abortado, cliente respondeu.`, { conversationId: conversation.id });
                    continue;
                }
                
                const currentStepName = conversation.followUpState?.step;
                if (!currentStepName) {
                     await doc.ref.update({ followUpState: FieldValue.delete() });
                     continue;
                }
                
                const currentFollowUpConfig: FollowUpStep | undefined = settings.followUps[currentStepName];

                // Envia a mensagem de follow-up se a etapa estiver configurada e ativa.
                if (currentFollowUpConfig && currentFollowUpConfig.enabled && currentFollowUpConfig.message) {
                    const result = await sendTextMessage({
                        userId,
                        phone: conversation.id,
                        message: currentFollowUpConfig.message,
                        source: 'ai',
                    });

                    if (result.success) {
                        processedCount++;
                        logSystemInfo(userId, 'processFollowUps_sent', `Follow-up '${currentStepName}' enviado para ${conversation.id}.`, { conversationId: conversation.id });
                    } else {
                        logSystemFailure(userId, 'processFollowUps_send_failed', { message: `Falha ao enviar follow-up para ${conversation.id}`, error: result.error }, { conversationId: conversation.id });
                         // Não agenda o próximo se o envio falhar.
                         await doc.ref.update({ followUpState: FieldValue.delete(), lastFollowUpSent: currentStepName });
                         continue;
                    }
                }
                
                // Determina e agenda a próxima etapa do follow-up.
                let nextStep: 'second' | 'third' | null = null;
                if (currentStepName === 'first') nextStep = 'second';
                else if (currentStepName === 'second') nextStep = 'third';

                const updateData: any = {
                    lastFollowUpSent: currentStepName,
                    followUpState: null // Limpa o estado atual por padrão.
                };
                
                const nextFollowUpConfig = nextStep ? settings.followUps[nextStep] : null;

                // Se houver uma próxima etapa válida, agenda-a.
                if (nextStep && nextFollowUpConfig && nextFollowUpConfig.enabled) {
                    const nextFollowUpDate = new Date();
                    nextFollowUpDate.setHours(nextFollowUpDate.getHours() + nextFollowUpConfig.intervalHours);
                    updateData.followUpState = {
                        nextFollowUpAt: Timestamp.fromDate(nextFollowUpDate),
                        step: nextStep,
                    };
                    logSystemInfo(userId, 'processFollowUps_scheduled_next', `Próximo follow-up '${nextStep}' agendado para ${conversation.id}.`, { conversationId: conversation.id });
                } else {
                     logSystemInfo(userId, 'processFollowUps_sequence_end', `Sequência de follow-up para ${conversation.id} finalizada.`, { conversationId: conversation.id });
                }

                await doc.ref.update(updateData);
            }
        }
        
        const successMessage = `Cron de follow-up concluído com sucesso. Processadas ${processedCount} conversas.`;
        return NextResponse.json({ message: successMessage });

    } catch (error: any) {
        console.error('CRÍTICO: Cron de follow-up falhou.', error);
        logSystemFailure('system_cron', 'processFollowUps_critical', { message: `Cron job falhou: ${error.message}`, stack: error.stack }, {});
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
