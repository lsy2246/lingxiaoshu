import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createApp} from '../src/server';import {Store} from '../src/store';import {initialState} from '../src/fixtures';
import {readCurrentStudioSocialTask} from '../src/studioSocialTaskRead';
async function fixture(t:any){const dir=mkdtempSync(join(tmpdir(),'interview-test-'));const app=createApp({dbPath:join(dir,'test.sqlite'),tenantId:'tenant-a',publicDir:resolve('public')});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const addr=app.server.address();assert(addr&&typeof addr==='object');t.after(async()=>{await new Promise<void>(r=>app.server.close(()=>r()));app.store.close();rmSync(dir,{recursive:true,force:true})});return {...app,url:'http://127.0.0.1:'+addr.port};}
const body=(method:string,value:unknown)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
test('page and playable media are served by actual HTTP server',async t=>{const f=await fixture(t);for(const [path,type]of [['/','text/html'],['/app.js','text/javascript'],['/media/demo.mp4','video/mp4'],['/media/demo.wav','audio/wav']]){const r=await fetch(f.url+path);assert.equal(r.status,200);assert(r.headers.get('content-type')?.startsWith(type));assert((await r.arrayBuffer()).byteLength>100)}});
test('create, edit, execute, and second version persist through closing and reopening SQLite',async t=>{
 const f=await fixture(t);const created=await fetch(f.url+'/api/tasks',body('POST',{title:'Created from HTTP',tenantId:'tenant-b'}));assert.equal(created.status,201);const task=await created.json();assert.equal(task.tenantId,'tenant-a');
 const saved=await fetch(f.url+'/api/tasks/'+task.id+'/content',body('PUT',{narration:'保存后的口播',scenes:[{id:'s1',description:'保存后的分镜'}]}));assert.equal(saved.status,200);
 for(let i=0;i<2;i++){const r=await fetch(f.url+'/api/tasks/'+task.id+'/execute',body('POST',{mode:'success'}));assert.equal(r.status,200)}
 const state=f.store.read();const c=state.contents.find(c=>c.taskId===task.productionTaskId)!;assert.equal(c.narration,'保存后的口播');assert.equal(c.scenes[0].description,'保存后的分镜');assert.equal(c.artifacts.length,2);assert.notEqual(c.artifacts[0].runId,c.artifacts[1].runId);
 const dir=mkdtempSync(join(tmpdir(),'interview-reopen-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let store=new Store(join(dir,'db.sqlite'));store.update(s=>Object.assign(s,state));store.close();store=new Store(join(dir,'db.sqlite'));assert.deepEqual(store.read(),state);store.close();
});
test('execution outcomes are durable business records',async t=>{const f=await fixture(t);for(const [mode,status]of [['running','running'],['missing_authorization','waiting_external'],['failure','failed'],['success','succeeded']]){const r=await fetch(f.url+'/api/tasks/task-running/execute',body('POST',{mode}));assert.equal(r.status,200);const task=await r.json();assert.equal(task.status,status);assert.equal(f.store.read().tasks.find(t=>t.id==='task-running')!.status,status)}});
test('invalid writes and foreign writes do not mutate stored data',async t=>{const f=await fixture(t);const before=f.store.read();for(const [path,data,status]of [['/api/tasks',{title:''},400],['/api/tasks/task-running/content',{narration:3,scenes:[]},400],['/api/tasks/task-running/execute',{mode:'unexpected'},400],['/api/tasks/task-foreign/execute',{mode:'success'},404]] as const){const r=await fetch(f.url+path,body(path.endsWith('content')?'PUT':'POST',data));assert.equal(r.status,status)}assert.deepEqual(f.store.read(),before)});
test('detail reads are side effect free',async t=>{const f=await fixture(t);const before=f.store.read();for(let i=0;i<3;i++){const r=await fetch(f.url+'/api/tasks/task-done/production');assert.equal(r.status,200)}assert.deepEqual(f.store.read(),before)});
test('transaction failure rolls back; reset restores only fixture state',()=>{const dir=mkdtempSync(join(tmpdir(),'interview-rollback-'));const store=new Store(join(dir,'db.sqlite'));try{const before=store.read();assert.throws(()=>store.update(state=>{state.tasks=[];throw Error('simulated failure')}));assert.deepEqual(store.read(),before);store.update(state=>{state.tasks=[]});store.reset();assert.deepEqual(store.read(),initialState())}finally{store.close();rmSync(dir,{recursive:true,force:true})}});
test('provided stale-read guard rejects late task application',async()=>{let current=true,writes=0;let release!:(x:ReturnType<typeof initialState>['contents'][number])=>void;const promise=readCurrentStudioSocialTask('content-a',()=>new Promise(r=>release=r),()=>current,()=>writes++);current=false;release(initialState().contents[0]);await promise;assert.equal(writes,0)});
test('production reads enforce tenant, binding, and historical artifact identity',async t=>{
 const f=await fixture(t);
 const historical=await fetch(f.url+'/api/tasks/task-done/production');assert.equal(historical.status,200);
 const historicalBody=await historical.json();assert.equal(historicalBody.artifact.artifactId,'film-1');assert.equal(historicalBody.artifact.version,'v1');assert.equal(historicalBody.artifact.runId,'run-1');
 const unbound=await fetch(f.url+'/api/tasks/task-unbound/production');assert.equal(unbound.status,409);const unboundBody=await unbound.json();assert.equal(unboundBody.error,'production_not_bound');assert.match(unboundBody.message,/尚未绑定/);
 const foreign=await fetch(f.url+'/api/tasks/task-foreign/production');assert.equal(foreign.status,404);
});
test('task projection reflects real status and attention state',async t=>{
 const f=await fixture(t);const response=await fetch(f.url+'/api/tasks');assert.equal(response.status,200);const tasks=await response.json();
 assert.equal(tasks.find((task:any)=>task.id==='task-running').statusLabel,'执行中');
 const blocked=tasks.find((task:any)=>task.id==='task-blocked');assert.equal(blocked.statusLabel,'需要补充资料');assert.equal(blocked.needsAttention,true);
 assert.equal(tasks.find((task:any)=>task.id==='task-done').statusLabel,'已完成');
});
test('new pending tasks do not claim an execution run before execution',async t=>{
 const f=await fixture(t);const created=await fetch(f.url+'/api/tasks',body('POST',{title:'No run yet'}));assert.equal(created.status,201);const task=await created.json();assert.equal(task.runId,undefined);
 const executed=await fetch(f.url+'/api/tasks/'+task.id+'/execute',body('POST',{mode:'success'}));assert.equal(executed.status,200);const result=await executed.json();assert.match(result.runId,/^run-/);
});
test('projection keeps approval, cancellation, and unknown statuses explicit',async t=>{
 const f=await fixture(t);f.store.update(state=>{
  state.tasks.push(
   {id:'task-approval',tenantId:'tenant-a',title:'等待审批',status:'waiting_approval',createdAt:new Date().toISOString()},
   {id:'task-cancelled',tenantId:'tenant-a',title:'已取消',status:'cancelled',createdAt:new Date().toISOString()},
   {id:'task-unknown',tenantId:'tenant-a',title:'未知状态',status:'future_state',createdAt:new Date().toISOString()},
  );
 });
 const tasks=await (await fetch(f.url+'/api/tasks')).json();
 assert.equal(tasks.find((task:any)=>task.id==='task-approval').statusLabel,'等待审批');
 assert.equal(tasks.find((task:any)=>task.id==='task-cancelled').statusLabel,'已取消');
 assert.equal(tasks.find((task:any)=>task.id==='task-unknown').statusLabel,'未知状态');
});
test('missing media stays an explicit unavailable resource',async t=>{
 const f=await fixture(t);f.store.update(state=>{state.contents.find(content=>content.taskId==='content-a')!.artifacts[0].videoUrl='/media/missing.mp4'});
 const detail=await (await fetch(f.url+'/api/tasks/task-done/production')).json();assert.equal(detail.artifact.videoUrl,'/media/missing.mp4');
 const media=await fetch(f.url+detail.artifact.videoUrl);assert.equal(media.status,404);
 const appJs=await (await fetch(f.url+'/app.js')).text();assert.match(appJs,/视频文件暂不可用/);
});
