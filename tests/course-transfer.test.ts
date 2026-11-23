import {it,expect} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {hostedAcademyDatabase} from "./helpers/hosted-academy-db";
import {HostedAcademy} from "../services/ai/academy";
import {HostedAcademyTransfer} from "../services/ai/academy-transfer";
import {Application} from "../src/server/application";
import {Store} from "../src/server/store";
import {Expansion} from "../src/server/expansion";
import {AcademyStudio} from "../src/server/academy-studio";
import {contentHash} from "../src/course-integrity";

it("resumes publication and single-use-grant downloads above the host payload limit without losing or truncating lessons",async()=>{
  const database=await hostedAcademyDatabase(),service=new HostedAcademy(database.pool),transfers=new HostedAcademyTransfer(service),directory=await mkdtemp(path.join(tmpdir(),"outclass-large-transfer-")),authorStore=new Store(path.join(directory,"author")),learnerStore=new Store(path.join(directory,"learner")),author=new Application(authorStore),learner=new Application(learnerStore),authorId=randomUUID(),learnerId=randomUUID(),expansion=new Expansion(author);
  try{
    const course={title:"Large original transport fixture",audience:"Synthetic engineering check",outcome:"Preserve Unicode and every lesson",rightsConfirmed:true,lessons:Array.from({length:80},(_,index)=>({title:`Lesson ${index+1}`,objective:"Preserve this lesson exactly",practice:"Compare the restored source",content:"λ".repeat(35000)}))};
    expect(Buffer.byteLength(JSON.stringify(course))).toBeGreaterThan(4500000);
    const saved=expansion.saveCourse({...course,expectedRevision:0}),studio=new AcademyStudio(author,expansion),audit=studio.audit(saved.id);
    studio.review(saved.id,{expectedRevision:saved.revision,hash:audit.hash,acknowledged:audit.findings.filter(f=>f.level==="review").map(f=>f.id),approve:true});const release=studio.release(saved.id,{expectedRevision:saved.revision,reviewHash:audit.hash,approve:true});
    let interruptUpload=true;const requests:number[]=[];
    author.ai.platform=(async(route:string,body:any)=>{
      if(body)requests.push(Buffer.byteLength(JSON.stringify(body)));
      if(route==="transfers")return transfers.begin(authorId,body);
      const match=/^transfers\/([^/]+)\/(chunk|publish)$/.exec(route);
      if(match){if(match[2]==="chunk"){if(interruptUpload && body.position===2){interruptUpload=false;throw Error("Synthetic dropped upload connection");}return transfers.chunk(authorId,match[1],body);}return transfers.publish(authorId,match[1]);}
      throw Error(`Unexpected route ${route}`);
    }) as typeof author.ai.platform;
    await expect(expansion.publishHosted(release.id)).rejects.toThrow(/dropped upload/);
    expect((await expansion.publishHosted(release.id) as any).id).toBe(release.id);
    expect(Math.max(...requests)).toBeLessThan(350000);
    await service.enroll(learnerId,release.id);const grant=await service.grant(learnerId,release.id,0);let redeems=0,interruptDownload=true;
    learner.ai.platform=(async(route:string,body:any)=>{
      if(route==="redeem"){redeems++;return service.redeem(learnerId,body.grant);}
      const match=/^courses\/([^/]+)\/lessons\/(\d+)\/chunks\/(\d+)$/.exec(route);
      if(match){if(interruptDownload && match[2]==="1"){interruptDownload=false;throw Error("Synthetic dropped lesson connection");}const result=await service.lessonChunk(learnerId,match[1],Number(match[2]),Number(match[3]));expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(350000);return result;}
      throw Error(`Unexpected route ${route}`);
    }) as typeof learner.ai.platform;
    await learner.setup(path.join(directory,"learning-history"),false);
    const download=new Expansion(learner);
    await expect(download.importHosted(grant.grant)).rejects.toThrow(/dropped lesson/);
    await download.importHosted(grant.grant);
    expect(redeems).toBe(1);
    expect(contentHash(download.state().releases[0].lessons)).toBe(contentHash(course.lessons));
    expect(download.state().releases[0].courseId).toBe(saved.id);
  }finally{authorStore.close();learnerStore.close();await database.close();await rm(directory,{recursive:true,force:true});}
},90000);
