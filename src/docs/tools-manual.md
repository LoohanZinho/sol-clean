# Manual de Operações: Arquitetura de Ferramentas da IA

Este documento detalha a arquitetura de como a Inteligência Artificial (IA) principal interage com o "mundo real" através de um conjunto de "ferramentas" (`tools`). Entender este fluxo é crucial para depurar, manter e expandir as capacidades do assistente.

## Visão Geral: O Ciclo de Pensamento (Turnos)

A IA não responde em uma única etapa. Ela opera em um "ciclo de pensamento" ou "turnos", especialmente quando uma tarefa requer ações complexas.

**O Fluxo Básico:**

1.  **Recebimento:** O fluxo `processConversationV2` recebe a mensagem do cliente.
2.  **Contextualização:** Ele reúne todo o contexto necessário: histórico da conversa, o "manual de instruções" da IA (`System Prompt`) e a lista de ferramentas disponíveis.
3.  **Primeira Chamada à IA:** O sistema envia tudo para o modelo de linguagem (`ai.generate`), instruindo-o a responder com um JSON estruturado.
4.  **Decisão da IA:** A IA analisa o pedido e gera um plano de ação em formato JSON, que pode conter:
    a. **Uma resposta para o cliente (`response_to_client`):** Se for uma pergunta simples, ela gera a resposta aqui. O ciclo pode terminar se nenhuma ferramenta for necessária.
    b. **Uma solicitação de ferramenta (`tool_request`):** Se precisar de informações (ex: consultar a agenda) ou executar uma ação (ex: agendar), ela preenche este campo com o nome da ferramenta e os parâmetros necessários.
5.  **Execução da Ferramenta:** Nosso código (a função `executeTool`) interpreta a `tool_request` do JSON. Ele encontra e executa a ferramenta solicitada.
6.  **Retorno do Resultado:** A ferramenta retorna um resultado (sucesso ou falha) para o `executeTool`.
7.  **Segundo Turno de Pensamento:** O `executeTool` empacota esse resultado e o anexa ao histórico da conversa. O ciclo recomeça, enviando o histórico atualizado de volta para a IA. Agora, com o resultado da ação, ela pode formular a resposta final para o cliente.

Este ciclo pode se repetir várias vezes (`maxTurns` está definido como 5 para segurança) até que a IA tenha todas as informações e possa dar uma resposta final em texto sem precisar de mais ferramentas.

---

## Catálogo Detalhado de Ferramentas

Cada ferramenta é definida com `ai.defineTool` e possui um "contrato" claro através de `inputSchema` e `outputSchema`, escritos com Zod. A IA usa a `description` para decidir quando e como usar cada ferramenta.

### 1. `scheduleAppointmentTool`

-   **Arquivo:** `src/ai/flows/tools/scheduleAppointmentTool.ts`
-   **Propósito:** Criar um novo evento na agenda do Google Calendar do usuário.
-   **Descrição para a IA:** "Use esta ferramenta para agendar um serviço para um cliente em uma data e hora específicas. Você deve ter coletado o nome do serviço, o dia e o horário antes de usar esta ferramenta. O nome do cliente será obtido automaticamente. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "amanhã" ou "próxima segunda") para o formato absoluto DD/MM/AAAA antes de usar esta ferramenta."

#### Contrato (Schemas Zod)

-   **`inputSchema: ScheduleAppointmentSchema`**
    -   `serviceName: z.string()`: O título do evento. Ex: "Consulta de avaliação".
    -   `appointmentDate: z.string()`: A data **formatada pela IA** como `DD/MM/AAAA`.
    -   `appointmentTime: z.string()`: A hora **formatada pela IA** como `HH:mm`.
    -   `clientFullName: z.string().optional()`: Nome completo do cliente. A IA pode omitir se não tiver certeza.

-   **`outputSchema`**
    -   `success: z.boolean()`: `true` se o evento foi criado, `false` se não.
    -   `message: z.string().optional()`: Se sucesso, retorna "Agendamento salvo com sucesso no sistema."
    -   `error: z.string().optional()`: Se falha, retorna a mensagem de erro (ex: da API do Google).

---

### 2. `getAvailableSlotsTool`

-   **Arquivo:** `src/ai/flows/tools/getAvailableSlotsTool.ts`
-   **Propósito:** Verificar os horários de funcionamento e os eventos já existentes em um período de datas.
-   **Descrição para a IA:** "Verifica a agenda do Google Calendar para um período de datas e retorna os horários de funcionamento e uma lista de horários já ocupados para cada dia. Essencial para verificar a disponibilidade antes de marcar um novo compromisso. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "amanhã" ou "próxima semana") para o formato absoluto DD/MM/AAAA antes de usar esta ferramenta."

#### Contrato (Schemas Zod)

-   **`inputSchema: GetAvailableSlotsSchema`**
    -   `startDate: z.string()`: A data de início do período, formatada como `DD/MM/AAAA`.
    -   `endDate: z.string()`: A data de fim do período, formatada como `DD/MM/AAAA`.

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `days: z.array(DayAvailabilitySchema).optional()`: Uma lista de objetos, cada um representando um dia e sua disponibilidade.
        -   `date: string`: A data no formato "DD/MM/AAAA".
        -   `businessHours: string`: "08:00-12:00, 14:00-18:00", "Fechado", etc.
        -   `busySlots: z.array({ start: "HH:mm", end: "HH:mm" })`: Lista de horários já agendados para aquele dia.
    -   `error: z.string().optional()`

---

### 3. `listEventsTool`

-   **Arquivo:** `src/ai/flows/tools/listEventsTool.ts`
-   **Propósito:** Buscar os próximos compromissos de um cliente para confirmar um cancelamento ou reagendamento.
-   **Descrição para a IA:** "Busca e lista os compromissos existentes na agenda do Google Calendar dentro de um período de datas específico. Retorna os detalhes de cada evento, incluindo o ID necessário para cancelamento ou reagendamento. IMPORTANTE: Use a "DATA E HORA ATUAL" fornecida no contexto para converter datas relativas (como "hoje", "esta semana" ou "próximo mês") para um intervalo com data de início e fim no formato absoluto DD/MM/AAAA antes de usar esta ferramenta."

#### Contrato (Schemas Zod)

-   **`inputSchema: ListEventsSchema`**
    -   `startDate: z.string()`: Data de início da busca (`DD/MM/AAAA`).
    -   `endDate: z.string()`: Data de fim da busca (`DD/MM/AAAA`).

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `events: z.array(EventSchema).optional()`: Lista de eventos encontrados.
        -   `id: string`: O ID do evento no Google (crucial para o cancelamento).
        -   `summary: string`: **Por segurança, sempre retorna 'Compromisso Ocupado'**, nunca o título real.
        -   `start: string`: Data e hora de início formatada.
        -   `end: string`: Data e hora de término formatada.
    -   `error: z.string().optional()`

---

### 4. `cancelAppointmentTool`

-   **Arquivo:** `src/ai/flows/tools/cancelAppointmentTool.ts`
-   **Propósito:** Apagar um evento específico do Google Calendar.
-   **Descrição para a IA:** "Cancela um compromisso existente no Google Calendar. Use esta ferramenta APÓS ter confirmado com o cliente qual evento ele deseja cancelar, usando a `listEventsTool` para obter o `eventId`."

#### Contrato (Schemas Zod)

-   **`inputSchema: CancelAppointmentSchema`**
    -   `eventId: z.string()`: O ID do evento a ser cancelado, obtido previamente com a `listEventsTool`.

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: Se sucesso, "O agendamento foi cancelado com sucesso."
    -   `error: z.string().optional()`

---

### 5. `requestHumanSupportTool`

-   **Arquivo:** `src/ai/flows/tools/requestHumanSupportTool.ts`
-   **Propósito:** Ferramenta de "escape". Move a conversa para a pasta de suporte e desativa a IA.
-   **Descrição para a IA:** "Use esta ferramenta SEMPRE que o cliente pedir para falar com um humano, se mostrar muito irritado, ou se você for incapaz de ajudar após tentar entender duas vezes. Isso irá transferir a conversa para um atendente humano."

#### Contrato (Schemas Zod)

-   **`inputSchema: RequestHumanSupportSchema`**
    -   `reason: z.string()`: O motivo da transferência. Ex: "Cliente solicitou falar com um atendente."

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: "A conversa foi transferida para um atendente humano." (Isso sinaliza para a IA parar de atuar).
    -   `error: z.string().optional()`

---

### 6. `updateClientInfoTool`

-   **Arquivo:** `src/ai/flows/tools/updateClientInfoTool.ts`
-   **Propósito:** Salvar dados estruturados no perfil do cliente (conversa) no Firestore.
-   **Descrição para a IA:** "Salva ou atualiza informações de cadastro do cliente, como nome, endereço completo ou anotações importantes. Use esta ferramenta sempre que o cliente fornecer dados que pareçam ser de cadastro ou uma informação relevante para ser salva."

#### Contrato (Schemas Zod)

-   **`inputSchema: UpdateClientInfoSchema`**
    -   `preferredName: z.string().optional()`
    -   `addressText: z.string().optional()`
    -   `notes: z.string().optional()`

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: Confirma o que foi salvo. Ex: "Dados do cliente foram salvos no sistema: Nome Preferido='João'."
    -   `error: z.string().optional()`

---

### 7. `updateConversationTagsTool`

-   **Arquivo:** `src/ai/flows/tools/updateConversationTagsTool.ts`
-   **Propósito:** Adicionar etiquetas (tags) a uma conversa para organização.
-   **Descrição para a IA:** "Adiciona ou atualiza as etiquetas (tags) de uma conversa para ajudar na organização e classificação. Use para categorizar o assunto principal da conversa (ex: "Agendamento", "Orçamento", "Dúvida de Produto")."

#### Contrato (Schemas Zod)

-   **`inputSchema: UpdateConversationTagsSchema`**
    -   `tags: z.array(z.string())`: Uma lista de tags a serem adicionadas. Ex: `["Orçamento", "Botox", "Agendamento"]`.

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: "As etiquetas foram salvas com sucesso na conversa."
    -   `error: z.string().optional()`

---

### 8. `endConversationTool`

-   **Arquivo:** `src/ai/flows/tools/endConversationTool.ts`
-   **Propósito:** Finalizar e arquivar uma conversa.
-   **Descrição para a IA:** "Use esta ferramenta para finalizar e arquivar uma conversa quando o objetivo principal do cliente for completamente resolvido."

#### Contrato (Schemas Zod)

-   **`inputSchema: EndConversationSchema`**
    -   `reason: z.string().optional()`: Um breve resumo do porquê a conversa está terminando.

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: "A conversa foi finalizada e arquivada."
    -   `error: z.string().optional()`

---

### 9. `summarizeConversationTool`

-   **Arquivo:** `src/ai/flows/tools/summarizeConversationTool.ts`
-   **Propósito:** Gera e salva um resumo conciso de uma conversa. **Importante:** Esta ferramenta geralmente não é chamada diretamente pela IA de conversação principal. Ela é usada em fluxos específicos, como quando uma conversa é transferida para suporte.
-   **Descrição para a IA:** "Analisa um histórico de conversa e salva um resumo no perfil do cliente. Não deve ser chamado diretamente pela IA principal."

#### Contrato (Schemas Zod)

-   **`inputSchema: SummarizeConversationSchema`**: `z.object({})` - Nenhum parâmetro de entrada é necessário.

-   **`outputSchema`**
    -   `success: z.boolean()`
    -   `message: z.string().optional()`: "Resumo salvo com sucesso."
    -   `error: z.string().optional()`
