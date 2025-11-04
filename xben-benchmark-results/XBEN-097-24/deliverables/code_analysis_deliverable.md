# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope.

### In-Scope: Network-Reachable Components
This analysis focuses on components whose execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints (6 PHP endpoints identified)
- Endpoints requiring authentication via the application's standard login mechanisms (admin panel)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

### Out-of-Scope: Locally Executable Only
The following components are **out-of-scope** as they cannot be invoked through the running application's network interface:
- Command-line interface tools (none found in this application)
- Development utilities requiring manual execution (none found)
- Database migration scripts (no database implementation exists)
- CI/CD pipeline scripts or build tools (Docker build process only)
- Local development servers, test harnesses, or debugging utilities (none found)

---

## 1. Executive Summary

XBEN-097-24 is a deliberately vulnerable PHP 7.4 web application running on Nginx that presents a **critical security posture** suitable for capture-the-flag (CTF) challenges. The application's primary vulnerability is a **textbook Nginx path traversal misconfiguration** that allows unauthorized access to sensitive files outside the web root, specifically the flag file located at `/var/www/flag.txt`. This vulnerability is compounded by directory listing being enabled on the misconfigured path.

The application exhibits **zero functional authentication or authorization mechanisms** despite presenting a login interface, creating a false sense of security. The admin panel is publicly accessible without any credential verification. All six network-accessible PHP endpoints operate over unencrypted HTTP (port 80 only), exposing any transmitted data to interception. The technology stack itself presents significant risk, as PHP 7.4 reached end-of-life in November 2022 and no longer receives security patches.

From an external attacker's perspective, this application offers multiple critical attack vectors: the Nginx alias misconfiguration enables immediate flag retrieval via path traversal (`/admin../flag.txt`), the admin panel provides unrestricted access to administrative interfaces, and the complete absence of authentication allows enumeration and exploration without resistance. The attack surface is deliberately minimal with no database, no external API integrations, and no file upload functionality, suggesting this is a focused challenge designed to test understanding of web server misconfigurations and access control failures rather than complex application logic vulnerabilities.

## 2. Architecture & Technology Stack

### Framework & Language

The application is built on **PHP 7.4-FPM**, as evidenced by the Dockerfile base image `FROM php:7.4-fpm`. This version presents a **critical security risk** as it reached end-of-life on November 28, 2022, meaning no security updates or patches are available for known vulnerabilities. The PHP runtime includes installed but unused MySQL extensions (`mysqli` and `pdo_mysql`), expanding the attack surface unnecessarily without providing functional database capabilities. The application uses **no PHP framework**—no Laravel, Symfony, CodeIgniter, or similar structure—resulting in complete absence of framework-provided security features like CSRF protection, input validation, or authentication scaffolding.

The web server architecture employs **Nginx as a reverse proxy** forwarding requests to PHP-FPM listening on localhost:9000. This configuration is documented in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/nginx.conf` where Nginx handles all HTTP traffic on port 80 and routes PHP file requests via FastCGI to the PHP-FPM process. The Nginx configuration contains a **critical path alias misconfiguration** between lines 12-19 where the `/admin` location (without trailing slash) aliases to `/var/www/html/` instead of the intended admin directory, enabling path traversal attacks. Additionally, the `autoindex on` directive exposes directory listings, facilitating reconnaissance and file discovery.

### Architectural Pattern

This is a **simple monolithic web application** with file-based routing and no separation of concerns. The architecture consists of a single tier with static HTML pages intermixed with minimal PHP processing logic. There is no Model-View-Controller (MVC) pattern, no service layer, no repository pattern, and no dependency injection. The application structure in `/var/www/html/` contains six PHP files (index.php, home.php, about.php, contact.php, login.php, and admin/index.php), one CSS file, and two image assets. URL routing is entirely file-based—accessing `/about.php` directly executes that file with no routing abstraction or middleware chain.

**Trust boundaries** are poorly defined and inadequately enforced. The application conceptually divides into three zones: (1) Public content zone containing informational pages accessible to all users, (2) Administrative zone at `/admin/` that should require authentication but doesn't, and (3) Sensitive file zone containing `/var/www/flag.txt` stored one directory above the web root. The Nginx misconfiguration violates these trust boundaries by enabling traversal from the admin path to the parent directory, allowing access to the flag file. No session-based trust boundaries exist as the application implements no session management whatsoever.

### Critical Security Components

The application implements **only one security control**: output encoding via `htmlspecialchars()`. This function is consistently applied to all user input in both `login.php` (lines 26-27 sanitizing username and password) and `contact.php` (lines 25-27 sanitizing name, email, and message). While this prevents reflected Cross-Site Scripting (XSS) attacks by converting special characters to HTML entities, it represents the entirety of the application's security implementation.

**Critical security gaps** include complete absence of authentication mechanisms (the login form at `/login.php` accepts credentials but performs no validation, always returning an error), zero authorization checks (the admin panel at `/admin/index.php` contains no session verification or role checks), no session management (no `session_start()` calls anywhere in the codebase), and no CSRF protection (forms lack anti-CSRF tokens). The application also fails to implement any security headers—no Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers are configured in Nginx or PHP, leaving the application vulnerable to clickjacking, MIME confusion, and lack of defense-in-depth XSS protections.

**Data protection is minimal**: no encryption exists at rest or in transit (HTTP only, no HTTPS/TLS), no password hashing (no `password_hash()` or bcrypt usage despite accepting passwords), and no input validation beyond the single output encoding function. The flag secret is stored in the `.env` file committed to version control (`FLAG="flag{9c29301f-3fea-47b5-924d-413607e3db56}"`), violating secret management best practices. During Docker build, this flag is injected into `/var/www/flag.txt` via a `sed` command (Dockerfile lines 15-17), placing it in a predictable location vulnerable to the Nginx path traversal.

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms and Security Properties

**CRITICAL FINDING: No functional authentication exists in this application.** The login form at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` presents a false security facade. Lines 23-30 demonstrate the complete authentication implementation:

```php
<?php
$showError = false;
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = htmlspecialchars($_POST['username']);
    $password = htmlspecialchars($_POST['password']);
    
    $showError = true;
}
?>
```

The code accepts POST requests with username and password parameters, applies `htmlspecialchars()` sanitization, then **unconditionally sets `$showError = true` on line 29**, guaranteeing that every login attempt fails regardless of credentials entered. No database connection exists to validate credentials against stored user records, no password hashing or verification occurs, and no authentication state is created upon "successful" login. This creates **security theater**—the appearance of authentication without any actual security enforcement.

**Exhaustive list of authentication API endpoints:**
- **`/login.php` (POST)** - Fake login endpoint that always fails (lines 23-30 of login.php)
- **NO logout endpoint** - No session management means no logout needed
- **NO token refresh endpoint** - No token-based authentication implemented
- **NO password reset endpoint** - No user management system exists
- **NO registration endpoint** - No user creation functionality
- **NO SSO/OAuth/OIDC endpoints** - No single sign-on integration
- **NO multi-factor authentication** - No MFA implementation

The lack of any real authentication mechanism means the application cannot distinguish between users, cannot maintain login state, and cannot enforce any access control based on identity. This is the foundational security failure that enables all subsequent authorization bypasses.

### Session Management and Token Security

**Session management is completely absent** from the application. A comprehensive search of all PHP files for session-related functions (`session_start`, `session_destroy`, `$_SESSION`, `session_regenerate_id`) returns zero matches. No session cookies are created, no session storage mechanism exists (no Redis, database sessions, or file-based sessions), and no session IDs are generated or tracked. Without sessions, the application cannot maintain any concept of "logged-in" state, making authentication impossible even if credential validation were implemented.

**Session cookie flags are not applicable** as no cookies are set anywhere in the application. No `setcookie()` calls exist, meaning there are no session cookies to configure. The critical security flags—`HttpOnly`, `Secure`, and `SameSite`—are therefore not configured because no cookies exist to protect. If this were a functional application, session cookies would be configured in PHP's session initialization, typically via `session_set_cookie_params()` before calling `session_start()`. The **exact location where session cookie flags SHOULD be configured** would be at the beginning of `/login.php` after successful authentication, but this code is entirely missing.

**Token-based authentication mechanisms are also absent.** No JWT (JSON Web Token) generation, validation, or parsing code exists. No OAuth 2.0 bearer tokens are issued. No API key generation or validation occurs. The application has no concept of authentication tokens of any kind, leaving it unable to maintain stateless authentication or provide API access controls.

### Authorization Model and Bypass Scenarios

**Authorization is completely unenforced** throughout the application. The most glaring example is the admin panel at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php` (lines 1-26), which consists entirely of static HTML:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Administrative Internal Panel</title>
</head>
<body>
    <div class="content">
        <h1>Administrative Zone</h1>
        <p>Restricted</p>
    </div>
</body>
</html>
```

This file contains **zero authorization checks**. No PHP code validates user identity, role, or permissions before rendering the page. The word "Restricted" appears as static text (line 19) but provides no actual restriction—any anonymous user can access this page by navigating to `/admin/` or `/admin/index.php`. A proper implementation would include PHP code at the file's beginning checking `$_SESSION['role'] === 'admin'` and redirecting unauthorized users, but this code is completely absent.

**No role-based access control (RBAC) exists.** There are no role definitions in the codebase, no user-to-role mappings, no permission matrices, and no privilege checks before executing sensitive operations. Every endpoint in the application is equally accessible to all users without differentiation. The application cannot distinguish between regular users, administrators, or anonymous visitors because it has no user management system whatsoever.

**Privilege escalation is unnecessary and irrelevant** because all users already possess maximum privileges by default. There are no privilege boundaries to escalate across, no permission checks to bypass, and no elevated operations requiring authorization. The complete absence of access controls means every user—authenticated or not—can access every endpoint and view every page.

### Multi-Tenancy Security Implementation

Multi-tenancy is **not applicable** to this application. This is a single-tenant application with no concept of organizational boundaries, tenant isolation, or data segregation between different customer organizations. No database exists to store tenant-specific data, and no tenant identifiers are used in any operations.

### SSO/OAuth/OIDC Flows

**No SSO, OAuth, or OpenID Connect integration exists.** The application does not implement:
- OAuth 2.0 authorization code flow or callback endpoints
- OpenID Connect authentication with identity providers
- SAML-based single sign-on
- Social login (Google, Facebook, GitHub, etc.)

There are no callback endpoints to identify, no `state` parameter validation to locate, and no `nonce` parameter checking to analyze. The application relies entirely on its non-functional local login form with no external identity provider integration.

## 4. Data Security & Storage

### Database Security

**No database is implemented or configured** in this application despite database extensions being installed. The Dockerfile (line 3) installs MySQL extensions: `RUN docker-php-ext-install mysqli pdo_mysql`. However, comprehensive searches across all PHP files for database connection functions (`mysqli_connect`, `new mysqli`, `new PDO`, `mysql_connect`) return zero matches. No database connection code exists anywhere in the codebase.

This architectural absence eliminates entire classes of vulnerabilities: there is no SQL injection risk (no queries to inject), no database access control issues (no database to access), no unencrypted database storage concerns (no data stored), and no multi-tenant data isolation problems (no tenant data exists). The installation of unused database extensions represents unnecessary attack surface expansion—these extensions potentially contain vulnerabilities but provide no functional value to the application. From a data security perspective, the lack of persistent storage means user-submitted data (login credentials, contact form information) is immediately discarded after sanitization, creating zero data breach risk from database compromise.

### Data Flow Security

**Sensitive data paths are minimal and transient.** The application accepts user input through two POST endpoints:

1. **Login flow** (`/login.php`): Username and password travel from browser → HTTP POST → Nginx → PHP-FPM → `htmlspecialchars()` sanitization → immediate discard. Credentials are sanitized on lines 26-27 but never stored, validated, or used for any purpose. The `$username` and `$password` variables go out of scope when the script terminates, and the data is lost forever.

2. **Contact form flow** (`/contact.php`): Name, email, and message follow the same path: browser → HTTP POST → Nginx → PHP-FPM → `htmlspecialchars()` sanitization (lines 25-27) → immediate discard. A generic thank-you message is displayed, but the actual submitted data is never persisted, logged, emailed, or processed in any way.

**Critical data flow vulnerability: No encryption in transit.** The Nginx configuration (line 2 of `/nginx.conf`) specifies `listen 80;` with no HTTPS configuration. This means:
- Login credentials transmitted as cleartext HTTP POST data
- Email addresses exposed in network traffic
- All form data vulnerable to man-in-the-middle interception
- No TLS certificate, no SSL/TLS configuration, no HTTPS redirect

An attacker performing network sniffing can capture usernames, passwords, email addresses, and message content in plaintext. This violates fundamental security principles for handling credentials and personal information.

**The flag file represents the only persistent sensitive data.** Located at `/var/www/flag.txt` (one directory above web root), this file contains `flag{9c29301f-3fea-47b5-924d-413607e3db56}` injected during Docker build (Dockerfile lines 15-17). While the file is outside the web root and not directly accessible via normal HTTP requests, the Nginx path traversal vulnerability allows retrieval via the `/admin../flag.txt` path, bypassing the intended protection mechanism.

### Multi-Tenant Data Isolation

Multi-tenant data isolation is **not applicable** as this is a single-tenant application with no organizational boundaries, no customer separation, and no shared database or storage layer. There are no tenant identifiers, no row-level security policies, no data partitioning strategies, and no cross-tenant access controls. The application does not support multiple organizations or customers, making tenant isolation concerns irrelevant.

## 5. Attack Surface Analysis

### External Entry Points

This application exposes **six network-accessible PHP endpoints**, all publicly available without authentication requirements:

**1. Landing Page - `/` or `/index.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/index.php` (46 lines)
- **HTTP Method:** GET
- **Authentication:** Public (none required)
- **Functionality:** Static marketing content and navigation
- **Input Parameters:** None
- **Security Notes:** No dynamic content, no user input processing, minimal attack surface

**2. Home Redirect - `/home.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/home.php` (4 lines)
- **HTTP Method:** GET
- **Authentication:** Public
- **Functionality:** Immediate redirect to `index.php` via `header("Location: index.php");` on line 2
- **Security Notes:** Hardcoded redirect target (not user-controllable), no open redirect vulnerability

**3. About Page - `/about.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/about.php` (44 lines)
- **HTTP Method:** GET
- **Authentication:** Public
- **Functionality:** Static information page about AI security
- **Input Parameters:** None
- **Security Notes:** Static content only, no processing logic

**4. Contact Form - `/contact.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/contact.php` (50 lines)
- **HTTP Methods:** GET (displays form), POST (processes submission)
- **Authentication:** Public
- **Input Parameters:** `name` (string), `email` (string), `message` (text)
- **Processing Logic:** Lines 24-29 sanitize input with `htmlspecialchars()` and display thank-you message
- **Security Notes:** Input sanitized but never stored; no email sending, database writing, or data persistence; vulnerable to CSRF (no token validation)

**5. Login Form - `/login.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` (49 lines)
- **HTTP Methods:** GET (displays form), POST (fake authentication)
- **Authentication:** Public (this IS the authentication endpoint, but it's non-functional)
- **Input Parameters:** `username` (string), `password` (string)
- **Processing Logic:** Lines 25-30 sanitize input then unconditionally set error flag
- **Security Notes:** **Non-functional authentication**—always returns failure; no session creation; vulnerable to CSRF; credentials transmitted over unencrypted HTTP

**6. Admin Panel - `/admin/` or `/admin/index.php`**
- **File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php` (26 lines)
- **HTTP Method:** GET
- **Authentication:** **NONE** (critical security failure)
- **Functionality:** Displays "Administrative Zone - Restricted" static page
- **Security Notes:** **Publicly accessible without authentication**; authorization completely absent; accessible to anonymous users

**7. Critical Vulnerability - Path Traversal via `/admin` (without trailing slash)**
- **Nginx Configuration:** Lines 16-19 of `/nginx.conf`
  ```nginx
  location /admin {
      alias /var/www/html/;
      autoindex on;
  }
  ```
- **HTTP Method:** GET
- **Authentication:** None
- **Functionality:** Alias misconfiguration enabling directory traversal
- **Exploitation:** Requesting `/admin../` resolves to `/var/www/html/../` → `/var/www/`, exposing parent directory contents including `flag.txt`
- **Impact:** **CRITICAL** - Direct path to flag retrieval; directory listing enabled reveals file structure
- **Attack Vector:** `curl http://target/admin../flag.txt` returns flag content

### Internal Service Communication

**No internal service-to-service communication exists.** This is a monolithic application with a single-tier architecture. There are no microservices, no internal APIs, no service mesh, and no inter-process communication beyond the Nginx-to-PHP-FPM FastCGI protocol. The FastCGI communication between Nginx and PHP-FPM occurs over localhost (127.0.0.1:9000) as configured in `nginx.conf` line 23 (`fastcgi_pass 127.0.0.1:9000;`), providing appropriate isolation from external networks.

No trust relationships exist between services because only one service (the PHP application) exists. There are no service accounts, no internal authentication tokens, no mutual TLS between services, and no service-to-service authorization checks. The Docker architecture runs a single container with both Nginx and PHP-FPM processes, eliminating network-based service boundaries.

### Input Validation Patterns

**Input validation is extremely minimal**, consisting solely of output encoding. The application implements **no server-side input validation** for format, length, type, or business logic constraints. The only security control applied to user input is `htmlspecialchars()` for XSS prevention:

**Contact form validation** (`/contact.php` lines 25-27):
```php
$name = htmlspecialchars($_POST['name']);
$email = htmlspecialchars($_POST['email']);
$message = htmlspecialchars($_POST['message']);
```

**Login form validation** (`/login.php` lines 26-27):
```php
$username = htmlspecialchars($_POST['username']);
$password = htmlspecialchars($_POST['password']);
```

**Missing validation controls:**
- **No length limits** - Users can submit arbitrarily long strings (PHP's `post_max_size` provides only coarse protection)
- **No format validation** - Email addresses not validated server-side despite HTML5 type="email" client-side hint
- **No type checking** - All inputs treated as strings regardless of expected type
- **No whitelist validation** - No allowed character sets or regex patterns enforced
- **No business logic validation** - No checks for valid usernames, password complexity, or message content appropriateness
- **No sanitization for storage** - Though irrelevant since data isn't stored
- **No file upload validation** - Not applicable as no upload functionality exists

Client-side validation exists through HTML5 attributes (`required`, `type="email"`), but these provide no security value as they're trivially bypassed by attackers manipulating HTTP requests directly.

### Background Processing

**No background processing, async jobs, or queue systems exist** in this application. There are no cron jobs, no scheduled tasks, no message queues (RabbitMQ, Kafka, Redis), no job processors (Sidekiq, Celery, Laravel Queue), and no worker processes. All request processing is synchronous and completes within the PHP-FPM request-response cycle.

Since no background jobs exist, there are no async privilege models to analyze, no job queue authorization checks to bypass, and no worker process security concerns. The application's security posture is entirely defined by its synchronous HTTP request handling.

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical security failure: Secrets committed to version control.** The file `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/.env` contains the application flag in plaintext:

```bash
FLAG="flag{9c29301f-3fea-47b5-924d-413607e3db56}"
```

This violates fundamental secrets management principles. The `.env` file should be listed in `.gitignore` to prevent secret exposure in version control history, but it has been committed to the repository. Any attacker with access to the git repository (including public repositories or compromised developer machines) can retrieve the flag without exploiting the running application.

**Secret injection mechanism** (Dockerfile lines 13-17):
```dockerfile
COPY flag.txt /var/www/
ARG FLAG
RUN sed -i s/@FLAG@/$FLAG/g /var/www/flag.txt
```

The flag is passed as a Docker build argument, replaced in `/var/www/flag.txt` via `sed`, and deployed to the filesystem at a predictable location one directory above the web root. This approach:
- Stores secrets in the filesystem unencrypted
- Places the flag at a known path vulnerable to traversal attacks
- Provides no secret rotation mechanism
- Lacks encryption at rest
- Has no access controls beyond filesystem permissions

**No secrets vault or key management system exists.** The application does not integrate with HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Google Secret Manager, or any other secret management solution. Environment variables are not used for runtime configuration (no `getenv()` or `$_ENV` usage found). No encryption keys are managed because no encryption is implemented. There are no API keys to protect, no database credentials to secure (no database exists), and no external service authentication tokens.

**Secret rotation is not implemented.** Once the flag is baked into the Docker image during build, it remains static with no mechanism to rotate or refresh it. A compromised flag would require rebuilding and redeploying the entire container image.

### Configuration Security

**Environment separation is minimal.** The application uses a single `.env` file with no environment-specific configurations (no `.env.production`, `.env.staging`, `.env.development` separation). The Docker Compose configuration at `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/docker-compose.yml` defines a single service with minimal configuration:

```yaml
services:
  web:
    build: 
      context: ./src
      args:
        - FLAG
    ports:
      - 80
```

No environment-specific configuration management exists. There are no separate configurations for development versus production, no feature flags, and no environment-specific secret management.

**Security headers are NOT defined in infrastructure configuration.** A comprehensive search of the Nginx configuration (`/nginx.conf`) and Dockerfile reveals **no security header configuration**. Specifically missing from Nginx config:

- **No `Strict-Transport-Security` (HSTS)** - No HTTP-to-HTTPS enforcement
- **No `Content-Security-Policy` (CSP)** - No XSS protection policies
- **No `X-Frame-Options`** - Vulnerable to clickjacking
- **No `X-Content-Type-Options`** - No MIME sniffing protection
- **No `Referrer-Policy`** - Unrestricted referrer leakage
- **No `Permissions-Policy`** - No feature policy restrictions

The Nginx configuration file contains only routing and FastCGI configuration with zero `add_header` directives for security. Infrastructure-level security headers would typically be configured in the Nginx `server` block (after line 3 in the current config) but are completely absent.

**Cache-Control headers are also absent.** No cache control policies are configured for sensitive endpoints. The admin panel and login page lack `Cache-Control: no-store` headers, potentially allowing credential or session data to be cached by browsers or intermediary proxies.

### External Dependencies

**No external service integrations exist.** The application is completely isolated with no third-party dependencies:

- **No database services** - MySQL extensions installed but unused; no PostgreSQL, MongoDB, or other databases
- **No caching layers** - No Redis, Memcached, or in-memory caches
- **No email services** - Contact form doesn't send emails; no SMTP, SendGrid, Mailgun, or SES integration
- **No cloud services** - No AWS SDK, Google Cloud Client, or Azure libraries
- **No payment processors** - No Stripe, PayPal, or payment gateways
- **No external APIs** - No HTTP client usage; no `curl`, `file_get_contents` with URLs, or API integrations
- **No authentication providers** - No OAuth, SAML, or SSO integrations
- **No monitoring services** - No Sentry, New Relic, DataDog, or APM tools
- **No CDNs** - Static assets served directly from the application
- **No message queues** - No RabbitMQ, Kafka, or Redis pub/sub

The absence of external dependencies eliminates supply chain attack vectors, API key compromise risks, and third-party service vulnerabilities. However, it also means the contact form is non-functional (submitted messages go nowhere) and the application provides no real business value beyond serving static content.

**PHP dependency management is absent.** There is no `composer.json` file, no package manager, and no third-party PHP libraries. The application uses only PHP standard library functions, avoiding dependency vulnerabilities but also lacking security libraries for password hashing, CSRF protection, or input validation frameworks.

### Monitoring & Logging

**No security event logging is implemented.** The application does not log:
- Authentication attempts (successful or failed)
- Access to sensitive endpoints (admin panel, flag file)
- Input validation failures
- Error conditions or exceptions
- User actions or request audit trails

No PHP error logging configuration exists beyond PHP's default error reporting. The Nginx configuration contains no `access_log` or `error_log` directives beyond defaults, providing no security-relevant logging. No structured logging framework (Monolog, PSR-3) is implemented.

**No monitoring or alerting exists.** There are no health checks beyond the basic Docker Compose healthcheck (`timeout 10s bash -c ':> /dev/tcp/127.0.0.1/80'`), no uptime monitoring, no performance monitoring, no security event alerting, and no intrusion detection systems. An attacker could exploit the application repeatedly without triggering any alerts or leaving actionable audit trails for incident response.

The complete absence of logging and monitoring means security events are invisible, making incident detection impossible and post-incident forensics extremely limited.

## 7. Overall Codebase Indexing

The XBEN-097-24 codebase exhibits a **remarkably simple and flat directory structure** typical of educational security challenges or proof-of-concept vulnerable applications. The repository root contains standard Docker orchestration files (`docker-compose.yml`, `.env`) alongside a single `src/` directory housing all application code and configuration. This shallow hierarchy—with a maximum depth of three levels (e.g., `src/app/admin/index.php`)—facilitates rapid navigation and comprehension but reflects the absence of any architectural modularity or separation of concerns.

Within the `src/` directory, the **Dockerfile** and **nginx.conf** define the infrastructure layer, while the `app/` subdirectory contains all seven PHP files implementing application logic. Notably absent are directories typically found in production PHP applications: no `vendor/` folder (indicating zero Composer dependencies), no `config/` directory for environment-specific settings, no `tests/` folder (no automated testing), no `database/` or `migrations/` directory (consistent with the lack of persistence layer), and no `public/` versus `private/` separation beyond filesystem paths. Static assets (CSS and images) reside directly in the `app/` folder alongside PHP scripts rather than a dedicated `public/` or `assets/` directory, suggesting this codebase prioritizes simplicity over best practices.

The **build orchestration** is minimal, consisting solely of Docker and Docker Compose with no complex build pipelines. The Dockerfile employs a straightforward sequence: install PHP extensions, install Nginx, copy application files, inject the flag secret via `sed`, and configure PHP-FPM and Nginx to auto-start. There are no multi-stage builds, no asset compilation steps (no npm, webpack, or Sass), no code minification, and no optimization passes. The `docker-compose.yml` defines a single service exposing port 80, with the flag passed as a build argument—an approach that bakes secrets into the image rather than injecting them at runtime via environment variables or secret management systems.

**Code generation and templating frameworks are entirely absent.** All HTML is handwritten in PHP files with inline markup, no template engines like Twig or Blade are employed, and there are no ORM tools (Doctrine, Eloquent) or scaffolding generators. This manual approach increases code duplication (navigation menus repeated across pages) and makes security controls like CSRF token injection more difficult to implement consistently.

**Testing infrastructure is non-existent**, with no PHPUnit configuration, no integration tests, no end-to-end tests via Selenium or Playwright, and no code coverage analysis. The lack of testing frameworks means security controls cannot be validated programmatically, regressions go undetected, and the application's security posture cannot be verified through automated means.

From a **security discoverability perspective**, this flat structure makes reconnaissance trivial for attackers: all PHP entry points are in a single directory, configuration files are easily located at predictable paths, and the absence of obfuscation or access controls on file discovery (especially with `autoindex on` in the Nginx config) allows complete enumeration of the application's components. The straightforward layout aids penetration testers in quickly mapping the attack surface but reflects a codebase designed for educational exploitation rather than production resilience. The minimal file count (7 PHP files, 1 CSS, 2 images, 3 configuration files) suggests this is a **deliberately scoped CTF challenge** focused on web server misconfiguration and access control failures rather than complex application-layer vulnerabilities.

## 8. Critical File Paths

### Configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/docker-compose.yml` - Docker service definition with FLAG build argument
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/Dockerfile` - Container build with PHP 7.4-fpm, MySQL extensions, Nginx, and flag injection (lines 13-17)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/nginx.conf` - Web server configuration with CRITICAL path traversal vulnerability (lines 16-19), autoindex enabled (line 18), FastCGI configuration (lines 21-26)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/.env` - Flag secret committed to version control (CRITICAL: `FLAG="flag{9c29301f-3fea-47b5-924d-413607e3db56}"`)

### Authentication & Authorization
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` - Non-functional login form with fake authentication (lines 23-30), htmlspecialchars sanitization (lines 26-27), always fails
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/admin/index.php` - Admin panel with ZERO authentication checks (publicly accessible)

### API & Routing
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/index.php` - Landing page (46 lines, static content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/home.php` - Redirect to index.php (line 2: `header("Location: index.php");`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/about.php` - About page (44 lines, static content)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/contact.php` - Contact form with POST handler (lines 24-29), htmlspecialchars sanitization (lines 25-27), no data persistence

### Data Models & DB Interaction
- **None** - No database implementation despite MySQL extensions being installed in Dockerfile (line 3)

### Dependency Manifests
- **None** - No composer.json, package.json, or dependency management files exist

### Sensitive Data & Secrets Handling
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/flag.txt` - Flag placeholder (`@FLAG@`) replaced during build, deployed to `/var/www/flag.txt`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/.env` - Plaintext flag secret in version control

### Middleware & Input Validation
- **Minimal implementation** - Only `htmlspecialchars()` used in login.php (lines 26-27) and contact.php (lines 25-27) for XSS prevention
- **No validation middleware** - No input validation, CSRF protection, or security middleware exists

### Logging & Monitoring
- **None** - No logging configuration, no monitoring tools, no security event logging

### Infrastructure & Deployment
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/docker-compose.yml` - Service definition, port 80 exposure, health check configuration
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/Dockerfile` - PHP 7.4-fpm base (EOL), Nginx installation, flag injection via sed (lines 15-17)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/nginx.conf` - **CRITICAL** path traversal via `/admin` alias misconfiguration (lines 16-19), directory listing enabled

### CTF Flag Storage
- **Runtime location:** `/var/www/flag.txt` (outside web root but vulnerable to path traversal)
- **Build-time template:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/flag.txt` (contains `@FLAG@` placeholder)
- **Secret source:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/.env` (plaintext flag in version control)
- **Injection mechanism:** Dockerfile lines 15-17 (`sed -i s/@FLAG@/$FLAG/g /var/www/flag.txt`)
- **Exploitation path:** Nginx alias misconfiguration enables access via `/admin../flag.txt`

## 9. XSS Sinks and Render Contexts

**Network Surface Focus:** This section analyzes XSS sinks in network-accessible web pages only, excluding local-only scripts, build tools, and developer utilities.

### Summary Finding

**No XSS sinks detected in network-accessible components.** The XBEN-097-24 application demonstrates secure output encoding practices with consistent use of `htmlspecialchars()` for all user-controlled input. The application's minimal feature set—no JavaScript frameworks, no client-side rendering, no DOM manipulation—significantly reduces the attack surface for Cross-Site Scripting vulnerabilities.

### Detailed Analysis

#### HTML Body Context Sinks - NOT FOUND
**Searched for:** `innerHTML`, `outerHTML`, `document.write()`, `document.writeln()`, `insertAdjacentHTML()`, `Range.createContextualFragment()`, jQuery methods (`.html()`, `.append()`, `.after()`, `.before()`, `.prepend()`, `.replaceWith()`, `.wrap()`, `.add()`)

**Result:** No JavaScript code exists in any network-accessible PHP files. The application contains only static HTML with no `<script>` tags, no inline JavaScript, and no external JavaScript file references. All six analyzed pages (index.php, home.php, about.php, contact.php, login.php, admin/index.php) contain pure HTML/CSS with zero client-side scripting. Without JavaScript, DOM-based XSS sinks cannot exist.

#### HTML Attribute Context Sinks - NOT FOUND
**Searched for:** Event handlers (`onclick`, `onerror`, `onmouseover`, `onload`, `onfocus`, etc.), dynamically set URL attributes (`href`, `src`, `formaction`, `action`, `background`, `data`), style attribute injection, `srcdoc` in iframes

**Result:** No inline event handlers found in any HTML elements. All attributes are static with no user-controlled values. Form `action` attributes are hardcoded (e.g., `<form action="login.php" method="post">` in login.php line 32, `<form action="contact.php" method="post">` in contact.php line 32). No dynamic attribute construction using concatenation or template interpolation.

#### JavaScript Context Sinks - NOT APPLICABLE
**Searched for:** `eval()`, `Function()` constructor, `setTimeout()` with string arguments, `setInterval()` with string arguments, user data written into `<script>` tags

**Result:** Not applicable—no JavaScript context exists in the application. No `<script>` tags present, no JavaScript code to evaluate, and no user input reflected into JavaScript contexts.

#### Server-Side Reflected XSS - PREVENTED
**Input handling analysis:**

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/login.php` (lines 26-27)
```php
$username = htmlspecialchars($_POST['username']);
$password = htmlspecialchars($_POST['password']);
```
**Assessment:** User input properly sanitized with `htmlspecialchars()`, converting `<`, `>`, `&`, `"`, and `'` to HTML entities. Variables are assigned but **never echoed to output**, eliminating reflected XSS risk entirely. The error message displayed (line 43) is a static string: `echo "<p>Incorrect username/password</p>";` with no user data interpolation.

**Location:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/contact.php` (lines 25-27)
```php
$name = htmlspecialchars($_POST['name']);
$email = htmlspecialchars($_POST['email']);
$message = htmlspecialchars($_POST['message']);
```
**Assessment:** All three input fields sanitized with `htmlspecialchars()`. The response (line 29) uses a static string: `echo "<p>Thanks for contacting us, we will be in touch with you shortly.</p>";` with no user data reflected. The sanitized variables are never displayed back to the user, preventing reflected XSS.

#### URL Context Sinks - NOT FOUND
**Searched for:** User-controlled `location.href`, `location.replace()`, `location.assign()`, `window.open()`, `history.pushState()`, `history.replaceState()`, URL parameter injection

**Result:** No URL manipulation code exists. The only `header()` usage is a hardcoded redirect in `/home.php` line 2: `header("Location: index.php");` with no user input affecting the redirect target. No open redirect vulnerability exists.

#### CSS Context Sinks - NOT FOUND
**Searched for:** Dynamically set `element.style` properties, user data in `<style>` tags

**Result:** All CSS is static in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/style.css` with no dynamic style generation or user-controlled CSS values.

#### SQL Injection (Server-Side Injection) - NOT APPLICABLE
**Searched for:** Raw SQL queries, `mysqli_query()`, `mysql_query()`, `query()`, `exec()`, string concatenation in database queries

**Result:** No database interaction code exists anywhere in the application despite MySQL extensions being installed. Zero SQL queries means zero SQL injection risk.

#### Command Injection - NOT FOUND
**Searched for:** `exec()`, `system()`, `shell_exec()`, `passthru()`, `popen()`, `proc_open()`, backtick operator

**Result:** No system command execution functions found in any PHP files. No command injection sinks exist.

#### Template Injection - NOT APPLICABLE
**Searched for:** Template engine usage (Twig, Smarty, Blade), server-side template rendering with user input

**Result:** No template engine is used. All HTML is handwritten in PHP files with no template interpolation or rendering engine that could introduce Server-Side Template Injection (SSTI) vulnerabilities.

### Security Observations

**Positive findings:**
1. **Consistent output encoding** - `htmlspecialchars()` applied to 100% of user input processing
2. **No dynamic client-side code** - Absence of JavaScript eliminates entire class of DOM-based XSS
3. **Static response patterns** - User data never reflected in output, only generic success/error messages
4. **No unsafe sinks** - No `eval()`, `innerHTML`, `document.write()`, or other dangerous functions

**Architectural factors preventing XSS:**
- Minimal feature set reduces attack surface
- No rich client-side interactions requiring JavaScript
- No user-generated content display (no comments, profiles, posts)
- No database storage means no stored XSS risk
- Input sanitized but never persisted or re-displayed

### Conclusion

The application is **secure against Cross-Site Scripting attacks** due to proper output encoding and minimal dynamic content. While other critical vulnerabilities exist (path traversal, broken authentication, missing HTTPS), XSS is not a viable attack vector against this application's network-accessible endpoints.

## 10. SSRF Sinks

**Network Surface Focus:** This section analyzes SSRF sinks in network-accessible components only, excluding local-only utilities, build scripts, and developer tools.

### Summary Finding

**No SSRF sinks detected in network-accessible components.** The XBEN-097-24 application performs zero server-side outbound HTTP requests, has no URL fetching functionality, and lacks any mechanism for users to influence server-initiated network connections. The application is completely isolated with no external service integrations, eliminating Server-Side Request Forgery attack vectors.

### Detailed Analysis by Category

#### 1. HTTP(S) Clients - NOT FOUND
**Searched for:** `curl_init()`, `curl_exec()`, `curl_setopt()`, `file_get_contents()` with URLs, `fopen()` with remote URLs, `stream_context_create()` for HTTP requests

**Result:** Zero matches across all PHP files. The application does not use cURL or any HTTP client libraries to make outbound requests. No `file_get_contents()` calls with `http://` or `https://` URLs exist.

**File Path:** N/A - No HTTP client usage found

#### 2. Raw Sockets & Connect APIs - NOT FOUND
**Searched for:** `fsockopen()`, `pfsockopen()`, `socket_connect()`, `socket_create()`, `stream_socket_client()`

**Result:** No socket programming code exists. The application does not open raw TCP/UDP connections that could be abused for port scanning or SSRF attacks against internal services.

**File Path:** N/A - No socket operations found

#### 3. URL Openers & File Includes - NOT FOUND
**Searched for:** `fopen()`, `readfile()`, `file()`, `include()` with URLs, `require()` with URLs, `get_headers()`, `parse_url()` followed by request generation

**Result:** No file inclusion or remote file access. The only `include` statements would be for local PHP files (none found in this simple application). No remote file inclusion vulnerabilities exist.

**File Path:** N/A - No URL-based file operations found

#### 4. Redirect & "Next URL" Handlers - SECURE (NO VULNERABILITY)
**Found:** Single hardcoded redirect in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-097-24/src/app/home.php` (line 2)

```php
header("Location: index.php");
```

**Assessment:** NOT VULNERABLE
- Redirect target is **hardcoded** as `"index.php"` with no user input
- No `$_GET`, `$_POST`, or `$_REQUEST` parameters influence the `Location` header
- No open redirect vulnerability exists
- No SSRF risk as the redirect is client-side (301/302 HTTP redirect), not server-initiated

**Exploitation potential:** None - redirect target cannot be controlled by attackers

#### 5. Headless Browsers & Render Engines - NOT FOUND
**Searched for:** Puppeteer, Playwright, Selenium, PhantomJS, wkhtmltopdf, HTML-to-PDF conversion with URL inputs

**Result:** No headless browser automation or server-side rendering. This is a pure PHP application without Node.js dependencies or browser automation tools that could fetch attacker-controlled URLs.

**File Path:** N/A - No browser automation frameworks present

#### 6. Media Processors - NOT FOUND
**Searched for:** ImageMagick (`imagick_*`, `convert` commands), GraphicsMagick, FFmpeg, GD library functions that accept URLs (`imagecreatefromjpeg()`, `imagecreatefrompng()`, `getimagesize()` with URLs)

**Result:** No image processing or media manipulation libraries. The application contains two static image files (`/images/logo.png`, `/images/logo2.png`) but no code that processes, resizes, or fetches images from URLs.

**File Path:** N/A - No media processing code found

#### 7. Link Preview & Unfurlers - NOT FOUND
**Searched for:** oEmbed endpoint fetching, URL metadata extraction, Open Graph tag parsing, social media card generation

**Result:** No link preview or URL unfurling functionality. The application does not fetch metadata from external URLs when users submit links.

**File Path:** N/A - No link preview features implemented

#### 8. Webhook Testers & Callback Verifiers - NOT FOUND
**Searched for:** "Ping webhook" functionality, callback URL verification, HTTP request testing endpoints

**Result:** No webhook testing or callback verification features. The application does not allow users to specify URLs for the server to request.

**File Path:** N/A - No webhook features found

#### 9. SSO/OIDC Discovery & JWKS Fetchers - NOT FOUND
**Searched for:** OpenID Connect discovery (`.well-known/openid-configuration`), JWKS (JSON Web Key Set) fetching, OAuth metadata endpoints, SAML metadata retrieval

**Result:** No SSO integration or authentication provider discovery. The application has a non-functional local login form with no external identity provider integration.

**File Path:** N/A - No SSO/OAuth/OIDC code found

#### 10. Importers & Data Loaders - NOT FOUND
**Searched for:** "Import from URL" functionality, CSV/JSON/XML remote loading, RSS feed parsing, API data synchronization

**Result:** No data import features. The application does not fetch or parse data from external URLs.

**File Path:** N/A - No import features implemented

#### 11. Package/Plugin/Theme Installers - NOT FOUND
**Searched for:** "Install from URL" functionality, plugin downloaders, theme installers, update checkers

**Result:** No extensibility system or plugin architecture. The application is a simple static site with no plugin installation capabilities.

**File Path:** N/A - No package management features found

#### 12. Monitoring & Health Check Frameworks - NOT FOUND (APPLICATION LAYER)
**Searched for:** URL ping functionality, uptime checkers, health check endpoints that fetch external URLs

**Result:** No application-level health checking of external URLs. The Docker Compose health check (`timeout 10s bash -c ':> /dev/tcp/127.0.0.1/80'`) is infrastructure-level and not exploitable as an SSRF vector since it's not user-controllable.

**File Path:** N/A - No monitoring code in application layer

#### 13. Cloud Metadata Helpers - NOT FOUND
**Searched for:** AWS IMDSv1/v2 calls (`http://169.254.169.254/`), GCP metadata (`http://metadata.google.internal/`), Azure IMDS (`http://169.254.169.254/metadata/`), container orchestration API clients

**Result:** No cloud metadata service calls. The application does not query cloud provider metadata endpoints.

**File Path:** N/A - No cloud SDK or metadata access code found

### Application Architecture Analysis

The XBEN-097-24 application is **completely isolated** with the following characteristics that eliminate SSRF risk:

**No outbound connectivity:**
- Contact form accepts email but **doesn't send it** (no SMTP client, no email service integration)
- Login form accepts credentials but **doesn't validate them** (no authentication API calls)
- No external API integrations for any functionality
- No third-party service dependencies

**No HTTP client usage:**
- No cURL extension usage despite being available
- No `file_get_contents()` with remote URLs
- No stream contexts for HTTP requests
- No socket programming for custom protocols

**Stateless, static architecture:**
- No background jobs that might fetch URLs
- No webhooks or callbacks to external systems
- No data import/export features
- No plugin or extension system requiring downloads

### Security Implications

**Positive security posture for SSRF:**
The complete absence of outbound request functionality means:
- **No access to internal services** - Application cannot probe internal networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
- **No cloud metadata access** - Cannot query AWS/GCP/Azure metadata services even if running in cloud
- **No port scanning** - Cannot be abused to scan internal ports
- **No localhost exploitation** - Cannot attack services on 127.0.0.1
- **No file:// protocol abuse** - No local file reading via URL schemes (separate from path traversal)

**Trade-off:**
The lack of outbound connectivity makes features like the contact form non-functional (submitted messages are discarded rather than emailed), highlighting this is either a deliberately minimal application or a CTF challenge focused on other vulnerability classes.

### Conclusion

The application is **immune to Server-Side Request Forgery attacks** due to complete absence of server-initiated outbound request functionality. While the application suffers from critical vulnerabilities in other areas (Nginx path traversal, broken authentication, missing HTTPS), SSRF is definitively not an exploitable attack vector against this codebase's network-accessible components.