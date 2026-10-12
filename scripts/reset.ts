import {resolve} from 'node:path';import {Store} from '../src/store';
// 只重置本题 SQLite；执行前停止服务。不会连接生产环境。
const store=new Store(resolve(process.env.INTERVIEW_DB_PATH??'data/interview.sqlite'));store.reset();store.close();console.log('Local interview data reset');
