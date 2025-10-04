import State from './state.js';

let socket = null;
let callbacks = {
  onMessage: null,
  onSeen: null,
  onPin: null,
  onDeleted: null,
  onEdited: null,
  onReact: null,
  onTyping: null,
  onPresence: null,
  onFriendRequest: null,
  onFriendAccepted: null,
  onGroupDeleted: null,
};

function connect() {
  const token = State.getToken();
  socket = io('/', { auth: { token } });

  socket.on('connect', () => {});

  socket.on('user:online', (userId) => {
    callbacks.onPresence && callbacks.onPresence({ userId, online: true });
  });

  socket.on('user:offline', (userId) => {
    callbacks.onPresence && callbacks.onPresence({ userId, online: false });
  });

  socket.on('typing', ({ from, isGroup }) => {
    callbacks.onTyping && callbacks.onTyping({ from, isGroup });
  });

  socket.on('message:new', (msg) => {
    callbacks.onMessage && callbacks.onMessage(msg);
  });

  socket.on('message:seen', ({ id, userId }) => {
    callbacks.onSeen && callbacks.onSeen({ id, userId });
  });

  socket.on('message:pin', ({ id, fijado }) => {
    callbacks.onPin && callbacks.onPin({ id, fijado });
  });

  socket.on('message:deleted', ({ id }) => {
    callbacks.onDeleted && callbacks.onDeleted({ id });
  });

  socket.on('message:edited', ({ id, contenido, edited }) => {
    callbacks.onEdited && callbacks.onEdited({ id, contenido, edited });
  });

  socket.on('message:react', ({ id, emoji, users }) => {
    callbacks.onReact && callbacks.onReact({ id, emoji, users });
  });

  socket.on('friend:request', (payload) => {
    callbacks.onFriendRequest && callbacks.onFriendRequest(payload);
  });

  socket.on('friend:accepted', (payload) => {
    callbacks.onFriendAccepted && callbacks.onFriendAccepted(payload);
  });

  socket.on('group:deleted', ({ id }) => {
    callbacks.onGroupDeleted && callbacks.onGroupDeleted({ id });
  });

  return socket;
}

function registerHandlers(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

function joinGroup(groupId) {
  if (!socket) return;
  socket.emit('join:group', groupId);
}

function emitTyping(targetId, isGroup) {
  if (!socket) return;
  socket.emit('typing', targetId, !!isGroup);
}

export { connect, registerHandlers, joinGroup, emitTyping };
