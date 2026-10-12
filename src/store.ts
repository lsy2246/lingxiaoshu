import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {State} from './contracts';
import {initialState} from './fixtures';
/** 本地真实 SQLite 持久化，不是内存假保存。每次变更在事务中读改写；仅面试单进程使用。 */
export class Store {
 private db:DatabaseSync;
 constructor(path:string){mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');if(!this.db.prepare('SELECT id FROM state WHERE id=1').get())this.write(initialState());}
 read():State{return JSON.parse((this.db.prepare('SELECT payload FROM state WHERE id=1').get() as {payload:string}).payload)}
 private write(state:State){this.db.prepare('INSERT OR REPLACE INTO state(id,payload) VALUES(1,?)').run(JSON.stringify(state))}
 update<T>(action:(state:State)=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const state=this.read();const result=action(state);this.write(state);this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
 reset(){this.write(initialState())} close(){this.db.close()}
}
