# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete  
- **Key Outcome:** One high-confidence horizontal privilege escalation vulnerability (IDOR) was identified and recorded. The application lacks proper object-level authorization, allowing any authenticated user to access other users' private order receipts. This vulnerability has been passed to the exploitation phase via the machine-readable exploitation queue.  
- **Purpose of this Document:** This report provides the strategic context, architectural intelligence, and technical analysis necessary to effectively exploit the IDOR vulnerability. It is intended to be read alongside the JSON exploitation queue.

**Vulnerability Summary:**
- **Total Vulnerabilities Found:** 1
- **Horizontal Privilege Escalation:** 1 (CRITICAL)
- **Vertical Privilege Escalation:** 0 (No RBAC system exists)
- **Context/Workflow Bypasses:** 0 (No multi-step workflows with state validation)

**Critical Finding:**
The endpoint `GET /order/<int:order_id>/receipt` retrieves any order from the database without validating ownership, allowing any authenticated user to access any other user's order receipts by manipulating the `order_id` URL parameter. Order #300401 contains the CTF flag and has no assigned user_id, making it accessible to any authenticated user.

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Object-Level Authorization (Horizontal IDOR)

- **Description:** The application performs authentication checks (verifying the user is logged in) but completely omits authorization checks (verifying the user has permission to access the specific resource). The order receipt endpoint retrieves orders by ID without binding the order to the authenticated user.

- **Implication:** Any authenticated user can access and read other users' sensitive financial transaction data, including order details, trading activity, and the CTF flag stored in Order #300401. This represents a complete breakdown of horizontal access control.

- **Representative:** AUTHZ-VULN-01

- **Code Pattern:**
  ```python
  # Line 97-102 in routes.py
  user_id = session.get('user_id')
  if user_id:  # AUTHENTICATION CHECK ONLY
      order = Order.query.get(order_id)  # NO OWNERSHIP VALIDATION
      return render_template('receipt.html', order=order)
  ```

- **Root Cause:** The application conflates authentication with authorization. The presence of a valid session (`user_id` exists) is treated as sufficient for accessing any order, when in reality the code should verify `order.user_id == session['user_id']` before granting access.

- **Architectural Weakness:** The inline authentication pattern (repeated `if user_id:` checks) focuses solely on identity verification and provides no framework for resource-level authorization. Each endpoint must manually implement ownership checks, and in this case, the developer failed to do so.

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture

- **Session Type:** Flask signed cookies (client-side session storage)
- **Session Secret:** `'your_secret_key'` (hardcoded in `__init__.py:11`)
- **Session Data:** `{'user_id': <integer>}` stored in cookie
- **Cookie Security Flags:** 
  - `HttpOnly`: True (Flask default - prevents JavaScript access)
  - `Secure`: False (cookies transmitted over HTTP)
  - `SameSite`: None (vulnerable to CSRF)
- **Session Lifetime:** Indefinite (no timeout configured)

**Critical Finding:** The hardcoded secret key `'your_secret_key'` allows session forgery. An attacker with this knowledge can craft valid session cookies for any user_id using the itsdangerous library. However, for the IDOR exploitation, simple authentication with test credentials is sufficient.

**Exploitation Note:** While session forgery is possible, the IDOR vulnerability does not require it. Authenticating with the provided test credentials (`test:test`) grants sufficient access to exploit the missing ownership checks.

### Authentication Flow

- **Two-Stage Login:**
  1. POST username to `/` → validates username exists → redirects to `/password/<username>`
  2. POST password to `/password/<username>` → validates plaintext password → sets `session['user_id']`

- **Test Credentials:**
  - Username: `test`
  - Password: `test`
  - User ID: `10032`
  - Owned Orders: 300123, 300214, 300327, 300481

- **Authentication Guard Pattern:** Inline checks in each protected route:
  ```python
  user_id = session.get('user_id')
  if user_id:
      # Protected logic
  else:
      return redirect(url_for('login'))
  ```

**Critical Finding:** The authentication guard is consistent across all protected endpoints (`/dashboard`, `/orders`, `/order/<id>/receipt`) but provides ONLY authentication, not authorization. The guard verifies identity but not permissions.

### Resource Access Patterns

- **Order Model Structure:**
  - Primary Key: `id` (integer)
  - Foreign Key: `user_id` → User.id (establishes ownership)
  - Sensitive Fields: `date`, `ticker`, `operation_type`, `quantity`, `price`, `receipt`

- **Order Retrieval Method:** `Order.query.get(order_id)` (direct primary key lookup)

- **Missing Authorization:** The code never queries with user context:
  ```python
  # CURRENT (VULNERABLE):
  order = Order.query.get(order_id)
  
  # EXPECTED (SECURE):
  order = Order.query.filter_by(id=order_id, user_id=user_id).first()
  if not order:
      abort(403)  # Forbidden
  ```

**Critical Finding:** The application uses SQLAlchemy ORM correctly for SQL injection prevention but fails to leverage the relationship-based filtering that would enforce ownership. The User model has an `orders` relationship that is properly used in the `/orders` endpoint but ignored in the receipt endpoint.

### Flag Storage and Access

- **Flag Location:** Order #300401, `receipt` field
- **Flag Value:** `flag{85c0d827-5e28-4577-be2b-319bdcbf872d}`
- **Order Characteristics:**
  - ID: 300401
  - Ticker: 'FLAG'
  - Operation: 'SELL'
  - User ID: NULL (orphaned record - no owner assigned)

- **Seeding Code:** `__init__.py:85-96`
  ```python
  with open('/flag') as flag_file:
      flag_content = flag_file.read()
  order = Order(
      id='300401',
      date='05/16/2024',
      ticker='FLAG',
      operation_type='SELL',
      quantity='1',
      price='1.00',
      receipt=flag_content
  )
  # NOTE: No user_id set
  db.session.add(order)
  ```

**Critical Finding:** Order 300401 is intentionally orphaned (no user_id), making it inaccessible through the `/orders` page (which correctly filters `user.orders`), but fully accessible through the vulnerable receipt endpoint.

### Exploitation Path

1. **Authenticate:** POST credentials to `/` then `/password/test`
2. **Obtain Session:** Valid session cookie with `user_id=10032` 
3. **Exploit IDOR:** GET `/order/300401/receipt`
4. **Bypass Authorization:** Endpoint performs authentication check only (line 97-98)
5. **Retrieve Flag:** Database query returns Order 300401 without ownership validation (line 100)
6. **Extract Data:** Template renders receipt containing flag (line 102)

**No special tooling required:** Standard HTTP client (curl, browser, Burp Suite) sufficient for exploitation.

## 4. Vectors Analyzed and Confirmed Secure

These endpoints were analyzed and confirmed to have proper authentication guards for their intended functionality. They are **not vulnerable** to authorization bypass.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|--------------|-------------------|----------------------|-------------|
| `GET /` | N/A | Public login page - no authentication required by design | SAFE |
| `POST /` | routes.py:23-32 | Public username validation - no authentication required by design | SAFE |
| `GET /password/<username>` | routes.py:46-49 | Public password page - validates username exists in database | SAFE |
| `POST /password/<username>` | routes.py:51-64 | Authenticates user - creates session on success | SAFE |
| `POST /logout` | routes.py:36-40 | Session clearing - intentionally public (anyone can logout) | SAFE |
| `GET /dashboard` | routes.py:71-77 | Requires valid session, displays authenticated user's own data | SAFE |
| `GET /orders` | routes.py:84-90 | Requires valid session, correctly filters orders by user: `orders=user.orders` | SAFE |

**Key Observation:** The `/orders` endpoint demonstrates the CORRECT implementation of authorization:
```python
# Line 84-90 in routes.py (SECURE)
user_id = session.get('user_id')
if user_id:
    user = User.query.get(user_id)
    return render_template('orders.html', orders=user.orders)  # Uses relationship filtering
```

This endpoint accesses orders through the User relationship (`user.orders`), which automatically filters by `user_id`. This is the authorization pattern that should have been applied to the receipt endpoint.

## 5. Analysis Constraints and Blind Spots

### Constraints

- **Static Analysis Only:** This analysis was performed through code review without dynamic testing. While the IDOR vulnerability is confirmed through source code examination, actual exploitation was not performed.

- **Application Simplicity:** The application's minimal architecture (232 lines of code across 5 files) means there are few complex workflows or edge cases to analyze. This reduces the likelihood of hidden authorization bypasses but also limits the scope of findings.

- **No External Integrations:** The application has no external API calls, third-party services, or microservice communication. Authorization analysis is limited to the monolithic Flask application and MySQL database.

### Blind Spots

- **Session Forgery Impact:** While the hardcoded secret key `'your_secret_key'` enables session forgery (allowing attackers to impersonate any user without authentication), this was not fully analyzed as it falls under authentication rather than authorization. The exploitation phase should consider this as an alternative attack vector.

- **Database-Level Permissions:** The analysis focused on application-layer authorization. Database-level permissions (MySQL user privileges) were not examined. The application uses the root database account, which represents a security concern but is out of scope for authorization analysis.

- **Race Conditions:** Potential race conditions in order creation or modification were not analyzed as the application has no order creation functionality exposed through the web interface.

- **Client-Side AJAX Security:** The order receipt is loaded via AJAX (`orders.html:107-111`), which introduces a DOM-based XSS vulnerability through jQuery's `.html()` sink. This was noted but not deeply analyzed as it's primarily an XSS concern rather than authorization.

### Assumptions

- **Test Credentials Validity:** The analysis assumes the test credentials (`test:test`) are valid and grant access to user_id 10032 as documented in the recon report.

- **Order ID 300401 Existence:** The analysis assumes Order #300401 exists in the database with the flag in its receipt field, as indicated by the initialization code in `__init__.py`.

- **External Accessibility:** The analysis assumes the application is accessible via `http://localhost:8080` from the internet per the scope definition. No VPN or internal network access is required.

### Coverage

- **Horizontal Authorization:** Complete - All endpoints accepting resource IDs were analyzed
- **Vertical Authorization:** Complete - Confirmed no RBAC system exists
- **Context/Workflow Authorization:** Complete - Confirmed no multi-step workflows requiring state validation
- **Session Security:** Complete - Authentication guard implementation fully analyzed

## 6. Recommendations for Remediation

While remediation is outside the scope of this analysis phase, the following fixes would address the identified vulnerability:

### Immediate Fix (Critical Priority)

**File:** `routes.py`, lines 100-102

**Current Code:**
```python
order = Order.query.get(order_id)
return render_template('receipt.html', order=order)
```

**Secure Implementation:**
```python
order = Order.query.filter_by(id=order_id, user_id=user_id).first()
if not order:
    return redirect(url_for('orders'))  # Or abort(403) for explicit forbidden
return render_template('receipt.html', order=order)
```

### Architectural Improvements

1. **Centralize Authorization:** Implement a decorator-based authorization system:
   ```python
   def requires_ownership(model, id_param):
       def decorator(f):
           @wraps(f)
           def decorated_function(*args, **kwargs):
               user_id = session.get('user_id')
               if not user_id:
                   return redirect(url_for('login'))
               obj = model.query.get(kwargs[id_param])
               if not obj or obj.user_id != user_id:
                   abort(403)
               return f(*args, **kwargs)
           return decorated_function
       return decorator
   
   @app.route('/order/<int:order_id>/receipt')
   @requires_ownership(Order, 'order_id')
   def order_receipt(order_id):
       # Authorization handled by decorator
       order = Order.query.get(order_id)
       return render_template('receipt.html', order=order)
   ```

2. **Use ORM Relationships Consistently:** Follow the pattern used in `/orders` endpoint:
   ```python
   user = User.query.get(user_id)
   order = [o for o in user.orders if o.id == order_id]
   if not order:
       abort(403)
   ```

3. **Implement RBAC (If Needed):** While not required for this simple application, add a `role` field to User model if administrative functions are added in the future.

---

**Analysis Completed:** 2025-10-29  
**Total Endpoints Analyzed:** 8 HTTP routes  
**Authorization Vulnerabilities Identified:** 1 (IDOR)  
**Externally Exploitable Vulnerabilities:** 1