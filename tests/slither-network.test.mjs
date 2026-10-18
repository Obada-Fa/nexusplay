import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
const once = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Timed out: ${event}`)), 3000);
  socket.once(event, data => { clearTimeout(timer); resolve(data); });
});
test('eight controllers, overflow rejection, authorized relays, late join and lobby return', async () => {
  const server = spawn(process.execPath, ['server.js'], { env: { ...process.env, SOCKET_PORT: '3107' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients = [];
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); server.once('exit', c => { if (c) reject(new Error(`Server exited ${c}`)); }); });
    const connect = async () => { const socket = io('http://localhost:3107', { transports: ['websocket'], reconnection: false }); clients.push(socket); await once(socket, 'connect'); return socket; };
    const host = await connect(); let event = once(host, 'room_created'); host.emit('host_create_room', { roomCode: '7621' }); await event;
    const colors = new Set();
    for (let i = 0; i < 8; i++) {
      const p = await connect(); event = once(p, 'join_success'); p.emit('player_join', { roomCode: '7621', playerName: `P${i}` }); colors.add((await event).player.color);
    }
    assert.equal(colors.size, 8);
    const extra = await connect(); event = once(extra, 'join_error'); extra.emit('player_join', { roomCode: '7621', playerName: 'Overflow' }); assert.match((await event).message, /full/);
    const p = clients[1]; event = once(host, 'player_steer'); p.emit('steer', { roomCode: '7621', angle: 1.2 }); assert.equal((await event).angle, 1.2);
    let unauthorized = false; host.on('player_steer', () => { unauthorized = true; });
    extra.emit('steer', { roomCode: '7621', angle: 1 });
    await new Promise(r => setTimeout(r, 80)); assert.equal(unauthorized, false);
    event = once(p, 'game_started'); host.emit('game_started', { gameIndex: 0, gameName: 'SlitherPlay' }); await event;
    clients[8].disconnect(); await new Promise(r => setTimeout(r, 30));
    event = once(extra, 'join_success'); extra.emit('player_join', { roomCode: '7621', playerName: 'Late' }); assert.equal((await event).gameName, 'SlitherPlay');
    event = once(p, 'slither_status'); host.emit('slither_status', { playerId: p.id, phase: 'playing', score: 125 }); assert.equal((await event).score, 125);
    event = once(p, 'game_ended'); host.emit('game_ended', { roomCode: '7621' }); await event;
    event = once(host, 'player_steer'); p.emit('steer', { roomCode: '7621', angle: 2 }); assert.equal((await event).playerId, p.id);
    event = once(p, 'room_closed'); host.disconnect(); await event;
    const nextHost = await connect(); event = once(nextHost, 'room_created'); nextHost.emit('host_create_room', { roomCode: '7622' }); await event;
    event = once(p, 'join_success'); p.emit('player_join', { roomCode: '7622', playerName: 'Return' }); assert.equal((await event).roomCode, '7622');
  } finally { for (const client of clients) client.disconnect(); server.kill(); }
});
