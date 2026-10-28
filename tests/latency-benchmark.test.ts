import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Room } from '../src/server/room';
import { createOrganism } from '../src/sim/world';
import { RoomBroadcast } from '../src/server/broadcast';
import { species } from '../src/data';

it('benchmarks crowded multiplayer and synchronized division', () => {
  const result: Record<string, number> = {};
  for (const count of [128, 256]) {
    const room = new Room('benchmark');
    for (let i=0;i<20;i++) room.join(`p${i}`,`t${i}`,'paramecium-caudatum');
    room.world.organisms=[];
    for(let i=0;i<count;i++) {
      const p=createOrganism(species['paramecium-caudatum'],room.world.nutrition,`cell${i}`,400+(i%16)*190,400+Math.floor(i/16)*180,120);
      p.kind='player';p.ownerId=`p${i%20}`;p.colonyId=p.ownerId;p.protectedUntil=0;
      room.world.organisms.push(p);
    }
    for(let i=0;i<5;i++)room.advance();
    let start=performance.now();
    for(let i=0;i<30;i++)room.advance();
    result[`${count} step ms`]=(performance.now()-start)/30;
    start=performance.now();let bytes=0;
    for(const id of room.clients.keys()) bytes+=JSON.stringify({state:room.state(id),players:20,leaderboard:room.leaderboard()}).length;
    result[`${count} broadcast ms`]=performance.now()-start;result[`${count} bytes`]=bytes;
    const encoder = new RoomBroadcast(); encoder.prepare(room);
    start=performance.now();const packet=encoder.prepare(room);bytes=0;
    for(const id of room.clients.keys())bytes+=packet(id,false).length;
    expect(bytes).toBeLessThan(result[`${count} bytes`] * 0.25);
    result[`${count} optimized broadcast ms`]=performance.now()-start;result[`${count} optimized bytes`]=bytes;
    for(const c of room.clients.values()){c.command={direction:{x:0,y:0},reproduce:true};c.lastInput=room.world.tick;}
    start=performance.now();room.advance();result[`${count} division ms`]=performance.now()-start;
    expect(room.world.organisms.filter(p=>p.alive).length).toBe(count*2);
  }
  const aiRoom = new Room('ai-stress'); aiRoom.join('observer','t','amoeba-proteus');
  aiRoom.world.organisms=aiRoom.world.organisms.filter(p=>p.kind==='player');
  for(let i=0;i<256;i++) {
    const p=createOrganism(species['paramecium-caudatum'],aiRoom.world.nutrition,`ai${i}`,400+(i%16)*190,400+Math.floor(i/16)*180,60);
    p.kind='ai';p.colonyId='forager-colony';p.ai={profileId:'forager',mode:'wander',direction:{x:0,y:0},decisionAt:0,wanderAt:0,wanderAngle:0,targetId:null};
    aiRoom.world.organisms.push(p);
  }
  const times:number[]=[];
  for(let i=0;i<90;i++){const start=performance.now();aiRoom.advance();times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);
  result['AI 256-to-512 median step ms']=times[45];result['AI 256-to-512 p95 step ms']=times[85];
  expect(aiRoom.world.organisms.filter(p=>p.kind==='ai').length).toBeGreaterThanOrEqual(256);
  mkdirSync('.test-temp', { recursive: true });
  writeFileSync(`.test-temp/latency-${process.env.BENCH_LABEL??'latest'}.json`,JSON.stringify(result,null,2));
},30000);
