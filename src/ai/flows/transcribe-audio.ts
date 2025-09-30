

'use server';

/**
 * @fileoverview Defines the flow for transcribing audio messages.
 * This flow is now self-contained and returns the transcription result
 * instead of triggering another flow, allowing for better orchestration.
 * This version uses the standard Genkit `ai.generate()` method with the appropriate
 * model for robust audio transcription and includes a model fallback system.
 */
import { ai } from '@/ai/genkit';
import type { AiProviderSettings, TranscribeAudioInput } from '@/lib/types';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { logSystemFailure, logSystemInfo } from './system-log-helpers';
import { googleAI } from '@genkit-ai/googleai';
import { getAiProviderSettings } from '@/actions/aiProviderActions';
import { TranscribeAudioInputSchema, TranscribeAudioOutputSchema } from '@/lib/schemas';


// Ordered list of models to try for transcription, as per user request.
// This is a fixed list and IGNORES the provider settings.
const TRANSCRIPTION_MODELS = [
  googleAI.model('gemini-2.5-flash'),
  googleAI.model('gemini-2.5-pro'),
  googleAI.model('gemini-2.5-flash-lite'), // A final, stable fallback
];


/**
 * Wrapper function to call the flow. This is what server components will import.
 * @param {TranscribeAudioInput} input - The input data for the transcription.
 * @returns {Promise<{ transcription: string | null }>} The result of the transcription.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<{ transcription: string | null }> {
    // Invokes the Genkit flow and returns its promise.
    return transcribeAudioFlow(input);
}

/**
 * @name transcribeAudioFlow
 * @description The main Genkit flow for transcribing audio.
 * It takes audio data, attempts to transcribe it using a predefined sequence
 * of AI models, and handles errors and fallbacks.
 */
const transcribeAudioFlow = ai.defineFlow(
  {
      name: 'transcribeAudioFlow',
      inputSchema: TranscribeAudioInputSchema,
      outputSchema: TranscribeAudioOutputSchema,
  },
  async ({ userId, conversationId, messageId, audioData }: TranscribeAudioInput): Promise<{ transcription: string | null }> => {
      
      const adminFirestore = getAdminFirestore();
      const messageRef = adminFirestore.collection('users').doc(userId).collection('conversations').doc(conversationId).collection('messages').doc(messageId);
      const logContext = { conversationId, messageId };
      
      logSystemInfo(userId, 'transcribeAudioFlow_start', `Iniciando fluxo de transcrição para mensagem ${messageId}.`, logContext);
      
      // 1. INPUT VALIDATION: Ensure audio data is provided in the correct format.
      if (!audioData || !audioData.includes(';base64,')) {
          const errorMessage = `Dados de áudio (Base64) não encontrados ou em formato inválido na mensagem ${messageId}.`;
          logSystemFailure(userId, 'transcribeAudioFlow_no_base64', { message: errorMessage }, logContext);
          await messageRef.update({ transcription: `[Falha: ${errorMessage}]`, transcriptionStatus: 'failed' });
          return { transcription: null };
      }

      // 2. API KEY CHECK: Transcription requires an API key, regardless of the model.
      const providerSettings = await getAiProviderSettings(userId) || {};
      const { apiKey: userApiKey } = providerSettings;

      if (!userApiKey) {
          const errorMessage = `API Key do usuário não configurada. A transcrição de áudio foi abortada.`;
          logSystemFailure(userId, 'transcribeAudioFlow_no_apikey', { message: errorMessage }, logContext);
          await messageRef.update({ transcription: `[Falha: API Key não configurada]`, transcriptionStatus: 'failed' });
          return { transcription: null };
      }

      // 3. MODEL STRATEGY: Use the fixed list of models defined for transcription.
      const modelsToTry = TRANSCRIPTION_MODELS;
      logSystemInfo(userId, 'transcribeAudioFlow_model_strategy', 'Estratégia de modelos de transcrição fixa definida.', { ...logContext, models: modelsToTry.map(m => m.name) });

      // 4. TRANSCRIPTION ATTEMPT LOOP: Iterate through the models and try to transcribe.
      for (const model of modelsToTry) {
        const modelName = model.name;
        try {
          logSystemInfo(userId, `transcribeAudioFlow_attempt`, `Tentando transcrição com ${modelName}.`, logContext);
          
          // Call the AI model with the audio data and a specific prompt.
          const result = await ai.generate({
              model,
              prompt: [
                // The prompt is very specific to guide the model's task.
                { text: "Sua única tarefa é transcrever APENAS a fala humana contida no áudio a seguir. Ignore completamente quaisquer outros sons. Regras: 1. Não transcreva ruídos de fundo, cliques, ou música. 2. Não transcreva sons de respiração ou ruídos como 'P', 'Ppp', ou 'Pppp' que podem ocorrer no final da gravação. Sua resposta deve conter apenas as palavras faladas, nada mais." },
                { media: { url: audioData } }
              ],
              config: {
                  temperature: 0, // Low temperature for deterministic output.
                  apiKey: userApiKey,
              },
          });
          
          const transcription = result.text;

          // 5. PROCESS RESULT: Check if the transcription was successful.
          if (transcription) {
              logSystemInfo(userId, 'transcribeAudioFlow_success', `Áudio transcrito com sucesso via ${modelName}.`, { ...logContext, transcription: transcription.substring(0, 70) + '...' });
              return { transcription }; // Success, return result.
          } else {
              logSystemFailure(userId, 'transcribeAudioFlow_empty_response', { message: `Modelo ${modelName} retornou uma resposta vazia.`}, { ...logContext, response: result });
              // Do not retry on empty response, as it's not a server error. Consider it a failed transcription.
              return { transcription: null };
          }

        } catch (error: any) {
          // 6. ERROR HANDLING & FALLBACK: If a model fails, log the error and decide whether to try the next one.
          const errorMessage = error.message || 'Erro desconhecido';
          // Check for network/server errors that are worth retrying with a different model.
          const isRetryable = errorMessage.includes('fetch failed') || ['500', '503', '502', 'ECONNRESET'].some(code => errorMessage.includes(code));

          logSystemFailure(
            userId, 
            `transcribeAudioFlow_fail`, 
            { message: `Falha na transcrição com o modelo ${modelName}: ${errorMessage}`, stack: error.stack, isRetryable }, 
            logContext
          );
          
          // If the error is not retryable (e.g., bad input) or it's the last model in our list, abort.
          if (!isRetryable || modelsToTry.indexOf(model) === modelsToTry.length - 1) {
            logSystemFailure(userId, 'transcribeAudioFlow_unretryable_stop', { message: `Erro não recuperável ou todas as tentativas de fallback falharam com o modelo ${modelName}. Abortando.`}, logContext);
            return { transcription: null }; 
          } else {
             // If the error is retryable and we have more models, log that we're trying the next one.
             logSystemInfo(userId, 'transcribeAudioFlow_fallback_triggered', `Modelo ${modelName} falhou. Tentando próximo modelo de fallback...`, logContext);
          }
        }
      }
      
      // This is reached only if all models in the list failed with retryable errors.
      logSystemFailure(userId, 'transcribeAudioFlow_all_models_failed', { message: "Todos os modelos de transcrição falharam." }, logContext);
      return { transcription: null };
  }
);

    