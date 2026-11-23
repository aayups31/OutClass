import {createHash,randomUUID} from "node:crypto";
import {Router} from "express";
import {z} from "zod";
import type {Application} from "./application.js";
import type {CourseRelease} from "../expansion-contract.js";
import {Expansion} from "./expansion.js";
import {Workspace} from "./workspace.js";
import {UserError,assertClean} from "./safety.js";
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value??null)).digest("hex");
type Upgrade={id:string;fromCourseId:string;fromReleaseId:string;toReleaseId:string;toHash:string;lessonIndex:number;sessionId:string;files:{path:string;target:string;content:string;version:string}[];results:{path:string;target:string;status:string}[];state:"prepared"|"complete";at:string;courseId?:string};
export class CourseUpgrades{
  private active=false;
  constructor(private app:Application){}
  private source(courseId:string){const binding=this.app.store.get<{release:CourseRelease;preview:boolean}>(`academy:delivery:${courseId}`);if(!binding||binding.preview)throw new UserError("Open an enrolled course to compare release versions.");return binding.release;}
  view(courseId:string){const release=this.source(courseId);return {releaseId:release.id,revision:release.revision,available:new Expansion(this.app).state().releases.filter(next=>next.courseId===release.courseId&&next.revision>release.revision).map(next=>({id:next.id,title:next.title,revision:next.revision})),recent:(this.app.store.get<Upgrade[]>("academy:upgrades:v1")||[]).filter(job=>job.fromCourseId===courseId||job.courseId===courseId).map(({files,...job})=>({...job,files:files.map(({content,...file})=>file)}))};}
  async preview(courseId:string,toReleaseId:string){
    const release=this.source(courseId),next=new Expansion(this.app).state().releases.find(release=>release.id===toReleaseId),session=this.app.configured().session;
    if(!next||next.courseId!==release.courseId||next.revision<=release.revision)throw new UserError("Choose a newer release of the same course.");
    if(session?.courseId!==courseId)throw new UserError("Open the course workspace before comparing an upgrade.");
    const mapping=release.lessons.map((lesson,index)=>{
      const stable=release.design?.plan.lessons[index]?.id;
      const candidates=next.lessons.flatMap((candidate,to)=>stable?next.design?.plan.lessons[to]?.id===stable?[to]:[]:candidate.title===lesson.title?[to]:[]);
      const to=candidates.length===1?candidates[0]:null;
      return {from:index,to,title:lesson.title,status:to===null?"needs manual mapping":digest(lesson)===digest(next.lessons[to])?"unchanged":"changed",assessmentChanged:to===null||digest(lesson.assessments)!==digest(next.lessons[to].assessments)};
    });
    const listing=await new Workspace(this.app).list(session.id,false),files=listing.files.map(file=>{
      const match=/^assignments\/lesson-(\d+)\/(.+)$/.exec(file.path),index=match?mapping[Number(match[1])]?.to:undefined;
      return {...file,target:match?(index===null||index===undefined?null:`assignments/lesson-${index}/${match[2]}`):file.path};
    });
    const proposal={fromCourseId:courseId,fromReleaseId:release.id,fromHash:release.hash,toReleaseId:next.id,toHash:next.hash,sessionId:session.id,mapping,files,skipped:listing.skipped};
    return {...proposal,hash:digest(proposal)};
  }
  private save(job:Upgrade){this.app.store.put("academy:upgrades:v1",[...(this.app.store.get<Upgrade[]>("academy:upgrades:v1")||[]).filter(row=>row.id!==job.id),job].slice(-20));}
  async prepare(raw:unknown){
    const input=z.object({courseId:z.string(),toReleaseId:z.string().uuid(),previewHash:z.string().length(64),paths:z.array(z.object({path:z.string().max(300),version:z.string().length(64)})).min(1).max(40),approve:z.literal(true)}).strict().parse(raw),proposal=await this.preview(input.courseId,input.toReleaseId);
    if(proposal.hash!==input.previewHash)throw new UserError("The course or saved files changed. Compare the current versions again.",409);
    if(new Set(input.paths.map(file=>file.path)).size!==input.paths.length)throw new UserError("Choose each source file once.");
    const workspace=new Workspace(this.app),files=[];
    for(const chosen of input.paths){const item=proposal.files.find(file=>file.path===chosen.path&&file.version===chosen.version);if(!item?.target)throw new UserError("Choose a file with an unambiguous lesson mapping.");const file=await workspace.read(proposal.sessionId,item.path);if(file.version!==chosen.version)throw new UserError("A saved file changed during the comparison.",409);assertClean(file.content,"upgrade snapshot");if(this.app.apiKey&&file.content.includes(this.app.apiKey))throw new UserError("Remove credentials before copying course work.");files.push({path:chosen.path,target:item.target,content:file.content,version:file.version});}
    if(files.reduce((sum,file)=>sum+file.content.length,0)>200000)throw new UserError("Copy up to 200,000 characters in one reviewed upgrade snapshot.");
    const currentLesson=Number(/^lesson-(\d+)$/.exec(this.app.store.state().session!.lessonId)?.[1]),lessonIndex=proposal.mapping[currentLesson]?.to??0;
    const job:Upgrade={id:randomUUID(),fromCourseId:input.courseId,fromReleaseId:proposal.fromReleaseId,toReleaseId:proposal.toReleaseId,toHash:proposal.toHash,sessionId:proposal.sessionId,lessonIndex,files,results:[],state:"prepared",at:new Date().toISOString()};this.save(job);return {id:job.id,files:files.map(({content,...file})=>file),lessonIndex};
  }
  async apply(id:string){
    if(this.active)throw new UserError("Another course upgrade is active.",409);
    const job=(this.app.store.get<Upgrade[]>("academy:upgrades:v1")||[]).find(job=>job.id===id);if(!job)throw new UserError("Upgrade snapshot not found.",404);if(job.state==="complete")return job;
    const expansion=new Expansion(this.app),target=expansion.state().releases.find(release=>release.id===job.toReleaseId);if(!target||target.hash!==job.toHash)throw new UserError("The target release changed or is unavailable.");
    const targetCourseId=`academy:${target.id}`,current=this.app.configured().session;
    if(current&&current.id!==job.sessionId&&current.courseId!==targetCourseId)throw new UserError("Finish the other active session before resuming this upgrade.",409);
    this.active=true;
    try{
      if(current?.id===job.sessionId)await this.app.sessionAction("discard");
      expansion.enroll(target.id);const started=await expansion.launch(target.id,job.lessonIndex),workspace=new Workspace(this.app);job.courseId=started.courseId;this.save(job);
      for(const file of job.files){if(job.results.some(result=>result.path===file.path))continue;let target=file.target,status="copied";
        try{const existing=await workspace.read(started.sessionId,target);if(existing.version===file.version)status="already present";else{target=`previous-release/${job.fromReleaseId.slice(0,8)}-${job.id.slice(0,8)}/${file.path}`;status="conflict preserved for manual merge";}}catch(error){if(!(error instanceof UserError&&error.status===404)&&!(error as NodeJS.ErrnoException).code?.includes("ENOENT"))throw error;}
        if(status!=="already present")try{await workspace.save(started.sessionId,target,file.content,null);}catch(error){const existing=await workspace.read(started.sessionId,target).catch(()=>null);if(existing?.version!==file.version)throw error;}
        job.results.push({path:file.path,target,status});this.save(job);
      }
      job.state="complete";this.save(job);return job;
    }finally{this.active=false;}
  }
  routes(){const router=Router();router.get("/",(req,res)=>res.json(this.view(z.string().parse(req.query.courseId))));router.post("/preview",async(req,res)=>{const input=z.object({courseId:z.string(),toReleaseId:z.string().uuid()}).strict().parse(req.body);res.json(await this.preview(input.courseId,input.toReleaseId));});router.post("/prepare",async(req,res)=>res.json(await this.app.serial(()=>this.prepare(req.body))));router.post("/:id/apply",async(req,res)=>{z.object({approve:z.literal(true)}).strict().parse(req.body);const job=await this.app.serial(()=>this.apply(z.string().uuid().parse(req.params.id)));const {files,...result}=job;res.json({...result,files:files.map(({content,...file})=>file)});});return router;}
}
