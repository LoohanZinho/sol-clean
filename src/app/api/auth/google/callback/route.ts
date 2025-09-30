
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, getAuthClient } from '@/actions/google-auth-actions';

/**
 * @fileoverview Endpoint de callback para o fluxo de autenticação do Google OAuth2.
 * Este endpoint é chamado pelo Google após o usuário conceder (ou negar) permissão.
 * Sua principal responsabilidade é receber o código de autorização e o estado,
 * trocá-los por tokens de acesso/atualização e, em seguida, fechar a janela pop-up.
 */

/**
 * Manipula a requisição GET do callback do Google.
 * @param {NextRequest} request - O objeto da requisição Next.js.
 * @returns {NextResponse} Uma resposta HTML que executa um script para fechar a janela pop-up.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // Contém o ID do usuário que iniciou o fluxo.

    if (!code || !state) {
        // Se o código ou o estado estiverem ausentes (ex: o usuário negou permissão),
        // apenas fecha a janela pop-up sem fazer nada.
        return new NextResponse(
            `<html><body><script>window.close();</script></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
        );
    }
    
    const userId = state;

    try {
        // Troca o código de autorização pelos tokens de acesso e de atualização.
        await exchangeCodeForTokens({ userId, code });
        
        // Se a troca for bem-sucedida, envia uma resposta HTML que executa um script.
        // O script envia uma mensagem para a janela principal (a página de configurações)
        // para que ela possa atualizar seu estado e exibir que a conexão foi bem-sucedida,
        // e em seguida fecha a janela pop-up.
        return new NextResponse(
            `<html>
                <body>
                    <script>
                        window.opener.postMessage('google-auth-success', '${process.env.NEXT_PUBLIC_BASE_URL}');
                        window.close();
                    </script>
                    <p>Autenticação bem-sucedida! Você pode fechar esta janela.</p>
                </body>
            </html>`,
            { headers: { 'Content-Type': 'text/html' } }
        );
    } catch (error: any) {
        console.error('Erro no callback do Google OAuth:', error);
        // Em caso de erro, apenas fecha a janela. A página principal não receberá
        // a mensagem de sucesso e manterá o estado de "desconectado".
        return new NextResponse(
            `<html><body><script>window.close();</script></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
        );
    }
}
