import { describe, it, expect } from 'vitest';
import { Room, parseCommand } from '../src/server/room';
import { sameColony } from '../src/sim/systems/colonies';
import { playerCells } from '../src/sim/systems/player-control';
import { reproduce } from '../src/sim/systems/reproduction';
import { killOrganism } from '../src/sim/systems/lifecycle';
import { eligiblePrey } from '../src/sim/systems/abilities';
import { didinium } from '../src/data/species/didinium';
import { didiniumMetabolism } from '../src/data/metabolism/ciliates';

describe('authoritative multiplayer pond', () => {
  it('populates shared rooms with bots before the first human joins and keeps them alongside human players', () => {
    const room = new Room('shared');
    const bots = room.world.organisms.filter(p => p.alive && p.kind === 'ai');
    expect(bots.length).toBeGreaterThan(0);
    room.join('a', 'a', 'amoeba-proteus'); room.join('b', 'b', 'paramecium-caudatum');
    room.advance();
    expect(room.state('a').organisms.some(p => p.kind === 'ai' && p.alive)).toBe(true);
    expect(room.state('a').organisms.some(p => p.ownerId === 'b' && p.alive)).toBe(true);
    expect(room.clients.size).toBe(2);
    room.leave('a');
    expect(room.state('b').organisms.some(p => p.kind === 'ai' && p.alive)).toBe(true);
  });
  it('moves owners independently, inherits ownership on division, isolates rooms and removes disconnected colonies', () => {
    const room = new Room('one'), other = new Room('two');
    room.join('a', 'secret-a', 'amoeba-proteus'); room.join('b', 'secret-b', 'paramecium-caudatum');
    const a = room.world.organisms.find(p => p.ownerId === 'a')!, b = room.world.organisms.find(p => p.ownerId === 'b')!;
    a.x = 700; a.y = 700; b.x = 2000; b.y = 1800;
    const oldX = a.x;
    room.clients.get('a')!.command = { direction: { x: 1, y: 0 } };
    room.advance();
    expect(a.x).toBeGreaterThan(oldX); expect(b.velocity.x).toBe(0); expect(other.world.tick).toBe(0);
    expect(sameColony(a,b)).toBe(false);
    a.mass = 220; a.protectedUntil = 0;
    expect(reproduce(room.world, a)).toBe(true);
    expect(room.world.organisms.filter(p => p.ownerId === 'a')).toHaveLength(2);
    expect(playerCells(room.state('b'))).toHaveLength(1);
    killOrganism(room.world, a, 'test', 30); room.advance();
    expect(room.state('a').player.alive).toBe(true);
    room.leave('a'); expect(room.world.organisms.some(p => p.ownerId === 'a')).toBe(false);
    expect(room.leaderboard()).toHaveLength(1);
  });
  it('permits cross-player prey and keeps respawn local to the owner', () => {
    const room = new Room('test'); room.join('a','a','didinium-nasutum'); room.join('b','b','paramecium-caudatum');
    const a=room.world.organisms.find(p=>p.ownerId==='a')!, b=room.world.organisms.find(p=>p.ownerId==='b')!;
    a.protectedUntil=0; b.protectedUntil=0; b.mass=20;
    expect(eligiblePrey(room.world,a,b)).toBe(true);
    killOrganism(room.world,a,'test',30); room.world.tick+=90;
    room.clients.get('a')!.command={direction:{x:0,y:0},respawn:true}; room.clients.get('a')!.lastInput=room.world.tick;
    room.advance(); expect(a.alive).toBe(true); expect(a.ownerId).toBe('a'); expect(b.ownerId).toBe('b');
  });
  it('enforces capacity and sanitizes commands without accepting mass or reserves', () => {
    const room = new Room('load');
    for(let i=0;i<20;i++) room.join(String(i),String(i),'paramecium-caudatum');
    expect(()=>room.join('extra','x','amoeba-proteus')).toThrow('Room full');
    const start=performance.now(); for(let i=0;i<300;i++)room.advance();
    console.log(`20-player simulation: ${((performance.now()-start)/300).toFixed(1)} ms/tick`);
    expect(room.clients.size).toBe(20); expect(room.state('0').tick).toBe(300);
    expect(parseCommand({direction:{x:100,y:0},mass:100000})).toEqual({direction:{x:1,y:0},target:undefined,activate:false,reproduce:false,respawn:false});
    expect(()=>parseCommand({direction:{x:Infinity,y:0}})).toThrow();
    expect(()=>parseCommand(null)).toThrow();
  });
});

it('Didinium can fund repeated hunts without grazing or free biomass rewards', () => {
  const room=new Room('balance'); room.join('hunter','s','didinium-nasutum');
  const a=room.world.organisms.find(p=>p.ownerId==='hunter')!;
  a.x=400; a.y=400; a.protectedUntil=0;
  room.world.organisms=[a]; room.world.foodParticles=[];
  for(let i=0;i<30*30;i++) { room.clients.get('hunter')!.command={direction:{x:0,y:0}};room.clients.get('hunter')!.lastInput=room.world.tick;room.advance(); }
  expect(a.alive).toBe(true); expect(a.reserves.energy).toBeGreaterThan(10);
  expect(didinium.diet).toHaveLength(0); expect(didiniumMetabolism.upkeepPerSecond).toBeGreaterThan(0);
});
