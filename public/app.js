// Browser fetch -> backend -> SQLite, with stale-response and error guards.
const $=id=>document.getElementById(id);let selected=null;let detailRequest=0;
async function api(path,options){const r=await fetch(path,options);const body=await r.json();if(!r.ok)throw Error(body.message??body.error??'请求失败');return body}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el}
function message(value,kind='error'){$('message').textContent=value;$('message').className=kind}
async function refresh(){
 try{
  const tasks=await api('/api/tasks');$('cards').replaceChildren();
  for(const task of tasks){
   const card=text('article','');card.className='card';card.append(text('h3',task.title),text('p','状态：'+task.statusLabel));
   if(task.needsAttention)card.append(text('p','需要处理'+(task.blocked_reason?'：'+task.blocked_reason:'')));
   const open=text('button','打开生产详情');open.onclick=()=>openTask(task.id);card.append(open);$('cards').append(card);
  }
  message('看板已刷新','success');
 }catch(e){message(e instanceof Error?e.message:'刷新失败')}
}
async function openTask(id){
 const requestId=++detailRequest;selected=id;const root=$('detail');root.replaceChildren(text('p','正在加载生产详情…'));
 const delay=id==='task-running'?(new URLSearchParams(location.search).get('delayMs')??'0'):'0';
 try{
  const view=await api('/api/tasks/'+encodeURIComponent(id)+'/production?delayMs='+encodeURIComponent(delay));
  if(requestId!==detailRequest||selected!==id)return;
  root.replaceChildren(text('h2',view.task.title),text('p','状态：'+view.task.status),text('code','任务 '+view.task.id+' / 运行 '+(view.task.runId??'尚未执行')));
  if(view.task.blocked_reason)root.append(text('p','受阻：'+view.task.blocked_reason));
  const modes=document.createElement('select');for(const [value,label]of [['running','开始执行'],['missing_authorization','模拟缺授权'],['failure','模拟失败'],['success','完成并产生新版本']]){const option=text('option',label);option.value=value;modes.append(option)}
  const executeButton=text('button','执行');executeButton.onclick=async()=>{try{executeButton.disabled=true;await api('/api/tasks/'+encodeURIComponent(id)+'/execute',json('POST',{mode:modes.value}));message('执行结果已保存','success');await refresh();await openTask(id)}catch(e){message(e instanceof Error?e.message:'执行失败')}finally{executeButton.disabled=false}};root.append(modes,executeButton);
  const narration=document.createElement('textarea');narration.value=view.content.narration;root.append(text('h3','口播文本'),narration);
  const sceneInputs=view.content.scenes.map(scene=>{const input=document.createElement('textarea');input.value=scene.description;root.append(text('h3','分镜 '+scene.id),input);return {scene,input}});
  const save=text('button','保存修改');save.onclick=async()=>{try{save.disabled=true;await api('/api/tasks/'+encodeURIComponent(id)+'/content',json('PUT',{narration:narration.value,scenes:sceneInputs.map(({scene,input})=>({id:scene.id,description:input.value}))}));message('修改已保存','success')}catch(e){message(e instanceof Error?e.message:'保存失败')}finally{save.disabled=false}};root.append(save);
  if(view.artifact){root.append(text('h3','成片 '+view.artifact.artifactId+' / '+view.artifact.version));const video=document.createElement('video');video.controls=true;video.src=view.artifact.videoUrl;const audio=document.createElement('audio');audio.controls=true;audio.src=view.artifact.audioUrl;root.append(video,audio)}else root.append(text('p','尚无成片'));
  const back=text('button','返回看板');back.onclick=()=>{detailRequest++;root.replaceChildren(text('p','请选择任务卡'));selected=null};root.append(back);
 }catch(e){if(requestId!==detailRequest||selected!==id)return;root.replaceChildren(text('h2','无法打开生产详情'),text('p',e instanceof Error?e.message:'请求失败'));message(e instanceof Error?e.message:'打开详情失败')}
}
$('create').onsubmit=async event=>{event.preventDefault();try{await api('/api/tasks',json('POST',{title:$('title').value}));message('任务已创建','success');await refresh()}catch(e){message(e instanceof Error?e.message:'创建失败')}};
$('refresh').onclick=refresh;refresh();
