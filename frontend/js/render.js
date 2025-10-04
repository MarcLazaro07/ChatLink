import parseMediaUrl from './parseMediaUrl.js';
function timeShort(d) {
  const dt = new Date(d);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function createLinkifiedFragment(text) {
  const frag = document.createDocumentFragment();
  const str = String(text || '');
  const urlRe = /(https?:\/\/[\w.-]+(?:\/[\w._~:\/?#[\]@!$&'()*+,;=-]*)?)/gi;
  let lastIndex = 0; let match;
  while ((match = urlRe.exec(str)) !== null) {
    const [url] = match; const index = match.index;
    if (index > lastIndex) frag.appendChild(document.createTextNode(str.slice(lastIndex, index)));
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noreferrer noopener'; a.textContent = url;
    frag.appendChild(a);
    lastIndex = index + url.length;
  }
  if (lastIndex < str.length) frag.appendChild(document.createTextNode(str.slice(lastIndex)));
  return frag;
}

function renderChatItem({ id, title, subtitle, avatarUrl, active, unread = 0, favorite = false }) {
  const div = document.createElement('div');
  div.className = 'chat-item' + (active ? ' active' : '');
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (avatarUrl && !String(avatarUrl).includes('default.png')) {
    const img = document.createElement('img');
    img.src = avatarUrl; img.loading = 'lazy'; avatar.appendChild(img);
  } else { avatar.textContent = (title || '?')[0]?.toUpperCase() || '?'; }
  const text = document.createElement('div');
  text.className = 'item-text';
  const t = document.createElement('div'); t.className = 'item-title'; t.textContent = (favorite ? '★ ' : '') + (title || '');
  const s = document.createElement('div'); s.className = 'item-sub'; s.textContent = subtitle || '';
  text.append(t, s);
  div.append(avatar, text);
  if (unread > 0) {
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = String(unread);
    div.appendChild(badge);
  }
  return div;
}

function renderPeerHeader({ name, status, avatarUrl }) {
  const avatar = document.getElementById('peerAvatar');
  avatar.innerHTML = '';
  if (avatarUrl && !String(avatarUrl).includes('default.png')) { const img = document.createElement('img'); img.src = avatarUrl; avatar.appendChild(img); } else { avatar.textContent = (name || '?')[0]?.toUpperCase() || '?'; }
  const peerName = document.getElementById('peerName'); peerName.textContent = name || '';
  const peerStatus = document.getElementById('peerStatus'); peerStatus.textContent = status || ''; peerStatus.dataset.base = status || '';
}

function renderMessage(msg, meId, opts = {}) {
  const div = document.createElement('div');
  div.className = 'message' + (String(msg.emisor) === String(meId) ? ' mine' : '');
  div.dataset.mid = msg._id;
  div.dataset.from = String(msg.emisor);
  div.dataset.ts = String(new Date(msg.fecha || msg.createdAt || Date.now()).toISOString());
  const body = document.createElement('div');

  // Sender label for group messages
  if (opts.isGroup) {
    const who = document.createElement('div'); who.className = 'sender';
    const name = typeof opts.resolveName === 'function' ? (opts.resolveName(String(msg.emisor)) || 'Usuario') : 'Usuario';
    who.textContent = name;
    div.appendChild(who);
  }

  // Reply preview
  if (msg.meta && msg.meta.replyTo && (msg.meta.replyTo.preview || msg.meta.replyTo.id)) {
    const prev = document.createElement('div'); prev.className = 'reply-preview';
    if (msg.meta.replyTo.id) prev.dataset.replyId = String(msg.meta.replyTo.id);
    prev.textContent = (msg.meta.replyTo.preview || 'Respuesta');
    div.appendChild(prev);
  }

  if (msg.tipo === 'texto') {
    const parsed = parseMediaUrl(msg.contenido || '');
    if (parsed && (parsed.kind === 'video' || parsed.kind === 'audio' || parsed.kind === 'image' || parsed.kind === 'pdf')) {
      body.appendChild(renderMediaCard(parsed));
    } else {
      body.textContent = '';
      body.appendChild(createLinkifiedFragment(msg.contenido || ''));
    }
  } else if (msg.tipo === 'imagen') {
    const img = document.createElement('img');
    img.src = msg.contenido;
    img.loading = 'lazy';
    img.dataset.viewer = 'image';
    body.appendChild(img);
  } else if (msg.tipo === 'pdf') {
    const card = document.createElement('div'); card.className = 'media-card';
    const bodyBox = document.createElement('div'); bodyBox.className = 'body';
    const title = document.createElement('div'); title.textContent = msg.meta?.nombreArchivo || 'Documento PDF';
    const btn = document.createElement('button'); btn.textContent = 'Ver'; btn.dataset.openPdf = msg.contenido;
    bodyBox.append(title, btn); card.appendChild(bodyBox); body.appendChild(card);
  } else {
    body.textContent = msg.contenido || '';
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const seen = document.createElement('span'); seen.className = 'seen'; seen.textContent = msg.vistoPor && msg.vistoPor.length ? 'Visto' : '';
  // mark edited
  if (msg.edited) {
    const edited = document.createElement('span'); edited.className = 'edited'; edited.textContent = 'editado'; meta.appendChild(edited);
  }
  meta.append(seen);
  // reactions container (optional)
  if (Array.isArray(msg.reactions) && msg.reactions.length) {
    const react = document.createElement('div'); react.className = 'reactions';
    msg.reactions.forEach(r => {
      const pill = document.createElement('span'); pill.className='react-pill'; pill.textContent = `${r.emoji} ${r.users?.length||0}`; react.appendChild(pill);
    });
    meta.appendChild(react);
  }
  div.appendChild(body);
  if (msg.fijado) { const pin = document.createElement('div'); pin.className = 'pin'; pin.textContent = '📌'; div.appendChild(pin); }
  // Actions
  const actions = document.createElement('div'); actions.className = 'msg-actions';
  const replyBtn = document.createElement('button'); replyBtn.type = 'button'; replyBtn.textContent = '↩'; replyBtn.title = 'Responder'; replyBtn.dataset.action = 'reply'; replyBtn.dataset.mid = msg._id;
  actions.appendChild(replyBtn);
  div.appendChild(actions);
  div.appendChild(meta);
  return div;
}

function renderMediaCard(parsed) {
  const card = document.createElement('div'); card.className = 'media-card';
  const thumb = document.createElement('div'); thumb.className = 'thumb'; thumb.textContent = 'Multimedia';
  const body = document.createElement('div'); body.className = 'body';
  const label = document.createElement('div'); label.textContent = `${parsed.provider || parsed.kind}`;
  const btn = document.createElement('button'); btn.textContent = 'Reproducir';
  btn.addEventListener('click', () => {
    const wrap = document.createElement('div'); wrap.className = 'media-player';
    if (parsed.embed) {
      const iframe = document.createElement('iframe');
      iframe.src = parsed.embed; iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      iframe.style.border = '0';
      wrap.appendChild(iframe);
      card.innerHTML = ''; card.appendChild(wrap);
    } else if (parsed.kind === 'audio' && parsed.src) {
      const audio = document.createElement('audio'); audio.controls = true; audio.src = parsed.src; audio.style.width = '100%';
      card.innerHTML = ''; card.appendChild(audio);
    } else if (parsed.kind === 'video' && parsed.src) {
      const video = document.createElement('video'); video.controls = true; video.src = parsed.src;
      wrap.appendChild(video);
      card.innerHTML = ''; card.appendChild(wrap);
    } else if (parsed.kind === 'image' && parsed.src) {
      const img = document.createElement('img'); img.src = parsed.src; img.loading = 'lazy'; img.style.width = '100%'; img.style.display = 'block';
      card.innerHTML = ''; card.appendChild(img);
    }
  });
  body.append(label, btn);
  card.append(thumb, body);
  return card;
}

export { renderChatItem, renderPeerHeader, renderMessage };
