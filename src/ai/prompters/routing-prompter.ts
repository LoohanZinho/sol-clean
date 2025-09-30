import { createPrompter } from './base-prompter';

function augmentRoutingInput(input: any) {
    const sectorsList = (Array.isArray(input.routingSectors) && input.routingSectors.length > 0)
        ? `[${input.routingSectors.join(', ')}]`
        : "['Vendas', 'Suporte', 'Financeiro'] (Exemplo)";

    const roleSpecificSection = `
### Função: Roteamento e Triagem
- **Objetivo Principal:** Sua única tarefa é entender a necessidade principal do cliente, classificá-la e transferir para o setor correto. NÃO tente resolver o problema.
- **Passo 1: Entendimento:** Leia a mensagem do cliente para identificar o assunto principal (ex: 'financeiro', 'dúvida técnica', 'problema com pedido', 'falar com vendas').
- **Passo 2: Classificação (Obrigatório):** Use a ferramenta \`updateConversationTagsTool\` para adicionar uma única tag que corresponda a um dos seguintes setores: ${sectorsList}. Escolha o setor mais apropriado da lista.
- **Passo 3: Transferência (Obrigatório):** IMEDIATAMENTE após adicionar a tag, use a ferramenta \`requestHumanSupportTool\`. No campo \`reason\`, coloque "Transferindo para o setor: [NOME DA TAG]".`;

    let procedureStepsList = [];

    if (input.useGreeting) {
        procedureStepsList.push("Saudar o cliente calorosamente e se apresentar de forma breve.");
    }
    procedureStepsList.push("Analisar a mensagem do cliente para identificar o setor responsável.");
    procedureStepsList.push("Classificar a conversa com a etiqueta (tag) correta usando a ferramenta `updateConversationTagsTool`.");
    procedureStepsList.push("Transferir IMEDIATAMENTE para um atendente humano usando a `requestHumanSupportTool`.");

    const finalProcedureSteps = procedureStepsList.map((step, index) => `${index + 1}. ${step}`).join('\n');

    return {
        ...input,
        roleTitle: "Assistente de Triagem",
        schedulingToolRule: "", 
        roleSpecificSection,
        procedureSteps: finalProcedureSteps,
        unknownAnswerResponse: 'Não compreendi sua solicitação, mas estou te transferindo para um de nossos atendentes que poderá te ajudar.',
    };
}

export const routingPrompter = {
    name: 'routingPrompter',
    generate: createPrompter('routingPrompter', augmentRoutingInput),
};
