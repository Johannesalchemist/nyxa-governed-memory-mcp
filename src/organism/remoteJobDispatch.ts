import { assessRemoteJob, type RemoteAuthorization } from './remoteJobGate.js';
import type { RemoteJobRequest } from './remoteJobContract.js';

/** Narrow remote executor. Authorization is verified again immediately before dispatch.
 * No arbitrary shell, no fallback endpoint, and no implicit grant. */
export type RemoteRunner = (job:RemoteJobRequest, signal:AbortSignal)=>Promise<unknown>;
export type RemoteAudit = (event:{jobId:string;phase:'denied'|'started'|'completed'|'failed';reason:string})=>Promise<void>;
export class GovernedRemoteDispatcher {
  private readonly consumed=new Set<string>();
  constructor(private readonly runner:RemoteRunner,private readonly audit:RemoteAudit){}
  async dispatch(untrusted:unknown,authorization:RemoteAuthorization|null):Promise<unknown>{
    const decision=assessRemoteJob(untrusted,authorization,Date.now(),id=>this.consumed.has(id));
    const job=decision.request;
    if(!decision.allowed||!job){
      await this.audit({jobId:'REDACTED',phase:'denied',reason:decision.reason});
      throw new Error('remote_dispatch_denied:'+decision.reason);
    }
    this.consumed.add(job.jobId);
    await this.audit({jobId:job.jobId,phase:'started',reason:'authorized'});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),job.maxRuntimeSeconds*1000);
    try{
      const result=await Promise.race([this.runner(job,controller.signal),new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('remote_job_timeout')),{once:true}))]);
      await this.audit({jobId:job.jobId,phase:'completed',reason:'runner_returned'});
      return {jobId:job.jobId,status:'completed',result,authorityEffect:'NONE'};
    }catch(error){
      await this.audit({jobId:job.jobId,phase:'failed',reason:error instanceof Error?error.message:'runner_failed'});
      throw error;
    }finally{clearTimeout(timer);}
  }
}
