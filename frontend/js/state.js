const State = (() => {
  let token = localStorage.getItem('token') || null;
  let me = null;
  // Backward compat: legacy 'theme' may contain a mode name or palette
  let theme = localStorage.getItem('theme') || 'oscuro';
  let mode = localStorage.getItem('mode') || (theme === 'oscuro' ? 'oscuro' : 'claro');
  let palette = localStorage.getItem('palette') || (['verde','azul','naranja','morado'].includes(theme) ? theme : 'azul');
  let chats = { directs: [], groups: [] };
  let current = null; // { type: 'direct'|'group', id, peer }
  let typingTimers = new Map();
  let drafts = JSON.parse(localStorage.getItem('drafts') || '{}'); // { key: text }
  let unread = {}; // { key: count }
  let favorites = new Set(JSON.parse(localStorage.getItem('favorites') || '[]')); // [key]

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem('token', t); else localStorage.removeItem('token');
  }
  function getToken() { return token; }
  function setMe(user) { me = user; }
  function getMe() { return me; }

  function applyAppearance(){
    document.body.setAttribute('data-mode', mode);
    document.body.setAttribute('data-palette', palette);
  }
  function setTheme(t, persist = true) {
    // Legacy: accept a single value to set either mode or palette
    if (!t) t = 'oscuro';
    if (t === 'oscuro' || t === 'claro') { mode = t; if (persist) localStorage.setItem('mode', mode); }
    else if (['verde','azul','naranja','morado'].includes(t)) { palette = t; if (persist) localStorage.setItem('palette', palette); }
    theme = t; if (persist) localStorage.setItem('theme', t);
    applyAppearance();
  }
  function setMode(m){ mode = m==='oscuro' ? 'oscuro' : 'claro'; localStorage.setItem('mode', mode); applyAppearance(); }
  function setPalette(p){ palette = ['verde','azul','naranja','morado'].includes(p) ? p : 'azul'; localStorage.setItem('palette', palette); applyAppearance(); }
  function getTheme() { return theme; }
  function getMode(){ return mode; }
  function getPalette(){ return palette; }

  function setChats(payload) { chats = payload; }
  function getChats() { return chats; }

  function setCurrent(sel) { current = sel; }
  function getCurrent() { return current; }

  function setTyping(key, cb) {
    if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
    cb(true);
    const to = setTimeout(() => cb(false), 1500);
    typingTimers.set(key, to);
  }

  // Drafts
  function setDraft(key, text) { drafts[key] = text || ''; localStorage.setItem('drafts', JSON.stringify(drafts)); }
  function getDraft(key) { return drafts[key] || ''; }

  // Unread counters
  function incUnread(key) { unread[key] = (unread[key] || 0) + 1; }
  function clearUnread(key) { if (key in unread) delete unread[key]; }
  function getUnread(key) { return unread[key] || 0; }
  function getAllUnread() { return { ...unread }; }

  // Favorites
  function toggleFavorite(key) {
    if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
    localStorage.setItem('favorites', JSON.stringify(Array.from(favorites)));
  }
  function isFavorite(key) { return favorites.has(key); }
  function getFavorites() { return Array.from(favorites); }

  return { setToken, getToken, setMe, getMe, setTheme, getTheme, setMode, setPalette, getMode, getPalette, setChats, getChats, setCurrent, getCurrent, setTyping, setDraft, getDraft, incUnread, clearUnread, getUnread, getAllUnread, toggleFavorite, isFavorite, getFavorites, applyAppearance };
})();

export default State;
