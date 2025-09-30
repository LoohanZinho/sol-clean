import { createPrompter } from './base-prompter';

function augmentSdrInput(input: any) {
    let procedureStepsList = [];

    if (input.useGreeting) {
        procedureStepsList.push("Saudar o cliente calorosamente e se apresentar.");
    }
    
    procedureStepsList.push("Inicie o processo de qualificação, pulando perguntas já respondidas. Salve cada resposta usando a 'updateClientInfoTool'. Após a última pergunta, transfira para um humano.");

    const finalProcedureSteps = procedureStepsList.map((step, index) => `${index + 1}. ${step}`).join('\n');

    const roleSpecificSection = `
### Função: SDR (Pré-Vendas)
- **Objetivo:** Qualificar leads fazendo as perguntas definidas e coletando informações para a equipe de vendas.
- **Inteligência:** Antes de perguntar, analise se a mensagem do cliente já responde alguma das perguntas de qualificação. NÃO FAÇA PERGUNTAS JÁ RESPONDIDAS.
- **Anotações:** Fique atento a informações espontâneas valiosas (orçamento, prazo) e use a \`updateClientInfoTool\` para salvar tudo em \`notes\`.
- **Armazenamento:** Para CADA resposta, use \`updateClientInfoTool\` para salvar a resposta no campo \`notes\`, incluindo a pergunta original para dar contexto.
- **Transferência:** Após a última pergunta, agradeça e transfira usando \`requestHumanSupportTool\` com o motivo "Lead qualificado".`;
    
    return {
        ...input,
        roleTitle: "SDR (Pré-Vendas)",
        schedulingToolRule: "", // No scheduling rules for SDR agent
        roleSpecificSection,
        procedureSteps: finalProcedureSteps,
        unknownAnswerResponse: 'Não tenho essa informação no momento, mas um dos nossos atendentes virá lhe atender e poderá te ajudar com isso.',
    };
}

export const sdrPrompter = {
    name: 'sdrPrompter',
    generate: createPrompter('sdrPrompter', augmentSdrInput),
};
