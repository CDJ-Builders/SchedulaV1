# Schedula MindLab service

Local Python inference service for ranked, feasible weekly meeting slots. It loads the supplied versioned artifacts once at startup; it does not fetch data or write to PostgreSQL.

## Runtime

Use **Python 3.13** and the pinned packages in `requirements.txt`, matching the model library versions supplied with the artifacts. The serialized models were produced with scikit-learn 1.6.1 and LightGBM 4.6.0; do not load them under an unverified version. On Windows PowerShell:

```powershell
cd schedulaml
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
$env:SCHEDULAML_SCORER = 'lgb'
# Optional when called by the Node backend:
# $env:SCHEDULAML_API_KEY = '<local shared secret>'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Do not create this environment with the unqualified `python -m venv` command if `python` resolves to Python 3.14. The model pickle references scikit-learn's private `_loss` classes; Python 3.14 or a different scikit-learn build can fail during startup with `ModuleNotFoundError: No module named '_loss'`. Recreate the environment explicitly with `py -3.13 -m venv .venv`, then reinstall the pinned requirements. The service checks the Python, scikit-learn, and LightGBM versions before loading model files and reports a setup error if they do not match.

This service binds only to loopback. Run Express separately and set its private service URL to `http://127.0.0.1:8001`.

## Endpoints

- `GET /health`: loaded model and manifest status.
- `GET /version`: scorer, model version, grid, and score meaning.
- `POST /rank`: normalized weekly occupancy, explicit preference flags, meeting duration/modality/type, and result limit.

If `SCHEDULAML_API_KEY` is set, supply `X-SchedulaML-Key`. Inputs contain no user identifiers, titles, descriptions, or tokens. Candidate scores are relative to that request's candidate set, are not probabilities, and must not be compared between requests.

Scorer options are `lgb`, `gb`, and `l3`. The default is `lgb`; see `MODEL_CARD.md` for the provisional rationale and limitations. Unsupported day/time periods must be excluded by the caller and reported in `context.warnings`.

## Tests

```powershell
python -m pytest
```

The regression fixture test calls the original supplied `predict_layered()` and checks that the service's `l3` output matches it. It is a regression check, not training parity or an accuracy estimate.

## Artifact update and rollback

Add a new `artifacts/<version>/` directory and its `MANIFEST.json`; preserve each previous version. Verify the hashes and test the new version in a separate process using `SCHEDULAML_ARTIFACT_VERSION=<version>`. Roll back by stopping the process and restarting with the previous version. Never replace model files in a running process.
