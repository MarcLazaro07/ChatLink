let PDF_ENV = null; // { base, worker }

function openPdfViewer({ url, title = 'Documento PDF' }) {
  const root = document.getElementById('modalRoot');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('header');
  header.textContent = title;

  const content = document.createElement('div');
  content.className = 'content';

  const controls = document.createElement('div');
  controls.className = 'viewer-controls';
  const prevBtn = document.createElement('button'); prevBtn.textContent = 'Anterior';
  const nextBtn = document.createElement('button'); nextBtn.textContent = 'Siguiente';
  const zoomOut = document.createElement('button'); zoomOut.textContent = '−';
  const zoomIn = document.createElement('button'); zoomIn.textContent = '+';
  const pageInfo = document.createElement('span'); pageInfo.textContent = 'Página 1';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvasWrap.appendChild(canvas);

  let pdfDoc = null;
  let loadingTask = null;
  let currentPage = 1;
  let scale = 1.1;

  async function renderPage(num) {
    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    const renderContext = { canvasContext: ctx, viewport, transform };
    await page.render(renderContext).promise;
    pageInfo.textContent = `Página ${currentPage} / ${pdfDoc.numPages}`;
  }

  prevBtn.addEventListener('click', async () => {
    if (currentPage <= 1) return; currentPage--; await renderPage(currentPage);
  });
  nextBtn.addEventListener('click', async () => {
    if (currentPage >= pdfDoc.numPages) return; currentPage++; await renderPage(currentPage);
  });
  zoomIn.addEventListener('click', async () => { scale = Math.min(scale + 0.2, 3); await renderPage(currentPage); });
  zoomOut.addEventListener('click', async () => { scale = Math.max(scale - 0.2, 0.6); await renderPage(currentPage); });

  controls.append(prevBtn, nextBtn, zoomOut, zoomIn, pageInfo);
  content.append(controls, canvasWrap);

  const footer = document.createElement('footer');
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'Cerrar'; closeBtn.className = 'icon-btn';
  function cleanupAndClose(){
    try { loadingTask && (loadingTask.destroy?.() || loadingTask.cancel?.()); } catch {}
    try { pdfDoc && pdfDoc.destroy && pdfDoc.destroy(); } catch {}
    backdrop.remove();
  }
  closeBtn.addEventListener('click', cleanupAndClose);
  backdrop.addEventListener('click', (e)=>{ if (e.target === backdrop) cleanupAndClose(); });
  footer.appendChild(closeBtn);

  modal.append(header, content, footer);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  pageInfo.textContent = 'Cargando PDF…';
  ensurePdfLoaded()
    .then(({ base, worker }) => {
      try {
        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + worker;
        }
        loadingTask = window.pdfjsLib.getDocument(url);
        loadingTask.promise
          .then(async (pdf) => { pdfDoc = pdf; currentPage = 1; await renderPage(currentPage); })
          .catch(() => { pageInfo.textContent = 'No se pudo cargar el PDF'; });
      } catch {
        pageInfo.textContent = 'PDF.js no disponible';
      }
    })
    .catch(() => {
      pageInfo.textContent = 'No se pudo cargar PDF.js';
    });
}

export default openPdfViewer;

function ensurePdfLoaded() {
  return new Promise((resolve, reject) => {
    // Reuse previously chosen environment if available
    if (window.__PDFJS_ENV) { PDF_ENV = window.__PDFJS_ENV; return resolve(PDF_ENV); }
    if (window.pdfjsLib) { PDF_ENV = { base: '/libs/pdfjs/', worker: 'pdf.worker.js' }; window.__PDFJS_ENV = PDF_ENV; return resolve(PDF_ENV); }

    const candidates = [
      { src: '/libs/pdfjs/pdf.js', base: '/libs/pdfjs/', worker: 'pdf.worker.js' },
      { src: '/libs/pdfjs/legacy/build/pdf.js', base: '/libs/pdfjs/legacy/build/', worker: 'pdf.worker.js' },
      // Reliable CDN (UMD global): pdf.js v3 on cdnjs
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', base: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', worker: 'pdf.worker.min.js' },
    ];

    const tryNext = (i) => {
      if (i >= candidates.length) return reject();
      const { src, base, worker } = candidates[i];
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => {
        if (window.pdfjsLib) {
          PDF_ENV = { base, worker };
          window.__PDFJS_ENV = PDF_ENV;
          resolve(PDF_ENV);
        } else {
          tryNext(i + 1);
        }
      };
      s.onerror = () => tryNext(i + 1);
      document.head.appendChild(s);
    };
    tryNext(0);
  });
}
