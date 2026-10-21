const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Minimal public ESPN responses captured on 2026-10-21; no credentials or user data.
const fixtures = require('./fixtures/player-2026-27.json');
const clone = value => JSON.parse(JSON.stringify(value));

function coreStats(gp=1,pts=22) {
  return {splits:{categories:[{name:'general',stats:[
    ['gamesPlayed',gp],['avgPoints',pts],['avgMinutes',28],['avgRebounds',9],['avgAssists',1],
    ['avgSteals',1],['avgBlocks',1],['avgTurnovers',1],['fieldGoalPct',61.5],['threePointPct',0],['freeThrowPct',85.7],
  ].map(([name,value])=>({name,value}))}]}};
}
function harness(now='2026-10-21T04:00Z') {
  const modules=new Map(),storage=new Map(),calls=[];
  let time=Date.parse(now);
  let respond=url=>{
    if(url.pathname.endsWith('/overview'))return clone(fixtures.duren.overview);
    if(url.pathname.endsWith('/gamelog'))return clone(fixtures.duren.gameLog);
    if(url.pathname.endsWith('/statisticslog'))return {entries:[{season:{$ref:'https://espn.test/seasons/2026'},statistics:[]}]};
    if(url.pathname.includes('/seasons/2027/'))return {httpStatus:404};
    if(url.pathname.endsWith('/statistics/0'))return coreStats(70,19.5);
    return clone(fixtures.duren.profile);
  };
  class Clock extends Date {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const context=vm.createContext({Date:Clock,Intl,Map,Set,Promise,URL,AbortController,setTimeout,clearTimeout,console,
    window:{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},
    fetch:async input=>{const url=new URL(input);calls.push(url);const data=await respond(url);
      return {ok:!data.httpStatus,status:data.httpStatus??200,json:async()=>data};},
  });
  function load(file){
    file=path.resolve(file);if(modules.has(file))return modules.get(file).exports;
    const loaded={exports:{}};modules.set(file,loaded);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename:file})(p=>load(path.resolve(path.dirname(file),p+'.ts')),loaded,loaded.exports);
    return loaded.exports;
  }
  const root=path.resolve(__dirname,'../src/lib/nba');
  return {espn:load(root+'/espn.ts'),store:load(root+'/store.ts'),calls,storage,
    setHandler:handler=>{const base=respond;respond=url=>handler(url,base);},advance:ms=>{time+=ms;},setTime:iso=>{time=Date.parse(iso);}};
}

test('season conversion rolls forward without hardcoded current years',()=>{
  const h=harness();assert.equal(h.espn.currentNbaSeasonYear(),2026);assert.equal(h.espn.espnSeasonYear(2026),2027);
  assert.equal(h.espn.currentNbaSeasonYear(new Date('2027-10-21T04:00Z')),2027);assert.equal(h.espn.espnSeasonYear(2027),2028);
});
test('overview requests ESPN ending year and tolerates object-shaped recent-event payload',async()=>{
  const h=harness();await h.espn.fetchAthleteOverview('4433621');
  assert.equal(h.calls[0].searchParams.get('season'),'2027');
});
test('captured opening-night game logs expose Duren and SGA 2026-27 stats without preseason contamination',async()=>{
  for(const [who,points] of [['duren',22],['shai',32]]){
    const h=harness();h.setHandler(()=>clone(fixtures[who].gameLog));
    const r=await h.espn.fetchAthleteSeasonGameLog(fixtures[who].espnId,2026);
    assert.equal(r.season.seasonLabel,'2026-27');assert.equal(r.season.gp,1);assert.equal(r.season.pts,points);
    assert.equal(r.recentGames.length,1);assert.equal(r.recentGames[0].date,'2026-10-21');
  }
});
test('profile inserts current season despite missing statisticslog entry and core 404, ignoring stale overview GP=70',async()=>{
  const h=harness();const p=await h.store.getPlayerProfile('4433621');
  assert.equal(p.currentSeasonYear,2026);assert.equal(p.currentSeason.label,'2026-27');assert.equal(p.currentSeason.gp,1);
  assert.equal(p.currentSeason.pts,22);assert.equal(p.currentSeasonStatus,'game-log');
  assert.equal(p.seasons[0].seasonYear,2026);assert.equal(p.seasons[1].seasonYear,2025);
  assert.ok(h.calls.some(u=>u.pathname.includes('/seasons/2027/types/2/athletes/4433621/statistics/0')));
});
test('official totals automatically supersede game-log fallback when published',async()=>{
  const h=harness();await h.store.getPlayerProfile('4433621');
  h.setHandler((url,base)=>url.pathname.includes('/seasons/2027/')?coreStats(1,23):base(url));
  const p=await h.store.getPlayerProfile('4433621',{force:true});
  assert.equal(p.currentSeasonStatus,'official');assert.equal(p.currentSeason.pts,23);
});
test('weighted shooting ratios use total makes/attempts and duplicate games do not count twice',async()=>{
  const h=harness();const data=clone(fixtures.duren.gameLog);const rows=data.seasonTypes[0].categories[0].events;
  rows.push(clone(rows[0]));const second=clone(rows[0]);second.eventId='second';
  second.stats[data.names.indexOf('fieldGoalsMade-fieldGoalsAttempted')]='1-1';
  rows.push(second);data.events.second={...data.events['401909088'],id:'second',gameDate:'2026-10-21T19:00Z'};
  h.setHandler(()=>data);const r=await h.espn.fetchAthleteSeasonGameLog('4433621',2026);
  assert.equal(r.season.gp,2);assert.equal(r.season.fgp,9/14);
});
test('fallback with more games supersedes an official summary that has not caught up',async()=>{
  const h=harness();const data=clone(fixtures.duren.gameLog);const second=clone(data.seasonTypes[0].categories[0].events[0]);second.eventId='second';
  data.seasonTypes[0].categories[0].events.push(second);data.events.second={...data.events['401909088'],id:'second'};
  h.setHandler((url,base)=>url.pathname.includes('/seasons/2027/')?coreStats(1,99):url.pathname.endsWith('/gamelog')?data:base(url));
  const p=await h.store.getPlayerProfile('4433621');assert.equal(p.currentSeason.gp,2);assert.equal(p.currentSeason.pts,22);assert.equal(p.currentSeasonStatus,'game-log');
});
test('empty current season is pending and previous season remains explicitly labeled',async()=>{
  const h=harness();h.setHandler((url,base)=>url.pathname.endsWith('/gamelog')?{...clone(fixtures.duren.gameLog),seasonTypes:[]}:base(url));
  const p=await h.store.getPlayerProfile('4433621');assert.equal(p.currentSeasonStatus,'pending');assert.equal(p.currentSeasonYear,2025);assert.equal(p.currentSeason.label,'2025-26');
});
test('current-season network errors remain errors, not zero games, and retain successful cached stats',async()=>{
  const h=harness();const first=await h.store.getPlayerProfile('4433621');
  h.advance(310000);h.setHandler((url,base)=>{if(url.pathname.includes('/seasons/2027/')||url.pathname.endsWith('/gamelog'))throw new Error('offline');return base(url);});
  const p=await h.store.getPlayerProfile('4433621');assert.ok(p.error);assert.equal(p.currentSeason.pts,22);
  const box=JSON.parse(h.storage.get('nba:player:v2:2026:4433621'));assert.equal(box.value.fetchedAt,first.fetchedAt);
});
test('current season refreshes every five minutes, history has an independent long cache, force bypasses',async()=>{
  const h=harness();const first=await h.store.getPlayerProfile('4433621');h.calls.length=0;
  const cached=await h.store.getPlayerProfile('4433621');assert.equal(cached.source,'cache');assert.equal(cached.fetchedAt,first.fetchedAt);assert.equal(h.calls.length,0);
  h.advance(300000);await h.store.getPlayerProfile('4433621');assert.ok(h.calls.some(u=>u.pathname.endsWith('/gamelog')));
  assert.ok(!h.calls.some(u=>u.pathname.endsWith('/statisticslog')));
  h.calls.length=0;await h.store.getPlayerProfile('4433621',{force:true});assert.ok(h.calls.some(u=>u.pathname.endsWith('/statisticslog')));
});

test('current postseason remains separate from regular season and also refreshes without the season index',async()=>{
  const h=harness();const data=clone(fixtures.duren.gameLog);const playoff=clone(data.seasonTypes[0]);
  playoff.displayName='2026-27 Postseason';playoff.categories[0].events[0].eventId='playoff';
  data.events.playoff={...data.events['401909088'],id:'playoff',gameDate:'2027-04-21T00:00Z'};
  data.seasonTypes.push(playoff);h.setHandler((url,base)=>url.pathname.endsWith('/gamelog')?data:base(url));
  const p=await h.store.getPlayerProfile('4433621');
  assert.equal(p.currentSeason.gp,1);const row=p.seasons.find(s=>s.seasonYear===2026&&s.seasonType==='playoffs');
  assert.equal(row.gp,1);assert.equal(row.provenance,'game-log');assert.equal(p.recentGames[0].detail,'Postseason');
});
test('upstream fallback to an older year cannot become current-season stats',async()=>{
  const h=harness();const data=clone(fixtures.duren.gameLog);data.filters[0].value='2026';
  h.setHandler((url,base)=>url.pathname.endsWith('/gamelog')?data:base(url));
  const p=await h.store.getPlayerProfile('4433621');assert.equal(p.currentSeasonStatus,'pending');assert.equal(p.currentSeasonYear,2025);
});
test('new season bypasses prior-season cache and probes the next ESPN year',async()=>{
  const h=harness();await h.store.getPlayerProfile('4433621');h.calls.length=0;h.setTime('2027-10-21T04:00Z');
  const data=clone(fixtures.duren.gameLog);data.filters[0].value='2028';
  for(const group of data.seasonTypes)group.displayName=group.displayName.replace('2026-27','2027-28');
  for(const event of Object.values(data.events))event.gameDate=event.gameDate.replace('2026','2027');
  h.setHandler((url,base)=>url.pathname.endsWith('/gamelog')?data:url.pathname.includes('/seasons/2028/')?{httpStatus:404}:base(url));
  const p=await h.store.getPlayerProfile('4433621');assert.equal(p.requestedSeasonYear,2027);assert.equal(p.currentSeasonYear,2027);
  assert.ok(h.calls.some(u=>u.searchParams.get('season')==='2028'));
});
