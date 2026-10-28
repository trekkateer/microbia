import { describe, it, expect } from 'vitest';
import { species } from '../src/data';
import { pond } from '../src/data/arenas/pond';
import { createOrganism, createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';
import { reproduce, reproductionBlock } from '../src/sim/systems/reproduction';
import { Room } from '../src/server/room';
import { sustain } from '../src/sim/systems/hunger';
import { RoomBroadcast } from '../src/server/broadcast';
import { PondDecoder } from '../src/network/protocol';

const idle = { direction: { x: 0, y: 0 } };
function empty(speciesId='paramecium-caudatum') {
  const w=createWorld({...pond, aiSpawns:[], zones:[], dissolvedPatches:[], ambientLight:0},species[speciesId]);
  w.foodParticles=[];w.player.protectedUntil=0;return w;
}
function advance(w: ReturnType<typeof empty>,seconds:number) { for(let i=0;i<seconds*30;i++)step(w,idle); }

describe('hunger and population pressure',()=>{
  it.each(Object.keys(species))('%s loses biomass and eventually dies without a resource supply',id=>{
    const w=empty(id), initial=w.player.mass;
    advance(w,46);
    expect(w.player.satiety).toBe(0);expect(w.player.mass).toBeLessThan(initial);expect(w.player.alive).toBe(true);
    advance(w,30);
    expect(w.player.alive).toBe(false);expect(w.player.deathReason).toBe('Starvation');expect(w.player.satiety).toBe(0);
    expect(Object.values(w.player.reserves).every(v=>v>=0)).toBe(true);
    const dead=w.player.mass;advance(w,2);expect(w.player.mass).toBe(dead);
  });
  it('carbon alone cannot sustain a Paramecium despite ample ability energy',()=>{
    const w=empty();w.player.nutrients.carbohydrate=1000;
    advance(w,46);
    expect(w.player.reserves.energy).toBeGreaterThan(30);expect(w.player.satiety).toBe(0);expect(w.player.mass).toBeLessThan(25);
  });
  it('a balanced raw inventory restores hunger through metabolism and stops starvation',()=>{
    const w=empty();w.player.satiety=0;w.player.hungryTicks=200;
    for(const id of ['carbohydrate','peptides','fatty-acids','phospholipids','nucleotides'])w.player.nutrients[id]=200;
    advance(w,15);
    expect(w.player.satiety).toBe(1);expect(w.player.hungryTicks).toBe(0);expect(w.player.alive).toBe(true);expect(w.player.mass).toBeGreaterThan(25);
  });
  it.each(['euglena-gracilis','navicula-radiosa'])('%s stays nourished using light and dissolved nutrients',id=>{
    const w=createWorld({...pond,aiSpawns:[]},species[id]);w.foodParticles=[];
    const patch=pond.dissolvedPatches![0];w.player.x=patch.x;w.player.y=patch.y;
    advance(w,60);
    expect(w.player.alive).toBe(true);expect(w.player.satiety).toBeGreaterThan(.9);expect(w.player.eaten).toBe(0);
  });
  it('division inherits hunger and maintenance demand, and low hunger blocks division',()=>{
    const w=empty();w.player.mass=120;w.player.satiety=.2;
    expect(reproductionBlock(w,w.player)).toContain('hunger');expect(reproduce(w,w.player)).toBe(false);
    w.player.satiety=.5;w.player.hungryTicks=20;
    for(const id of Object.keys(w.player.reserves))w.player.reserves[id]=10;
    const parent=structuredClone(w.player);
    expect(reproduce(w,w.player)).toBe(true);const child=w.organisms[0];
    expect(child.satiety).toBe(.5);expect(child.hungryTicks).toBe(20);
    sustain({...w,player:parent},1,0);sustain(w,1,0);sustain({...w,player:child},1,0);
    for(const id of Object.keys(parent.reserves))expect(w.player.reserves[id]+child.reserves[id]).toBeCloseTo(parent.reserves[id]);
    expect(w.player.mass+child.mass).toBe(120);
  });
  it('a resource-poor AI colony dies out rather than retaining immortal daughters',()=>{
    const w=empty();w.player.alive=false;
    for(let i=0;i<8;i++){
      const p=createOrganism(species['paramecium-caudatum'],w.nutrition,`ai${i}`,500+i*250,1000,30);
      p.kind='ai';p.colonyId='family';p.parentId=i===0?null:'ai0';
      p.ai={profileId:'forager',mode:'wander',direction:{x:0,y:0},decisionAt:0,wanderAt:0,wanderAngle:0,targetId:null};w.organisms.push(p);
    }
    advance(w,76);
    expect(w.organisms.filter(p=>p.alive)).toHaveLength(0);
  });
  it('respawn restores hunger and multiplayer carries per-cell hunger without trusting input',()=>{
    const room=new Room('hunger');room.join('a','a','paramecium-caudatum');room.join('b','b','amoeba-proteus');
    room.world.organisms.find(p=>p.ownerId==='b')!.satiety=.321;
    const a=room.world.organisms.find(p=>p.ownerId==='a')!;a.satiety=0;a.hungryTicks=899;
    a.nutrients={};for(const id of Object.keys(a.reserves))a.reserves[id]=0;
    room.input('a',1,{...idle,satiety:1});room.advance();expect(a.alive).toBe(false);
    const encode=new RoomBroadcast().prepare(room),decoded=new PondDecoder().decode(JSON.parse(encode('a',true)));
    expect(decoded.player.satiety).toBe(0);expect(decoded.organisms.find(p=>p.ownerId==='b')!.satiety).toBeCloseTo(.321,2);
    room.world.tick=a.respawnAtTick;room.input('a',2,{...idle,respawn:true});room.advance();
    expect(a.alive).toBe(true);expect(a.satiety).toBeGreaterThan(.99);expect(a.hungryTicks).toBe(0);
  });
});
