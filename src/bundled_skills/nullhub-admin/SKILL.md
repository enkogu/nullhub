---
name: nullhub-admin
version: 0.1.2
description: Teach managed nullclaw agents to discover NullHub routes first and then use nullhub api for instance, provider, component, NullTickets task, queue, and NullBoiler workflow operations.
always: true
requires_bins:
  - nullhub
---

# NullHub Admin

Use this skill whenever the task involves `nullhub`, NullHub-managed instances, providers, components, NullTickets tasks, or NullBoiler workflow routes.

Workflow:

1. Do not ask the user for the exact `nullhub` command or endpoint if `nullhub` can discover it.
2. Start with `nullhub routes --json` to discover the current route contract.
3. Use `nullhub api <METHOD> <PATH>` for the actual operation.
4. Prefer a read operation first unless the user already gave a precise destructive intent.
5. After a mutation, verify with a follow-up `GET`.

Rules:

- Prefer `nullhub api` over deleting files directly when NullHub owns the cleanup.
- If a route or payload is unclear, inspect `nullhub routes --json` again instead of guessing or asking the user for syntax.
- Use `--pretty` for user-facing inspection output.
- Use `--body` or `--body-file` for JSON request bodies.
- If path segments come from arbitrary ids or names, percent-encode them before building the request path.
- Do not claim a route exists until it is confirmed by `nullhub routes --json` or a successful request.

Common patterns:

```bash
nullhub routes --json
nullhub api GET /api/meta/routes --pretty
nullhub api GET /api/components --pretty
nullhub api GET /api/instances --pretty
nullhub api GET /api/instances/nullclaw/instance-1 --pretty
nullhub api GET /api/instances/nullclaw/instance-1/skills --pretty
nullhub api DELETE /api/instances/nullclaw/instance-2
nullhub api POST /api/providers/2/validate
```

Shorthand paths are allowed:

```bash
nullhub api GET instances
nullhub api POST providers/2/validate
```

## NullTickets Tasks And Queues

Use this section whenever the user asks about NullTickets tasks, tickets, work queues, assignments, pipelines, or backlog.

NullTickets is accessed through the managed NullHub action route. Do not call `nulltickets history`; history is only for NullClaw conversation history.

Start by finding managed instance names:

```bash
nullhub api GET /api/instances --pretty
```

Use `default` below only when that is the requested or discovered NullTickets instance name.

List pipelines:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/pipelines"}' --pretty
```

Inspect one pipeline:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/pipelines/PIPELINE_ID"}' --pretty
```

Create a pipeline:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body-file pipeline-request.json --pretty
```

`pipeline-request.json`:

```json
{
  "method": "POST",
  "path": "/pipelines",
  "payload": {
    "name": "engineering",
    "definition": {
      "initial": "todo",
      "states": {
        "todo": { "agent_role": "coder" },
        "done": { "terminal": true }
      },
      "transitions": [
        { "from": "todo", "to": "done", "trigger": "complete" }
      ]
    }
  }
}
```

List tasks without claiming work:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks?limit=25"}' --pretty
```

Filter the task list:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks?stage=todo&limit=25"}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks?pipeline_id=PIPELINE_ID&limit=25"}' --pretty
```

Inspect one task:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks/TASK_ID"}' --pretty
```

Create one task:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body-file task-request.json --pretty
```

`task-request.json`:

```json
{
  "method": "POST",
  "path": "/tasks",
  "payload": {
    "pipeline_id": "PIPELINE_ID",
    "title": "Implement the change",
    "description": "Detailed task context",
    "priority": 0,
    "metadata": {}
  }
}
```

Create multiple tasks:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body-file bulk-tasks-request.json --pretty
```

`bulk-tasks-request.json`:

```json
{
  "method": "POST",
  "path": "/tasks/bulk",
  "payload": {
    "tasks": [
      {
        "pipeline_id": "PIPELINE_ID",
        "title": "Task title",
        "description": "Task context",
        "priority": 0,
        "metadata": {}
      }
    ]
  }
}
```

Read or change task dependencies:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks/TASK_ID/dependencies"}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/tasks/TASK_ID/dependencies","payload":{"depends_on_task_id":"BLOCKER_TASK_ID"}}' --pretty
```

Read or change task assignments:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks/TASK_ID/assignments"}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/tasks/TASK_ID/assignments","payload":{"agent_id":"AGENT_ID"}}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"DELETE","path":"/tasks/TASK_ID/assignments/AGENT_ID"}' --pretty
```

Read task run state:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/tasks/TASK_ID/run-state"}' --pretty
```

Inspect queue/claimable roles:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/ops/queue"}' --pretty
```

Claim work only when the user asks to execute or take a task. Do not claim for inspection-only requests:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/leases/claim","payload":{"agent_id":"AGENT_ID","agent_role":"coder","lease_ttl_ms":60000}}' --pretty
```

When claiming returns `lease_id`, `lease_token`, `run.id`, and `task.id`, keep them together. Use the returned `lease_token` as `bearer_token` for heartbeat, run events, transition, or fail operations. Reading tasks does not require claiming them.

Heartbeat a lease:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/leases/LEASE_ID/heartbeat","bearer_token":"LEASE_TOKEN"}' --pretty
```

Add run progress events:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/runs/RUN_ID/events","bearer_token":"LEASE_TOKEN","payload":{"kind":"progress","data":{"message":"Started work"}}}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/runs/RUN_ID/events?limit=50"}' --pretty
```

Complete or fail a claimed run:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/runs/RUN_ID/transition","bearer_token":"LEASE_TOKEN","payload":{"trigger":"complete","instructions":"Completed successfully"}}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/runs/RUN_ID/fail","bearer_token":"LEASE_TOKEN","payload":{"error":"Reason for failure"}}' --pretty
```

Add or list artifacts:

```bash
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"POST","path":"/artifacts","payload":{"task_id":"TASK_ID","run_id":"RUN_ID","kind":"file","uri":"file:///path/to/artifact","meta":{}}}' --pretty
nullhub api POST /api/instances/nulltickets/default/tickets --body '{"method":"GET","path":"/artifacts?task_id=TASK_ID"}' --pretty
```

## NullBoiler Workflows

Use this section whenever the user asks about workflows, workflow runs, workflow execution, run steps, checkpoints, tracker status, or pull-mode execution.

NullBoiler is accessed through the shared proxy route. Use the `boiler_instance` query parameter when more than one NullBoiler instance exists.

List workflows:

```bash
nullhub api GET '/api/nullboiler/workflows?boiler_instance=default' --pretty
```

Inspect, validate, and render one workflow:

```bash
nullhub api GET '/api/nullboiler/workflows/WORKFLOW_ID?boiler_instance=default' --pretty
nullhub api POST '/api/nullboiler/workflows/WORKFLOW_ID/validate?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/workflows/WORKFLOW_ID/mermaid?boiler_instance=default' --pretty
```

Create or update a workflow:

```bash
nullhub api POST '/api/nullboiler/workflows?boiler_instance=default' --body-file workflow.json --pretty
nullhub api PUT '/api/nullboiler/workflows/WORKFLOW_ID?boiler_instance=default' --body-file workflow.json --pretty
```

Run a workflow:

```bash
nullhub api POST '/api/nullboiler/workflows/WORKFLOW_ID/run?boiler_instance=default' --body '{"input":{}}' --pretty
```

List and inspect runs:

```bash
nullhub api GET '/api/nullboiler/runs?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/runs/RUN_ID?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/runs/RUN_ID/steps?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/runs/RUN_ID/events?boiler_instance=default' --pretty
```

Control runs:

```bash
nullhub api POST '/api/nullboiler/runs/RUN_ID/cancel?boiler_instance=default' --pretty
nullhub api POST '/api/nullboiler/runs/RUN_ID/retry?boiler_instance=default' --pretty
nullhub api POST '/api/nullboiler/runs/RUN_ID/resume?boiler_instance=default' --body '{}' --pretty
nullhub api POST '/api/nullboiler/runs/fork?boiler_instance=default' --body '{"run_id":"RUN_ID"}' --pretty
```

Read checkpoints and live stream snapshots:

```bash
nullhub api GET '/api/nullboiler/runs/RUN_ID/checkpoints?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/runs/RUN_ID/checkpoints/CHECKPOINT_ID?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/runs/RUN_ID/stream?boiler_instance=default' --pretty
```

Inspect pull-mode tracker state:

```bash
nullhub api GET '/api/nullboiler/tracker/status?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/tracker/tasks?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/tracker/tasks/TASK_ID?boiler_instance=default' --pretty
nullhub api GET '/api/nullboiler/tracker/stats?boiler_instance=default' --pretty
nullhub api POST '/api/nullboiler/tracker/refresh?boiler_instance=default' --pretty
```

If the task asks about NullTickets backlog, use the NullTickets section. If it asks about workflow execution, runs, steps, or tracker worker behavior, use the NullBoiler section.
