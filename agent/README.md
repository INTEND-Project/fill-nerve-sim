# Agent

A simple command-line agent that runs inside a container, uses the OpenAI API, and can call tools for shell access, Python execution, file I/O, and HTTP requests.

## Setup

1) Create the API key file:

```
cd /agent
printf "YOUR_OPENAI_API_KEY" > openai.credential
```

2) (Optional) Set the model name:

```
export OPENAI_MODEL=gpt-5-mini
```

## Run with Docker Compose

Add the service in `docker-compose.yml` (already included in this repo), then:

```
docker compose up --build agent
```

## Skills

- Skill folders live in `agent/skills/<skill-name>/SKILL.md`
- The menu file is `agent/skills/menu.md`
- The agent reloads all skill files each turn, so you can edit them while it runs.

## CLI commands

- `:help` show commands
- `:skills` print the current skills menu + all SKILL.md files
- `:exit` quit
