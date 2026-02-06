# AGENT.md

Guidelines for contributors and AI agents working in this repository.

## Project summary
fill-nerve-sim is a container-based simulation of the Nerve API for the FILL use case.

## Quick start
- Bring up the stack: `docker compose up --build`
- Backend API: `http://localhost:3000/`
- Frontend: `http://localhost:8000`

## Repository layout
- `backend/` API service (simulated Nerve API)
- `frontend/` UI for interacting with the simulator
- `docker-compose.yml` Local dev stack

## Development notes
- Prefer small, focused changes and keep UI/API behavior consistent with existing patterns.
- If you add new endpoints or data fields, update both backend responses and frontend types.
- Keep example data realistic and minimal to avoid confusing UI states.

## Testing
- No formal test suite is documented. If you add one, update this file.
- When changing behavior, do a quick manual check via the UI and API endpoints.

## Code style
- Match existing formatting and conventions in each subproject.
- Avoid introducing new dependencies unless necessary.

## Git hygiene
- Use clear commit messages in the imperative mood.
- Avoid committing generated or build artifacts.
