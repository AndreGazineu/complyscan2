// index.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURAÇÃO ---
const app = express();
const port = process.env.PORT || 8080;

// Chave da API e inicialização do modelo Gemini
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("A variável de ambiente GEMINI_API_KEY é obrigatória.");
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { temperature: 0 } });

// Configuração do Multer para upload de arquivos em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Habilitar o parse de JSON para a API de chat (com limite maior para imagens)
app.use(express.json({ limit: '50mb' }));


// --- FUNÇÃO AUXILIAR PARA CONVERTER BUFFER EM PARTE PARA O GEMINI ---
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType,
        },
    };
}


// --- ROTAS DA API ---

/**
 * Rota para OCR (substitui a função 'imagedifftest')
 * Espera um único arquivo no campo 'file1'
 */
app.post('/api/ocr', upload.single('file1'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }

    try {
        const prompt = "Extraia todo o texto presente na imagem abaixo com a máxima fidelidade possível. Preserve a ordem, grafia e espaçamento conforme visualmente exibido. Não faça interpretações, apenas transcreva com exatidão.";

        const imagePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        res.json({ text });

    } catch (error) {
        console.error("Erro na API de OCR:", error);
        res.status(500).json({ error: "Erro ao processar a imagem com a API Gemini." });
    }
});


/**
 * Rota para Análise de Conformidade (substitui a função 'complyscan')
 * Espera dois arquivos nos campos 'file1' e 'file2'
 */
app.post('/api/complyscan', upload.single('file1'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "É necessário enviar o arquivo ('file1')." });
    }

    try {
        const prompt = `
          Você é um especialista em conformidade de rótulos de alimentos no Brasil.
          Analise a imagem do rótulo e verifique se ela atende aos requisitos da legislação (ANVISA/MAPA).
          Responda em formato JSON. O objeto JSON deve ser um array onde cada item contém três chaves: "requisito" (string), "status" ("Atendido", "Não Atendido", ou "Não Aplicável"), e "justificativa" (string).

          REQUISITOS A VERIFICAR:
          1. Identificação do Fabricante
          2. Origem
          3. Atendimento ao Consumidor (SAC)
          4. Denominação de Venda
          5. Lista de Ingredientes
          6. Conteúdo Líquido
          7. Conservação e Validade
          8. Alergênicos
          9. Glúten
          10. Lactose
          11. Transgênicos
          12. Tabela Nutricional
          13. Rotulagem Nutricional Frontal (Lupa)

          Exemplo de um item no array JSON:
          {
            "requisito": "Glúten",
            "status": "Atendido",
            "justificativa": "A declaração 'Não contém Glúten' está presente e clara."
          }
        `;

        const imagePart1 = fileToGenerativePart(req.file.buffer, req.file.mimetype);

        // Habilita o modo JSON para esta requisição específica
        const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }, imagePart1] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        });

        const response = await result.response;
        const text = response.text();

        // O modelo retorna o JSON como uma string, então fazemos o parse
        const jsonData = JSON.parse(text);

        res.json(jsonData); // Envia o JSON estruturado para o frontend

    } catch (error) {
        console.error("Erro na API ComplyScan:", error);
        res.status(500).json({ error: "Erro ao processar a imagem ou ao fazer o parse da resposta da API Gemini." });
    }
});


/**
 * Rota para Verificação de Diferenças Visuais
 * Espera três arquivos: 'file1' (original), 'file2' (modificada) e 'file3' (diff)
 */
app.post('/api/visualdiff', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }, { name: 'file3', maxCount: 1 }]), async (req, res) => {
    if (!req.files || !req.files.file1 || !req.files.file2 || !req.files.file3) {
        return res.status(400).json({ error: "É necessário enviar os três arquivos ('file1', 'file2' e 'file3')." });
    }

    try {
        // 1. Extrair OCR de ambas as imagens
        const ocrPrompt = "Extraia todo o texto da imagem, mantendo a formatação original.";
        const imagePart1 = fileToGenerativePart(req.files.file1[0].buffer, req.files.file1[0].mimetype);
        const imagePart2 = fileToGenerativePart(req.files.file2[0].buffer, req.files.file2[0].mimetype);
        const imagePart3 = fileToGenerativePart(req.files.file3[0].buffer, req.files.file3[0].mimetype);

        const [ocrResult1, ocrResult2] = await Promise.all([
            model.generateContent([ocrPrompt, imagePart1]),
            model.generateContent([ocrPrompt, imagePart2])
        ]);

        const text1 = ocrResult1.response.text();
        const text2 = ocrResult2.response.text();

        // 2. Criar um prompt abrangente
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
              // Exemplo: "Diferença Textual: O endereço mudou de 'Rua A' para 'Rua B'."
              // Exemplo: "Diferença Visual: O logotipo foi reposicionado."
            ]
          }

          **Instruções**:
          1.  Compare o texto extraído de ambas as imagens. Registre cada discrepância.
          2.  Inspecione as diferenças visuais (cores, fontes, layout, imagens), usando a Imagem 3 como auxílio. Registre cada discrepância.
          3.  Preencha o JSON de resposta com base na sua análise. O campo "diferencas" deve conter uma lista de TODAS as diferenças encontradas.
          `;

        // 3. Gerar conteúdo com todas as informações
        const result = await model.generateContent([analysisPrompt, imagePart1, imagePart2, imagePart3]);
        const response = await result.response;
        const analysisText = response.text();

        // O modelo retorna o JSON como uma string, então fazemos o parse
        const jsonData = JSON.parse(analysisText);

        res.json(jsonData); // Envia o JSON estruturado para o frontend

    } catch (error) {
        console.error("Erro na API de Verificação Visual:", error);
        res.status(500).json({ error: "Erro ao processar as imagens com a API Gemini." });
    }
});



app.post('/api/unified-analysis', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
    if (!req.files || !req.files.file1 || !req.files.file2) {
        return res.status(400).json({ error: "É necessário enviar os dois arquivos ('file1' e 'file2')." });
    }

    try {
        const ocrPrompt = "Extraia todo o texto presente na imagem abaixo com a máxima fidelidade possível. Preserve a ordem, grafia e espaçamento conforme visualmente exibido. Não faça interpretações, apenas transcreva com exatidão.";
        const imagePart1 = fileToGenerativePart(req.files.file1[0].buffer, req.files.file1[0].mimetype);
        const imagePart2 = fileToGenerativePart(req.files.file2[0].buffer, req.files.file2[0].mimetype);

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

        // Heurística simples para determinar hasDifferences baseado na resposta da IA
        const hasDifferences = !summary.toLowerCase().includes("as imagens são iguais");

        res.json({ hasDifferences, summary });

    } catch (error) {
        res.status(500).json({ error: "Erro ao processar as imagens com a API Gemini." });
    }
});

app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: "Nenhuma mensagem enviada." });
    }

    try {
        // Resposta simples e estática por enquanto
        const botResponse = `Você disse: "${userMessage}". Esta é uma resposta automática.`;
        res.json({ text: botResponse });
    } catch (error) {
        console.error("Erro na API de Chat:", error);
        res.status(500).json({ error: "Erro ao processar a mensagem com a API Gemini." });
    }
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
