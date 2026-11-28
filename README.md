# Schedula: Build Your Daily Blocks

[![Build Status](https://img.shields.io/badge/Status-v1.12%20Quality%20Fixes-violet.svg)](#sprint-planning--agile-scrum)
[![Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20FastAPI%20%7C%20PostgreSQL%20%7C%20Vanilla%20JS-blue.svg)](#technology-stack)
[![ML Engine](https://img.shields.io/badge/SchedulaML-v1.1.0-green.svg)](#technology-stack)

**Schedula** is a student-first, collaborative academic and professional scheduling platform that combines smart availability detection, preference-aware conflict resolution, visual timetable customization, and intelligent recommendation modeling. Designed to eliminate spreadsheet friction and solve complex course and meeting coordination problems, Schedula empowers individual students and collaborative teams to plan their semesters and projects seamlessly.

---

## 📌 Executive Summary & Project Context

Time management significantly influences academic and professional performance ([Patzak et al., 2025](docs/scrum/SchedulaProposal.md#L46)). While single-user calendar applications assist with personal scheduling, they lack mechanisms for groups to share availability, negotiate meeting times, or account for individual preferences without administrative overhead ([Roels & Corbett, 2024](docs/scrum/SchedulaProposal.md#L47); [Tran et al., 2023](docs/scrum/SchedulaProposal.md#L49)).

### Core Problem Statements
1. **Automatic Conflict & Preference Detection:** How to automatically identify time overlaps and align schedules with user-defined availability, preferred time windows, commute times, and break durations.
2. **Multi-Schedule Management:** How individuals and teams can create, combine, and organize multiple personal and group schedules cleanly.
3. **Smart Scheduling with Machine Learning:** How to intelligently score and recommend optimal meeting slots based on current weekly commitments, workload density, and personal habits.
4. **Seamless Visualization & Customization:** How to provide intuitive visual schedules with interactive block editing, color palettes, and instant high-resolution PNG export.

---

## 🎯 Agile SCRUM & Sprint Planning
### Sprint 8 Goal 
Quality of Life Fixes
Dark Mode UI
Mobile UI

### Sprint 9 Goal
Deployment

### Team Roles & Responsibilities
- **Product Owner:** Jimenez, Jian Jowel *(Manages backlog prioritization and user alignment)*
- **Scrum Master:** Devega, Adrian Nate *(Tracks milestones, removes blockers, and manages time)*
- **Development Team:** Carmona, Devega, Jimenez *(Design, architecture, machine learning integration, and full-stack implementation)*

---

## 📋 Product Backlog & Feature Breakdown

### Core Features
| Feature | Description & User Story | Status |
| :--- | :--- | :---: |
| **1: Smart Scheduling** | *Preference & Availability Detection:* Detects unavailable time ranges (`availability_blocks`), manages conflict detection via GiST ranges, and generates ML-powered slot recommendations via SchedulaML. | **Done** |
| **2: Multi-Schedule & Team Management** | *Team & User Based:* Manage personal and team schedules (`teams.html`, `teams-settings.html`), propose meeting slots, review proposals, duplicate templates, and avoid double-booking. | **Done** |
| **3: Schedule Visualization & Export** | Clean calendar grid, interactive block builder, customizable color palettes, Excel import/export (`scheduleExcel.js`), and high-resolution PNG/PDF export capabilities. | **Done** |
| **4: Authentication** | Secure user registration with email verification, encrypted passwords via Blowfish `crypt()`, JWT session handling with idle timeout, and email PIN password resets. | **Done** |
| **5: Authorization & Admin Console** | Role-based access control (`user`, `developer`, `super_admin`), step-up auth, audit logging, error diagnostics, and the dedicated Admin Console (`admin/`). | **Done** |

### Secondary Features
| Feature | Description | Status |
| :--- | :--- | :---: |
| **6: Enhanced UI/UX** | Responsive layouts, accessible forms, tactile skeuomorphic & glassmorphic design system, and smooth CSS transitions. | **Done** |

---

## 💻 Technology Stack

### Current Implementation
- **Frontend:** HTML5, Modular CSS3, Vanilla JavaScript (Builder, Plotter, Profile, Preferences, Authentication)
- **Backend API:** Node.js, Express.js (RESTful API, JWT authentication, rate limiting, parameterized queries)
- **Database:** PostgreSQL 15+ (UUID primary keys, UTC `timestamptz`, GiST range indexing for overlap checks, cascading deletes)
- **Machine Learning Inference:** Python 3.13, FastAPI, Uvicorn, scikit-learn 1.6.1, LightGBM 4.6.0, pandas, NumPy, joblib (SchedulaML MindLab Smart Scheduling engine)

---

## 📂 Project Structure

```text
schedula/
├── admin/                        # Admin Operations Console (dashboard, users, audit, errors, health)
│   ├── admin.css                 # Admin console styling
│   ├── admin.js                  # Admin dashboard views & interactions
│   ├── api.js                    # Admin API client
│   ├── index.html                # Admin console entry point
│   └── session.js                # Admin session & token state
├── backend/                      # Node.js Express API server & PostgreSQL services
│   ├── config/                   # DB pool, env validation, retention & health thresholds
│   ├── middleware/               # JWT auth, RBAC, step-up, network guard, metrics, validation
│   ├── routes/                   # API routers (admin, auth, schedules, teams, user)
│   ├── scripts/                  # DB setup, migrations, resets, super-admin & demo seeders
│   ├── services/                 # Business logic (auth, schedules, teams, recommendations, admin, audit)
│   ├── sql/
│   │   ├── 1setup.sql            # Initial database setup script
│   │   └── migrations/           # Reversible SQL migrations (001_schedula_schema through 015)
│   ├── test/                     # Backend test suite (admin, plotterModel, recommendation, teams)
│   ├── utils/                    # Async handler, crypto, email, helpers, password policy
│   ├── db-server.js              # Express application bootstrap & route mounting
│   └── package.json
├── schedulaml/                   # Python FastAPI machine learning inference service
│   ├── app/                      # Microservice application
│   │   ├── adapter.py            # Feature transformation & occupancy grid adapter
│   │   ├── main.py               # FastAPI application endpoints (/health, /version, /rank)
│   │   ├── model_loader.py       # Checksum-verified model loading & manifest validation
│   │   ├── schemas.py            # Pydantic request & response validation schemas
│   │   └── scoring.py            # Model scoring & ranking logic
│   ├── artifacts/
│   │   └── 1.1.0/                # Versioned LightGBM & GradientBoosting model bundles & manifest
│   ├── tests/                    # Pytest suite (adapter, regression, feature contract, scoring)
│   ├── pyproject.toml / uv.lock  # Python dependency specifications
│   ├── requirements.txt
│   └── start.ps1                 # Python 3.13 launcher script
├── frontend/                     # Client stylesheets and interactive logic
│   ├── css/                      # Modular stylesheets (auth, builder, chrome, plotter, profile, teams, theme, etc.)
│   └── scripts/                  # Interactive logic (auth, plotter, preferences, schedules, teams, timePicker, etc.)
├── pages/                        # Application views
│   ├── builder.html              # Timetable builder & Smart Schedule recommendation dialog
│   ├── forgot-password.html      # Password reset request page
│   ├── home.html                 # User dashboard
│   ├── login.html                # User login page
│   ├── plotter.html              # Timetable visualization & PNG/PDF export page
│   ├── profile.html              # Profile editing, account settings & availability management
│   ├── setup.html                # Initial onboarding & preferences setup page
│   ├── signup.html               # New user registration page
│   ├── teams.html                # Team schedules, member availability & meeting proposals
│   └── teams-settings.html       # Team management, invites & role administration
├── docs/                         # Comprehensive project documentation
│   ├── admin/                    # Admin API, operations guide & recon notes (API.md, README.md, RECON.md)
│   ├── plans/                    # Migration guides, audits & UI/UX plans (incl. UIUX_AUDIT/)
│   ├── schemas/                  # Backend, DB, security & SchedulaML contract specifications
│   ├── scrum/                    # Agile SCRUM logs, requirements & proposals
│   ├── GRAPHIFY_CODEBASE_INDEX.md # Codebase knowledge graph summary
│   └── TODO.md                   # Development backlog and task tracking
├── assets/                       # Static branding images, icons, and diagrams
├── index.html                    # Public landing page
├── .env.example                  # Environment configuration template
├── PROGRESS.md                   # SchedulaML integration progress and status
├── PRD.md                        # Product Requirements Document
└── README.md                     # Project overview and reference guide
```

---

## 🛡️ Responsible AI & Ethical Compliance

- **AI Assistance:** AI tools were utilized strictly for syntax explanations, boilerplate scaffolding, and logic debugging. 
- **Human Verification:** All generated code and architecture designs underwent rigorous review, refactoring, and local runtime verification by the development team.
- **Data Privacy:** User schedules, preferences, and availability data are kept private, scoped to authorized users, and stored securely.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [PostgreSQL](https://www.postgresql.org/) (v15+ recommended)
- [Python](https://www.python.org/) (v3.13 recommended for SchedulaML inference)

### 1. Database Setup
Create a PostgreSQL database

### 2. Configure Environment
Update your database credentials and secrets

### 3. Start SchedulaML Inference Service
In a separate terminal, launch the Python service:

> **⚠️ Python 3.13 required.** The model artifacts are incompatible with Python 3.14+. Using the wrong interpreter will cause a startup `RuntimeError`. Use `.\start.ps1` or the `uv` instructions below.

**Recommended — use the included launcher (auto-selects Python 3.13):**
```powershell
cd schedulaml
.\start.ps1
```

**Manual setup (first time or after deleting `.venv`):**
```powershell
cd schedulaml
uv venv --python 3.13 .venv
uv pip install -r requirements.txt --python .venv
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### 4. Start the Backend API Server
In another terminal, install dependencies and start Express:

```powershell
cd backend
npm install
npm start
```

### 5. Access the Application
```
python -m http.server 8080
  
```
Open your browser and navigate to `http://localhost:8080` to access the application.

---

*© 2026 CDJ Builders (De La Salle University - Dasmarinas)*
