// src/services/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fileToGenerativePart, extractJsonFromMarkdown } = require('../utils/fileUtils');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("A variável de ambiente GEMINI_API_KEY é obrigatória.");
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite", generationConfig: { temperature: 0 } });

const OCR_PROMPT = "Extraia todo o texto presente na imagem abaixo com a máxima fidelidade possível. Preserve a ordem, grafia e espaçamento conforme visualmente exibido. Não faça interpretações, apenas transcreva com exatidão.";

const defaultComplyScanRequirements = [
    "Identificação do Fabricante",
    "Origem",
    "Atendimento ao Consumidor (SAC)",
    "Denominação de Venda",
    "Lista de Ingredientes",
    "Conteúdo Líquido",
    "Conservação e Validade",
    "Alergênicos",
    "Glúten",
    "Lactose",
    "Transgênicos",
    "Tabela Nutricional",
    "Rotulagem Nutricional Frontal (Lupa)"
];

function buildComplyScanPrompt(requirements) {
    const requirementsList = requirements.map((r, i) => `${i + 1}. ${r}`).join('\n  ');
    return `
      Você é um especialista em conformidade de rótulos de alimentos no Brasil.
      Analise a imagem do rótulo e verifique se ela atende aos requisitos da legislação (ANVISA/MAPA).
      Responda em formato JSON. O objeto JSON deve ser um array onde cada item contém três chaves: "requisito" (string), "status" ("Atendido", "Não Atendido", ou "Não Aplicável"), e "justificativa" (string).
      **Importante**: Sua resposta DEVE conter um objeto para CADA requisito listado abaixo. Se a informação de um requisito não estiver presente na imagem, use o status "Não Aplicável".

      REQUISITOS A VERIFICAR:
      ${requirementsList}

      Exemplo de um item no array JSON:
      {
        "requisito": "Glúten",
        "status": "Atendido",
        "justificativa": "A declaração '''Não contém Glúten''' está presente e clara."
      }
    `;
}

async function runOCR(file) {
    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);
    const result = await model.generateContent([OCR_PROMPT, imagePart]);
    return result.response.text();
}

async function runComplyScan(file, requirements = defaultComplyScanRequirements) {
    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);
    const chunkSize = 5;
    const chunks = [];
    for (let i = 0; i < requirements.length; i += chunkSize) {
        chunks.push(requirements.slice(i, i + chunkSize));
    }

    let allResults = [];
    for (const chunk of chunks) {
        const prompt = buildComplyScanPrompt(chunk);
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }, imagePart] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        });
        const text = result.response.text();
        const cleanedJson = extractJsonFromMarkdown(text);
        const chunkResult = JSON.parse(cleanedJson);
        allResults = allResults.concat(chunkResult);
    }

    return allResults;
}

async function runVisualDiff(file1, file2, file3) {
    const ocrPrompt = "Extraia todo o texto da imagem, mantendo a formatação original.";
    const imagePart1 = fileToGenerativePart(file1.buffer, file1.mimetype);
    const imagePart2 = fileToGenerativePart(file2.buffer, file2.mimetype);
    const imagePart3 = fileToGenerativePart(file3.buffer, file3.mimetype);

    const [ocrResult1, ocrResult2] = await Promise.all([
        model.generateContent([ocrPrompt, imagePart1]),
        model.generateContent([ocrPrompt, imagePart2])
    ]);

    const text1 = ocrResult1.response.text();
    const text2 = ocrResult2.response.text();

    const analysisPrompt = `
      **Tarefa**: Compare a Imagem 1 (referência) com a Imagem 2 (nova versão) e determine se são idênticas.
      **Contexto**:
      - Imagem 3 é um guia visual que destaca as áreas de prováveis diferenças.
      - Texto da Imagem 1 (OCR): """${text1}"""
      - Texto da Imagem 2 (OCR): """${text2}"""

      **Formato da Resposta**:
      Sua resposta DEVE ser um objeto JSON com a seguinte estrutura:
      {
        "sao_diferentes": boolean, // true se houver QUALQUER diferença, false caso contrário
        "diferencas": [ // Array de strings. Vazio se não houver diferenças.
          // Exemplo: "Diferença Textual: O endereço mudou de '''Rua A''' para '''Rua B'''."
          // Exemplo: "Diferença Visual: O logotipo foi reposicionado."
        ]
      }

      **Instruções**:
      1.  Compare o texto extraído de ambas as imagens. Registre cada discrepância.
      2.  Inspecione as diferenças visuais (cores, fontes, layout, imagens), usando a Imagem 3 como auxílio. Registre cada discrepância.
      3.  Preencha o JSON de resposta com base na sua análise. O campo "diferencas" deve conter uma lista de TODAS as diferenças encontradas.
      `;

    const result = await model.generateContent([analysisPrompt, imagePart1, imagePart2, imagePart3]);
    const analysisText = result.response.text();
    const cleanedJson = extractJsonFromMarkdown(analysisText);
    return JSON.parse(cleanedJson);
}

async function runUnifiedAnalysis(file1, file2) {
    const ocrPrompt = "Extraia todo o texto presente na imagem abaixo com a máxima fidelidade possível. Preserve a ordem, grafia e espaçamento conforme visualmente exibido. Não faça interpretações, apenas transcreva com exatidão.";
    const imagePart1 = fileToGenerativePart(file1.buffer, file1.mimetype);
    const imagePart2 = fileToGenerativePart(file2.buffer, file2.mimetype);

    const [result1, result2] = await Promise.all([
        model.generateContent([ocrPrompt, imagePart1]),
        model.generateContent([ocrPrompt, imagePart2])
    ]);

    const text1 = result1.response.text();
    const text2 = result2.response.text();

    const comparisonPrompt = `
      Você é um agente especialista em verificação de similaridade de documentos.
      Analise a "Imagem 1" e a "Imagem 2" abaixo.
      Sua tarefa é determinar se as duas imagens são essencialmente iguais, usando uma combinação de análise de texto e visual.

      1.  **Extraia o texto** de ambas as imagens.
      2.  **Compare o texto extraído**. Há diferenças?
      3.  **Compare visualmente as imagens**. Existem diferenças em layout, cores, logotipos ou outros elementos gráficos?
      4.  **Use seu raciocínio**: Com base nas diferenças textuais e visuais, as imagens representam o mesmo documento ou rótulo? Pequenas variações de alinhamento ou qualidade de imagem podem ser ignoradas, mas qualquer diferença de conteúdo (texto, números, imagens) deve ser notada.

      Responda com um veredito final: "As imagens são iguais" ou "As imagens são diferentes".
      Se forem diferentes, forneça um resumo claro e conciso das diferenças que você encontrou.
    `;

    const result = await model.generateContent([comparisonPrompt, imagePart1, imagePart2]);
    const summary = result.response.text();

    const hasDifferences = !summary.toLowerCase().includes("as imagens são iguais");

    return { hasDifferences, summary };
}

module.exports = {
    runOCR,
    runComplyScan,
    runVisualDiff,
    runUnifiedAnalysis,
    defaultComplyScanRequirements,
};
