import API from './api.js';
import State from './state.js';
import { connect, registerHandlers, joinGroup, emitTyping } from './socketClient.js';
import { renderChatItem, renderPeerHeader, renderMessage } from './render.js';
import { createModal } from './modals.js';
import openPdfViewer from './pdfViewer.js';
import openImageViewer from './imageViewer.js';

// Responsive helpers
const mqlMobile = window.matchMedia('(max-width: 980px)');
function isMobile() { return mqlMobile.matches; }

// Emoji panel
let emojiPanelEl = null;
const EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','😘','😗','😙','😚','😋','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','👍','👎','👏','🙌','🙏','🔥','🎉','💯','❤️','💔','✨','⭐'];
function showEmojiPanel(anchor){
  hideEmojiPanel();
  emojiPanelEl = document.createElement('div'); emojiPanelEl.className='ctx-menu emoji-menu';
  const list = document.createElement('div'); list.className='ctx-list'; list.style.display='grid'; list.style.gridTemplateColumns='repeat(8, 1fr)'; list.style.gap='4px';
  EMOJIS.forEach(e => { const b=document.createElement('button'); b.className='ctx-item'; b.textContent=e; b.style.textAlign='center'; b.addEventListener('click', (ev)=>{ ev.stopPropagation(); insertAtCursor(document.getElementById('messageInput'), e); }); list.appendChild(b); });
  emojiPanelEl.appendChild(list);
  document.body.appendChild(emojiPanelEl);
  const rect = anchor.getBoundingClientRect();
  const panRect = emojiPanelEl.getBoundingClientRect();
  let left = rect.left; let top = rect.bottom + 8;
  if (left + panRect.width > window.innerWidth) left = window.innerWidth - panRect.width - 8;
  if (top + panRect.height > window.innerHeight) top = rect.top - panRect.height - 8;
  emojiPanelEl.style.left = `${Math.max(8,left)}px`;
  emojiPanelEl.style.top = `${Math.max(8,top)}px`;
}
function hideEmojiPanel(){ if (emojiPanelEl) { emojiPanelEl.remove(); emojiPanelEl = null; } }
function insertAtCursor(input, text){ if (!input) return; const [start, end] = [input.selectionStart||input.value.length, input.selectionEnd||input.value.length]; input.value = input.value.slice(0,start) + text + input.value.slice(end); const pos = start + text.length; input.setSelectionRange(pos, pos); input.focus(); }

function appendWithDate(list, el, date){
  const key = new Date(date||Date.now()).toDateString();
  const last = list.lastElementChild;
  const lastKey = last && (last.classList.contains('date-sep') ? last.dataset.dateKey : last.previousElementSibling?.dataset?.dateKey);
  if (lastKey !== key) {
    const sep = document.createElement('div'); sep.className='date-sep'; sep.textContent=new Date(date||Date.now()).toLocaleDateString(); sep.dataset.dateKey=key; list.appendChild(sep);
  }
  list.appendChild(el);
  // Basic pruning for virtualization
  const MAX_NODES = 400;
  const TARGET_NODES = 300;
  if (list.childElementCount > MAX_NODES){
    while (list.childElementCount > TARGET_NODES){ list.removeChild(list.firstElementChild); }
  }
}

// Context menu helpers
let ctxMenuEl = null;
function showContextMenu(x, y, msgEl){
  hideContextMenu();
  ctxMenuEl = document.createElement('div');
  ctxMenuEl.className = 'ctx-menu';
  const list = document.createElement('div'); list.className='ctx-list';
  // Timestamp item
  const ts = new Date(msgEl.dataset.ts || Date.now());
  const tsItem = document.createElement('div'); tsItem.className = 'ctx-item ctx-muted'; tsItem.textContent = ts.toLocaleString();
  list.appendChild(tsItem);
  const btnCopy = document.createElement('button'); btnCopy.textContent='Copiar'; btnCopy.className='ctx-item';
  btnCopy.addEventListener('click', async ()=>{
    try{
      const urlPdf = msgEl.querySelector('[data-open-pdf]')?.dataset.openPdf;
      const img = msgEl.querySelector('img');
      const text = msgEl.querySelector('div:not(.reply-preview):not(.sender)')?.textContent?.trim();
      const val = urlPdf || (img?.src) || text || '';
      if (val) await navigator.clipboard.writeText(val);
    }finally{ hideContextMenu(); }
  });
  list.appendChild(btnCopy);
  // Permissions
  const isMine = msgEl.classList.contains('mine');
  const canDelete = isMine || (currentIsGroup && currentIsAdmin);
  const canEdit = isMine; // admin cannot edit others

  // Delete
  if (canDelete){
    const btnDel = document.createElement('button'); btnDel.textContent='Eliminar'; btnDel.className='ctx-item';
    btnDel.addEventListener('click', async ()=>{
      try{ await API.deleteMessage(msgEl.dataset.mid); msgEl.remove(); }
      catch{ /* ignore */ }
      finally{ hideContextMenu(); }
    });
    list.appendChild(btnDel);
  }
  // React emojis
  const emojis = ['👍','❤️','😂','😮','😢','🔥','👏','🎉','🙏','😡','🤔','😍'];
  const reactRow = document.createElement('div'); reactRow.className='ctx-item';
  emojis.forEach(e => { const b=document.createElement('button'); b.className='icon-btn'; b.style.border='none'; b.style.background='transparent'; b.textContent=e; b.addEventListener('click', async (ev)=>{ ev.stopPropagation(); try{ await API.reactMessage(msgEl.dataset.mid, e);} finally{ hideContextMenu(); } }); reactRow.appendChild(b); });
  list.appendChild(reactRow);
  // Edit own text message
  if (canEdit) {
    const looksText = !msgEl.querySelector('img,[data-open-pdf],.media-card');
    if (looksText) {
      const btnEdit = document.createElement('button'); btnEdit.textContent='Editar'; btnEdit.className='ctx-item';
      btnEdit.addEventListener('click', async ()=>{
        const curText = msgEl.querySelector('div:not(.reply-preview):not(.sender):not(.meta):not(.pin):not(.msg-actions)')?.textContent||'';
        const wrap = document.createElement('div'); const ta=document.createElement('textarea'); ta.style.width='100%'; ta.style.minHeight='90px'; ta.value=curText; wrap.appendChild(ta);
        createModal({ title:'Editar mensaje', content: wrap, actions:[
          { text:'Cancelar', className:'icon-btn' },
          { text:'Guardar', className:'primary-btn', onClick: async ({ close }) => { try{ const res = await API.editMessage(msgEl.dataset.mid, ta.value); const body = msgEl.querySelector('div:not(.reply-preview):not(.sender):not(.meta):not(.pin):not(.msg-actions)'); if (body){ body.textContent=res.contenido; } let meta = msgEl.querySelector('.meta'); if (meta && !meta.querySelector('.edited')){ const e=document.createElement('span'); e.className='edited'; e.textContent='editado'; meta.appendChild(e);} close(); } catch{} } }
        ]});
        hideContextMenu();
      });
      list.appendChild(btnEdit);
    }
  }
  ctxMenuEl.appendChild(list);
  document.body.appendChild(ctxMenuEl);
  const rect = ctxMenuEl.getBoundingClientRect();
  ctxMenuEl.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
  ctxMenuEl.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
  setTimeout(()=>{
    document.addEventListener('click', onGlobalDismiss, { once: true });
    document.addEventListener('keydown', onEscDismiss, { once: true });
  }, 0);
}
function hideContextMenu(){ if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; } }
function onGlobalDismiss(){ hideContextMenu(); }
function onEscDismiss(e){ if (e.key==='Escape') hideContextMenu(); }
function openSidebar(){
  document.body.classList.add('sidebar-open');
  const ov = document.getElementById('appOverlay'); if (ov) ov.classList.remove('hidden');
}
function closeSidebar(){
  document.body.classList.remove('sidebar-open');
  const ov = document.getElementById('appOverlay'); if (ov) ov.classList.add('hidden');
  // also close menu panel if open
  const panel = document.getElementById('menuPanel'); if (panel) panel.classList.add('hidden');
}
mqlMobile.addEventListener?.('change', (e)=>{ if (!e.matches) closeSidebar(); });

const chatPages = new Map(); // key -> { page, limit, total, loading }
let replyTarget = null; // { id, preview }
let currentIsGroup = false;
let currentIsAdmin = false;
let currentGroupNameResolver = null; // (userId)=>name
let pendingMentions = new Set();

function keyOf(sel){ return sel?.type === 'group' ? `g:${sel.id}` : sel?.type === 'direct' ? `d:${sel.id}` : null; }

async function boot(){
  // Appearance
  State.applyAppearance();

  const token = localStorage.getItem('token');
  if (token) {
    State.setToken(token); API.setToken(token);
    try {
      const me = await fetchMe();
      State.setMe(me);
      // Apply appearance from server (new fields)
      if (me.mode) State.setMode(me.mode);
      if (me.palette) State.setPalette(me.palette);
      setupUI();
      setupSockets();
      await loadChats();
    } catch (e) {
      showAuth();
    }
  } else {
    showAuth();
  }
}

function setupUI(){
  const menuBtn = document.getElementById('menuBtn');
  const panel = document.getElementById('menuPanel');
  menuBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.body.addEventListener('click', (e)=>{ if(!panel.contains(e.target) && e.target!==menuBtn){ panel.classList.add('hidden'); }});

  // Sidebar toggle (mobile)
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  const overlay = document.getElementById('appOverlay');
  if (toggleBtn) toggleBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openSidebar(); });
  if (overlay) overlay.addEventListener('click', ()=> closeSidebar());

  panel.querySelector('[data-action="add-contact"]').addEventListener('click', onAddContact);
  panel.querySelector('[data-action="create-group"]').addEventListener('click', onCreateGroup);
  panel.querySelector('[data-action="profile"]').addEventListener('click', onProfile);
  panel.querySelector('[data-action="settings"]').addEventListener('click', onSettings);
  panel.querySelector('[data-action="logout"]').addEventListener('click', onLogout);

  const messageInput = document.getElementById('messageInput');
  const messageList = document.getElementById('messageList');
  messageInput.addEventListener('input', () => {
    const cur = State.getCurrent(); if (!cur) return;
    emitTyping(cur.id, cur.type === 'group');
    const key = keyOf(cur); State.setDraft(key, messageInput.value);
  });

  // Context menu (right click) for messages
  messageList.addEventListener('contextmenu', (e) => {
    const msgEl = e.target.closest('.message');
    if (!msgEl) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, msgEl);
  });
  // Click reply preview to jump
  messageList.addEventListener('click', (e) => {
    const prev = e.target.closest('.reply-preview');
    if (prev && prev.dataset.replyId) {
      const target = document.querySelector(`[data-mid="${prev.dataset.replyId}"]`);
      if (target) { target.classList.add('hl'); target.scrollIntoView({ behavior:'smooth', block:'center' }); setTimeout(()=>target.classList.remove('hl'), 1400); }
    }
  });
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('attachBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', onAttachFile);
  document.getElementById('emojiBtn').addEventListener('click', (ev) => {
    ev.stopPropagation();
    showEmojiPanel(ev.currentTarget);
  });
  document.body.addEventListener('click', () => hideEmojiPanel());

  // Mentions autocomplete
  const me = State.getMe();
  let mentionMenuEl = null; let mentionActiveIndex = -1;
  function buildMentionCandidates(){
    const sel = State.getCurrent(); if (!sel) return [];
    if (sel.type==='group') return (sel.peer.miembros||[]).map(u=>({ id:String(u._id||u.id||u), username:u.username, nombre:u.nombre }));
    const friends = me.amigos||[]; return friends.map(u=>({ id:String(u._id||u.id||u), username:u.username, nombre:u.nombre }));
  }
  function showMentionMenu(anchorRect, items){
    hideMentionMenu(); mentionActiveIndex = 0;
    mentionMenuEl = document.createElement('div'); mentionMenuEl.className='mention-menu';
    const list = document.createElement('div'); list.className='mention-list';
    items.forEach((it, i)=>{ const el=document.createElement('div'); el.className='mention-item'+(i===0?' active':''); el.dataset.uid=it.id; el.dataset.username = it.username||''; el.textContent = `${it.nombre||it.username||'Usuario'} (@${it.username||''})`; el.addEventListener('click',()=>applyMention(it)); list.appendChild(el); });
    mentionMenuEl.appendChild(list); document.body.appendChild(mentionMenuEl);
    const top = anchorRect.bottom + 8; const left = Math.max(8, Math.min(window.innerWidth-240, anchorRect.left));
    mentionMenuEl.style.top = `${top}px`; mentionMenuEl.style.left = `${left}px`;
  }
  function hideMentionMenu(){ if (mentionMenuEl){ mentionMenuEl.remove(); mentionMenuEl = null; mentionActiveIndex = -1; } }
  function applyMention(user){
    const input = document.getElementById('messageInput'); if (!input) return;
    const val = input.value; const caret = input.selectionStart||val.length; const left = val.slice(0, caret); const right = val.slice(caret);
    const m = left.match(/@([\w._-]{0,32})$/); if (!m) return hideMentionMenu();
    const atStart = left.slice(0, m.index);
    const insert = `@${user.username||user.nombre||'usuario'} `;
    input.value = atStart + insert + right; const pos = (atStart+insert).length; input.setSelectionRange(pos, pos); input.focus();
    pendingMentions.add(String(user.id)); hideMentionMenu();
  }
  function handleMentionInput(){
    const input = document.getElementById('messageInput'); const val = input.value; const caret = input.selectionStart||val.length; const left = val.slice(0, caret);
    const m = left.match(/@([\w._-]{0,32})$/); if (!m) { hideMentionMenu(); return; }
    const q = (m[1]||'').toLowerCase(); const items = buildMentionCandidates().filter(u=> (u.username||'').toLowerCase().startsWith(q) || (u.nombre||'').toLowerCase().startsWith(q) ).slice(0,8);
    if (items.length===0) { hideMentionMenu(); return; }
    const rect = input.getBoundingClientRect(); showMentionMenu(rect, items);
  }
  messageInput.addEventListener('keyup', (e)=>{ if (e.key.length===1 || e.key==='Backspace' || e.key==='Delete') handleMentionInput(); if (mentionMenuEl && (e.key==='ArrowDown' || e.key==='ArrowUp' || e.key==='Enter')){ e.preventDefault(); const items=[...mentionMenuEl.querySelectorAll('.mention-item')]; if (e.key==='ArrowDown') mentionActiveIndex = Math.min(items.length-1, mentionActiveIndex+1); if (e.key==='ArrowUp') mentionActiveIndex = Math.max(0, mentionActiveIndex-1); items.forEach((el,i)=>el.classList.toggle('active', i===mentionActiveIndex)); if (e.key==='Enter') { const el=items[mentionActiveIndex]; if (el) applyMention({ id: el.dataset.uid, username: el.dataset.username }); } } });
  messageInput.addEventListener('blur', ()=> setTimeout(hideMentionMenu, 100));

  // Conversation search and favorites
  const searchChatBtn = document.getElementById('searchChatBtn');
  if (searchChatBtn) searchChatBtn.addEventListener('click', onSearchInConversation);
  const favoriteChatBtn = document.getElementById('favoriteChatBtn');
  if (favoriteChatBtn) favoriteChatBtn.addEventListener('click', onToggleFavorite);

  // Leave group
  document.getElementById('leaveGroupBtn').addEventListener('click', async () => {
    const cur = State.getCurrent(); if (!cur || cur.type !== 'group') return;
    const { close } = createModal({ title: 'Salir del grupo', content: '¿Deseas salir de este grupo?', actions:[
      { text: 'Cancelar', className: 'icon-btn' },
      { text: 'Salir', className: 'primary-btn', onClick: async ({ close }) => {
        try { await API.leaveGroup(cur.id); close(); State.setCurrent(null); await loadChats(); document.getElementById('messageList').innerHTML=''; renderPeerHeader({ name: 'Selecciona un chat', status: '—' }); }
        catch(e){ console.error(e); }
      } }
    ]});
  });

  // Pinned messages view
  document.getElementById('pinToggle').addEventListener('click', () => {
    const list = document.getElementById('messageList');
    const pinned = [...list.querySelectorAll('.message .pin')].map(pin => pin.parentElement);
    const wrap = document.createElement('div');
    if (!pinned.length) { wrap.textContent = 'No hay mensajes fijados en este chat.'; }
    else {
      wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.gap = '8px';
      pinned.forEach(msgEl => {
        const clone = msgEl.cloneNode(true);
        clone.querySelectorAll('button,input').forEach(b=>b.disabled=true);
        wrap.appendChild(clone);
      });
    }
    createModal({ title: 'Mensajes fijados', content: wrap, actions: [{ text: 'Cerrar', className: 'icon-btn' }] });
  });

  messageList.addEventListener('scroll', async () => {
    hideContextMenu(); hideEmojiPanel();
    if (messageList.scrollTop < 80) {
      await loadMoreMessages();
    }
  });

  messageList.addEventListener('dblclick', async (e) => {
    const msgEl = e.target.closest('.message');
    if (!msgEl) return;
    const id = msgEl.dataset.mid;
    const pinned = !!msgEl.querySelector('.pin');
    try { await API.pinMessage(id, !pinned); } catch {}
  });

  messageList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-pdf]');
    if (btn) { openPdfViewer({ url: btn.dataset.openPdf }); return; }
    const img = e.target.closest('img[data-viewer="image"]');
    if (img) { openImageViewer(img.src); return; }
    const act = e.target.closest('.msg-actions button');
    if (act && act.dataset.action === 'reply') {
      const msgEl = act.closest('.message');
      if (!msgEl) return;
      const textEl = msgEl.querySelector('div');
      const preview = (textEl && textEl.textContent) ? textEl.textContent.slice(0, 140) : 'Mensaje';
      replyTarget = { id: msgEl.dataset.mid, preview };
      showReplyBar(preview);
    }
  });

  const searchInput = document.getElementById('searchInput');
  // Debounced search
  const debounce = (fn, wait=250) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); }; };
  const doFilter = debounce(() => filterChatList(searchInput.value), 300);
  searchInput.addEventListener('input', doFilter);
}

function setupSockets(){
  connect();
  registerHandlers({
    onMessage: handleIncoming,
    onSeen: ({ id }) => {
      const el = document.querySelector(`[data-mid="${id}"] .meta .seen`);
      if (el) el.textContent = 'Visto';
    },
    onPin: ({ id, fijado }) => {
      const msgEl = document.querySelector(`[data-mid="${id}"]`);
      if (msgEl) {
        let pin = msgEl.querySelector('.pin');
        if (fijado) { if (!pin) { pin = document.createElement('div'); pin.className='pin'; pin.textContent='📌'; msgEl.appendChild(pin); } }
        else { if (pin) pin.remove(); }
      }
    },
    onDeleted: ({ id }) => {
      const el = document.querySelector(`[data-mid="${id}"]`);
      if (el) el.remove();
    },
    onEdited: ({ id, contenido, edited }) => {
      const el = document.querySelector(`[data-mid="${id}"]`);
      if (el) {
        const body = el.querySelector('div:not(.reply-preview):not(.sender):not(.meta):not(.pin):not(.msg-actions)');
        if (body) { body.textContent = contenido; }
        if (edited) {
          const meta = el.querySelector('.meta'); if (meta && !meta.querySelector('.edited')) { const e = document.createElement('span'); e.className='edited'; e.textContent='editado'; meta.appendChild(e); }
        }
      }
    },
    onReact: ({ id, emoji, users }) => {
      const el = document.querySelector(`[data-mid="${id}"]`);
      if (!el) return;
      let meta = el.querySelector('.meta'); if (!meta) return;
      let wrap = meta.querySelector('.reactions'); if (!wrap){ wrap = document.createElement('div'); wrap.className='reactions'; meta.appendChild(wrap); }
      let pill = [...wrap.children].find(x=>x.textContent.startsWith(emoji));
      const count = users?.length||0;
      if (count===0) { if (pill) pill.remove(); return; }
      if (!pill) { pill = document.createElement('span'); pill.className='react-pill'; wrap.appendChild(pill); }
      pill.textContent = `${emoji} ${count}`;
    },
    onGroupDeleted: ({ id }) => {
      const cur = State.getCurrent();
      if (cur && cur.type==='group' && String(cur.id)===String(id)){
        State.setCurrent(null);
        const list = document.getElementById('messageList'); if (list) list.innerHTML='';
        renderPeerHeader({ name: 'Selecciona un chat', status: '—' });
        createModal({ title:'Grupo eliminado', content:'Este grupo fue eliminado por un administrador.', actions:[{ text:'Cerrar', className:'primary-btn' }] });
        loadChats();
      }
    },
    onTyping: ({ from, isGroup }) => {
      const cur = State.getCurrent(); if (!cur) return;
      const key = isGroup ? `g-${cur.id}` : `d-${from}`;
      const status = document.getElementById('peerStatus');
      State.setTyping(key, (val)=>{ status.textContent = val ? 'Escribiendo…' : (status.dataset.base || ''); });
    },
    onPresence: ({ userId, online }) => {
      const cur = State.getCurrent();
      const status = document.getElementById('peerStatus');
      if (cur && cur.type==='direct' && String(cur.id)===String(userId)){
        status.textContent = online ? 'En línea' : 'Desconectado';
        status.dataset.base = status.textContent;
      }
    },
    onFriendRequest: async (_payload) => {
      try { const me = await fetchMe(); State.setMe(me); await loadChats(); } catch {}
    },
    onFriendAccepted: async (_payload) => {
      try { const me = await fetchMe(); State.setMe(me); await loadChats(); } catch {}
    }
  });
}

async function fetchMe(){
  const res = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${State.getToken()}` } });
  if (!res.ok) throw new Error('Auth');
  return res.json();
}

async function loadChats(){
  const data = await API.getChats();
  State.setChats(data);
  renderChatList();
}

function renderChatList(){
  const list = document.getElementById('chatList');
  list.innerHTML = '';
  const me = State.getMe();
  const { directs, groups } = State.getChats();
  const unread = State.getAllUnread();
  const favs = new Set(State.getFavorites());

  if ((!directs || directs.length===0) && (!groups || groups.length===0)) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No hay chats aún. Usa el menú para agregar contactos o crear un grupo.';
    list.appendChild(empty);
    return;
  }
  const directItems = directs.map(d => ({
    el: null,
    sortFav: favs.has(`d:${String(d.user._id || d.user?.id)}`) ? 0 : 1,
    renderArgs: {
      id: d.user._id || d.user?.id,
      title: d.user?.nombre || d.user?.username,
      subtitle: d.lastMessage?.contenido || '',
      avatarUrl: d.user?.fotoPerfil,
      unread: unread[`d:${String(d.user._id || d.user?.id)}`] || 0,
      favorite: favs.has(`d:${String(d.user._id || d.user?.id)}`)
    },
    onClick: () => selectChat({ type:'direct', id: String(d.user._id || d.user?.id), peer: d.user })
  }));
  const groupItems = groups.map(g => ({
    el: null,
    sortFav: favs.has(`g:${String(g._id)}`) ? 0 : 1,
    renderArgs: {
      id: g._id,
      title: g.nombre,
      subtitle: 'Grupo',
      avatarUrl: g.imagen,
      unread: unread[`g:${String(g._id)}`] || 0,
      favorite: favs.has(`g:${String(g._id)}`)
    },
    onClick: () => selectChat({ type:'group', id: String(g._id), peer: g })
  }));
  [...directItems, ...groupItems]
    .sort((a,b) => a.sortFav - b.sortFav)
    .forEach(item => {
      const el = renderChatItem(item.renderArgs);
      el.dataset.type = item.renderArgs.subtitle==='Grupo' ? 'group' : 'direct';
      el.dataset.id = String(item.renderArgs.id);
      el.addEventListener('click', item.onClick);
      // Popover in direct chats on avatar click
      const av = el.querySelector('.avatar');
      if (av && el.dataset.type==='direct'){
        av.addEventListener('click', async (e)=>{ e.stopPropagation(); showUserPopover(String(item.renderArgs.id), av); });
      }
      list.appendChild(el);
    });
}

async function showUserPopover(userId, anchorEl){
  try{
    const user = await API.getUser(userId);
    const pop = document.createElement('div'); pop.className='popover';
    const head = document.createElement('header');
    const av = document.createElement('div'); av.className='avatar'; av.textContent=(user.nombre||user.username||'?')[0]?.toUpperCase()||'?'; if (user.fotoPerfil){ const img=document.createElement('img'); img.src=user.fotoPerfil; av.innerHTML=''; av.appendChild(img); }
    const title = document.createElement('div'); title.textContent = user.nombre||user.username||'Usuario';
    head.append(av, title);
    const content = document.createElement('div'); content.className='content';
    const st = document.createElement('div'); st.textContent = `Estado: ${user.estado||'—'}`;
    const desc = document.createElement('div'); desc.textContent = `Descripción: ${user.descripcion||'—'}`;
    content.append(st, desc);
    pop.append(head, content);
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
    let left = rect.left; let top = rect.bottom + 10; if (left+pr.width>window.innerWidth) left = window.innerWidth - pr.width - 8; if (top+pr.height>window.innerHeight) top = rect.top - pr.height - 10;
    pop.style.left = `${Math.max(8,left)}px`; pop.style.top = `${Math.max(8,top)}px`;
    const close = ()=>{ pop.remove(); document.removeEventListener('click', onDoc); };
    const onDoc=(e)=>{ if (!pop.contains(e.target)) close(); };
    setTimeout(()=> document.addEventListener('click', onDoc, { once:true }), 0);
  }catch{}
}

async function selectChat(sel){
  State.setCurrent(sel);
  [...document.querySelectorAll('.chat-item')].forEach(el => el.classList.toggle('active', el.dataset.id===sel.id));
  if (sel.type==='group') joinGroup(sel.id);
  // Prepare resolver for group messages
  currentIsGroup = sel.type === 'group';
  if (currentIsGroup) {
    const map = new Map();
    (sel.peer.miembros||[]).forEach(m => { const uid = String(m._id||m.id||m); const name = m.nombre||m.username||'Usuario'; map.set(uid, name); });
    currentGroupNameResolver = (uid)=> map.get(String(uid)) || 'Usuario';
    currentIsAdmin = Array.isArray(sel.peer.admins) && sel.peer.admins.some(id => String(id) === String(State.getMe()?.id));
  } else { currentGroupNameResolver = null; }
  const name = sel.type==='group' ? sel.peer.nombre : (sel.peer?.nombre || sel.peer?.username || '');
  renderPeerHeader({ name, status: sel.type==='group' ? `${sel.peer.miembros?.length||''} miembros` : '—', avatarUrl: sel.type==='group' ? sel.peer.imagen : sel.peer?.fotoPerfil });

  // Toggle group edit visibility if admin
  const editBtn = document.getElementById('editGroupBtn');
  if (sel.type === 'group' && Array.isArray(sel.peer.admins) && sel.peer.admins.some(id => String(id) === String(State.getMe()?.id))) {
    editBtn.classList.remove('hidden');
    editBtn.onclick = () => onEditGroup(sel);
  } else {
    editBtn.classList.add('hidden');
    editBtn.onclick = null;
  }
  const leaveBtn = document.getElementById('leaveGroupBtn');
  if (sel.type === 'group') { leaveBtn.classList.remove('hidden'); } else { leaveBtn.classList.add('hidden'); }

  const key = keyOf(sel); chatPages.set(key, { page: 1, limit: 30, total: 0, loading: false });
  const list = document.getElementById('messageList'); list.innerHTML = '';
  await loadMessages();
  // Close sidebar on mobile after selecting a chat
  if (isMobile()) closeSidebar();
  // Clear unread and set draft
  State.clearUnread(key);
  renderChatList();
  const messageInput = document.getElementById('messageInput');
  messageInput.value = State.getDraft(key) || '';
  hideReplyBar(); replyTarget = null;
  const favBtn = document.getElementById('favoriteChatBtn');
  if (favBtn) favBtn.textContent = State.isFavorite(key) ? '★' : '☆';
}

async function loadMessages(){
  const sel = State.getCurrent(); if (!sel) return;
  const key = keyOf(sel); const pg = chatPages.get(key); if (!pg || pg.loading) return;
  pg.loading = true; chatPages.set(key, pg);
  const { total, limit, messages } = await API.getMessages(sel.id, sel.type==='group', pg.page, pg.limit);
  pg.total = total; pg.limit = limit; chatPages.set(key, pg);
  const list = document.getElementById('messageList');
  const meId = State.getMe()?.id;
  const frag = document.createDocumentFragment();
  let lastKey = null;
  messages.slice().reverse().forEach(m => {
    const el = renderMessage(m, meId, { isGroup: currentIsGroup, resolveName: currentGroupNameResolver });
    const key = new Date(m.fecha||m.createdAt||Date.now()).toDateString();
    if (lastKey !== key) {
      const sep = document.createElement('div'); sep.className='date-sep'; sep.textContent = new Date(m.fecha||m.createdAt).toLocaleDateString(); sep.dataset.dateKey = key; frag.appendChild(sep); lastKey = key;
    }
    frag.appendChild(el);
  });
  list.appendChild(frag);
  list.scrollTop = list.scrollHeight;
  // mark seen for received
  for (const m of messages) {
    if (String(m.emisor)!==String(meId)) { try { await API.seenMessage(m._id); } catch {} }
  }
}

async function loadMoreMessages(){
  const sel = State.getCurrent(); if (!sel) return;
  const key = keyOf(sel); const pg = chatPages.get(key); if (!pg) return;
  const list = document.getElementById('messageList');
  if (pg.page * pg.limit >= pg.total) return; // all loaded
  if (pg.loading) return;
  const prevHeight = list.scrollHeight; pg.page += 1; chatPages.set(key, pg);
  const { messages } = await API.getMessages(sel.id, sel.type==='group', pg.page, pg.limit);
  const meId = State.getMe()?.id;
  const frag = document.createDocumentFragment();
  let lastKey = list.firstElementChild?.dataset?.dateKey || (list.firstElementChild?.previousElementSibling?.dataset?.dateKey) || null;
  messages.slice().reverse().forEach(m => {
    const el = renderMessage(m, meId, { isGroup: currentIsGroup, resolveName: currentGroupNameResolver });
    const key = new Date(m.fecha||m.createdAt||Date.now()).toDateString();
    if (lastKey !== key) { const sep = document.createElement('div'); sep.className='date-sep'; sep.textContent=new Date(m.fecha||m.createdAt).toLocaleDateString(); sep.dataset.dateKey=key; frag.appendChild(sep); lastKey = key; }
    frag.appendChild(el);
  });
  list.insertBefore(frag, list.firstChild);
  // keep scroll position
  list.scrollTop = list.scrollHeight - prevHeight;
}

async function sendMessage(){
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  const sel = State.getCurrent(); if (!sel) return;
  if (!text) return;
  try{
    const meta = replyTarget ? { replyTo: { id: replyTarget.id, preview: replyTarget.preview } } : {};
    if (pendingMentions.size){ meta.mentions = Array.from(pendingMentions); }
    await API.sendMessage({ receptor: sel.id, esGrupo: sel.type==='group', tipo: 'texto', contenido: text, meta });
    // do not append here; wait for socket 'message:new' to avoid duplicates
    input.value = '';
    State.setDraft(keyOf(sel), '');
    hideReplyBar(); replyTarget = null;
    pendingMentions.clear();
  }catch(e){ console.error(e); }
}

async function onAttachFile(e){
  const file = e.target.files?.[0]; if (!file) return; e.target.value='';
  const sel = State.getCurrent(); if (!sel) return;
  try{
    const up = await API.upload(file, file.type.startsWith('image/') ? 'file' : (file.type==='application/pdf'?'file':'file'));
    let tipo = 'archivo'; let meta = { nombreArchivo: file.name, tam: file.size };
    if (file.type.startsWith('image/')) tipo = 'imagen';
    if (file.type === 'application/pdf') tipo = 'pdf';
    await API.sendMessage({ receptor: sel.id, esGrupo: sel.type==='group', tipo, contenido: up.url, meta });
    // no append; wait for socket message:new
  }catch(err){ console.error(err); }
}

function filterChatList(q){
  const norm = (q||'').toLowerCase();
  document.querySelectorAll('.chat-item').forEach(item => {
    const title = item.querySelector('.item-title')?.textContent.toLowerCase()||'';
    const sub = item.querySelector('.item-sub')?.textContent.toLowerCase()||'';
    item.style.display = (title.includes(norm) || sub.includes(norm)) ? '' : 'none';
  });
}

// Menu actions
function onLogout(){
  State.setToken(null); API.setToken(null); location.reload();
}

function onSettings(){
  const me = State.getMe();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>Modo</label>
      <select id="modeSelect">
        <option value="claro">Claro</option>
        <option value="oscuro">Oscuro</option>
      </select>
    </div>
    <div class="field"><label>Paleta</label>
      <select id="paletteSelect">
        <option value="azul">Azul</option>
        <option value="verde">Verde</option>
        <option value="naranja">Naranja</option>
        <option value="morado">Morado</option>
      </select>
    </div>
    <hr style="border:none; border-top:1px solid var(--border); margin:12px 0;" />
    <div class="field"><label>Cuenta</label>
      <button id="btnDeleteAccount" class="icon-btn danger">Eliminar cuenta</button>
    </div>
  `;
  const selMode = wrap.querySelector('#modeSelect'); selMode.value = me.mode || State.getMode();
  const selPal = wrap.querySelector('#paletteSelect'); selPal.value = me.palette || State.getPalette();

  wrap.querySelector('#btnDeleteAccount').addEventListener('click', () => {
    const { close } = createModal({ title:'Eliminar cuenta', content: '¿Seguro que deseas eliminar tu cuenta? Esta acción es permanente. Tus mensajes directos serán eliminados y en los grupos se mostrará "Usuario".', actions:[
      { text:'Cancelar', className:'icon-btn' },
      { text:'Eliminar', className:'primary-btn', onClick: async ({ close }) => { try { await API.deleteAccount(); close(); State.setToken(null); API.setToken(null); location.reload(); } catch(e){ alert('No se pudo eliminar la cuenta'); } } }
    ]});
  });

  createModal({ title:'Configuraciones', content: wrap, actions:[
    { text:'Cancelar', className:'icon-btn' },
    { text:'Guardar', className:'primary-btn', onClick: async ({ close }) => {
      const mode = selMode.value;
      const palette = selPal.value;
      State.setMode(mode); State.setPalette(palette);
      try { await API.updateUser(me.id, { mode, palette }); } catch {}
      close();
    } }
  ]});
}

function onProfile(){
  const me = State.getMe();
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row" style="gap:16px; align-items:center; margin-bottom:12px;">
      <div class="avatar" id="profAvatar">${(me.nombre||'?')[0]}</div>
      <input type="file" id="avatarFile" />
    </div>
    <div class="field"><label>Nombre</label><input id="profName" type="text" value="${me.nombre||''}"></div>
    <div class="field"><label>Estado</label><input id="profStatus" type="text" value="${me.estado||''}"></div>
    <div class="field"><label>Descripción</label><input id="profDesc" type="text" value="${me.descripcion||''}"></div>
  `;
  const avatarEl = wrap.querySelector('#profAvatar'); if (me.fotoPerfil){ const img = document.createElement('img'); img.src = me.fotoPerfil; avatarEl.innerHTML=''; avatarEl.appendChild(img);} 
  createModal({ title:'Perfil', content: wrap, actions:[
    { text:'Cerrar', className:'icon-btn' },
    { text:'Guardar', className:'primary-btn', onClick: async ({ close }) => {
      const name = wrap.querySelector('#profName').value.trim();
      const st = wrap.querySelector('#profStatus').value.trim();
      const desc = wrap.querySelector('#profDesc').value.trim();
      try {
        let updates = { nombre: name, estado: st };
        const file = wrap.querySelector('#avatarFile').files?.[0];
        if (file) { const up = await API.upload(file, 'avatar'); updates.fotoPerfil = up.url; }
        if (typeof desc === 'string') updates.descripcion = desc;
        const user = await API.updateUser(me.id, updates); State.setMe(user);
      } catch {}
      close();
      loadChats();
    } }
  ]});
}

function onAddContact(){
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>Buscar usuario</label><input id="qUser" type="text" placeholder="username"></div>
    <div id="results"></div>
    <hr style="border:none; border-top:1px solid var(--border); margin:12px 0;" />
    <div class="field"><label>Solicitudes recibidas</label></div>
    <div id="incoming"></div>
  `;
  const resEl = wrap.querySelector('#results');
  const inEl = wrap.querySelector('#incoming');
  const input = wrap.querySelector('#qUser');
  input.addEventListener('input', async () => {
    const q = input.value.trim(); if (!q) { resEl.innerHTML=''; return; }
    const users = await API.searchUsers(q);
    resEl.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
      row.innerHTML = `<div>${u.nombre||u.username}</div>`;
      const btn = document.createElement('button'); btn.textContent = 'Agregar'; btn.className='primary-btn';
      btn.addEventListener('click', async ()=>{ try { await API.sendFriendRequest(u._id || u.id); btn.textContent='Enviado'; btn.disabled=true; } catch{} });
      row.appendChild(btn);
      resEl.appendChild(row);
    });
  });
  // Load incoming requests
  (async () => {
    try{
      const me = await fetchMe();
      const reqs = me.solicitudes || [];
      inEl.innerHTML = '';
      if (!reqs.length) { inEl.textContent = 'No tienes solicitudes nuevas.'; return; }
      reqs.forEach(r => {
        const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
        row.innerHTML = `<div>${r.nombre||r.username}</div>`;
        const btn = document.createElement('button'); btn.textContent='Aceptar'; btn.className='primary-btn';
        btn.addEventListener('click', async () => {
          try { await API.acceptFriend(r._id || r.id); btn.textContent='Aceptado'; btn.disabled=true; const me2 = await fetchMe(); State.setMe(me2); await loadChats(); }
          catch{}
        });
        row.appendChild(btn);
        inEl.appendChild(row);
      });
    } catch {}
  })();
  createModal({ title:'Agregar contacto', content: wrap, actions:[ { text:'Cerrar', className:'icon-btn' } ]});
}

async function onCreateGroup(){
  const me = State.getMe();
  const friends = me.amigos || [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>Nombre del grupo</label><input id="gName" type="text" placeholder="Amigos"></div>
    <div class="field"><label>Seleccionar miembros</label></div>
    <div id="friendList"></div>
    <div class="field"><label>Buscar usuarios</label><input id="gSearch" type="text" placeholder="Buscar por username"></div>
    <div id="gResults"></div>
  `;
  const list = wrap.querySelector('#friendList');
  friends.forEach(f => {
    const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
    const left = document.createElement('div'); left.className='row';
    const av = document.createElement('div'); av.className='avatar'; if (f.fotoPerfil && !String(f.fotoPerfil).includes('default.png')) { const img=document.createElement('img'); img.src=f.fotoPerfil; av.appendChild(img);} else { av.textContent=(f.nombre||f.username||'?')[0]?.toUpperCase()||'?'; }
    const name = document.createElement('div'); name.textContent = f.nombre||f.username;
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value = f._id || f.id;
    left.append(av, name);
    row.append(left, cb);
    list.appendChild(row);
  });
  const gSearch = wrap.querySelector('#gSearch');
  const gResults = wrap.querySelector('#gResults');
  gSearch.addEventListener('input', async () => {
    const q = gSearch.value.trim(); if (!q) { gResults.innerHTML = ''; return; }
    try{
      const users = await API.searchUsers(q);
      gResults.innerHTML = '';
      users.forEach(u => {
        const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
        const left = document.createElement('div'); left.className='row';
        const av = document.createElement('div'); av.className='avatar'; if (u.fotoPerfil && !String(u.fotoPerfil).includes('default.png')) { const img=document.createElement('img'); img.src=u.fotoPerfil; av.appendChild(img);} else { av.textContent=(u.nombre||u.username||'?')[0]?.toUpperCase()||'?'; }
        const name = document.createElement('div'); name.textContent = u.nombre||u.username;
        const cb = document.createElement('input'); cb.type='checkbox'; cb.value = u._id || u.id;
        left.append(av, name);
        row.append(left, cb);
        gResults.appendChild(row);
      });
    }catch(e){ gResults.textContent = 'Error buscando'; }
  });
  createModal({ title:'Crear grupo', content: wrap, actions:[
    { text:'Cancelar', className:'icon-btn' },
    { text:'Crear', className:'primary-btn', onClick: async ({ close }) => {
      const name = wrap.querySelector('#gName').value.trim();
      const ids = [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
      if (!name) return;
      try{ const g = await API.createGroup({ nombre: name, miembros: ids }); close(); await loadChats(); }
      catch(e){ console.error(e); }
    } }
  ]});
}

function handleIncoming(msg){
  const cur = State.getCurrent();
  // de-duplication: if message already exists, skip
  if (document.querySelector(`[data-mid="${msg._id}"]`)) return;
  // Append to current conversation if it matches
  if (cur) {
    if (msg.esGrupo) {
      if (cur.type==='group' && String(msg.receptor)===String(cur.id)) {
        const list = document.getElementById('messageList'); const meId = State.getMe()?.id;
        appendWithDate(list, renderMessage(msg, meId, { isGroup: currentIsGroup, resolveName: currentGroupNameResolver }), msg.fecha||msg.createdAt);
        list.scrollTop = list.scrollHeight;
        if (String(msg.emisor)!==String(meId)) { try { API.seenMessage(msg._id); } catch{} }
      }
    } else {
      const meId = State.getMe()?.id;
      const other = String(msg.emisor)===String(meId) ? String(msg.receptor) : String(msg.emisor);
      if (cur.type==='direct' && String(other)===String(cur.id)){
        const list = document.getElementById('messageList');
        appendWithDate(list, renderMessage(msg, meId, { isGroup: false }), msg.fecha||msg.createdAt);
        list.scrollTop = list.scrollHeight;
        if (String(msg.emisor)!==String(meId)) { try { API.seenMessage(msg._id); } catch{} }
      }
    }
  }
  // Increment unread for non-current targets (including no chat selected)
  const key = msg.esGrupo ? `g:${msg.receptor}` : `d:${String(msg.emisor)===String(State.getMe()?.id) ? msg.receptor : msg.emisor}`;
  const curKey = cur ? keyOf(cur) : null;
  if (key !== curKey) { State.incUnread(key); renderChatList(); }
}

function showAuth(){
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row" style="gap:12px; margin-bottom:12px;">
      <button id="tabLogin" class="primary-btn">Iniciar sesión</button>
      <button id="tabRegister" class="icon-btn">Registrarse</button>
    </div>
    <div id="authForm"></div>
  `;
  const { close } = createModal({ title:'Bienvenido', content: wrap, actions: [] });

  function renderLogin(){
    const c = document.createElement('div');
    c.innerHTML = `
      <div class="field"><label for="lUser">Usuario o correo</label><input id="lUser" name="lUser" type="text" autocomplete="username" required></div>
      <div class="field"><label for="lPass">Contraseña</label><input id="lPass" name="lPass" type="password" autocomplete="current-password" required></div>
      <div class="row" style="justify-content:flex-end; gap:8px;">
        <button id="doLogin" class="primary-btn">Entrar</button>
      </div>
    `;
    const doLogin = async () => {
      const username = c.querySelector('#lUser').value.trim();
      const password = c.querySelector('#lPass').value.trim();
      try{
        const data = await API.login({ username, password });
        State.setToken(data.token); API.setToken(data.token);
        const me = await fetchMe(); State.setMe(me);
        if (me.mode) State.setMode(me.mode);
        if (me.palette) State.setPalette(me.palette);
        setupUI(); setupSockets(); await loadChats(); close();
      }catch(e){ alert(e?.message || 'Error de login'); }
    };
    c.querySelector('#doLogin').addEventListener('click', async () => {
      await doLogin();
    });
    c.addEventListener('keydown', (ev) => { if (ev.key==='Enter') { ev.preventDefault(); doLogin(); } });
    return c;
  }

  function renderRegister(){
    const c = document.createElement('div');
    c.innerHTML = `
      <div class="field"><label for="rUser">Usuario</label><input id="rUser" name="rUser" type="text" autocomplete="username" required></div>
      <div class="field"><label for="rEmail">Correo</label><input id="rEmail" name="rEmail" type="email" autocomplete="email" required></div>
      <div class="field"><label for="rPass">Contraseña</label><input id="rPass" name="rPass" type="password" autocomplete="new-password" required></div>
      <div class="field"><label for="rName">Nombre</label><input id="rName" name="rName" type="text"></div>
      <div class="field"><label for="rAvatar">Avatar (opcional)</label><input id="rAvatar" name="rAvatar" type="file" accept="image/*"></div>
      <div class="row" style="justify-content:flex-end; gap:8px;">
        <button id="doRegister" class="primary-btn">Crear cuenta</button>
      </div>
    `;
    const doRegister = async () => {
      const username = c.querySelector('#rUser').value.trim();
      const email = c.querySelector('#rEmail').value.trim();
      const password = c.querySelector('#rPass').value.trim();
      const nombre = c.querySelector('#rName').value.trim();
      const avatarFile = c.querySelector('#rAvatar').files?.[0];
      try{
        const data = await API.register({ username, email, password, nombre, avatarFile });
        State.setToken(data.token); API.setToken(data.token);
        const me = await fetchMe(); State.setMe(me);
        if (me.mode) State.setMode(me.mode);
        if (me.palette) State.setPalette(me.palette);
        setupUI(); setupSockets(); await loadChats(); close();
      }catch(e){ alert(e?.message || 'Error registrando'); }
    };
    c.querySelector('#doRegister').addEventListener('click', async () => { await doRegister(); });
    c.addEventListener('keydown', (ev) => { if (ev.key==='Enter') { ev.preventDefault(); doRegister(); } });
    return c;
  }

  const form = wrap.querySelector('#authForm');
  const btnLogin = wrap.querySelector('#tabLogin');
  const btnReg = wrap.querySelector('#tabRegister');
  function setTab(which){
    form.innerHTML = ''; form.appendChild(which==='login' ? renderLogin() : renderRegister());
    btnLogin.className = which==='login' ? 'primary-btn' : 'icon-btn';
    btnReg.className = which==='register' ? 'primary-btn' : 'icon-btn';
  }
  btnLogin.addEventListener('click', ()=>setTab('login'));
  btnReg.addEventListener('click', ()=>setTab('register'));
  setTab('login');
}

async function onEditGroup(sel){
  // fetch group details for proper names/avatars
  let g = sel.peer;
  try { g = await API.getGroup(sel.id); } catch {}
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>Nombre</label><input id="egName" type="text" value="${g.nombre||''}"></div>
    <div class="field"><label>Descripción</label><input id="egDesc" type="text" value="${g.descripcion||''}"></div>
    <div class="field"><label>Imagen</label><input id="egImage" type="file"></div>
    <div class="field"><label>Miembros actuales</label></div>
    <div id="egMembers"></div>
    <div class="field"><label>Buscar y añadir</label><input id="egSearch" type="text" placeholder="username"></div>
    <div id="egResults"></div>
  `;
  const memEl = wrap.querySelector('#egMembers');
  const toRemove = new Set();
  (g.miembros||[]).forEach(m => {
    const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
    const left = document.createElement('div'); left.className='row';
    const av = document.createElement('div'); av.className='avatar';
    const foto = m.fotoPerfil; if (foto && !String(foto).includes('default.png')) { const img=document.createElement('img'); img.src=foto; av.appendChild(img);} else { av.textContent=(m.nombre||m.username||'?')[0]?.toUpperCase()||'?'; }
    const name = document.createElement('div'); name.textContent = m.nombre||m.username||String(m);
    left.append(av, name);
    const x = document.createElement('button'); x.textContent = '✕'; x.className='icon-btn';
    x.addEventListener('click', () => {
      const { close } = createModal({ title:'Remover miembro', content:`¿Quitar a ${name.textContent}?`, actions:[
        { text:'Cancelar', className:'icon-btn' },
        { text:'Quitar', className:'primary-btn', onClick: ({ close }) => { toRemove.add(m._id || m.id || m); row.remove(); close(); } }
      ]});
    });
    row.append(left, x);
    memEl.appendChild(row);
  });
  const egSearch = wrap.querySelector('#egSearch'); const egResults = wrap.querySelector('#egResults');
  egSearch.addEventListener('input', async () => {
    const q = egSearch.value.trim(); if (!q) { egResults.innerHTML=''; return; }
    try{
      const users = await API.searchUsers(q);
      egResults.innerHTML='';
      users.forEach(u => {
        const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
        const left = document.createElement('div'); left.className='row';
        const av = document.createElement('div'); av.className='avatar'; if (u.fotoPerfil && !String(u.fotoPerfil).includes('default.png')) { const img=document.createElement('img'); img.src=u.fotoPerfil; av.appendChild(img);} else { av.textContent=(u.nombre||u.username||'?')[0]?.toUpperCase()||'?'; }
        const name = document.createElement('div'); name.textContent = u.nombre||u.username;
        const cb = document.createElement('input'); cb.type='checkbox'; cb.value = u._id || u.id;
        left.append(av, name);
        row.append(left, cb);
        egResults.appendChild(row);
      });
    }catch{ egResults.textContent='Error'; }
  });

  createModal({ title:'Editar grupo', content: wrap, actions:[
    { text:'Eliminar grupo', className:'icon-btn danger', onClick: async ({ close }) => {
      const { close: close2 } = createModal({ title:'Eliminar grupo', content:'¿Seguro que deseas eliminar el grupo y todos sus mensajes para todos?', actions:[
        { text:'Cancelar', className:'icon-btn' },
        { text:'Eliminar', className:'primary-btn', onClick: async ({ close }) => { try { await API.deleteGroup(sel.id); close(); close2(); State.setCurrent(null); await loadChats(); document.getElementById('messageList').innerHTML=''; renderPeerHeader({ name: 'Selecciona un chat', status: '—' }); } catch(e){ console.error(e); } } }
      ]});
    } },
    { text:'Cancelar', className:'icon-btn' },
    { text:'Guardar', className:'primary-btn', onClick: async ({ close }) => {
      const nombre = wrap.querySelector('#egName').value.trim();
      const descripcion = wrap.querySelector('#egDesc').value.trim();
      const imgFile = wrap.querySelector('#egImage').files?.[0];
      const removeMiembros = Array.from(toRemove);
      const addMiembros = [...wrap.querySelectorAll('#egResults input[type="checkbox"]:checked')].map(x=>x.value);
      const updates = { nombre, descripcion, removeMiembros, addMiembros };
      if (imgFile) { try { const up = await API.upload(imgFile, 'group'); updates.imagen = up.url; } catch{} }
      try{ await API.editGroup(sel.id, updates); close(); await loadChats(); const fresh = await API.getGroup(sel.id); selectChat({ type:'group', id: sel.id, peer: fresh }); }catch(e){ console.error(e); }
    } }
  ]});
}

window.addEventListener('DOMContentLoaded', boot);

// Helpers for reply bar
function showReplyBar(preview){
  const composer = document.querySelector('.composer');
  if (!composer) return;
  let bar = composer.previousElementSibling;
  if (!bar || !bar.classList || !bar.classList.contains('reply-bar')) {
    bar = document.createElement('div');
    bar.className = 'reply-bar';
    composer.parentElement.insertBefore(bar, composer);
  }
  bar.innerHTML = '';
  const txt = document.createElement('div'); txt.textContent = `Respondiendo: ${preview}`;
  const cancel = document.createElement('button'); cancel.className = 'icon-btn'; cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', () => { hideReplyBar(); replyTarget = null; });
  bar.append(txt, cancel);
}

function hideReplyBar(){
  const composer = document.querySelector('.composer'); if (!composer) return;
  const bar = composer.previousElementSibling; if (bar && bar.classList && bar.classList.contains('reply-bar')) bar.remove();
}

async function onSearchInConversation(){
  const sel = State.getCurrent(); if (!sel) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="field"><label>Buscar en conversación</label><input id="qChat" type="text" placeholder="Palabra o frase"></div>
    <div id="chatResults"></div>
  `;
  const results = wrap.querySelector('#chatResults');
  const input = wrap.querySelector('#qChat');
  const debounce = (fn, wait=300) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; };
  const doSearch = debounce(async ()=>{
    const q = input.value.trim(); if (!q) { results.innerHTML = ''; return; }
    results.textContent = 'Buscando...';
    try{
      const { messages } = await API.searchMessages(sel.id, sel.type==='group', q, 1, 20);
      results.innerHTML = '';
      if (!messages.length){ results.textContent = 'Sin resultados'; return; }
      messages.forEach(m => {
        const row = document.createElement('div'); row.className = 'row'; row.style.justifyContent='space-between';
        const left = document.createElement('div'); left.style.display='flex'; left.style.flexDirection='column';
        const prev = (m.tipo==='texto' ? (m.contenido||'') : (m.meta?.nombreArchivo||m.tipo||''));
        const title = document.createElement('div'); title.textContent = prev.slice(0,120);
        const when = document.createElement('div'); when.style.fontSize='12px'; when.style.color='var(--muted)'; when.textContent = new Date(m.fecha||m.createdAt).toLocaleString();
        left.append(title, when);
        const open = document.createElement('button'); open.className='icon-btn'; open.textContent='Abrir';
        open.addEventListener('click', ()=>{
          if (m.tipo==='pdf') openPdfViewer({ url: m.contenido });
          else if (m.tipo==='imagen') openImageViewer(m.contenido);
          else {
            replyTarget = { id: m._id, preview: prev.slice(0,140) };
            showReplyBar(replyTarget.preview);
          }
        });
        row.append(left, open);
        results.appendChild(row);
      });
    }catch{ results.textContent='Error buscando'; }
  }, 300);
  input.addEventListener('input', doSearch);
  createModal({ title:'Buscar en conversación', content: wrap, actions:[ { text:'Cerrar', className:'icon-btn' } ]});
  setTimeout(()=> input.focus(), 0);
}

function onToggleFavorite(){
  const sel = State.getCurrent(); if (!sel) return;
  const key = keyOf(sel);
  State.toggleFavorite(key);
  const btn = document.getElementById('favoriteChatBtn');
  if (btn) btn.textContent = State.isFavorite(key) ? '★' : '☆';
  renderChatList();
}
