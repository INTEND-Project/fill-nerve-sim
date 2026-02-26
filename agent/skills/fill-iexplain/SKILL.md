---
name: iexplain-integration
description: Call the iExplain service to get human-readable explanations of FILL system events. Use when users ask "What happened?" after an intent was executed, want a summary of system changes, or need a report about deployments or state changes.
compatibility: Requires HTTP access to iExplain service (http://iexplain:8000 in Docker or http://localhost:8000)
metadata:
  author: sintef
  version: "0.1"
  date: 2026-02-24
---

# iExplain Integration

Use this skill to call iExplain and generate Markdown reports explaining what happened in the FILL system after an intent was executed.

## When to Use

- User asks "What happened?" after an intent was executed
- User wants an explanation of system events
- You need to generate a report about deployments or state changes

## iExplain API

Base URL: `http://iexplain:8000/api/v1` (in Docker network) or `http://localhost:8000/api/v1`

### Step 1: Create a Session

```http
POST /api/v1/sessions
Content-Type: application/json

{
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

Response:
```json
{
  "session_id": "sess_abc123",
  "created_at": "2026-02-23T11:00:00",
  "config": {"provider": "openai", "model": "gpt-4o-mini"}
}
```

### Step 2: Submit Explanation Task

```http
POST /api/v1/sessions/{session_id}/tasks
Content-Type: application/json

{
  "task": "Fetch logs from http://fill_app:3000/nerve/logs/2026-02-23.log and analyze the FILL Nerve events.\n\nContext:\n- User intent at 11:32: 'record all the alerts' for machine SN0009\n- Explain what actions were taken following this intent\n\nGenerate a Markdown report with Summary, Timeline, Outcome, and Notes.",
  "workflow": "simple"
}
```

Response:
```json
{
  "job_id": "job_xyz789",
  "session_id": "sess_abc123",
  "status": "pending"
}
```

### Step 3: Poll for Results

```http
GET /api/v1/jobs/{job_id}
```

Poll every 2-5 seconds until `status` is `completed` or `failed`.

Response when completed:
```json
{
  "job_id": "job_xyz789",
  "status": "completed",
  "result": {
    "content": "### Summary\nFollowing the intent at 11:32, Container29 was deployed...\n\n### Timeline\n..."
  },
  "duration_seconds": 14.5
}
```

### Step 4: Cleanup (Optional)

```http
DELETE /api/v1/sessions/{session_id}
```

## Example: Complete Flow with http_request

```python
import json
import time

IEXPLAIN_URL = "http://iexplain:8000/api/v1"

# 1. Create session
session_resp = http_request(
    method="POST",
    url=f"{IEXPLAIN_URL}/sessions",
    json={"provider": "openai", "model": "gpt-4o-mini"}
)
session = json.loads(session_resp["body"])
session_id = session["session_id"]

# 2. Submit task
task_text = """Fetch logs from http://fill_app:3000/nerve/logs/2026-02-23.log and analyze.

Context:
- User intent at 11:32 to 'record all alerts' for SN0009
- Explain what happened

Generate Markdown report with Summary, Timeline, Outcome, Notes."""

task_resp = http_request(
    method="POST",
    url=f"{IEXPLAIN_URL}/sessions/{session_id}/tasks",
    json={"task": task_text, "workflow": "simple"}
)
job = json.loads(task_resp["body"])
job_id = job["job_id"]

# 3. Poll for results
while True:
    result_resp = http_request(method="GET", url=f"{IEXPLAIN_URL}/jobs/{job_id}")
    result = json.loads(result_resp["body"])
    if result["status"] == "completed":
        explanation = result["result"]["content"]
        break
    elif result["status"] == "failed":
        explanation = f"Error: {result.get('error')}"
        break
    time.sleep(3)

# 4. Return explanation to user
print(explanation)

# 5. Cleanup
http_request(method="DELETE", url=f"{IEXPLAIN_URL}/sessions/{session_id}")
```

## Task Template

When calling iExplain, construct the task like this:

```
Fetch logs from http://fill_app:3000/nerve/logs/{date}.log and analyze the FILL Nerve events.

Context:
- User intent at {time}: '{intent_description}' for machine {serial_number}
- Explain what actions were taken following this intent

Generate a Markdown report with Summary, Timeline, Outcome, and Notes.
```

Replace:
- `{date}` with the date in YYYY-MM-DD format (e.g., 2026-02-23)
- `{time}` with the time the intent was submitted (e.g., 11:32)
- `{intent_description}` with what the user asked for
- `{serial_number}` with the target machine (e.g., SN0009)

## Expected Output

iExplain returns a Markdown report like:

```markdown
### Summary
Following the intent at 11:32, Container29 was deployed to node-09 (SN0009).

### Timeline
- **11:29:56** - Node "node-09" (SN0009) came online
- **11:35:18** - Workload Container29 v1.0.0 deployed ← Result of intent

### Outcome
Node SN0009 now has 2 workloads: temperature:1.0.0, Container29:1.0.0

### Notes
- Deployment completed ~3 minutes after intent
- No errors logged
```

## Health Check

Before calling iExplain, verify it's running:

```http
GET /api/v1/health
```

Response:
```json
{"status": "healthy", "version": "1.0.0"}
```
