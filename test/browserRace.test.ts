import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as vm from 'node:vm';

class FakeElement {
 children:FakeElement[]=[];
 textContent=''; value=''; className=''; disabled=false; controls=false; src='';
 onclick:(()=>void)|undefined; onsubmit:((event:unknown)=>void)|undefined; onerror:(()=>void)|undefined;
 constructor(public tagName:string){}
 append(...nodes:FakeElement[]){this.children.push(...nodes)}
 replaceChildren(...nodes:FakeElement[]){this.children=nodes}
}

test('browser ignores a late production response after task selection changes',async()=>{
 const elements=new Map<string,FakeElement>(['create','refresh','cards','detail','message','title'].map(id=>[id,new FakeElement(id)]));
 const document={getElementById:(id:string)=>elements.get(id)!,createElement:(tagName:string)=>new FakeElement(tagName)};
 const response=(body:unknown)=>({ok:true,json:async()=>body});
 const task=(id:string,title:string)=>({id,tenantId:'tenant-a',title,status:'running',runId:'run-1'});
 const payloads:Record<string,unknown>={
  'task-running':{task:task('task-running','视频制作'),content:{narration:'',scenes:[]},artifact:null},
  'task-done':{task:{...task('task-done','历史成片交付'),status:'succeeded'},content:{narration:'',scenes:[]},artifact:null},
 };
 const fetch=async(path:string)=>{
  if(path==='/api/tasks')return response(Object.values(payloads).map((item:any)=>item.task));
  const id=new URL(path,'http://localhost').pathname.split('/')[3]!;
  if(id==='task-running')await new Promise(resolve=>setTimeout(resolve,25));
  return response(payloads[id]);
 };
 const context:Record<string,any>={document,fetch,location:{search:'?delayMs=25'},URLSearchParams,URL,encodeURIComponent,setTimeout,Error,console};
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInNewContext(`${source}\n;globalThis.__openTask=openTask;`,context);
 await Promise.all([context.__openTask('task-running'),context.__openTask('task-done')]);
 assert.equal(elements.get('detail')!.children[0]!.textContent,'历史成片交付');
});
