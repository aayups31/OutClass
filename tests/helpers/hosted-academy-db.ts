import {PGlite} from "@electric-sql/pglite";
import type {Pool} from "pg";
import {readFile} from "node:fs/promises";
/** Real PostgreSQL semantics and production RLS, in memory with no accounts or production writes. */
export async function hostedAcademyDatabase(){
  const db=new PGlite();
  try{
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE outclass_api NOLOGIN NOBYPASSRLS;");
    for(const file of ["academy-schema.sql","academy-media-schema.sql","academy-assessment-schema.sql","academy-content-schema.sql","academy-transfer-schema.sql"])await db.exec(await readFile(`services/ai/${file}`,"utf8"));
    await db.exec("SET ROLE outclass_api");
  }catch(error){await db.close();throw error;}
  let available=Promise.resolve();
  const pool={connect:async()=>{
    const previous=available;let unlock!:()=>void;
    available=new Promise<void>(resolve=>{unlock=resolve;});await previous;
    let released=false;
    return {query:async(sql:string,params?:unknown[])=>{const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows};},release:()=>{if(!released){released=true;unlock();}}};
  }} as unknown as Pool;
  return {db,pool,close:async()=>{await available;await db.close();}};
}
