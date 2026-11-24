# Schedula: Build Your Daily Blocks

[![Build Status](https://img.shields.io/badge/Status-v1.9%20Team%20Proposals-violet.svg)](#sprint-planning--agile-scrum)
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

### Sprint 6 Goal
Multi-Schedule Proposals, streamline timetable visualization, and Quality of Life Fixes.

### Sprint 7 Goal
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
| **2: Multi-Schedule Management** | *Team & User Based:* Manage personal and team schedules, duplicate templates, and avoid double-booking. | **In Progress** |
| **3: Schedule Visualization & Customization** | Clean calendar grid, interactive block builder, customizable color palettes, and PNG export capabilities. | **Done** |
| **4: Authentication** | Secure user registration, encrypted passwords via Blowfish `crypt()`, JWT session handling, and email PIN password resets. | **Done** |
| **5: Authorization** | Role-based access control for standard users, group members/owners, and system administrators. | **Done** |

### Secondary Features
| Feature | Description | Status |
| :--- | :--- | :---: |
| **6: Smart Deadlines & Reminders** | Flexible task deadlines and push/email notifications for upcoming meetings. | **To Do** |
| **7: Streak Reward System** | Usage streaks to incentivize consistent deadline compliance and attendance. | **To Do** |
| **8: Enhanced UI/UX** | Responsive layouts, dark mode support, accessible forms, and smooth CSS transitions. | **Done** |

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
├── backend/                      # Node.js Express API server & PostgreSQL services
│   ├── config/                   # PostgreSQL connection pool & environment variable validation
│   ├── middleware/               # JWT authentication, role guards, validation, and error handler
│   ├── routes/                   # API routers (auth, user, schedules, admin)
│   ├── services/                 # Business logic, SQL queries, & recommendation orchestration
│   ├── sql/
│   │   └── migrations/           # Reversible SQL migrations (001_schedula_schema through 006)
│   ├── test/                     # Backend test suite (recommendationService tests)
│   ├── utils/                    # Password hashing, email helpers, async handlers
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
│   └── requirements.txt
├── frontend/                     # Client stylesheets and interactive logic
│   ├── css/                      # Modular stylesheets (admin, builder, chrome, dashboard, landing, plotter, profile)
│   └── scripts/                  # Interactive logic (auth, footer, header, plotter, preferences, profile, schedules, etc.)
├── pages/                        # Application views
│   ├── builder.html              # Timetable builder & Smart Schedule recommendation dialog
│   ├── forgot-password.html      # Password reset request page
│   ├── home.html                 # User dashboard
│   ├── login.html                # User login page
│   ├── plotter.html              # Timetable visualization & PNG export page
│   ├── profile.html              # Profile editing, account settings & availability management
│   ├── setup.html                # Initial onboarding & preferences setup page
│   └── signup.html               # New user registration page
├── docs/                         # Comprehensive project documentation
│   ├── plans/                    # Migration guides, audits, and integration plans
│   │   ├── DB_UPDATE_INSTRUCTIONS.md
│   │   ├── REFACTOR_AUDIT.md
│   │   ├── SCHEDULAML_INTEGRATION_PLAN.md
│   │   └── SCHEDULA_DB_PLAN.md
│   ├── schemas/                  # Backend, database, and ML contract specifications
│   │   ├── SCHEDULA_BACKEND_SCHEMA.md
│   │   ├── SCHEDULA_DB_SCHEMA.md
│   │   ├── schedulaml-feature-contract.md
│   │   └── schedulaml-integration.md
│   ├── scrum/                    # Agile SCRUM logs, requirements, and proposals
│   │   ├── SchedulaProposal.md
│   │   ├── SchedulaRequirements.md
│   │   └── SchedulaSCRUM.md
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

```powershell
cd schedulaml
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### 4. Start the Backend API Server
In another terminal, install dependencies and start Express:

```powershell
cd backend
npm install
npm start
```

### 5. Access the Application
Open your browser and navigate to `http://localhost:3000` to access the application.

---

*© 2026 CDJ Builders (De La Salle University - Dasmarinas)*
