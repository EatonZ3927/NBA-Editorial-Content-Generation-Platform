const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(stores) {
  const persistent = stores?.persistent ?? new Map(), session = stores?.session ?? new Map(), events = new Map();
  const storage = map => ({getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k)});
  const window = {localStorage:storage(persistent),sessionStorage:storage(session),addEventListener:(name,handler)=>events.set(name,handler)};
  const module = {exports:{}};
  const source = fs.readFileSync('src/lib/copy/key-storage.ts','utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,window});
  return {...module.exports,persistent,session,window,events};
}
// All keys below are synthetic fixtures, never real credentials.
const longKey = 'sk-ws-test.' + 'abcDEF0123456789_-'.repeat(20) + '.signature';
test('long workspace key survives save/read unchanged, without any browser storage',()=>{
  const h=harness(); h.saveUserApiKey('  '+longKey+'\n');
  assert.equal(h.getUserApiKey(),longKey);
  assert.equal(h.persistent.size,0);
  assert.equal(h.session.size,0);
});
test('legacy local and session keys are removed and never used as fallback',()=>{
  const h=harness(); h.persistent.set('dashscope_api_key','sk-legacy-test-key');
  h.session.set('dashscope_api_key','sk-legacy-session-key');
  assert.equal(h.getUserApiKey(),''); assert.equal(h.persistent.size,0);assert.equal(h.session.size,0);
});
test('malformed or masked keys cannot replace a valid saved key',()=>{
  const h=harness(); h.saveUserApiKey(longKey);
  for(const value of ['','sk-short','sk-ws-abc def','sk-ws-abc\ndef','sk-************','sk-ws-中文密钥','Bearer '+longKey]) {
    assert.throws(()=>h.saveUserApiKey(value));
    assert.equal(h.getUserApiKey(),longKey);
  }
});
test('old key format still accepted',()=>{
  const h=harness();h.saveUserApiKey('sk-synthetic-old-key-123456');assert.equal(h.getUserApiKey(),'sk-synthetic-old-key-123456');
});
test('clear removes both legacy and session credentials',()=>{
  const h=harness();h.saveUserApiKey(longKey);h.persistent.set('dashscope_api_key','old');h.clearUserApiKey();
  assert.equal(h.session.size,0);assert.equal(h.persistent.size,0);assert.equal(h.getUserApiKey(),'');
});
test('memory key works without writing to browser storage',()=>{
  const h=harness(); h.window.sessionStorage.setItem=()=>{throw new Error('blocked');};
  h.saveUserApiKey(longKey);assert.equal(h.getUserApiKey(),longKey);assert.equal(h.persistent.size,0);assert.equal(h.session.size,0);
});
test('fresh page after reload or close cannot restore the key from shared stores',()=>{
  const h=harness();h.saveUserApiKey(longKey);
  const fresh=harness(h);assert.equal(fresh.getUserApiKey(),'');
});
test('pagehide clears the key even when the document enters back-forward cache',()=>{
  const h=harness();h.saveUserApiKey(longKey);h.events.get('pagehide')({persisted:true});
  assert.equal(h.getUserApiKey(),'');
});

test('generation passes the entire workspace key in the header and parses a valid result',async()=>{
  const h=harness();h.saveUserApiKey(longKey);
  const module={exports:{}}; let request;
  const engine={TEMPLATES:[],TONES:[],LENGTHS:[],collectDataPoints:()=>[],summarizeSource:()=>'',buildTags:()=>[]};
  const source=fs.readFileSync('src/lib/copy/ai.ts','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{
    module,exports:module.exports,require:name=>{assert.equal(name,'./engine');return engine;},
    process:{env:{NEXT_PUBLIC_OPENAI_API_KEY:'sk-synthetic-public-secret-never-use'}},
    AbortController,setTimeout,clearTimeout,
    fetch:async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({title:'测试标题',body:'测试正文',tags:['NBA']})}}]})};},
  });
  assert.equal(module.exports.isAiConfigured(),false);
  const result=await module.exports.generateCopyWithAi({userApiKey:h.getUserApiKey(),template:'game-recap',tone:'brief',length:'short',ctx:{}});
  assert.equal(request.headers.Authorization,'Bearer '+longKey);
  assert.equal(request.url,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(request.url.includes(longKey),false);assert.equal(request.body.includes(longKey),false);
  assert.equal(result.generatedBy,'ai');assert.equal(result.body,'测试正文');
});
