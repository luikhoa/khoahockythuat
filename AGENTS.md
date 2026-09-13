# Repository Guidelines

## Project Structure & Module Organization

CyberShield is a Chrome/Edge extension backed by a FastAPI service that classifies Vietnamese text. Keep extension TypeScript under `extension/src/`: `content/` scans and annotates page text, `popup/` renders the extension UI, and `lib/` contains shared API calls, type contracts, and link checks. `extension/build.js` emits loadable files to the ignored `extension/dist/` directory; `manifest.json` and `content.css` remain at the extension root. The Python service lives in `backend/`: `server.py` defines HTTP routes, `predictor.py` owns model inference, and `storage.py` manages SQLite statistics. Browser fixtures are in `demo/`.

## Build, Test, and Development Commands

Run the backend from `backend/`:

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Check it with `curl http://127.0.0.1:8000/health`. From `extension/`, run `npm install`, then `npm run typecheck` for strict TypeScript validation and `npm run build` to bundle `dist/`. To exercise the standalone demo after building, run `python3 -m http.server 8080` from the repository root and open `/demo/demo.html`.

## Coding Style & Naming Conventions

Use four spaces for Python and two spaces for TypeScript, matching existing files. Keep TypeScript strict: do not introduce unused locals, implicit return paths, or untyped API data. Use `camelCase` for TypeScript values and functions, `PascalCase` for interfaces/classes, and `snake_case` for Python functions, variables, and modules. Preserve the API contract between `backend/server.py` Pydantic models and `extension/src/lib/types.ts`; update both sides together when it changes. Hand-write CSS in `extension/content.css` or `extension/src/popup/styles.css`; no formatter or linter is configured.

## Testing Guidelines

No automated test framework or coverage threshold is currently configured. At minimum, run `npm run typecheck` and `npm run build` for extension changes. For backend changes, start Uvicorn and validate affected endpoints, especially `POST /predict`, `POST /events`, and `GET /stats`. Add focused tests with any new nontrivial logic, using clear names such as `test_predict_returns_two_probabilities`.

## Commit & Pull Request Guidelines
DON'T, user is the one who do git add/commit/push
