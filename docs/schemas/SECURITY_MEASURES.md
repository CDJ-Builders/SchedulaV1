# Schedula Information Assurance and Security Meeasures

## 1. System Overview & Architecture

### Main Functions
* *Schedule Building & Visualization:* Allows users to create, modify, and visualize personal time blocks, courses, and weekly commitments through an interactive grid builder and plotter.
* *Smart Conflict Detection:* Automatically flags overlapping events and time clashes using temporal range evaluation (tstzrange).
* *Team & Group Availability Coordination:* Aggregates individual member schedules and availability blocks to identify optimal common meeting times.
* *Custom Preferences & Modality Settings:* Allows customization of work buffers, avoided time blocks, modality preferences (e.g., onsite vs. online), and custom visual themes.
* *Export & Sharing:* Enables sharing schedules within the system and exporting calendars to external formats (PNG, PDF, Excel).
* *Account & Identity Management:* Secure registration, authentication, session renewal, and password reset flows.

### Users & User Roles
1. **Standard User (user):** Students, professionals, and instructors who can create, view, and update their own schedules, define personal availability, configure preferences, join teams, and access shared schedules based on granted permissions.
2. **Platform Administrator (admin):** Elevated maintainers with authorization to manage platform accounts, view user metadata, inspect system-wide schedules, and perform platform-level maintenance.
3. *Team-Level Roles (Collaborative Scoping):* Modeled in group memberships:
   * *Owner:* Full administrative authority over a team schedule, group settings, and membership invitations.
   * *Admin:* Manages group events and membership permissions.
   * *Member:* Contributes availability, creates shared group events, and participates in group schedules.
   * *Viewer:* Read-only access to group schedules and shared consolidated calendars.

### Technologies Used
* *Frontend:* Semantic HTML5, CSS3 (Modular design), Vanilla JavaScript (ES6+ fetch client, event handlers, client-side token storage).
* *Backend Application Server:* Node.js with [Express.js](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/db-server.js) REST API architecture.
* *Database & Persistence:* [PostgreSQL](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/config/database.js) utilizing the pg driver, relational schema constraints, GiST indexing, and the pgcrypto cryptographic extension.
* *Security & Utility Libraries:*
  * jsonwebtoken (JWT access and refresh token generation and verification)
  * crypto (Built-in Node.js module for SHA-256 token hashing and AES-256-CBC encryption)
  * express-rate-limit (IP-based API rate limiting and brute-force mitigation)
  * cors (Cross-Origin Resource Sharing control)
  * nodemailer (Out-of-band delivery for password reset verification PINs)

### Information Collected or Stored
* *Authentication Credentials:* Lowercased email address, salted Blowfish/bcrypt password hash (password_hash), SHA-256 hashes of issued refresh tokens (token_hash), password reset PINs, and token expiry timestamps.
* *User Profile & Identification Data:* User UUID, display name, avatar URL, timezone, and locale settings.
* *Preferences & Availability:* Working hours, preferred and avoided scheduling windows, buffer times, modality preferences, and conflict tolerance parameters.
* *Scheduling Data:* Schedule titles, group affiliations, event start and end UTC timestamps (start_at, end_at), locations, recurrence rules, event categories, and private notes.

### Database & Major System Components
mermaid
flowchart LR
    Client["Frontend Web Client<br/>(HTML5 / CSS / Vanilla JS)"]
    Gateway["Express.js API Server<br/>(Rate Limit, Auth Middleware, Routes)"]
    DB[("PostgreSQL Database<br/>(pgcrypto, GiST Ranges, UUIDs)")]
    Mailer["SMTP / Nodemailer<br/>(PIN Dispatch)"]

    Client -- "HTTPS / JSON + JWT Bearer" --> Gateway
    Gateway -- "Parameterized SQL (pg)" --> DB
    Gateway -- "Out-of-band Email" --> Mailer

* *Client Layer:* Static HTML pages ([`pages/login.html`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/pages/login.html), [`pages/builder.html`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/pages/builder.html), [`pages/teams.html`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/pages/teams.html)) sending authenticated HTTP requests via the Fetch API with Authorization: Bearer <token>.
* *API Middleware Layer:* Centralized Express router handling rate-limiting ([`db-server.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/db-server.js#L24-L31)), token validation ([`middleware/auth.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/middleware/auth.js#L9-L21)), role checks (adminOnly), and global error handling.
* *PostgreSQL Engine:* Persistent storage enforcing relational integrity, soft deletes (deleted_at), temporal range conflict detection via GiST indexes, and cryptographically hashed passwords.

---

## 4. Security Objectives (CIA Triad)

### Confidentiality
* *Objective:* Prevent unauthorized access to or disclosure of personal calendars, user credentials, and private schedule data.
* *Application to Schedula:*
  * *Credential Secrecy:* Passwords are never stored in plaintext or readable format; they are hashed with cryptographic salt via PostgreSQL pgcrypto (gen_salt('bf')).
  * *Ownership Isolation:* Schedule queries are scoped strictly to the authenticated user's ID (WHERE owner_user_id = $1 AND deleted_at IS NULL), preventing users from accessing or enumerating other users' calendar events.
  * *Administrative Route Isolation:* Admin-only endpoints (/api/admin/*) require both a valid JWT and an explicit database check for platform_role = 'admin'. Non-admin requests receive an immediate 403 Forbidden.
  * *Token Secrecy & Short Lifespans:* Access tokens expire after 15 minutes, minimizing the risk window if a token is intercepted. Refresh tokens stored in the database are hashed with SHA-256 to ensure raw tokens cannot be recovered from database dumps.

### Integrity
* *Objective:* Prevent unauthorized, accidental, or malicious modification, tampering, or deletion of schedule events, user profiles, and authorization roles.
* *Application to Schedula:*
  * *Protection Against SQL Injection:* All database operations utilize parameterized queries with placeholders ($1, $2, ...) via the pg client, guaranteeing that user input cannot alter SQL syntax.
  * *Temporal & Structural Validation:* Input validators verify that date formats conform to ISO-8601, weekly time blocks follow valid HH:MM patterns, and that event termination strictly succeeds event start (end_at > start_at), preserving calendar consistency.
  * *Transactional Consistency:* Critical multi-table operations (e.g., user signup inserting into users, profiles, and preferences) execute inside atomic database transactions (BEGIN ... COMMIT / ROLLBACK), preventing partial or corrupted data states.
  * *Auditability & Non-Destructive Deletions:* Soft deletes (deleted_at IS NOT NULL) preserve data history for auditing while immediately hiding deactivated records from application queries.

### Availability
* *Objective:* Ensure the scheduling platform and availability calculation services remain accessible and responsive to authorized users when needed.
* *Application to Schedula:*
  * *Protection Against Denial of Service (DoS) & Brute Force:* An IP-based rate limiter ([`express-rate-limit`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/db-server.js#L24-L31)) restricts clients to a controlled threshold of requests per 15-minute window, mitigating credential-stuffing attacks and API flooding.
  * *Efficient Conflict Indexing:* Schedule conflict detection uses a PostgreSQL GiST index over generated tstzrange intervals, avoiding full-table scans and CPU-intensive overlap algorithms even as the calendar dataset grows.
  * *Connection Pooling:* Database queries operate through a managed pg.Pool, controlling resource consumption and preventing database connection exhaustion under concurrent traffic.
  * *Graceful Degradation & Centralized Error Handling:* Centralized Express middleware traps unhandled exceptions and database errors, ensuring individual query failures return structured JSON errors without crashing the backend process.

---

## 6. Security Measures Implemented or Proposed

### 1. Cryptographic Password Hashing (Implemented)
* *What is it?* A one-way cryptographic transformation using bcrypt/Blowfish (gen_salt('bf') via PostgreSQL pgcrypto) that converts plaintext passwords into salted irreversible hashes.
* *Why is it needed?* Protects user authentication credentials against exposure in the event of database leaks, internal breach, or backup theft.
* *How is it implemented?* Handled directly within database queries in [`authService.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/services/authService.js#L23) and [`adminService.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/services/adminService.js#L21):
  
  INSERT INTO users (email, password_hash)
  VALUES (LOWER($1), crypt($2, gen_salt('bf')));
  
  During authentication, the input password is confirmed using crypt($2, u.password_hash) = u.password_hash.
* *What does it protect?* User account passwords and authentication integrity.

---

### 2. Stateless JWT Authentication with Dual-Token Rotation (Implemented)
* *What is it?* A token-based authentication mechanism where clients receive a short-lived Access Token and a long-lived Refresh Token upon valid login.
* *Why is it needed?* Avoids maintaining server-side session state for every request while limiting exposure window if an access token is intercepted, allowing secure session renewal and revocation.
* *How is it implemented?* 
  * Tokens are generated in [`authService.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/services/authService.js#L11-L15) with an access token expiration of 15 minutes and refresh token expiration of 7 days.
  * Incoming requests pass through [`middleware/auth.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/middleware/auth.js#L9-L21) which verifies the bearer token using jwt.verify(token, JWT_SECRET).
  * The refresh token is stored in the database only as a cryptographic hash (token_hash = sha256(refreshToken)), and revoked tokens are deleted or flagged.
* *What does it protect?* User sessions, API endpoints, and private user resources from unauthorized access.

---

### 3. Parameterized SQL Queries (Implemented)
* *What is it?* A database access pattern where user-supplied inputs are passed as separate bound parameters to pre-compiled SQL statements rather than concatenated into query strings.
* *Why is it needed?* Defends against SQL Injection (SQLi), one of the most critical web vulnerabilities that allows attackers to manipulate queries, bypass authentication, or dump the database.
* *How is it implemented?* Consistently applied across all services using the pg driver parameterized syntax:
  
  await pool.query(
    'SELECT id FROM schedules WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL',
    [scheduleId, userId]
  );
  
* *What does it protect?* Database confidentiality, relational structure, and data integrity.

---

### 4. Role-Based Access Control (RBAC) & Ownership Scoping (Implemented & Proposed)
* *What is it?* An authorization model that grants access rights based on user roles (admin vs. standard user) and data ownership checks (owner_user_id).
* *Why is it needed?* Prevents Insecure Direct Object References (IDOR) and horizontal/vertical privilege escalation where regular users might access or tamper with administrative functions or other users' schedules.
* *How is it implemented & proposed?*
  * *Implemented:* Express middleware [`adminOnly`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/middleware/auth.js#L27-L41) checks platform_role === 'admin' before allowing access to /api/admin/*. Schedule mutations in [`scheduleService.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/services/scheduleService.js#L152) require matching owner_user_id = $userId.
  * *Proposed:* Enforce PostgreSQL Row Level Security (RLS) directly at the database engine level so that database policies automatically restrict rows based on session context (current_setting('app.current_user_id')), adding defense-in-depth even if application checks fail.
* *What does it protect?* Administrative controls, team schedules, and personal calendar data against horizontal and vertical privilege escalation.

---

### 5. API Rate Limiting & DoS Protection (Implemented)
* *What is it?* A traffic-shaping control that limits the number of requests an individual IP address can submit to API routes within a specific timeframe.
* *Why is it needed?* Prevents automated credential-stuffing attacks on /api/login, brute-force guessing of password reset PINs, and API starvation/denial of service.
* *How is it implemented?* Configured in [`db-server.js`](file:///c:/Users/theun/OneDrive/Desktop/projects/SchedulaSE/backend/db-server.js#L24-L31) via express-rate-limit:
  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: env.API_RATE_LIMIT,
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
  });
  app.use('/api', limiter);
  
* *What does it protect?* Server availability, authentication endpoints, and system resources.

---

### 6. Transport Layer Security (TLS/HTTPS) & Secure Cookie Storage (Proposed)
* *What is it?* Encrypting all network traffic between the browser and backend with TLS/HTTPS, and storing JWT credentials in HttpOnly, Secure, SameSite=Strict cookies instead of browser localStorage.
* *Why is it needed?* Tokens stored in browser localStorage are vulnerable to exfiltration if any Cross-Site Scripting (XSS) vulnerability exists. Unencrypted HTTP traffic exposes authentication tokens and calendar details to eavesdropping or man-in-the-middle (MitM) packet inspection.
* *How is it proposed?*
  1. Enforce HTTPS across all deployment environments with HTTP Strict Transport Security (HSTS).
  2. Transition client token handling from localStorage to server-set cookies:
     
     res.cookie('token', token, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'strict',
       maxAge: 15 * 60 * 1000
     });
     
* *What does it protect?* Authentication tokens, user privacy, and session confidentiality against XSS exfiltration and network eavesdropping.