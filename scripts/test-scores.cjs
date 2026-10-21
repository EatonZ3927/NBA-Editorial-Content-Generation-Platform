/* Exercise the real TypeScript data path with deterministic clock/network/storage. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function harness(now = '2026-10-15T02:00:00Z') {
  const storage = new Map(), modules = new Map(), calls = [];
  let time = Date.parse(now), handler = () => ({ events: [] });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const context = vm.createContext({ Date: Clock, Intl, Map, Set, Promise, URL, AbortController,
    setTimeout, clearTimeout, console,
    window: { localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) } },
    fetch: async url => {
      calls.push(url);
      return { ok: true, json: async () => handler(new URL(url)) };
    },
  });
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const loaded = { exports: {} }; modules.set(file, loaded);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInContext('(function(require,module,exports){' + code + '\n})', context, { filename: file })(
      p => load(path.resolve(path.dirname(file), p + '.ts')), loaded, loaded.exports);
    return loaded.exports;
  }
  const root = path.resolve(__dirname, '../src/lib/nba');
  return { dates: load(root + '/dates.ts'), espn: load(root + '/espn.ts'), store: load(root + '/store.ts'),
    calls, storage, respond: fn => { handler = fn; }, advance: ms => { time += ms; },
    seed: (key, value, age = 0) => storage.set(key, JSON.stringify({at: time-age, value})),
  };
}
function event(id, date, state = 'post') {
  return { id, date, status: {type:{state,completed:state==='post'}}, competitions: [{ competitors: [
    { homeAway:'away', score:'90', team:{abbreviation:'BKN'} },
    { homeAway:'home', score:'100', team:{abbreviation:'MIA'} },
  ] }] };
}
function summary(state = 'post', complete = false) {
  const e = event('1','2026-10-15T00:00Z',state);
  return { header:{id:'1', competitions:[{...e.competitions[0],date:e.date,status:e.status,competitors:e.competitions[0].competitors.map(c=>({...c,linescores:complete?[{value:25},{value:25},{value:25},{value:25}]:[]}))}]},
    boxscore: complete ? {players:['BKN','MIA'].map(abbr=>({team:{abbreviation:abbr},statistics:[{
      labels:['MIN','PTS'],athletes:[{athlete:{id:abbr},stats:['20:30','10']}],
    }]})),teams:['BKN','MIA'].map(abbr=>({team:{abbreviation:abbr},statistics:[{name:'assists',displayValue:'20'}]}))} : {},
  };
}

test('Beijing midnight and invalid calendar dates', () => {
  const h=harness('2026-10-14T16:30:00Z');
  assert.equal(h.dates.todayIso(),'2026-10-15');
  assert.equal(h.dates.normalizeDate('2026-02-30'),'2026-10-15');
  assert.match(h.dates.timeZh('2026-10-14T23:30Z'),/10-15 07:30.*北京/);
});
test('Beijing day merges adjacent source days, filters, deduplicates and respects homeAway',async()=>{
  const h=harness();
  h.respond(()=>({events:[event('1','2026-10-14T23:30Z'),event('2','2026-10-15T00:00Z'),event('3','2026-10-15T18:00Z')]}));
  const games=await h.espn.fetchScoreboard('2026-10-15');
  assert.equal(games.length,2); assert.equal(games[0].gameDate,'2026-10-15');
  assert.equal(games[0].home.abbr,'MIA'); assert.equal(games[0].away.abbr,'BKN');
  assert.deepEqual([...new Set(h.calls.map(u=>new URL(u).searchParams.get('dates')))].sort(),['20261014','20261015']);
});
test('previous-day live cache expires, cache hits retain real timestamp; force bypasses cache',async()=>{
  const h=harness();
  h.respond(()=>({events:[event('1','2026-10-14T00:00Z','in')]}));
  const first=await h.store.getScoreboard('2026-10-14');
  h.advance(6*3600000);h.calls.length=0;
  const updated=await h.store.getScoreboard('2026-10-14');
  assert.ok(h.calls.length>0); assert.notEqual(updated.fetchedAt,first.fetchedAt);
  h.advance(1000);h.calls.length=0;
  assert.equal((await h.store.getScoreboard('2026-10-14')).fetchedAt,updated.fetchedAt);
  assert.equal(h.calls.length,0);
  await h.store.getScoreboard('2026-10-14',{force:true}); assert.ok(h.calls.length>0);
});
test('valid empty day and network failure differ; stale fallback preserves fetch time',async()=>{
  const h=harness();
  const empty=await h.store.getScoreboard('2026-10-15');
  assert.equal(empty.source,'live'); assert.equal(empty.error,undefined);
  h.respond(()=>{throw new Error('offline');});
  const failed=await h.store.getScoreboard('2026-10-15',{force:true});
  assert.ok(failed.error); assert.equal(failed.stale,true); assert.equal(failed.fetchedAt,empty.fetchedAt);
  const noCache=await h.store.getScoreboard('2026-10-16');
  assert.equal(noCache.source,'offline'); assert.equal(noCache.fetchedAt,null);
});
test('one failed adjacent day cannot masquerade as a complete empty board',async()=>{
  const h=harness();h.respond(url=>{if(url.searchParams.get('dates')==='20261014')throw new Error('offline');return {events:[]};});
  const r=await h.store.getScoreboard('2026-10-15');assert.ok(r.error);assert.equal(r.source,'offline');
});
test('recent board uses bounded single-day requests and actual Beijing date',async()=>{
  const h=harness();h.respond(url=>({events:url.searchParams.get('dates')==='20261013'?[event('1','2026-10-13T23:30Z')]:[]}));
  const r=await h.store.getRecentBoard();assert.equal(r.date,'2026-10-14');
  assert.ok(h.calls.every(u=>!new URL(u).searchParams.get('dates').includes('-')));
});
test('incomplete final detail retries after short TTL and invalid payload is rejected',async()=>{
  const h=harness();h.respond(()=>summary());
  const first=await h.store.getGameDetail('1');assert.equal(first.incomplete,true);
  h.advance(61000);h.calls.length=0;h.respond(()=>summary('post',true));
  const full=await h.store.getGameDetail('1');assert.ok(h.calls.length>0);assert.equal(full.incomplete,false);
  assert.equal(full.detail.gameDate,'2026-10-15');assert.equal(full.detail.home.players[0].minutes,20.5);
  h.respond(()=>({}));const bad=await h.store.getGameDetail('bad');assert.equal(bad.detail,null);assert.ok(bad.error);
});

test('Beijing day boundaries include midnight and exclude next midnight in winter and summer',async()=>{
  for (const day of ['2026-01-15','2026-07-15']) {
    const h=harness(day+'T02:00:00Z');
    const start=Date.parse(day+'T00:00:00+08:00');
    h.respond(()=>({events:[event('before',new Date(start-1).toISOString()),event('start',new Date(start).toISOString()),
      event('last',new Date(start+86400000-1).toISOString()),event('next',new Date(start+86400000).toISOString())]}));
    const games=await h.espn.fetchScoreboard(day);
    assert.deepEqual(Array.from(games,g=>g.id),['start','last']);
  }
});
test('concurrent subscribers share the same upstream requests',async()=>{
  const h=harness();h.respond(()=>({events:[event('1','2026-10-15T00:00Z')]}));
  const [a,b]=await Promise.all([h.store.getScoreboard('2026-10-15'),h.store.getScoreboard('2026-10-15')]);
  assert.equal(a.games[0].id,b.games[0].id);assert.equal(h.calls.length,2);
});
test('old UTC caches cannot contaminate Beijing results',async()=>{
  const h=harness();h.seed('nba:games:2026-10-15',[{id:'old'}]);
  const r=await h.store.getScoreboard('2026-10-15');assert.equal(r.source,'live');assert.equal(r.games.length,0);
});
test('malformed scoreboard is an error, not an empty successful day',async()=>{
  const h=harness();h.respond(()=>({}));
  const r=await h.store.getScoreboard('2026-10-15');assert.equal(r.source,'offline');assert.ok(r.error);
});
test('offseason fallback locates older games from the single-day calendar within a fixed request bound',async()=>{
  const h=harness();h.respond(url=>({
    events:url.searchParams.get('dates')==='20260622'?[event('final','2026-06-23T00:00Z')]:[],
    leagues:[{calendarType:'day',calendar:['2026-06-22T07:00Z']}],
  }));
  const r=await h.store.getRecentBoard();assert.equal(r.date,'2026-06-23');assert.equal(r.games[0].id,'final');
  assert.ok(h.calls.length<=17);assert.ok(h.calls.every(u=>!new URL(u).searchParams.get('dates').includes('-')));
});
test('complete older finals use long cache, incomplete older finals remain short-lived',async()=>{
  const h=harness('2026-10-20T02:00Z');h.respond(()=>summary('post',true));
  const a=await h.store.getGameDetail('1');h.advance(3600000);h.calls.length=0;
  const b=await h.store.getGameDetail('1');assert.equal(h.calls.length,0);assert.equal(b.fetchedAt,a.fetchedAt);
  h.respond(()=>summary());await h.store.getGameDetail('1',{force:true});
  h.advance(61000);h.calls.length=0;await h.store.getGameDetail('1');assert.equal(h.calls.length,1);
});

// Run the actual hook effect with controlled browser events/timers. React state is
// observed at its boundary; network completion and cleanup remain asynchronous.
function pollingHarness(load, delay) {
  const timers=new Map(), events=new Map(), updates=[];
  let cleanup, nextId=0;
  const doc={hidden:false,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
  const react={useState:()=>[null,v=>updates.push(v)],useRef:()=>({current:null}),useCallback:fn=>fn,
    useEffect:fn=>{cleanup=fn();}};
  const context=vm.createContext({Promise,document:doc,window:doc,
    setTimeout:(fn,ms)=>{const id=++nextId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const file=path.resolve(__dirname,'../src/lib/nba/useLiveResult.ts');
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};
  vm.runInContext('(function(require,module,exports){'+code+'\n})',context)(()=>react,loaded,loaded.exports);
  const hook=loaded.exports.useLiveResult('test',load,delay);
  return {timers,events,updates,doc,refresh:hook.refresh,stop:()=>cleanup(),
    tick:()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();}};
}
async function flush() { for(let i=0;i<15;i++) await Promise.resolve(); }

test('live page polls at 30 seconds, manual refresh bypasses cache, returning online forces refresh',async()=>{
  const calls=[];const h=pollingHarness(async force=>{calls.push(force);return {};},()=>30000);
  await flush();assert.deepEqual(calls,[false]);assert.equal([...h.timers.values()][0].ms,30000);
  h.tick();await flush();assert.deepEqual(calls,[false,false]);
  h.refresh();await flush();assert.equal(calls.at(-1),true);
  h.events.get('online')();await flush();assert.equal(calls.length,4);assert.equal(calls.at(-1),true);
  h.stop();assert.equal(h.timers.size,0);assert.equal(h.events.size,0);
});
test('incomplete statistics stop after five retries and manual refresh restarts them',async()=>{
  let calls=0;const h=pollingHarness(async()=>{calls++;return {incomplete:true};},()=>60000);
  await flush();for(let i=0;i<5;i++){h.tick();await flush();}
  assert.equal(calls,6);assert.equal(h.timers.size,0);
  h.refresh();await flush();assert.equal(calls,7);assert.equal(h.timers.size,1);h.stop();
});
test('hidden page pauses polling and ignores late responses after leaving',async()=>{
  let calls=0;const h=pollingHarness(async()=>{calls++;return {};},()=>30000);
  await flush();h.doc.hidden=true;h.tick();await flush();assert.equal(calls,1);
  h.doc.hidden=false;h.events.get('visibilitychange')();await flush();assert.equal(calls,2);h.stop();
  let resolve;const late=pollingHarness(()=>new Promise(done=>{resolve=done;}),()=>30000);
  await flush();late.stop();const before=late.updates.length;resolve({});await flush();
  assert.equal(late.updates.length,before);assert.equal(late.timers.size,0);
});

if (process.env.NBA_REPLAY_DIR) {
  test('captured ESPN responses preserve all seven Beijing morning games',async()=>{
    const h=harness();const folder=process.env.NBA_REPLAY_DIR;
    h.respond(url=>JSON.parse(fs.readFileSync(path.join(folder,url.searchParams.has('event')?'summary.json':url.searchParams.get('dates')+'.json'))));
    const r=await h.store.getScoreboard('2026-10-15');assert.equal(r.source,'live');assert.equal(r.games.length,7);
    assert.ok(r.games.every(g=>g.gameDate==='2026-10-15'));
    const detail=await h.store.getGameDetail('401898404');assert.equal(detail.source,'live');assert.equal(detail.incomplete,false);
    assert.equal(detail.detail.home.abbr,'MIA');assert.equal(detail.detail.away.abbr,'BKN');
    console.log('ESPN replay:',r.games.length,'games;',detail.detail.home.players.length,'home players;',detail.detail.away.players.length,'away players');
  });
}
