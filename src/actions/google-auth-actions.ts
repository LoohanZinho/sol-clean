
'use server';

/**
 * @fileoverview Ações do lado do servidor para gerenciar a autenticação com o Google OAuth2.
 * Este arquivo lida com a geração da URL de autenticação, a troca do código de autorização
 * por tokens, o armazenamento seguro desses tokens no Firestore e a criação de um cliente
 * de API autenticado que lida com a atualização automática de tokens.
 */

import { google } from 'googleapis';
import { getAdminFirestore, initializeAdmin } from '@/lib/firebase-admin';
import { logSystemFailure, logSystemInfo } from '@/ai/flows/system-log-helpers';
import { z } from 'zod';
import { UserRefreshClient } from 'google-auth-library';

// Garante que o SDK do Firebase Admin esteja inicializado.
initializeAdmin();

// Credenciais do cliente OAuth2, carregadas das variáveis de ambiente.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// A URL de callback deve ser a mesma configurada no Google Cloud Console.
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/google/callback`;

// Escopos de permissão que a aplicação solicitará ao usuário.
const SCOPES = [
    'https://www.googleapis.com/auth/calendar', // Acesso total à agenda
    'https://www.googleapis.com/auth/userinfo.email', // Acesso ao email do usuário
    'https://www.googleapis.com/auth/userinfo.profile', // Acesso à foto de perfil e nome
];

// Instância global do cliente OAuth2.
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

/**
 * Busca as informações básicas do usuário (email, foto) usando o token de acesso.
 * @param {string} accessToken - O token de acesso OAuth2.
 * @returns {Promise<{ email: string | null, picture: string | null }>} O email e a URL da foto do usuário.
 */
async function getUserInfo(accessToken: string): Promise<{ email: string | null, picture: string | null }> {
    try {
        const oauth2 = google.oauth2({
            auth: oAuth2Client,
            version: 'v2',
        });
        oAuth2Client.setCredentials({ access_token: accessToken });
        const { data } = await oauth2.userinfo.get();
        return { email: data.email || null, picture: data.picture || null };
    } catch (error) {
        console.error('Falha ao buscar informações do usuário:', error);
        return { email: null, picture: null };
    }
}


/**
 * Armazena os tokens (acesso e refresh) do usuário de forma segura no Firestore,
 * dentro de uma subcoleção `secure_tokens` para controle de acesso.
 * @param {string} userId - O ID do usuário no Firebase.
 * @param {any} tokens - O objeto de tokens retornado pelo Google.
 */
async function storeTokens(userId: string, tokens: any) {
  const firestore = getAdminFirestore();
  const tokenRef = firestore.collection('users').doc(userId).collection('secure_tokens').doc('google_oauth');
  
  // Usa o token de acesso recém-obtido para buscar o email e a foto do usuário.
  const { email, picture } = await getUserInfo(tokens.access_token);

  await tokenRef.set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scope: tokens.scope,
    userEmail: email, // Armazena o email para exibição no painel.
    userPicture: picture, // Armazena a URL da foto.
  });
  
  await logSystemInfo(userId, 'google_auth_store_tokens', 'Tokens do Google OAuth armazenados com sucesso.', { userEmail: email });
}

/**
 * Recupera os tokens do Google armazenados para um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<any | null>} O objeto de tokens ou `null` se não for encontrado.
 */
async function getStoredTokens(userId: string): Promise<any | null> {
  const firestore = getAdminFirestore();
  const tokenRef = firestore.collection('users').doc(userId).collection('secure_tokens').doc('google_oauth');
  const tokenSnap = await tokenRef.get();
  
  if (!tokenSnap.exists) {
    return null;
  }
  return tokenSnap.data();
}

/**
 * Uma Server Action para gerar a URL de autenticação do Google.
 * Esta URL é usada para iniciar o fluxo de login do Google em um pop-up.
 * @param {{ userId: string }} params - O ID do usuário, usado para rastreamento.
 * @returns {Promise<{ success: boolean; authUrl?: string; error?: string }>} A URL de autenticação ou um erro.
 */
export async function getGoogleAuthUrl({ userId }: { userId: string }): Promise<{ success: boolean; authUrl?: string; error?: string }> {
    try {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', // Essencial para obter um refresh_token.
            scope: SCOPES,
            prompt: 'consent', // Força a tela de consentimento para garantir que o refresh_token seja sempre enviado.
            state: userId, // Passa o ID do usuário no estado para identificá-lo no retorno (callback).
        });
        await logSystemInfo(userId, 'getGoogleAuthUrl_success', 'URL de autenticação do Google gerada.', {});
        return { success: true, authUrl };
    } catch (error: any) {
        await logSystemFailure(userId, 'getGoogleAuthUrl_failure', { message: error.message }, {});
        return { success: false, error: "Falha ao gerar a URL de autenticação do Google." };
    }
}

/**
 * Uma Server Action para trocar o código de autorização (recebido no callback) por tokens de acesso e de atualização.
 * @param {{ userId: string; code: string }} params - O ID do usuário e o código de autorização.
 * @returns {Promise<{ success: boolean; error?: string }>} Um objeto indicando o sucesso da operação.
 */
export async function exchangeCodeForTokens({ userId, code }: { userId: string; code: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        await storeTokens(userId, tokens); // Armazena os tokens obtidos.
        return { success: true };
    } catch (error: any) {
        await logSystemFailure(userId, 'exchangeCodeForTokens_failure', { message: error.message, stack: error.stack }, { code });
        return { success: false, error: "Falha ao trocar o código de autorização por tokens." };
    }
}

/**
 * Uma Server Action para desconectar a conta do Google do usuário, apagando os tokens armazenados.
 * @param {{ userId: string }} params - O ID do usuário.
 * @returns {Promise<{ success: boolean; error?: string }>} Um objeto indicando o sucesso da operação.
 */
export async function disconnectGoogleAccount({ userId }: { userId: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const firestore = getAdminFirestore();
        const tokenRef = firestore.collection('users').doc(userId).collection('secure_tokens').doc('google_oauth');
        await tokenRef.delete();
        await logSystemInfo(userId, 'disconnectGoogleAccount_success', 'Tokens da conta do Google apagados.', {});
        return { success: true };
    } catch (error: any) {
        await logSystemFailure(userId, 'disconnectGoogleAccount_failure', { message: error.message }, {});
        return { success: false, error: "Falha ao desconectar a conta do Google." };
    }
}


/**
 * Uma Server Action para verificar se o usuário possui tokens válidos do Google armazenados.
 * Usado pelo frontend para determinar o estado da interface (mostrar "Conectar" ou "Desconectar").
 * @param {{ userId: string }} params - O ID do usuário.
 * @returns {Promise<{ isAuthenticated: boolean; userEmail?: string; userPicture?: string }>} O estado da autenticação e as informações do usuário.
 */
export async function checkGoogleAuthState({ userId }: { userId: string }): Promise<{ isAuthenticated: boolean; userEmail?: string; userPicture?: string }> {
    try {
        const tokens = await getStoredTokens(userId);
        // A presença de um refresh_token é o indicador mais confiável de uma autenticação persistente.
        if (tokens && tokens.refreshToken) {
            return { 
                isAuthenticated: true, 
                userEmail: tokens.userEmail || undefined,
                userPicture: tokens.userPicture || undefined,
            };
        }
        return { isAuthenticated: false };
    } catch (error: any) {
        return { isAuthenticated: false };
    }
}


/**
 * Obtém um cliente OAuth2 autorizado para fazer chamadas às APIs do Google.
 * Esta função é o coração da integração, pois lida com a atualização automática de tokens.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<any>} Uma instância do cliente OAuth2 pronta para uso.
 * @throws {Error} Lança um erro se o usuário não estiver autenticado.
 */
export async function getAuthClient(userId: string): Promise<any> {
    const tokens = await getStoredTokens(userId);
    if (!tokens || !tokens.refreshToken) {
        throw new Error('Usuário não autenticado com o Google ou refresh token ausente.');
    }

    // Usa o UserRefreshClient, uma classe da biblioteca de autenticação do Google,
    // que lida nativamente com a lógica de atualização do token de acesso usando o refresh_token.
    const client = new UserRefreshClient(
        CLIENT_ID,
        CLIENT_SECRET,
        tokens.refreshToken
    );
    
    // Obtém o token de acesso mais recente. Se o antigo expirou, o cliente o renovará automaticamente.
    const { token } = await client.getAccessToken();
    
    // Cria uma nova instância do OAuth2 para ser usada com a biblioteca `googleapis`.
    const authClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    authClient.setCredentials({
        access_token: token,
        refresh_token: tokens.refreshToken, // Passa o refresh token para consistência.
    });
    
    return authClient;
}
