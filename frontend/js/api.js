const API = (() => {
  const base = '';
  let token = null;

  function setToken(t) { token = t; }
  function authHeaders() { return token ? { Authorization: `Bearer ${token}` } : {}; }

  async function json(res) {
    if (!res.ok) throw new Error((await res.text()) || res.statusText);
    return res.json();
  }

  async function deleteAccount() {
    const res = await fetch(`${base}/api/users/me`, { method: 'DELETE', headers: { ...authHeaders() } });
    return json(res);
  }

  // Auth
  async function register({ username, email, password, nombre, avatarFile }) {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, nombre })
    });
    const data = await json(res);
    // If avatar provided, upload then update profile
    if (avatarFile) {
      setToken(data.token);
      const up = await upload(avatarFile, 'avatar');
      await updateUser(data.user.id, { fotoPerfil: up.url });
      data.user.fotoPerfil = up.url;
    }
    return data;
  }

  async function login({ username, password }) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return json(res);
  }

  // Users
  async function getUser(id) {
    const res = await fetch(`${base}/api/users/${id}`, { headers: { ...authHeaders() } });
    return json(res);
  }

  async function searchUsers(q) {
    const url = new URL(`${base}/api/users/search`, location.origin);
    url.searchParams.set('q', q || '');
    const res = await fetch(url, { headers: { ...authHeaders() } });
    return json(res);
  }

  async function updateUser(id, updates) {
    const res = await fetch(`${base}/api/users/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(updates)
    });
    return json(res);
  }

  async function sendFriendRequest(id) {
    const res = await fetch(`${base}/api/users/${id}/request`, { method: 'POST', headers: { ...authHeaders() } });
    return json(res);
  }

  async function acceptFriend(id) {
    const res = await fetch(`${base}/api/friends/${id}/accept`, { method: 'POST', headers: { ...authHeaders() } });
    return json(res);
  }

  // Chats
  async function getChats() {
    const res = await fetch(`${base}/api/chats`, { headers: { ...authHeaders() } });
    return json(res);
  }

  // Messages
  async function getMessages(id, esGrupo, page = 1, limit = 30) {
    const url = new URL(`${base}/api/messages/${id}`, location.origin);
    url.searchParams.set('esGrupo', String(!!esGrupo));
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { headers: { ...authHeaders() } });
    return json(res);
  }

  async function sendMessage({ receptor, esGrupo, tipo = 'texto', contenido = '', meta = {} }) {
    const res = await fetch(`${base}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ receptor, esGrupo, tipo, contenido, meta })
    });
    return json(res);
  }

  async function pinMessage(id, fijado) {
    const res = await fetch(`${base}/api/messages/${id}/pin`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ fijado })
    });
    return json(res);
  }

  async function seenMessage(id) {
    const res = await fetch(`${base}/api/messages/${id}/seen`, { method: 'PUT', headers: { ...authHeaders() } });
    return json(res);
  }

  async function deleteMessage(id) {
    const res = await fetch(`${base}/api/messages/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    return json(res);
  }

  async function editMessage(id, contenido) {
    const res = await fetch(`${base}/api/messages/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ contenido }) });
    return json(res);
  }

  async function reactMessage(id, emoji) {
    const res = await fetch(`${base}/api/messages/${id}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ emoji }) });
    return json(res);
  }

  async function searchMessages(peerId, esGrupo, q, page = 1, limit = 20) {
    const url = new URL(`${base}/api/messages/search`, location.origin);
    url.searchParams.set('peerId', peerId);
    url.searchParams.set('esGrupo', String(!!esGrupo));
    url.searchParams.set('q', q || '');
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { headers: { ...authHeaders() } });
    return json(res);
  }

  // Groups
  async function createGroup({ nombre, miembros = [], imagen }) {
    const res = await fetch(`${base}/api/groups`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ nombre, miembros, imagen })
    });
    return json(res);
  }

  async function editGroup(id, updates) {
    const res = await fetch(`${base}/api/groups/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(updates)
    });
    return json(res);
  }

  async function getGroup(id) {
    const res = await fetch(`${base}/api/groups/${id}`, { headers: { ...authHeaders() } });
    return json(res);
  }

  async function leaveGroup(id) {
    const res = await fetch(`${base}/api/groups/${id}/leave`, { method: 'POST', headers: { ...authHeaders() } });
    return json(res);
  }

  async function deleteGroup(id) {
    const res = await fetch(`${base}/api/groups/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
    return json(res);
  }

  // Upload
  async function upload(file, type = 'file') {
    const form = new FormData();
    form.append('file', file);
    const url = new URL(`${base}/api/upload`, location.origin);
    url.searchParams.set('type', type);
    const res = await fetch(url, { method: 'POST', headers: { ...authHeaders() }, body: form });
    return json(res);
  }

  return {
    setToken,
    register, login,
    getUser, searchUsers, updateUser,
    sendFriendRequest, acceptFriend,
    getChats, getMessages, sendMessage, pinMessage, seenMessage, deleteMessage, editMessage, reactMessage,
    searchMessages,
    createGroup, editGroup, getGroup, leaveGroup, deleteGroup,
    upload,
    deleteAccount,
  };
})();

export default API;
