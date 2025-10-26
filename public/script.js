let pdfFiles = [null, null];
let pdfReady = [false, false];
let scale = 1;
let isFullscreen = false;
let panning = false;
let offsetX = 0;
let offsetY = 0;
let start = { x: 0, y: 0 };
let pdfImages = [null, null];

function applyTransform() {
    const canvas1 = document.getElementById("overlay-canvas1");
    const canvas2 = document.getElementById("overlay-canvas2");
    [canvas1, canvas2].forEach(canvas => {
        if (canvas) {
            // CORREÇÃO: Mantém a centralização original e adiciona o pan/zoom do usuário
            canvas.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }
    });
}

function handleWheel(event) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY);
    const factor = 0.1;
    scale = delta > 0 ? Math.max(0.1, scale - factor) : Math.min(5, scale + factor);
    applyTransform();
}

function startPan(evt) {
    if (isFullscreen) {
        panning = true;
        start = { x: evt.clientX - offsetX, y: evt.clientY - offsetY };
    }
}

function move(evt) {
    if (isFullscreen && panning) {
        offsetX = evt.clientX - start.x;
        offsetY = evt.clientY - start.y;
        applyTransform();
    }
}

function endPan() {
    if (isFullscreen) { panning = false; }
}

function setupInteractionListeners(canvasContainer) {
    canvasContainer.addEventListener("wheel", handleWheel);
    canvasContainer.addEventListener("mousedown", startPan);
    canvasContainer.addEventListener("mousemove", move);
    canvasContainer.addEventListener("mouseup", endPan);
    canvasContainer.addEventListener("mouseleave", endPan);
}

const swiper = new Swiper('.swiper-container', {
    effect: 'coverflow',
    grabCursor: true,
    centeredSlides: true,
    slidesPerView: 'auto',
    coverflowEffect: {
        rotate: 50,
        stretch: 0,
        depth: 100,
        modifier: 1,
        slideShadows: true,
    },
    pagination: { el: '.swiper-pagination' },
    on: {
        slideChangeTransitionEnd: function () {
            if (this.activeIndex === 3) {
                renderizarEajustarOverlay();
            }
        },
        resize: function () {
            if (this.activeIndex === 3) {
                renderizarEajustarOverlay();
            }
        },
        slideChange: function () {
            if (this.activeIndex === 2 && pdfReady[0] && pdfReady[1]) {
                compararPDFsDiferencas();
            } else if (this.activeIndex === 3 && pdfReady[0] && pdfReady[1]) {
                renderizarEajustarOverlay();
            } else if (this.activeIndex === 4 && pdfReady[0] && pdfReady[1]) {
                compararTextosPDFs(pdfFiles[0], pdfFiles[1]);
            }
        }
    }
});

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const dropAreas = [document.getElementById("drop-area-1"), document.getElementById("drop-area-2")];
dropAreas.forEach((dropArea, index) => {
    dropArea.addEventListener("dragover", (e) => e.preventDefault());
    dropArea.addEventListener("drop", (e) => handleFileDrop(e, index));
    dropArea.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf, image/*";
        input.onchange = (e) => {
            handleFileDrop({
                preventDefault: ()=>{},
                dataTransfer: { files: e.target.files }
            }, index);
        };
        input.click();
    });
});

function handleFileDrop(event, index) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.type.startsWith("image/"))) {
        pdfFiles[index] = file;
        pdfReady[index] = true;
        const dropArea = dropAreas[index];
        dropArea.innerHTML = `<i class="fas fa-check-circle" style="color: green;"></i><p>${file.name} carregado</p>`;
        document.getElementById("resultados").innerHTML = '';
        document.getElementById("text-comparison-results").innerHTML = 'Aguarde os arquivos serem carregados...';
        processarEntrada(file, index);
    } else {
        alert("Por favor, arraste um arquivo PDF ou uma imagem.");
    }
}

function processarEntrada(file, index) {
    if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function(e) { pdfImages[index] = e.target.result; };
        reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
        const reader = new FileReader();
        reader.onload = function(e) {
            const dadosPDF = e.target.result;
            pdfjsLib.getDocument({ data: dadosPDF }).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                    const escala = 6;
                    const viewport = page.getViewport({ scale: escala });
                    const canvas = document.createElement("canvas");
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    const contexto = canvas.getContext("2d");
                    page.render({ canvasContext: contexto, viewport: viewport }).promise.then(() => {
                        pdfImages[index] = canvas.toDataURL("image/png");
                    });
                });
            });
        };
        reader.readAsArrayBuffer(file);
    }
}

function pdfFileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function compararPDFsDiferencas() {
    const resultadosDiv = document.getElementById("resultados");
    resultadosDiv.innerHTML = '<div class="loading-animation"></div><p>Comparando imagens...</p>';

    if (!pdfImages[0] || !pdfImages[1]) {
        resultadosDiv.innerHTML = "<p>Erro: Uma ou ambas as imagens não estão prontas para comparação.</p>";
        return;
    }
    await compararImagensDiferencas(pdfImages[0], pdfImages[1]);
}

async function compararTextosPDFs(pdf1File, pdf2File) {
    const textComparisonDiv = document.getElementById("text-comparison-results");
    textComparisonDiv.innerHTML = '<div class="loading-animation"></div><p>Gerando relatório...</p>';

    if (!pdf1File.type.startsWith("image/") && !pdf2File.type.startsWith("image/")) {
        const pdf1 = await pdfjsLib.getDocument({ data: await pdfFileToArrayBuffer(pdf1File) }).promise;
        const pdf2 = await pdfjsLib.getDocument({ data: await pdfFileToArrayBuffer(pdf2File) }).promise;
        const text1 = await extractTextFromPDFDocument(pdf1);
        const text2 = await extractTextFromPDFDocument(pdf2);
        const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 0));
        const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 0));
        const missingInText1 = [...words2].filter(word => !words1.has(word));
        const missingInText2 = [...words1].filter(word => !words2.has(word));
        textComparisonDiv.innerHTML = `
            <strong>Palavras no Arquivo 2 mas faltando no Arquivo 1:</strong><br>
            ${missingInText1.join(', ') || 'Nenhuma.'}<br><br>
            <strong>Palavras no Arquivo 1 mas faltando no Arquivo 2:</strong><br>
            ${missingInText2.join(', ') || 'Nenhuma.'}
        `;
    } else {
        textComparisonDiv.innerHTML = "Comparação de textos detalhada não disponível para imagens. Use a análise OCR/ComplyScan.";
    }
    if (pdfImages[0]) {
        const barcode1 = await detectarCodigoBarras(pdfImages[0]);
        textComparisonDiv.innerHTML += `<br><br><strong>Código de barras (Arquivo 1):</strong> ${barcode1}`;
    }
    if (pdfImages[1]) {
        const barcode2 = await detectarCodigoBarras(pdfImages[1]);
        textComparisonDiv.innerHTML += `<br><br><strong>Código de barras (Arquivo 2):</strong> ${barcode2}`;
    }
}

async function extractTextFromPDFDocument(pdf) {
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
    }
    return fullText.trim();
}

async function compararImagensDiferencas(imgURL1, imgURL2) {
    const resultadosDiv = document.getElementById("resultados");
    resultadosDiv.innerHTML = '<div class="loading-animation"></div><p>Analisando diferenças...</p>';

    try {
        const img1 = new Image();
        const img2 = new Image();
        await Promise.all([
            new Promise((resolve, reject) => { img1.onload = resolve; img1.onerror = reject; img1.src = imgURL1; }),
            new Promise((resolve, reject) => { img2.onload = resolve; img2.onerror = reject; img2.src = imgURL2; })
        ]);

        const largura = Math.min(img1.width, img2.width);
        const altura = Math.min(img1.height, img2.height);

        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = largura;
        diffCanvas.height = altura;
        const diffContexto = diffCanvas.getContext("2d");

        // Desenha as imagens em canvas temporários para obter os dados
        const canvas1 = document.createElement("canvas");
        canvas1.width = largura;
        canvas1.height = altura;
        const contexto1 = canvas1.getContext("2d");
        contexto1.drawImage(img1, 0, 0, largura, altura);
        const imgDados1 = contexto1.getImageData(0, 0, largura, altura);

        const canvas2 = document.createElement("canvas");
        canvas2.width = largura;
        canvas2.height = altura;
        const contexto2 = canvas2.getContext("2d");
        contexto2.drawImage(img2, 0, 0, largura, altura);
        const imgDados2 = contexto2.getImageData(0, 0, largura, altura);

        const diffImgDados = diffContexto.createImageData(largura, altura);

        // Calcula o diff
        for (let i = 0; i < largura * altura * 4; i += 4) {
            const gray1 = 0.299 * imgDados1.data[i] + 0.587 * imgDados1.data[i + 1] + 0.114 * imgDados1.data[i + 2];
            const gray2 = 0.299 * imgDados2.data[i] + 0.587 * imgDados2.data[i + 1] + 0.114 * imgDados2.data[i + 2];
            const diff = Math.abs(gray1 - gray2);
            if (diff > 50) { // Limiar de diferença
                diffImgDados.data[i] = 255;     // R
                diffImgDados.data[i + 1] = 0;       // G
                diffImgDados.data[i + 2] = 0;       // B
                diffImgDados.data[i + 3] = 255;     // A
            } else {
                diffImgDados.data[i + 3] = 0; // Transparente
            }
        }
        diffContexto.putImageData(diffImgDados, 0, 0);

        // Limpa a div de resultados e exibe a imagem de diff
        resultadosDiv.innerHTML = '';
        const divPagina = document.createElement("div");
        divPagina.className = "pagina";
        const tituloPagina = document.createElement("h3");
        tituloPagina.textContent = `Visualização das Diferenças (em vermelho)`;
        divPagina.appendChild(tituloPagina);
        divPagina.appendChild(diffCanvas);
        resultadosDiv.appendChild(divPagina);

        // Envia para o backend para análise do Gemini
        const diffImageDataURL = diffCanvas.toDataURL('image/png');
        const formData = new FormData();
        formData.append("file1", dataURLtoFile(imgURL1, 'imagem1.png'));
        formData.append("file2", dataURLtoFile(imgURL2, 'imagem2.png'));
        formData.append("file3", dataURLtoFile(diffImageDataURL, 'imagem_diff.png'));

        const response = await fetch("/api/visualdiff", {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Erro na API: ${response.status}`);
        }

        // Adiciona o resultado da análise do Gemini
        const analysisResultDiv = document.createElement("div");
        analysisResultDiv.className = "pagina";
        analysisResultDiv.innerHTML = `<h3>Análise do Gemini (baseado nas 3 imagens)</h3><pre>${data.text}</pre>`;
        resultadosDiv.appendChild(analysisResultDiv);

    } catch (error) {
        console.error("Erro ao comparar imagens:", error);
        resultadosDiv.innerHTML = `<p style="color: red;">Ocorreu um erro durante a análise: ${error.message}</p>`;
    } finally {
        // Garante que os listeners de interação sejam reconfigurados se necessário
        const canvasContainer = document.querySelector(".canvas-container");
        if (canvasContainer) {
            setupInteractionListeners(canvasContainer);
        }
    }
}

async function renderizarEajustarOverlay() {
    if (!pdfImages[0] || !pdfImages[1]) {
        return;
    }

    const overlayCanvas1 = document.getElementById("overlay-canvas1");
    const overlayCanvas2 = document.getElementById("overlay-canvas2");
    const container = document.getElementById("overlay-canvas-container");

    if (container.clientWidth === 0) return;

    const img1 = new Image();
    img1.src = pdfImages[0];
    const img2 = new Image();
    img2.src = pdfImages[1];

    await Promise.all([
        new Promise(resolve => img1.onload = resolve),
        new Promise(resolve => img2.onload = resolve)
    ]);

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const aspectRatio = img1.naturalWidth / img1.naturalHeight;

    let largura, altura;
    if (containerWidth / containerHeight > aspectRatio) {
        altura = containerHeight;
        largura = altura * aspectRatio;
    } else {
        largura = containerWidth;
        altura = largura / aspectRatio;
    }

    [overlayCanvas1, overlayCanvas2].forEach(canvas => {
        canvas.width = largura;
        canvas.height = altura;
    });

    const ctx1 = overlayCanvas1.getContext("2d");
    ctx1.drawImage(img1, 0, 0, largura, altura);

    const ctx2 = overlayCanvas2.getContext("2d");
    ctx2.drawImage(img2, 0, 0, largura, altura);

    const overlayControl = document.getElementById("overlay-control");
    overlayCanvas2.style.opacity = overlayControl.value;
    
    offsetX = 0;
    offsetY = 0;
    scale = 1;
    applyTransform();
    
    setupInteractionListeners(container);
}

function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, {type: mime});
}

async function detectarCodigoBarras(imageDataURL) {
    const file = dataURLtoFile(imageDataURL, "temp.png");
    const readerOptions = {
        tryHarder: true,
        formats: ["QRCode", "Code128", "EAN_13"]
    };

    try {
        const results = await ZXingWASM.readBarcodesFromImageFile(file, readerOptions);
        if (results.length > 0) {
            return results[0].text;
        } else {
            return "Nenhum código de barras detectado.";
        }
    } catch (error) {
        console.error("Erro ao detectar código de barras:", error);
        return "Erro ao processar a imagem para detectar código de barras.";
    }
}


async function enviarParaAnaliseUnificada() {
    const loadingMessage = document.getElementById("loading-message");
    if (loadingMessage) loadingMessage.style.display = 'block';

    if (!pdfImages[0] || !pdfImages[1]) {
        alert("É necessário carregar os dois arquivos antes de usar a análise unificada.");
        if (loadingMessage) loadingMessage.style.display = 'none';
        return;
    }

    try {
        const formData = new FormData();
        const file1 = dataURLtoFile(pdfImages[0], 'imagem1.png');
        const file2 = dataURLtoFile(pdfImages[1], 'imagem2.png');

        formData.append("file1", file1);
        formData.append("file2", file2);

        const response = await fetch("/api/unified-analysis", {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Erro na API de Análise Unificada: ${response.status}`);
        }

        const resultsDiv = document.getElementById("unified-results");
        if (data.hasDifferences) {
            resultsDiv.innerHTML = `<strong>Diferenças Encontradas:</strong><br><p>${data.summary}</p>`;
        } else {
            resultsDiv.innerHTML = `<strong>Nenhuma diferença encontrada.</strong><br><p>${data.summary}</p>`;
        }

    } catch (error) {
        console.error("Erro na requisição de Análise Unificada:", error);
        alert(`Erro ao chamar a API de Análise Unificada: ${error.message}`);
    } finally {
        if (loadingMessage) loadingMessage.style.display = 'none';
    }
}

async function enviarParaComplyScan() {
    const loadingMessage = document.getElementById("loading-message-comply");
    if (loadingMessage) loadingMessage.style.display = 'block';

    const resultsDiv = document.getElementById("comply-scan-results");
    resultsDiv.innerHTML = ''; // Limpa resultados anteriores

    if (!pdfImages[0]) {
        alert("É necessário carregar pelo menos a primeira imagem para usar o ComplyScan.");
        if (loadingMessage) loadingMessage.style.display = 'none';
        return;
    }

    try {
        const formData = new FormData();
        const file1 = dataURLtoFile(pdfImages[0], 'imagem1.png');
        formData.append("file1", file1);

        const response = await fetch("/api/complyscan", {
            method: "POST",
            body: formData
        });

        const data = await response.json(); // Agora é um objeto JSON

        if (!response.ok) {
            throw new Error(data.error || `Erro na API ComplyScan: ${response.status}`);
        }

        // Constrói o HTML da checklist
        let html = '<ul class="checklist">';
        data.forEach(item => {
            let icon = '';
            let statusClass = '';
            switch (item.status) {
                case 'Atendido':
                    icon = '<i class="fas fa-check-circle"></i>';
                    statusClass = 'status-atendido';
                    break;
                case 'Não Atendido':
                    icon = '<i class="fas fa-times-circle"></i>';
                    statusClass = 'status-nao-atendido';
                    break;
                default: // Inclui 'Não Aplicável'
                    icon = '<i class="fas fa-info-circle"></i>';
                    statusClass = 'status-nao-aplicavel';
                    break;
            }
            html += `
                <li>
                    <div class="item-header">
                        <span class="status-icon ${statusClass}">${icon}</span>
                        <span class="requisito-text">${item.requisito}</span>
                    </div>
                    <p class="justificativa">${item.justificativa}</p>
                </li>
            `;
        });
        html += '</ul>';

        resultsDiv.innerHTML = html;

    } catch (error) {
        console.error("Erro na requisição ComplyScan:", error);
        alert(`Erro ao chamar a API ComplyScan: ${error.message}`);
        resultsDiv.innerHTML = `<p style="color: red;">Ocorreu um erro: ${error.message}</p>`;
    } finally {
        if (loadingMessage) loadingMessage.style.display = 'none';
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("unifiedAnalysisButton").addEventListener("click", enviarParaAnaliseUnificada);
    document.getElementById("complyScanButton").addEventListener("click", enviarParaComplyScan);

    const overlayControl = document.getElementById("overlay-control");
    const overlayCanvas2 = document.getElementById("overlay-canvas2");
    overlayControl.addEventListener("input", (e) => {
        overlayCanvas2.style.opacity = e.target.value;
    });

    const resultadosContainer = document.getElementById("resultados");
    const canvasContainer = document.getElementById("overlay-canvas-container");
    const respostaElement = document.getElementById("resposta");

    function toggleFullscreen(element) {
        if (!document.fullscreenElement) {
            element.requestFullscreen().catch(err => alert(`Erro ao entrar em tela cheia: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    }

    resultadosContainer.addEventListener("dblclick", () => toggleFullscreen(resultadosContainer));
    canvasContainer.addEventListener("dblclick", () => toggleFullscreen(canvasContainer));
    if(respostaElement) {
        respostaElement.addEventListener("dblclick", () => toggleFullscreen(respostaElement));
    }


});
