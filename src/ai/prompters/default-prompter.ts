import { createPrompter } from './base-prompter';

const commonSteps = {
    analyzeAndCheckTriggers: `Analisar a mensagem para entender a necessidade e verificar se algum gatilho de transferência foi acionado.`,
    searchFaq: `Primeiro, buscar a resposta na base de conhecimento (FAQ).`,
    answerFromFaq: `Se a resposta estiver no FAQ, fornecê-la e guiar o cliente para o "Objetivo Principal".`,
    handleUnknownAnswer: `Se a resposta não estiver no FAQ, usar a frase de "não sei" e imediatamente usar a ferramenta \`requestHumanSupportTool\`.`,
    saveClientInfo: `Se o cliente fornecer dados de cadastro ou informações úteis, usar a ferramenta \`updateClientInfoTool\` e confirmar o salvamento.`,
    endConversation: `**Finalização:** Após concluir o objetivo principal, confirme se o cliente está satisfeito e se precisa de mais alguma ajuda antes de usar a ferramenta \`endConversationTool\` para resumir e arquivar a conversa.`
};

function augmentDefaultInput(input: any) {
    let procedureStepsList = [];

    if (input.useGreeting) {
        procedureStepsList.push("Saudar o cliente calorosamente. Use a 'DATA E HORA ATUAL' para determinar se é 'Bom dia', 'Boa tarde' ou 'Boa noite', independentemente da saudação que o cliente usou. Em seguida, se apresente.");
    }
    
    procedureStepsList.push(commonSteps.analyzeAndCheckTriggers);
    procedureStepsList.push(commonSteps.searchFaq);
    procedureStepsList.push(commonSteps.answerFromFaq);
    procedureStepsList.push(commonSteps.handleUnknownAnswer);
    procedureStepsList.push(commonSteps.saveClientInfo);
    procedureStepsList.push(commonSteps.endConversation);

    const finalProcedureSteps = procedureStepsList.map((step, index) => `${index + 1}. ${step}`).join('\n');
    
    return {
        ...input,
        roleTitle: input.agentRole || "Assistente de Atendimento",
        schedulingToolRule: "", 
        roleSpecificSection: '',
        procedureSteps: finalProcedureSteps,
        unknownAnswerResponse: 'Não tenho essa informação no momento, mas um dos nossos atendentes virá lhe atender e poderá te ajudar com isso.',
    };
}

export const defaultPrompter = {
    name: 'defaultPrompter',
    generate: createPrompter('defaultPrompter', augmentDefaultInput),
};
