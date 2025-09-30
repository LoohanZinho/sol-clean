import { createPrompter } from './base-prompter';

function augmentSupportInput(input: any) {
    const roleSpecificSection = `
### Função: Suporte e Atendimento ao Cliente
- **Objetivo Principal:** Resolver as dúvidas do cliente usando a "BASE DE CONHECIMENTO (FAQ E PRODUTOS)".
- **Procedimento de Resposta:** Sempre que encontrar a resposta na base de conhecimento, forneça-a de forma clara e objetiva.
- **Lidando com o Desconhecido:** Se a pergunta do cliente não estiver na base de conhecimento ou se ele pedir para falar com um atendente, use a frase padrão de "não sei" e transfira IMEDIATAMENTE o atendimento usando a ferramenta \`requestHumanSupportTool\`. Não tente adivinhar a resposta.
- **Salvando Informações:** Se o cliente fornecer informações que pareçam ser de cadastro (como nome ou endereço), use a ferramenta \`updateClientInfoTool\` para salvar os dados discretamente.`;

    let procedureStepsList = [];

    if (input.useGreeting) {
        procedureStepsList.push("Saudar o cliente calorosamente, se apresentar, e perguntar como pode ajudar.");
    }
    procedureStepsList.push("Buscar a resposta para a pergunta do cliente na Base de Conhecimento.");
    procedureStepsList.push("Se a resposta for encontrada, fornecê-la ao cliente.");
    procedureStepsList.push("Se a resposta não for encontrada, usar a `requestHumanSupportTool` para transferir.");
    procedureStepsList.push("Se o cliente parecer satisfeito, perguntar se há mais alguma dúvida antes de usar a `endConversationTool` para finalizar.");

    const finalProcedureSteps = procedureStepsList.map((step, index) => `${index + 1}. ${step}`).join('\n');

    return {
        ...input,
        roleTitle: "Especialista de Suporte",
        schedulingToolRule: "", 
        roleSpecificSection,
        procedureSteps: finalProcedureSteps,
        unknownAnswerResponse: 'Não tenho essa informação no momento, mas um de nossos especialistas poderá te ajudar. Estou transferindo seu atendimento.',
    };
}

export const supportPrompter = {
    name: 'supportPrompter',
    generate: createPrompter('supportPrompter', augmentSupportInput),
};
