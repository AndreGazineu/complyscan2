// src/api/controllers.js
const geminiService = require('../services/geminiService');

// Utility to wrap async functions and catch errors
const catchAsync = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const ocrController = catchAsync(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
    }
    const text = await geminiService.runOCR(req.file);
    res.json({ text });
});

const complyScanController = catchAsync(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "É necessário enviar o arquivo ('file1')." });
    }
    // Extrai os requisitos do corpo da requisição. Se não houver, usa o padrão.
    const requirements = req.body.requirements ? JSON.parse(req.body.requirements) : undefined;
    const jsonData = await geminiService.runComplyScan(req.file, requirements);
    res.json(jsonData);
});

const getComplyScanRequirements = (req, res) => {
    res.json(geminiService.defaultComplyScanRequirements);
};

const visualDiffController = catchAsync(async (req, res) => {
    if (!req.files || !req.files.file1 || !req.files.file2 || !req.files.file3) {
        return res.status(400).json({ error: "É necessário enviar os três arquivos ('file1', 'file2' e 'file3')." });
    }
    const jsonData = await geminiService.runVisualDiff(req.files.file1[0], req.files.file2[0], req.files.file3[0]);
    res.json(jsonData);
});

const unifiedAnalysisController = catchAsync(async (req, res) => {
    if (!req.files || !req.files.file1 || !req.files.file2) {
        return res.status(400).json({ error: "É necessário enviar os dois arquivos ('file1' e 'file2')." });
    }
    const result = await geminiService.runUnifiedAnalysis(req.files.file1[0], req.files.file2[0]);
    res.json(result);
});

const chatController = catchAsync(async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) {
        return res.status(400).json({ error: "Nenhuma mensagem enviada." });
    }
    // Placeholder logic
    const botResponse = `Você disse: "${userMessage}". Esta é uma resposta automática.`;
    res.json({ text: botResponse });
});

module.exports = {
    ocrController,
    complyScanController,
    visualDiffController,
    unifiedAnalysisController,
    chatController,
    getComplyScanRequirements,
};
