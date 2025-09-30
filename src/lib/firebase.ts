
'use client';

/**
 * @fileOverview Inicialização do Firebase no lado do cliente.
 * Este arquivo garante que a app do Firebase seja inicializada apenas uma vez
 * e fornece instâncias singleton dos serviços do Firebase (Firestore, Auth, Storage)
 * para uso em componentes React e hooks.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config';

let app: FirebaseApp;
let firestore: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

// Inicializa o Firebase de forma segura no lado do cliente.
if (typeof window !== 'undefined') {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
    firestore = getFirestore(app);
    auth = getAuth(app);
    storage = getStorage(app);
}

/**
 * Obtém a instância singleton do Firestore para a app do cliente.
 * @returns {Firestore} A instância do Firestore.
 */
export function getFirebaseFirestore(): Firestore {
    if (!firestore) {
         if (!getApps().length) {
            app = initializeApp(firebaseConfig);
        } else {
            app = getApp();
        }
        firestore = getFirestore(app);
    }
    return firestore;
}

/**
 * Obtém a instância singleton do Auth para a app do cliente.
 * @returns {Auth} A instância do Auth.
 */
export function getFirebaseAuth(): Auth {
    if (!auth) {
        if (!getApps().length) {
            app = initializeApp(firebaseConfig);
        } else {
            app = getApp();
        }
        auth = getAuth(app);
    }
    return auth;
}

/**
 * Obtém a instância singleton do Storage para a app do cliente.
 * @returns {FirebaseStorage} A instância do Firebase Storage.
 */
export function getFirebaseStorage(): FirebaseStorage {
    if (!storage) {
        if (!getApps().length) {
            app = initializeApp(firebaseConfig);
        } else {
            app = getApp();
        }
        storage = getStorage(app);
    }
    return storage;
}
