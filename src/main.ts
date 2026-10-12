import {resolve} from 'node:path';
import {createApp} from './server';
const {server,store}=createApp({dbPath:resolve(process.env.INTERVIEW_DB_PATH??'data/interview.sqlite'),tenantId:process.env.INTERVIEW_TENANT??'tenant-a',publicDir:resolve('public')});
server.listen(Number(process.env.PORT??4317),'127.0.0.1',()=>console.log('Interview: http://127.0.0.1:'+String(process.env.PORT??4317)));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>server.close(()=>{store.close();process.exit(0)}));
