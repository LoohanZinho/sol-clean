# Gerente Inteligente - Assistente de Atendimento para WhatsApp com IA

O Gerente Inteligente é um sistema completo que automatiza o primeiro atendimento via WhatsApp. Ele utiliza a inteligência artificial do Google (Genkit) para interagir com clientes de forma natural, responder perguntas frequentes e agendar atendimentos, gerenciando todas as conversas através de um dashboard web intuitivo.

## Visão Geral da Arquitetura

O sistema opera em um fluxo contínuo, desde a mensagem do cliente até a gestão da conversa no dashboard:

```
Cliente (WhatsApp) <--> Evolution API <--> Webhook (Next.js API Route) <--> Genkit AI Flows <--> Firestore DB <--> Dashboard (Next.js)
```

1.  **Entrada da Mensagem**: O cliente envia uma mensagem (texto ou áudio) para o número de WhatsApp da empresa, que é gerenciado pela **Evolution API**.
2.  **Webhook**: A Evolution API encaminha a mensagem para um endpoint de webhook no nosso aplicativo Next.js (`/api/webhook`).
3.  **Processamento com IA**:
    *   O webhook aciona um fluxo de IA (`processConversationV2`).
    *   Se a mensagem for um áudio, ela é primeiro transcrita para texto (`transcribeAudio`).
    *   O fluxo principal analisa o histórico da conversa (buscado do **Firestore**), entende a intenção do cliente usando um prompt de IA com uma base de conhecimento (FAQ) e determina a próxima ação. Se não souber a resposta, encaminha para um humano.
4.  **Armazenamento de Dados**: Todas as interações e informações de clientes são salvas em tempo real no **Firestore**.
5.  **Envio da Resposta**: O Genkit gera a resposta apropriada e a envia de volta para o cliente via Evolution API.
6.  **Dashboard de Gerenciamento**: Um painel de controle construído em **Next.js** e hospedado no **Firebase App Hosting** permite que o dono do negócio:
    *   Visualize as conversas em tempo real.
    *   Gerencie contatos e adicione anotações.
    *   Construa a personalidade do agente de IA e cadastre a base de conhecimento (FAQ).
    *   Configure parâmetros do sistema, como horário de funcionamento e credenciais da Evolution API.
7.  **Escalável**: Construído sobre a infraestrutura serverless do Google (Firebase e Cloud Functions), garantindo performance e confiabilidade.

## Estrutura do Projeto

-   `src/app/api/webhook/route.ts`: Endpoint que recebe as mensagens da Evolution API.
-   `src/ai/flows/`: Contém todos os fluxos de inteligência artificial construídos com Genkit.
    -   `process-conversations-v2.ts`: O cérebro da IA, onde a lógica da conversa é definida.
    -   `tools/index.ts`: Ponto de exportação para as ferramentas que a IA pode usar, como `updateClientInfoTool` e `requestHumanSupportTool`.
-   `src/components/app/`: Componentes React que formam o dashboard de gerenciamento.
    -   `AgentBuilderPage.tsx`: Construtor visual para criar o prompt do sistema do agente de IA.
-   `src/hooks/`: Hooks do React para buscar e ouvir dados do Firestore em tempo real.
-   `src/lib/`: Módulos centrais da aplicação.
    -   `firebase.ts`: Inicialização e configuração do Firebase SDK.
    -   `types.ts`: Definições de tipos (TypeScript) para os dados do projeto.
-   `apphosting.yaml`: Arquivo de configuração para o Firebase App Hosting.

## Tecnologias Utilizadas

-   **Frontend & Backend**: [Next.js](https://nextjs.org/)
-   **Hospedagem e Infra Serverless**: [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)
-   **Inteligência Artificial**: [Genkit (Google AI)](https://firebase.google.com/docs/genkit)
-   **Integração com WhatsApp**: [Evolution API](https://evolution-api.com/)
-   **Estilização**: [Tailwind CSS](https://tailwindcss.com/)
-   **Componentes UI**: [shadcn/ui](https://ui.shadcn.com/)

## Como Configurar e Rodar o Projeto

### Pré-requisitos

-   Node.js e npm.
-   Conta no Firebase com um projeto criado.
-   Uma instância da **Evolution API** rodando e acessível.
-   Firebase CLI (`firebase-tools`) instalado.
-   Google Cloud CLI (`gcloud`) instalado.
-   Uma chave de API do Google AI Studio.

### Passos para Instalação

1.  **Clonar o repositório e instalar dependências:**
    ```bash
    git clone <url-do-repositorio>
    cd <nome-do-repositorio>
    npm install
    ```

2.  **Configurar Variáveis de Ambiente Locais:**
    Crie um arquivo `.env` na raiz do projeto e adicione as variáveis do Firebase e a chave do Gemini.
    ```
    # Credenciais do seu projeto Firebase
    NEXT_PUBLIC_FIREBASE_API_KEY=...
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
    # ... (restante das credenciais Firebase)

    # Chave de API do Google AI Studio
    GEMINI_API_KEY=...

    # URL base para o webhook (use ngrok para desenvolvimento)
    NEXT_PUBLIC_BASE_URL=http://localhost:3000
    ```
    
3.  **Autenticação Local com o Google Cloud:**
    ```bash
    gcloud auth application-default login
    ```

### Rodando Localmente

1.  **Iniciar o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```
2.  **Expor o Webhook com ngrok:**
    ```bash
    ngrok http 3000
    ```
    Pegue a URL HTTPS gerada e configure na sua instância da Evolution API.

## Deploy (Publicação)

O processo de deploy é o mesmo da versão anterior, mas lembre-se:

-   **Credenciais da Evolution API:** Diferente da Z-API, você deve configurar a URL da API, o nome da instância e a API Key no painel de **Ajustes > Conexão Evolution** da sua aplicação. O sistema em produção usará essas credenciais salvas no Firestore.
-   **Webhook de Produção:** A URL do seu webhook em produção será a URL da sua aplicação no App Hosting. Configure-a na sua instância da Evolution API.
-   O `apphosting.yaml` já está configurado para dar as permissões necessárias e usar a `GEMINI_API_KEY` do Secret Manager.

```bash
npm run deploy
```