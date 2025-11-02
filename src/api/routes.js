// src/api/routes.js
const express = require('express');
const multer = require('multer');
const controllers = require('./controllers');

const router = express.Router();

// Configuração do Multer para upload de arquivos em memória
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ROTAS DA API ---
router.post('/ocr', upload.single('file1'), controllers.ocrController);
router.get('/complyscan/requirements', controllers.getComplyScanRequirements);
router.post('/complyscan', upload.single('file1'), controllers.complyScanController);
router.post('/visualdiff', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }, { name: 'file3', maxCount: 1 }]), controllers.visualDiffController);
router.post('/unified-analysis', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), controllers.unifiedAnalysisController);
router.post('/chat', controllers.chatController);

module.exports = router;
