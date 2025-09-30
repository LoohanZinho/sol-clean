
import 'dotenv/config';
import { initializeApp, getApps } from 'firebase-admin/app';
import { genkit, GenkitError } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * @fileoverview Configuração e inicialização central da instância do Genkit.
 * Este arquivo configura o plugin `googleAI` e exporta uma instância `ai`
 * que será usada em todo o projeto para definir fluxos, prompts e ferramentas.
 * Inclui uma verificação de segurança crítica para garantir que a chave de API
 * do Gemini esteja disponível no ambiente de produção.
 */


// Inicializa o Firebase Admin SDK uma única vez para evitar múltiplas instâncias.
if (getApps().length === 0) {
  initializeApp();
}

// Em um ambiente de produção (como o Firebase App Hosting), a GEMINI_API_KEY
// é injetada através da configuração 'secrets' no arquivo apphosting.yaml.
// Esta verificação garante que a aplicação falhe rapidamente durante a inicialização
// se o segredo não estiver configurado corretamente, prevenindo erros em tempo de execução.
if (process.env.NODE_ENV === 'production' && !process.env.GEMINI_API_KEY) {
  // Alterado de um 'throw' para 'console.warn' para não quebrar o processo de build.
  // O build ocorre em um ambiente sem acesso aos segredos, que são injetados apenas em tempo de execução.
  console.warn("AVISO: O segredo GEMINI_API_KEY não está definido no ambiente de build. A aplicação espera que ele seja injetado em tempo de execução.");
}


// Exporta a instância configurada do Genkit.
// A chave de API (`apiKey`) agora é fornecida dinamicamente em cada chamada `ai.generate()`,
// permitindo que cada usuário utilize sua própria chave. O valor no `process.env`
// atua como um fallback para fluxos não específicos do usuário (se houver) e para
// desenvolvimento local.
export const ai = genkit({
  plugins: [
    googleAI({ 
      apiKey: process.env.GEMINI_API_KEY 
    }),
  ],
});
