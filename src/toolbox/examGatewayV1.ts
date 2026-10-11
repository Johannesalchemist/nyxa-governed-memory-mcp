import type { ToolboxRegistry } from './registry.js';

/** Fail-closed examination capabilities. Effect calls require governed dispatch. */
export function registerExamDeclarations(toolbox: ToolboxRegistry): void {
  toolbox.registerConnector({id:'exam-claude',kind:'model_examiner',state:'not_configured',description:'Claude examination through governed NYXA Newsroom'});
  for (const [name, description, risk] of [
    ['exam.submit','Submit an examination attempt for governed processing','effect'],
    ['exam.evaluate','Evaluate an authorized attempt using Claude','effect'],
    ['exam.result','Read an independently recorded examination result','read']
  ] as const) {
    toolbox.register({name,description,risk,version:'0.1.0',connector:'exam-claude',resourceKind:'exam_attempt',evidence:true,
      inputSchema:{type:'object',additionalProperties:false,properties:{attempt_id:{type:'string',minLength:1,maxLength:128}},required:['attempt_id']},
      handler:async()=>({status:'not_configured',executable:false,authority:'NONE',reason:'governed_exam_dispatch_not_connected'})});
  }
}
