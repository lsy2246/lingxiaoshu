// 真正的浏览器 fetch → 后端 → SQLite 链路。此页面保留待修的异步和错误反馈缺口。
const $=id=>document.getElementById(id);let selected=null;
async function api(path,options){const r=await fetch(path,options);const body=await r.json();if(!r.ok)throw Error(body.error??'请求失败');return body}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function text(tag,value){const el=document.createElement(tag);el.textContent=value;return el}
async function refresh(){const tasks=await api('/api/tasks');$('cards').replaceChildren();for(const task of tasks){const card=text('article','');card.className='card';card.append(text('h3',task.title),text('p',task.statusLabel));const open=text('button','打开生产详情');open.onclick=()=>openTask(task.id);card.append(open);$('cards').append(card)}}
async function openTask(id){
 selected=id;
 // 考题缺口 D：慢请求回来时可能覆盖另一个任务。?delayMs=1500 可稳定复现，非生成延迟。
 const delay=id==='task-running'?(new URLSearchParams(location.search).get('delayMs')??'0'):'0';
 const view=await api('/api/tasks/'+encodeURIComponent(id)+'/production?delayMs='+encodeURIComponent(delay));
 const root=$('detail');root.replaceChildren(text('h2',view.task.title),text('p','状态：'+view.task.status),text('code','任务 '+view.task.id+' / 运行 '+view.task.runId));
 if(view.task.blocked_reason)root.append(text('p','受阻：'+view.task.blocked_reason));
 const modes=document.createElement('select');for(const [value,label]of [['running','开始执行'],['missing_authorization','模拟缺授权'],['failure','模拟失败'],['success','完成并产生新版本']]){const option=text('option',label);option.value=value;modes.append(option)}
 const execute=text('button','执行');execute.onclick=async()=>{await api('/api/tasks/'+encodeURIComponent(id)+'/execute',json('POST',{mode:modes.value}));await refresh();await openTask(id)};root.append(modes,execute);
 const narration=document.createElement('textarea');narration.value=view.content.narration;root.append(text('h3','口播文本'),narration);
 const sceneInputs=view.content.scenes.map(scene=>{const input=document.createElement('textarea');input.value=scene.description;root.append(text('h3','分镜 '+scene.id),input);return {scene,input}});
 const save=text('button','保存修改');save.onclick=async()=>{await api('/api/tasks/'+encodeURIComponent(id)+'/content',json('PUT',{narration:narration.value,scenes:sceneInputs.map(({scene,input})=>({id:scene.id,description:input.value}))}));$('message').textContent='已保存，请刷新或重启验证'};root.append(save);
 if(view.artifact){root.append(text('h3','成片 '+view.artifact.artifactId+' / '+view.artifact.version));const video=document.createElement('video');video.controls=true;video.src=view.artifact.videoUrl;const audio=document.createElement('audio');audio.controls=true;audio.src=view.artifact.audioUrl;root.append(video,audio)}else root.append(text('p','尚无成片'));
 const back=text('button','返回看板');back.onclick=()=>{$('detail').replaceChildren(text('p','请选择任务卡'));selected=null};root.append(back);
}
$('create').onsubmit=async event=>{event.preventDefault();try{await api('/api/tasks',json('POST',{title:$('title').value}));await refresh()}catch(e){$('message').textContent=e.message}};
$('refresh').onclick=refresh;refresh().catch(e=>$('message').textContent=e.message);
