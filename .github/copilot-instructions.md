# Copilot Instructions for Birk Project

This file gives concise, actionable guidance for AI coding agents to be productive in this repository.

## Big Picture
- Backend: Python FastAPI app (see `birk_api.py`, `routes/`, and `services/`). Business logic lives in `services/`; HTTP endpoints live in `routes/` and call services. Database models are defined in `models.py` with connections in `database.py`. Migrations live under `alembic/`.
- Frontend: React + Vite under `frontend/`. Key UI components are in `frontend/src/components/`. The frontend talks to the backend via `VITE_API_URL` (see `vite.config.js` and `frontend/README.md`).
- Dev/deploy: Dockerfile and `docker-compose.yml` present for containerized runs. `start_demo.sh` and `seed_demo_data.py` assist local demo setup.

## Primary workflows (how humans run things)
- Backend local quick start:
  1. Activate the project virtualenv (this repo commonly uses `.venv`).
 2. Install backend deps: `pip install -r requirements-backend.txt`.
 3. Run migrations (alembic) if needed: `alembic upgrade head` (config in `alembic.ini`).
 4. Start the API: the entrypoint is `birk_api.py` (FastAPI app).
- Frontend local:
  1. `cd frontend`
 2. `npm install`
 3. `npm run dev` (Vite dev server). Ensure `VITE_API_URL` is set or default will point to the live API.
- Tests: run `pytest` from repo root. See tests `test_monte_carlo.py` and `test_smoke_get_rates.py`.

## Project conventions & patterns
- Routes/services separation: add new HTTP endpoints by creating a new file in `routes/` and implementing business logic in `services/`. Routes should remain thin and focus on request/response handling.
- Naming: services follow `*_service.py` pattern (e.g., `monte_carlo_service.py`). Use the same pattern for new domain logic.
- DB access: use `database.py` for session/scoping. Models are in `models.py`; add migration under `alembic/versions/` when modifying DB schema.
- Frontend: UI components under `frontend/src/components/`. Keep styling with Tailwind classes and use `Recharts` for charts (add to `frontend/package.json` when needed). Use `import.meta.env.VITE_API_URL` for the API base.

## Integration points / external deps
- External API host (used in production/frontend): `https://birk-fx-api.onrender.com` (also configurable via `VITE_API_URL`).
- Database migrations use Alembic config at `alembic.ini` and scripts under `alembic/`.
- Docker: `Dockerfile` + `docker-compose.yml` for containerized runs—updates here may need port and env adjustments.

## Where to make common changes (examples)
- Add a new Monte Carlo API route: update `routes/monte_carlo_routes_fastapi.py` and place heavy logic in `services/monte_carlo_service.py`.
- Add a frontend page/tab: create component under `frontend/src/components/` and register it in `frontend/src/App.jsx`, passing props like `exposures` if available.
- Seed/demo data: `seed_demo_data.py` is the canonical script for creating sample data—use it for integration testing.

## What to watch for (gotchas observed in repo)
- Environment assumptions: local scripts assume a Python virtualenv and an accessible DB; make no silent changes to global Python environments.
- Frontend relies on `VITE_API_URL`; missing this can cause runtime requests to hit an unintended host.
- Test coverage is limited to a few smoke tests. Avoid assuming comprehensive tests exist.

## Suggested steps for common agent tasks
- To add an API endpoint:
  - Create `routes/<feature>_routes_fastapi.py` following existing routes for style.
  - Add service logic to `services/<feature>_service.py`.
  - Update `birk_api.py` (or routes package) to include the new route if not auto-discovered.
  - Add or update Alembic migration if DB schema changes.
- To modify the frontend UI:
  - Add new components under `frontend/src/components/`.
  - Update `frontend/src/App.jsx` to register tabs/pages.
  - Run `cd frontend && npm install` when adding new dependencies and then `npm run dev` to verify.

## Files to reference when coding
- API entry & orchestration: `birk_api.py`
- Routes: `routes/`
- Business logic: `services/`
- DB models: `models.py`, `database.py`, `alembic/`
- Frontend components & entry: `frontend/src/components/`, `frontend/src/App.jsx`, `frontend/package.json`
- Tests: `test_monte_carlo.py`, `test_smoke_get_rates.py`

---
If any section is unclear or you want the document to include more examples (e.g., a template route + service pair or a sample frontend component), tell me which area to expand and I will iterate.
