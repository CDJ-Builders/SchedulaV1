# Schedula MindLab Model Card

## Model and intended use

- **Artifact version:** 1.1.0
- **Input:** normalized Monday–Saturday hourly occupancy, preference flags, commute and break/tolerance values, plus a proposed meeting's duration, modality, and type.
- **Output:** a ranked list of feasible weekly candidate slots. Scores are relative to one request's candidate set; they are not probabilities and are not comparable across requests.
- **Intended use:** assist a user in choosing a time for one meeting. Recommendations are not saved automatically and do not replace Schedula's conflict validation.
- **Out of scope:** Sunday, sub-hour scheduling, automatic full-course timetable construction, and unreviewed preference interpretation.

The supplied model bundle contains L1 models (`lr`, `rf`, `gb`, `et`, `dt`, `knn`, `gnb`, `lgb`) and an L2 LightGBM ranker. The original `features.py` and `predict_layered.py` are copied unchanged. At service startup, the artifact manifest is verified before importing the original predictor and loading the models. Joblib artifacts can execute code during unpickling, so only the versioned repository artifacts with a verified manifest may be loaded.

## Scorer selection

The service defaults to the standalone `lgb` scorer, configurable with `SCHEDULAML_SCORER`. In the supplied pooled out-of-fold metrics, `pred_lgb` has the highest NDCG@1 (0.2451), Hit@1 (0.3350), and MRR (0.5209) among the reported individual models; `pred_gb` has higher NDCG@3 (0.3315), NDCG@5 (0.3720), and Hit@3 (0.6497). The layered `pred_l3` is lower on NDCG@1 (0.1603) and Hit@1 (0.2284), and only modestly above the rule score. The default is a provisional choice for review, not a claim that LGB is universally best. `gb` and `l3` remain available for comparison.

These metrics are pooled out-of-fold values only. They include no confidence intervals or per-fold variance and are not evidence of production accuracy. Validate scorer choice on an approved held-out evaluation before broad rollout.

## Data provenance and limitations

The artifacts were trained from survey-derived scheduling scenarios. No raw survey workbook is bundled in the service. The supplied evaluation set is small and exploratory; respondent identity was inferred in the upstream work and target labels are ranked survey choices. Results may not generalize to Schedula users or other institutions.

The notebook README describes a 07:00–18:00 grid, while the supplied version 1.1.0 config and feature code use a 07:00–22:00 grid. The service follows the artifact config. Current feature-code density defaults are Light through 5 occupied hours, Medium above 5 through 15, and Heavy above 15; their validity against training labels is unverified. The model input treats preferred break as minutes; Schedula stores it in `preferences.preferred_break_minutes`, defaulting to 60 minutes through migration 005 and the profile/setup controls. Schedula's back-to-back setting is an integer from 0 to 6, enforced in the database by migration 006 and passed directly to the feature code. Only canonical recurring weekly blocks are represented; every weekly block is treated as a class, active dated events/busy availability fail closed, and only onsite/online occupancy is accepted. Proposed meeting labels are Project, Event, and Meeting.

The artifact feature schema's `input_fields.response` omits preference columns that `features.py` reads. The adapter therefore emits all day and time preference fields explicitly. Vocabulary is validated and mapped explicitly because the feature code silently treats unknown occupancy values as free and unknown meeting labels as zero-valued features.

## Safety and operational controls

- Model artifacts are checksum-verified against `MANIFEST.json` before model loading.
- Inference uses only explicit normalized context and excludes identifying fields.
- A second occupancy check drops any conflicting/out-of-grid candidate; non-finite scores are dropped.
- A one-candidate layered request is returned with a warning because its per-request z-score is unreliable.
- The service is intended to bind to `127.0.0.1`; optional shared-secret auth is supported for the local backend call.
- Logs include model name/version and latency only. Do not log request bodies or user schedule/preferences.
- If the service is unavailable, the backend must return a safe unavailable response; there is no silent rule-based fallback.

## Retraining and versioning

Retrain only in the approved SML research workflow using reviewed, appropriately anonymized data and grouped evaluation. Re-export model files, feature order/schema, config, and metrics as a new version. Do not overwrite an existing version. Add a new manifest, run fixture and service checks under the exact training runtime, review the metrics and data provenance, and preserve the prior artifact directory for rollback.
