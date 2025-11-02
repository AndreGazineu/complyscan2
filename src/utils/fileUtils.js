// src/utils/fileUtils.js

/**
 * Converte um buffer de arquivo em um objeto GenerativePart para a API Gemini.
 * @param {Buffer} buffer O buffer do arquivo.
 * @param {string} mimeType O tipo MIME do arquivo.
 * @returns {{ inlineData: { data: string, mimeType: string } }}
 */
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType,
        },
    };
}

/**
 * Extrai uma string JSON de um bloco de markdown.
 * @param {string} markdownString A string contendo o bloco de markdown.
 * @returns {string} A string JSON extraída.
 */
function extractJsonFromMarkdown(markdownString) {
    const jsonRegex = /```json\n([\s\S]*?)\n```/;
    const match = markdownString.match(jsonRegex);
    if (match && match[1]) {
        return match[1];
    }
    return markdownString; // Retorna a string original se não encontrar o padrão
}

module.exports = {
    fileToGenerativePart,
    extractJsonFromMarkdown,
};
