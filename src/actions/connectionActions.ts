
'use server';

import { getGlobalEvolutionCredentials } from '@/actions/evolutionApiActions';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import axios, { AxiosError } from 'axios';

// This is a simplified version of axiosWithRetry for this specific action
async function axiosConnect(url: string, options: any, retries = 2) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios(options);
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, 1000));
        }
    }
}

export async function createWhatsAppInstanceAction({ userEmail, userId }: { userEmail: string; userId: string }): Promise<{ success: boolean; pairingCode?: string; base64?: string; error?: string, state?: 'open' | 'close' | 'connecting' | 'SCAN_QR_CODE'}> {
    try {
        const globalCredentials = await getGlobalEvolutionCredentials();
        if (!globalCredentials || !globalCredentials.apiUrl || !globalCredentials.apiKey) {
            throw new Error('Credenciais globais da Evolution API não estão configuradas no painel de admin.');
        }

        const { apiUrl, apiKey: globalApiKey } = globalCredentials;
        
        const createUrl = `${apiUrl.replace(/\/$/, '')}/instance/create`;
        const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook?userId=${userId}`;

        const createBody = {
            instanceName: userEmail,
            token: userEmail,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
                url: webhookUrl,
                webhook_by_events: true, 
                webhook_base64: true,
                events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
            }
        };

        try {
            const { data: instanceData } = await axios.post(createUrl, createBody, {
                headers: { 'Content-Type': 'application/json', 'apikey': globalApiKey }
            });

            if (instanceData?.instance?.state === 'open') {
                return { success: true, state: 'open' };
            }

            const pairingCode = instanceData?.qrcode?.pairingCode;
            const base64 = instanceData?.qrcode?.base64;
            
            if (pairingCode || base64) {
                return { success: true, pairingCode, base64 };
            }
            throw new Error("A instância foi criada, mas não retornou um código de conexão.");

        } catch (error: any) {
            const axiosError = error as AxiosError<any>;
            if (axiosError.response && (axiosError.response.status === 409 || (JSON.stringify(axiosError.response.data).includes("already exists")))) {
                logSystemInfo(userId, 'createWhatsAppInstance_already_exists', `A instância ${userEmail} já existe. Tentando conectar para obter QR.`, {});
                
                const connectUrl = `${apiUrl.replace(/\/$/, '')}/instance/connect/${userEmail}`;
                const { data: instanceData } = await axios.get(connectUrl, { headers: { 'apikey': globalApiKey } });

                if (instanceData?.instance?.state === 'open') {
                    return { success: true, state: 'open' };
                }
                
                const pairingCode = instanceData?.qrcode?.pairingCode;
                const base64 = instanceData?.qrcode?.base64;

                if (pairingCode || base64) {
                    return { success: true, pairingCode, base64 };
                }
                throw new Error("A instância já existe, mas falhou ao obter o código de conexão.");
            } else {
                throw error;
            }
        }
    } catch (error: any) {
        let errorMessage = 'Ocorreu um erro ao criar ou conectar a instância.';
        if (axios.isAxiosError(error) && error.response?.data) {
             errorMessage = JSON.stringify(error.response.data, null, 2);
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        await logSystemFailure(userId, 'createWhatsAppInstance_critical_failure', { message: errorMessage, stack: (error as any).stack }, { userEmail });
        return { success: false, error: errorMessage };
    }
}
