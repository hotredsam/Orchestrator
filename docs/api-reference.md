# Swarm Town API Reference

Base URL: `http://localhost:6969`

All endpoints return JSON. CORS is enabled for all origins.

---

## Repos

### GET /api/repos
List all registered repositories with current state and stats.

**Response:**
```json
[
  {
    "id": 1,
    "name": "my-project",
    "path": "/path/to/repo",
    "db_path": "/path/to/repo/.swarm-agent.db",
    "github_url": "https://github.com/user/repo",
    "branch": "main",
    "running": 1,
    "created_at": "2026-03-04 08:00:00",
    "state": "execute_step",
    "cycle_count": 2,
    "active_agents": 10,
    "stats": {
      "items_total": 15,
      "items_done": 8,
      "steps_total": 20,
      "steps_done": 12,
      "agents": 10,
      "memory": 45,
      "mistakes": 3,
      "audio": 2
    }
  }
]
```

### POST /api/repos
Add a new repository.

**Request:**
```json
{
  "name": "my-project",
  "path": "/path/to/repo",
  "github_url": "https://github.com/user/repo",
  "branch": "main"
}
```

**Response:** `201`
```json
{
  "ok": true,
  "repo": { "id": 1, "name": "my-project", ... }
}
```

---

## Items (Features & Issues)

### GET /api/items?repo_id=N
List all items for a repository.

**Response:**
```json
[
  {
    "id": 1,
    "type": "feature",
    "title": "Add login page",
    "description": "OAuth login flow with Google",
    "priority": "high",
    "status": "pending",
    "source": "manual",
    "created_at": "2026-03-04 08:00:00",
    "started_at": null,
    "completed_at": null
  }
]
```

### POST /api/items
Add an item (feature or issue) to a repository.

**Request:**
```json
{
  "repo_id": 1,
  "type": "feature",
  "title": "Add login page",
  "description": "OAuth login flow with Google",
  "priority": "high",
  "source": "manual"
}
```

**Response:** `201`
```json
{ "ok": true }
```

---

## Plan

### GET /api/plan?repo_id=N
Get all plan steps for a repository.

**Response:**
```json
[
  {
    "id": 1,
    "item_id": 1,
    "step_order": 0,
    "description": "Create login component with OAuth flow",
    "status": "completed",
    "agent_type": "coder",
    "tests_written": 12,
    "tests_passed": 12,
    "created_at": "2026-03-04 08:10:00",
    "completed_at": "2026-03-04 08:25:00"
  }
]
```

---

## Logs

### GET /api/logs?repo_id=N
Get execution log entries (last 100).

**Response:**
```json
[
  {
    "id": 1,
    "state": "execute_step",
    "action": "step_1",
    "result": "Completed successfully",
    "agent_count": 10,
    "cost_usd": 0.15,
    "duration_sec": 45.2,
    "error": "",
    "created_at": "2026-03-04 08:15:00"
  }
]
```

---

## Agents

### GET /api/agents?repo_id=N
Get running agents for a repository.

**Response:**
```json
[
  {
    "id": 1,
    "agent_type": "coder",
    "agent_id": "agent-abc123",
    "status": "running",
    "task": "Implementing login flow",
    "spawned_at": "2026-03-04 08:10:00",
    "completed_at": null
  }
]
```

---

## Memory

### GET /api/memory?repo_id=N
Get memory entries. Optional `q` parameter for search.

**Query params:**
- `repo_id` (required): Repository ID
- `q` (optional): Search query

**Response:**
```json
[
  {
    "id": 1,
    "namespace": "execution",
    "key": "step_1",
    "value": "{\"desc\": \"login flow\", \"elapsed\": 45.2, \"ok\": true}",
    "created_at": "2026-03-04 08:10:00",
    "updated_at": "2026-03-04 08:25:00"
  }
]
```

---

## Mistakes

### GET /api/mistakes?repo_id=N
Get mistake history for a repository (last 50).

**Response:**
```json
[
  {
    "id": 1,
    "error_type": "test_failure",
    "description": "Tests failed: ImportError in login module",
    "resolution": "Fixed import path",
    "step_id": 3,
    "state_snapshot": "{...}",
    "created_at": "2026-03-04 08:20:00"
  }
]
```

---

## Audio

### GET /api/audio?repo_id=N
Get audio review entries.

**Response:**
```json
[
  {
    "id": 1,
    "filename": "review_1709550000.webm",
    "transcript": "We need to fix the login bug...",
    "parsed_items": "[{\"type\": \"issue\", \"title\": \"Fix login bug\"}]",
    "status": "processed",
    "created_at": "2026-03-04 08:00:00",
    "processed_at": "2026-03-04 08:02:00"
  }
]
```

### POST /api/audio
Upload audio for transcription.

**Request:**
```json
{
  "repo_id": 1,
  "filename": "review.webm",
  "audio_data": "<base64-encoded audio>"
}
```

**Response:** `201`
```json
{ "ok": true, "filename": "review.webm" }
```

---

## State

### GET /api/state?repo_id=N
Get current state machine state for a repository.

**Response:**
```json
{
  "current_state": "execute_step",
  "current_step_id": 5,
  "last_items_hash": "abc123",
  "refactor_done": true,
  "cycle_count": 2,
  "active_agents": 10,
  "running": true,
  "paused_state": "",
  "errors": []
}
```

---

## Control

### POST /api/start
Start orchestration for a repo or all repos.

**Request:**
```json
{ "repo_id": 1 }
```
or
```json
{ "repo_id": "all" }
```

**Response:**
```json
{ "ok": true }
```

### POST /api/stop
Stop orchestration.

**Request:**
```json
{ "repo_id": 1 }
```
or
```json
{ "repo_id": "all" }
```

**Response:**
```json
{ "ok": true }
```

### POST /api/push
Trigger a git push for a repository.

**Request:**
```json
{
  "repo_id": 1,
  "message": "feat: implemented login"
}
```

**Response:**
```json
{ "success": true, "output": "...", "elapsed": 5.2 }
```

---

## Static Files

### GET /
Serves `index.html` (the dashboard).

### GET /swarm-dashboard.jsx
Serves the React dashboard component.

---

## Error Responses

All errors return JSON:
```json
{ "error": "Description of the error" }
```

Common status codes:
- `400` — Missing required parameters
- `404` — Resource not found
- `500` — Internal server error
