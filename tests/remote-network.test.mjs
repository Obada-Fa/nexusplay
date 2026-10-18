import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
const delay = ms => new Promise(r => setTimeout(r, ms));
const once = (s, name, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { s.off(name, listener); reject(new Error(`Timeout ${name}`)); }, 3000);
  const listener = data => { if (predicate(data)) { clearTimeout(timer); s.off(name, listener); resolve(data); } };
  s.on(name, listener);
});
test('main remote permissions, confirmation, late join, transfer and preserved room', async () => {
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, SOCKET_PORT: '3108' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients = [];
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
    const connect = async () => { const s = io('http://localhost:3108', { transports: ['websocket'], reconnection: false }); clients.push(s); await once(s, 'connect'); return s; };
    const host = await connect(); let event = once(host, 'room_created'); host.emit('host_create_room', { roomCode: '1234' }); await event;
    const join = async name => { const s = await connect(); const state = once(s, 'session_state'); s.emit('player_join', { roomCode: '1234', playerName: name }); return [s, await state]; };
    const [main, first] = await join('Main'); assert.equal(first.controllerId, main.id);
    const [second] = await join('Second');
    let navigation = 0; host.on('gallery_select', () => navigation++);
    second.emit('gallery_select', { roomCode: '1234' }); await delay(60); assert.equal(navigation, 0);
    event = once(host, 'gallery_select'); main.emit('gallery_select', { roomCode: '1234' }); await event;
    event = once(main, 'session_state', s => s.gameName === 'WormBlitz'); host.emit('game_started', { gameIndex: 4, gameName: 'WormBlitz' }); await event;
    const command = (s, action) => s.emit('remote_command', { roomCode: '1234', action });
    let paused = false; second.on('session_state', s => { paused = s.paused; });
    command(second, 'menu'); await delay(60); assert.equal(paused, false);
    event = once(main, 'session_state', s => s.paused); command(main, 'menu'); await event;
    let inputs = 0; host.on('player_worms_input', () => inputs++);
    second.emit('worms_input', { roomCode: '1234', action: { kind: 'key', key: 'fire', down: true } }); await delay(60); assert.equal(inputs, 0);
    const [late, snapshot] = await join('Late'); assert.equal(snapshot.paused, true); assert.equal(snapshot.gameName, 'WormBlitz');
    event = once(main, 'session_state', s => s.confirm === 'restart'); command(main, 'restart'); await event;
    event = once(main, 'session_state', s => !s.confirm); command(main, 'cancel'); assert.equal((await event).paused, true);
    event = once(main, 'session_state', s => s.menuIndex === 1); command(main, 'down'); await event;
    event = once(main, 'session_state', s => s.confirm === 'restart'); command(main, 'select'); await event;
    event = once(host, 'remote_execute'); command(main, 'confirm'); assert.equal((await event).action, 'restart');
    event = once(second, 'session_state', s => s.controllerId === second.id); main.disconnect(); await event;
    event = once(second, 'session_state', s => s.paused); command(second, 'menu'); await event;
    event = once(second, 'session_state', s => s.confirm === 'lobby'); command(second, 'lobby'); await event;
    event = once(host, 'remote_execute'); command(second, 'confirm'); assert.equal((await event).action, 'lobby');
    event = once(late, 'session_state', s => !s.gameName); host.emit('game_ended', { roomCode: '1234' }); assert.equal((await event).paused, false);
    event = once(host, 'gallery_select'); second.emit('gallery_select', { roomCode: '1234' }); await event;
    // A returning phone joins after the current main remote.
    const [, returning] = await join('Main'); assert.equal(returning.controllerId, second.id);
  } finally { for (const s of clients) s.disconnect(); server.kill(); }
});
