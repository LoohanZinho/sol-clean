

'use server';

/**
 * @fileoverview Fluxo para enviar uma mensagem de confirmação de pagamento.
 * Este fluxo é acionado pelo webhook do Mercado Pago após um pagamento ser aprovado.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { sendTextMessage } from '@/actions/evolutionApiActions';
import { logSystemFailure, logSystemInfo } from './system-log-helpers';
import type { Order } from '@/lib/types';
import { googleAI } from '@genkit-ai/googleai';
import { getAiConfig } from './helpers';

const SendPaymentConfirmationSchema = z.object({
  userId: z.string(),
  orderId: z.string(),
  conversationId: z.string(),
});

/**
 * Função principal que envia a confirmação de pagamento.
 * @param {object} input - Contém os IDs necessários para o processo.
 */
export async function sendPaymentConfirmation(input: z.infer<typeof SendPaymentConfirmationSchema>): Promise<void> {
    try {
        await sendPaymentConfirmationFlow(input);
    } catch (error: any) {
        logSystemFailure(input.userId, 'sendPaymentConfirmation_flow_error', { message: error.message, stack: error.stack }, { orderId: input.orderId });
    }
}

/**
 * @name sendPaymentConfirmationFlow
 * @description O fluxo Genkit que gera e envia a mensagem de confirmação de pagamento.
 */
const sendPaymentConfirmationFlow = ai.defineFlow(
  {
    name: 'sendPaymentConfirmationFlow',
    inputSchema: SendPaymentConfirmationSchema,
    outputSchema: z.void(),
  },
  async ({ userId, orderId, conversationId }) => {
    logSystemInfo(userId, 'sendPaymentConfirmation_start', 'Iniciando fluxo de confirmação de pagamento.', { orderId, conversationId });

    const firestore = getAdminFirestore();
    
    try {
        // 1. Busca os detalhes do pedido e a configuração da IA em paralelo.
        const [orderSnap, aiConfig] = await Promise.all([
            firestore.collection('users').doc(userId).collection('orders').doc(orderId).get(),
            getAiConfig(userId)
        ]);
        
        if (!orderSnap.exists) {
            throw new Error(`Pedido ${orderId} não encontrado.`);
        }

        const order = orderSnap.data() as Order;
        const agentName = aiConfig.companyName || 'Nossa equipe';
        
        // Formata os detalhes do pedido para o prompt
        const orderSummary = order.items.map(item => `${item.quantity}x ${item.name}`).join(', ');
        const orderTotal = `R$ ${order.totalAmount.toFixed(2).replace('.', ',')}`;

        // 2. Define um prompt para gerar a mensagem de agradecimento.
        const confirmationPrompt = ai.definePrompt({
            name: 'paymentConfirmationPrompt',
            model: googleAI.model('gemini-2.5-flash-lite'),
            input: { schema: z.object({ 
                agentName: z.string(), 
                orderSummary: z.string(),
                orderTotal: z.string() 
            })},
            output: { schema: z.object({ message: z.string() }) },
            prompt: `Você é um assistente de atendimento ao cliente. Um pagamento foi confirmado. Gere uma mensagem curta, amigável e profissional para o cliente.
            
            **Instruções:**
            1. Agradeça o cliente pela compra.
            2. Confirme o que foi comprado e o valor total.
            3. Informe que o pedido já está sendo preparado.
            4. Assine com o nome do agente/empresa fornecido.
            
            **Detalhes da Compra:**
            - Itens: {{{orderSummary}}}
            - Valor Total: {{{orderTotal}}}

            **Exemplo:**
            "Oba! 🎉 Recebemos seu pagamento de {{{orderTotal}}} referente à compra de {{{orderSummary}}}. Nossa equipe já está preparando tudo com muito carinho para você. Obrigado pela sua compra! Atenciosamente, {{agentName}}."

            Agora, gere a mensagem, assinando como "{{agentName}}":
            `,
        });

        // 3. Gera a mensagem de confirmação.
        const { output } = await confirmationPrompt({ agentName, orderSummary, orderTotal });
        const messageToSend = output?.message;

        if (!messageToSend) {
            throw new Error("A IA não conseguiu gerar a mensagem de confirmação.");
        }
        
        // 4. Envia a mensagem para o cliente.
        const sendResult = await sendTextMessage({
            userId,
            phone: conversationId,
            message: messageToSend,
            source: 'ai'
        });

        if (!sendResult.success) {
            throw new Error(`Falha ao enviar mensagem de confirmação: ${sendResult.error}`);
        }

        logSystemInfo(userId, 'sendPaymentConfirmation_success', `Mensagem de confirmação para o pedido ${orderId} enviada com sucesso.`, { orderId, conversationId });

    } catch (error: any) {
      logSystemFailure(userId, 'sendPaymentConfirmation_failure', { message: error.message, stack: error.stack }, { orderId, conversationId });
      // Mesmo que a IA falhe, envia uma mensagem padrão para não deixar o cliente sem feedback.
      await sendTextMessage({
        userId,
        phone: conversationId,
        message: `Recebemos seu pagamento para o pedido #${orderId.substring(0, 7)}. Em breve, ele será preparado. Obrigado!`,
        source: 'system'
      });
    }
  }
);
