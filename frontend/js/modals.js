function createModal({ title = '', content, actions = [] }) {
  const root = document.getElementById('modalRoot');
  const previouslyFocused = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.tabIndex = -1;
  const header = document.createElement('header');
  header.textContent = title;
  const body = document.createElement('div');
  body.className = 'content';
  if (content instanceof HTMLElement) body.appendChild(content); else body.innerHTML = content || '';
  const footer = document.createElement('footer');
  actions.forEach((a) => {
    const btn = document.createElement('button');
    btn.textContent = a.text || 'OK';
    btn.className = a.className || 'primary-btn';
    btn.addEventListener('click', async () => {
      if (a.onClick) await a.onClick({ close }); else close();
    });
    footer.appendChild(btn);
  });
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  function close() {
    backdrop.remove();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    document.removeEventListener('keydown', onKeyDown);
  }
  function onKeyDown(e){
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      // Focus trap
      const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusable).filter(el=>!el.hasAttribute('disabled'));
      if (!list.length) return;
      const first = list[0]; const last = list[list.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKeyDown);
  // Focus the first focusable or modal
  setTimeout(() => {
    const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusable || modal).focus();
  }, 0);
  return { close, modal, backdrop, body };
}

export { createModal };
