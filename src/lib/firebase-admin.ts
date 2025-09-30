
/**
 * @fileOverview Inicialização centralizada do SDK do Firebase Admin para o lado do servidor.
 * Este arquivo garante que o SDK do Admin seja inicializado apenas uma vez,
 * usando uma abordagem de carregamento preguiçoso compatível com o processo de build do Next.js.
 * Exporta uma função para obter a instância do Firestore, garantindo a inicialização prévia.
 */

import * as admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

/**
 * Inicializa o SDK do Firebase Admin se ainda não tiver sido inicializado.
 * Esta função é idempotente, o que significa que é seguro chamá-la várias vezes.
 */
export function initializeAdmin() {
  // Verifica se já existe uma app inicializada para evitar erros.
  if (getApps().length === 0) {
    admin.initializeApp();
  }
}

/**
 * Obtém a instância singleton do Firestore para uso no lado do servidor.
 * Garante que a app admin esteja inicializada antes de retornar a instância.
 * @returns {admin.firestore.Firestore} A instância do Firestore.
 */
export function getAdminFirestore(): admin.firestore.Firestore {
    initializeAdmin();
    return admin.firestore();
}
