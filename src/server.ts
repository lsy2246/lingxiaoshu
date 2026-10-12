import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {Store} from './store';
import {projectTask} from './projection';
import {productionDetail} from './production';
import {execute,executionModes,type ExecutionMode} from './executor';
/** 当前身份来自服务端启动配置，不能由 URL/body 修改。无需实现 OAuth；测试时可启动 tenant-b 实例。 */
export function createApp(options:{dbPath:string;tenantId:string;publicDir:string}){
 const store=new Store(options.dbPath);
 const server=createServer(async(req,res)=>{
  const send=(status:number,body:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body))};
  try{
   const url=new URL(req.url??'/','http://localhost');const path=url.pathname;
   if(req.method==='GET'&&!path.startsWith('/api/')){
    const files:Record<string,string>={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/media/demo.mp4':'media/demo.mp4','/media/demo.wav':'media/demo.wav'};
    const file=files[path];if(!file)return send(404,{error:'not_found'});
    const type=file.endsWith('.mp4')?'video/mp4':file.endsWith('.wav')?'audio/wav':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8';
    const data=await readFile(resolve(options.publicDir,file));res.writeHead(200,{'Content-Type':type,'Content-Length':data.length});res.end(data);return;
   }
   if(req.method==='GET'&&path==='/api/session')return send(200,{tenantId:options.tenantId});
   if(req.method==='GET'&&path==='/api/tasks')return send(200,store.read().tasks.filter(t=>t.tenantId===options.tenantId).map(projectTask));
   const readBody=async()=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Error('body_too_large')}return JSON.parse(raw||'{}') as Record<string,unknown>};
   if(req.method==='POST'&&path==='/api/tasks'){
    const body=await readBody();if(typeof body.title!=='string'||!body.title.trim()||body.title.length>200)return send(400,{error:'title_required'});
    const task=store.update(state=>{const id='task-'+randomUUID();const contentId='content-'+randomUUID();const runId='run-'+randomUUID();const task={id,tenantId:options.tenantId,title:(body.title as string).trim(),status:'pending',productionTaskId:contentId,runId,createdAt:new Date().toISOString()};state.tasks.push(task);state.contents.push({taskId:contentId,tenantId:options.tenantId,version:'v1',runId,sources:[],artifacts:[],scenes:[{id:'scene-'+randomUUID(),description:'新任务默认分镜',mediaUrl:'/media/demo.mp4'}],narration:'请编辑口播'});return task});return send(201,task);
   }
   const match=path.match(/^\/api\/tasks\/([^/]+)\/(production|execute|content)$/);
   if(!match)return send(404,{error:'not_found'});
   const taskId=decodeURIComponent(match[1]);const action=match[2];const task=store.read().tasks.find(t=>t.id===taskId);
   if(!task)return send(404,{error:'task_not_found'});
   if(req.method==='GET'&&action==='production'){
    // 考题：可控延迟用于复现浏览器快速切换时的旧请求覆盖。身份及绑定校验需要补齐。
    const delay=Math.min(2000,Math.max(0,Number(url.searchParams.get('delayMs'))||0));if(delay)await new Promise(r=>setTimeout(r,delay));
    return send(200,productionDetail(store.read(),task));
   }
   // 写接口有组织边界；候选人需要让读接口达到同等保障。
   if(task.tenantId!==options.tenantId)return send(404,{error:'task_not_found'});
   if(req.method==='POST'&&action==='execute'){
    const body=await readBody();if(!executionModes.includes(body.mode as ExecutionMode))return send(400,{error:'invalid_mode'});
    const result=store.update(state=>{const fresh=state.tasks.find(t=>t.id===taskId)!;execute(state,fresh,body.mode as ExecutionMode);return fresh});return send(200,result);
   }
   if(req.method==='PUT'&&action==='content'){
    const body=await readBody();if(typeof body.narration!=='string'||body.narration.length>10000||!Array.isArray(body.scenes)||body.scenes.length>50||body.scenes.some(s=>!s||typeof s.id!=='string'||typeof s.description!=='string'||s.description.length>2000))return send(400,{error:'invalid_content'});
    const content=store.update(state=>{const c=state.contents.find(c=>c.taskId===task.productionTaskId&&c.tenantId===options.tenantId);if(!c)throw Error('production_not_bound');c.narration=body.narration as string;c.scenes=(body.scenes as {id:string;description:string}[]).map(s=>({id:s.id,description:s.description,mediaUrl:'/media/demo.mp4'}));return c});return send(200,content);
   }
   send(405,{error:'method_not_allowed'});
  }catch(e){console.error(JSON.stringify({event:'request_failed',path:req.url,error:e instanceof Error?e.message:'unknown'}));send(e instanceof SyntaxError?400:500,{error:e instanceof SyntaxError?'invalid_json':'request_failed'})}
 });return {server,store};
}
