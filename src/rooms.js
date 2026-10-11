// Multiplayer rooms: local directory (persisted) + validation logic.
// The relay server lands later; this directory + lobby flow is the client
// contract it will plug into (create → list/search → join → lobby → start).

const KEY = 'war-of-crowns-rooms-v1';
const mem = new Map(); // in-memory mirror (tests + private-mode fallback)

function store() {
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        get: () => localStorage.getItem(KEY),
        set: (v) => localStorage.setItem(KEY, v),
      };
    }
  } catch { /* private mode */ }
  return {
    get: () => mem.get(KEY) ?? null,
    set: (v) => mem.set(KEY, v),
  };
}

export function listRooms() {
  try {
    const raw = store().get();
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && r.id && r.name) : [];
  } catch {
    return [];
  }
}

function saveRooms(arr) {
  try { store().set(JSON.stringify(arr)); } catch { /* ignore */ }
}

export function searchRooms(query) {
  const q = String(query || '').trim().toLowerCase();
  const all = listRooms();
  if (!q) return all;
  return all.filter((r) => r.name.toLowerCase().includes(q));
}

export function validateRoom(name, password) {
  const nm = String(name || '').trim();
  if (!nm) return 'Give your room a name.';
  if (nm.length > 24) return 'Room name is too long (max 24).';
  if (password && String(password).length > 24) return 'Password is too long (max 24).';
  return null;
}

export function createRoom(name, password = '') {
  const err = validateRoom(name, password);
  if (err) return { error: err };
  const rooms = listRooms();
  const room = {
    id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    name: String(name).trim(),
    locked: !!String(password || '').trim(),
    // never store the password in plain sight next to the directory
    pass: String(password || '').trim() ? b64(String(password).trim()) : '',
    players: 1,
    max: 2,
    created: Date.now(),
  };
  rooms.unshift(room);
  saveRooms(rooms.slice(0, 50));
  return { room };
}

export function joinRoom(id, password = '') {
  const room = listRooms().find((r) => r.id === id);
  if (!room) return { error: 'Room no longer exists.' };
  if (room.players >= room.max) return { error: 'Room is full.' };
  if (room.locked && b64(String(password || '').trim()) !== room.pass) {
    return { error: 'Wrong password.' };
  }
  return { room };
}

export function leaveRoom(id) {
  saveRooms(listRooms().filter((r) => r.id !== id));
}

function b64(s) {
  try {
    if (typeof btoa !== 'undefined') return btoa(unescape(encodeURIComponent(s)));
    return 'b64:' + [...s].map((c) => c.charCodeAt(0).toString(16)).join('');
  } catch {
    return 'b64:' + s;
  }
}

// test hook: wipe the directory
export function _clearRooms() {
  saveRooms([]);
}
