# fill-nerve-sim

A container-based simulation of Nerve API for the FILL use case.

## Prerequisites

- Docker and Docker Compose
- An OpenAI API key

## Getting started

### 1. Set your OpenAI API key

```bash
export OPENAI_API_KEY=<sk-proj...>
```

Or create a `.env` file at the project root:

```
OPENAI_API_KEY=sk-proj...
```

### 2. Start the services

```bash
docker compose up --build
```

### 3. Populate the database (first time only)

On first startup, the database is empty. Run the seed to create all machines (8 nodes) and workloads (Container1-42):

```bash
docker compose --profile seed up --build
```

This only needs to be run once. The seed checks for existing data and skips duplicates, so it's safe to run again after a reset.

To reset the database and re-seed:

```bash
docker compose down -v
docker compose up --build
docker compose --profile seed up --build
```

## Services

| Service         | URL                   | Description                                          |
| --------------- | --------------------- | ---------------------------------------------------- |
| NERVE API       | http://localhost:3000 | Backend API for the FILL simulator                   |
| NERVE Dashboard | http://localhost:8080 | Frontend showing nodes, workloads, and DNA targets   |
| Agent Chat      | http://localhost:8086 | Chat interface for sending intents to the agent      |
| Mongo Express   | http://localhost:8081 | MongoDB admin interface (login: admin / admin)       |
| iExplain API    | http://localhost:8000 | Explainability service for generating intent reports |
