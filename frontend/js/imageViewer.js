function openImageViewer(src) {
  const root = document.getElementById('modalRoot');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('header');
  header.textContent = 'Imagen';
  const content = document.createElement('div');
  content.className = 'content';
  const wrap = document.createElement('div');
  wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
  wrap.style.background = '#000'; wrap.style.borderRadius = '10px'; wrap.style.overflow = 'hidden';
  const img = document.createElement('img'); img.src = src; img.style.maxWidth = '100%'; img.style.transformOrigin = 'center center';
  wrap.appendChild(img);
  content.appendChild(wrap);

  const footer = document.createElement('footer');
  const zoomOut = document.createElement('button'); zoomOut.textContent = '−'; zoomOut.className = 'icon-btn';
  const zoomIn = document.createElement('button'); zoomIn.textContent = '+'; zoomIn.className = 'icon-btn';
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'Cerrar'; closeBtn.className = 'primary-btn';
  footer.append(zoomOut, zoomIn, closeBtn);

  let scale = 1;
  function apply() { img.style.transform = `scale(${scale})`; }
  zoomIn.addEventListener('click', () => { scale = Math.min(scale + 0.2, 4); apply(); });
  zoomOut.addEventListener('click', () => { scale = Math.max(scale - 0.2, 0.5); apply(); });
  closeBtn.addEventListener('click', () => backdrop.remove());

  modal.append(header, content, footer);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
}

export default openImageViewer;
