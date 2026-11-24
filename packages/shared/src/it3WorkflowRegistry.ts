import { registerComponents, type ComponentCollection } from "./it3WorkflowRegistration.ts";

// Terminal scope authorizes publication and starts for every component. Answering an approval
// is a separate authenticated operation. Children inherit the host workflow invocation.
export const componentAccess = {
  local: ["terminal:operate"],
  ask: ["terminal:operate", "orchestration:operate (answer)"],
  invoke: ["terminal:operate"],
} as const;
const core = {
  start: {
    input: "object",
    title: "Input",
    icon: "LogIn",
    description: "Receive a JSON object",
    ports: ["next"],
    settings: "none",
    permission: "local",
    handler: "data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed(data));",
  },
  set: {
    input: "object",
    title: "Set field",
    icon: "Braces",
    description: "Write a value into the data",
    ports: ["next"],
    settings: "scalar",
    permission: "local",
    handler:
      "data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed({...data,[node.field]:JSON.parse(node.literal)}));",
  },
  branch: {
    input: "object",
    title: "Condition",
    icon: "GitBranch",
    description: "Compare a field with a value",
    ports: ["yes", "no"],
    settings: "scalar",
    permission: "local",
    handler:
      'const yes=yield* T3.step(id,{returns:Schema.Boolean},Effect.succeed(Object.hasOwn(data,node.field) && data[node.field]===JSON.parse(node.literal))); port=yes?"yes":"no";',
  },
  review: {
    input: "object",
    title: "Approval",
    icon: "UserRound",
    description: "Ask a person to choose a path",
    ports: ["yes", "no"],
    settings: "none",
    permission: "ask",
    handler:
      'const answer=yield* T3.ask(id,{input:"object",title:node.label,choices:["Yes","No"],data}); port=Option.isSome(answer) && answer.value.choice==="Yes"?"yes":"no";',
  },
  result: {
    input: "object",
    title: "Output",
    icon: "Flag",
    description: "Return the current data",
    ports: [],
    settings: "none",
    permission: "local",
    handler: "return yield* T3.step(id,{returns:Schema.Json},Effect.succeed(data));",
  },
  subflow: {
    input: "object",
    title: "Subflow",
    icon: "Workflow",
    description: "Run a published workflow at a pinned version",
    ports: ["next"],
    settings: "workflow",
    permission: "invoke",
    handler:
      'const end=yield* T3.invokeVersion(id,node.target.workflow,node.target.version,data); if(end.outcome!=="completed")return yield* T3.stop(end.reason); data=end.value;',
  },
} as const satisfies ComponentCollection;

const suite = {
  "suite-read": {
    input: "suite-report",
    title: "Read suite report",
    icon: "ListChecks",
    description: "Count test outcomes and keep the report evidence",
    ports: ["next"],
    settings: "none",
    permission: "local",
    handler: `
 const report=Schema.Struct({suite:Schema.String,revision:Schema.String,evidence:Schema.String,complete:Schema.Boolean,cases:Schema.Array(Schema.Struct({name:Schema.String,outcome:Schema.Literals(["passed","failed","skipped"])})).check(Schema.isMaxLength(10000))});
 if(!Schema.is(report)(data))return yield* T3.stop("Invalid suite report");
 const {suite,revision,evidence,complete,cases}=data;
 const summary={suite,revision,evidence,complete,passed:0,failed:0,skipped:0,examples:[],projectId:canvas.projectId,outcome:"reported"};
 for(const c of cases){summary[c.outcome]++;if(c.outcome==="failed" && summary.examples.length<3)summary.examples.push(c.name);}
 summary.hasFailures=summary.failed>0;
 data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed(summary));`,
  },
  check: {
    input: "suite-summary",
    title: "Check report",
    icon: "CheckCheck",
    description: "Require a completed test suite",
    ports: ["next"],
    settings: "none",
    permission: "local",
    handler: `const verdict=yield* T3.step(id,{returns:Schema.String},Effect.succeed(!data.complete?"Incomplete suite report":!(data.failed+data.passed>0)?"No tests executed":"Complete"));if(verdict!=="Complete")return yield* T3.stop(verdict);`,
  },
  "suite-brief": {
    input: "suite-summary",
    title: "Diagnosis brief",
    icon: "ClipboardList",
    description: "Prepare a bounded brief from the suite evidence",
    ports: ["next"],
    settings: "none",
    permission: "local",
    handler:
      'data=yield* T3.step(id,{returns:Schema.Json},Effect.succeed({...data,outcome:"diagnosis-requested",verification:"Rerun the failing cases, then the complete suite against the candidate revision."}));',
  },
} as const satisfies ComponentCollection;

export const workflowComponents = registerComponents(core, suite);
