// src/index.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./api/routes');

// --- CONFIGURAÇÃO ---
const app = express();
const port = process.env.PORT || 8080;

// Servir arquivos estáticos da pasta 'public'
// A pasta 'public' está um nível acima do diretório 'src'
app.use(express.static(path.join(__dirname, '../public')));

// Habilitar o parse de JSON para as APIs
app.use(express.json({ limit: '50mb' }));

// --- ROTAS ---
app.use('/api', apiRoutes);

// Rota principal para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- TRATAMENTO DE ERROS GLOBAL ---
app.use((err, req, res, next) => {
    console.error("Erro não tratado:", err);
    res.status(500).json({ error: err.message || "Ocorreu um erro interno no servidor." });
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});