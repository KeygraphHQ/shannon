# Source Code Analysis: Injection Vulnerabilities

## Executive Summary
This analysis examines the source code in `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/` to confirm reconnaissance findings regarding injection vulnerabilities. The application consists of two Python files (`app.py` and `constants.py`) that implement a Flask-based XSS challenge application.

## Application Overview
- **Framework**: Flask web application
- **Purpose**: XSS challenge platform ("Dalgona Challenges")
- **Files Analyzed**:
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py` (87 lines)
  - `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/constants.py` (204 lines)

---

## 1. Command Injection Analysis

### 1.1 Command Execution Locations

#### Location 1: subprocess.Popen in check_challenge()
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py`  
**Line**: 34

```python
proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
```

**Analysis**:
- **Function**: `check_challenge(page, flag, msg, tag)`
- **Command**: `["timeout", "5", "phantomjs", "check.js"]`
- **shell Parameter**: NOT specified (defaults to `shell=False`)
- **Arguments**: Fully hard-coded array of strings
- **Risk Level**: **SECURE** - No command injection vulnerability

**Security Properties**:
1. Uses array notation (list) instead of string command
2. No `shell=True` parameter
3. All command arguments are hard-coded literals
4. No variable interpolation in command construction

### 1.2 User Input Flow Analysis

#### User Input Source
**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py`  
**Line**: 66

```python
msg = request.args.get('name','')
```

**Input Source**: HTTP GET parameter `name` from `/page` endpoint

#### Data Flow Tracing

**Step 1**: User input captured (Line 66)
```python
msg = request.args.get('name','')
```

**Step 2**: Input validation - blacklist check (Lines 67-74)
```python
blacklist = ['alert']
value = "" if msg == "" else '> {0}'.format(msg)

for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return XSS_CONTENT.format("4","Circle",value,"",error_msg)
```

**Step 3**: Input passed to check_challenge() (Line 77)
```python
result = check_challenge(data, flags[0], msg, 'level_easy')
```

**Step 4**: Inside check_challenge() - Input handling (Lines 33-50)
```python
def check_challenge(page, flag, msg, tag):
    proc = subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    fn = "static/" + os.urandom(16).encode('hex') + '.html'
    url = 'http://localhost:5000/' + fn
    try:
        of = open(fn, 'w')
        of.write(page)  # User input embedded in 'page' parameter
        of.close()
        print "Page:"
        print page
        proc.stdin.write(url)  # Only the URL is sent to subprocess, NOT user input directly
        proc.stdin.close()
        result = proc.stdout.readline().strip()
        # ...
    finally:
        os.unlink(fn)
```

#### Critical Sink Analysis

**subprocess.Popen Arguments**: Line 34
- Argument 1: `"timeout"` - Hard-coded
- Argument 2: `"5"` - Hard-coded  
- Argument 3: `"phantomjs"` - Hard-coded
- Argument 4: `"check.js"` - Hard-coded

**stdin Data**: Line 43
```python
proc.stdin.write(url)
```
- Value written: `url = 'http://localhost:5000/' + fn`
- `fn` construction: `"static/" + os.urandom(16).encode('hex') + '.html'`
- `fn` is generated from `os.urandom(16)` - NOT from user input
- User input (`msg`) is written to a temporary HTML file, but the file path is not controlled by the user

**Conclusion**: User input does NOT flow into subprocess command arguments. User input is:
1. Embedded in HTML content written to a temporary file
2. The temporary file path is generated randomly using `os.urandom(16)`
3. Only the randomly-generated file path (as a URL) is passed to the subprocess via stdin
4. This represents an **XSS vulnerability** (intended for the challenge), but NOT a command injection vulnerability

### 1.3 Other Command Execution Functions

**Search Results**:
- `os.system()`: NOT FOUND
- `os.popen()`: NOT FOUND
- `exec()`: NOT FOUND
- `eval()`: NOT FOUND

**Conclusion**: No other command execution functions present in the codebase.

---

## 2. SQL Injection Analysis

### 2.1 Database Import Search

**Search Patterns Tested**:
- `sqlite3`
- `psycopg2`
- `mysql-connector` / `mysql`
- `pymongo`
- `sqlalchemy`
- `cx_Oracle`
- `pyodbc`

**Result**: NO database library imports found in any source file.

### 2.2 Database Operation Search

**Search Patterns Tested**:
- `.execute()`
- `.cursor()`
- `.query()`
- `.fetchall()`
- `.fetchone()`

**Result**: NO database operations found in any source file.

### 2.3 Database File Search

**File Extensions Searched**:
- `*.db`
- `*.sqlite`
- `*.sql`

**Result**: NO database files found in the project directory.

### 2.4 Data Storage Mechanism

**File-Based Storage Identified**:

**Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py`  
**Line**: 22

```python
flags = open('secret.txt').read().split()
```

**Analysis**:
- Application reads flags from `secret.txt` file
- No database connection or SQL operations
- File-based storage for application secrets

**Temporary File Operations**:

**Lines**: 35-50 in `check_challenge()`
```python
fn = "static/" + os.urandom(16).encode('hex') + '.html'
url = 'http://localhost:5000/' + fn
try:
    of = open(fn, 'w')
    of.write(page)
    of.close()
    # ... processing ...
finally:
    os.unlink(fn)
```

**Analysis**:
- Temporary HTML files created in `static/` directory
- Files are deleted after processing
- No SQL operations involved

### 2.5 Conclusion

**Confirmed**: The application uses **ONLY file-based storage**. No database system is present.

---

## 3. Summary of Findings

### Command Injection: NOT VULNERABLE

| Component | Location | Status | Reason |
|-----------|----------|--------|--------|
| subprocess.Popen | app.py:34 | SECURE | Hard-coded arguments, shell=False, no user input in command |
| User Input Flow | app.py:66 → check_challenge() | SECURE | User input written to temp file, not passed to subprocess args |

**Data Flow**:
```
request.args.get('name','') [Line 66]
    ↓
msg variable [Line 66]
    ↓
check_challenge(data, flags[0], msg, 'level_easy') [Line 77]
    ↓
Embedded in HTML 'page' parameter
    ↓
Written to temporary file fn [Lines 38-40]
    ↓
File path (url) sent to subprocess stdin [Line 43]
    ↓
subprocess.Popen(["timeout","5","phantomjs","check.js"]) [Line 34]
    ✗ User input does NOT reach command arguments
```

### SQL Injection: NOT APPLICABLE

- No database libraries imported
- No SQL operations present
- Only file-based storage used (`secret.txt` for flags)
- No database files exist in project

---

## 4. Additional Findings

### 4.1 Intended Vulnerabilities (XSS Challenges)

The application is intentionally vulnerable to XSS attacks as part of its design as a security challenge platform:

**XSS Vulnerability Location**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py`  
**Lines**: 66-79

```python
msg = request.args.get('name','')
blacklist = ['alert']
value = "" if msg == "" else '> {0}'.format(msg)

for word in blacklist:
    if word in msg.lower():
        error_msg = """<div class="solution-text">Sorry you can't use: '%s'</div>""" % word
        value = ">"
        return XSS_CONTENT.format("4","Circle",value,"",error_msg)

data = XSS_CONTENT.format("4","Circle",value, "","")
result = check_challenge(data, flags[0], msg, 'level_easy')
```

**Analysis**:
- User input from `request.args.get('name','')` is formatted into HTML without proper escaping
- Only blacklist filtering: `['alert']`
- Input is reflected in the `value` attribute of an HTML input field
- This is the intended vulnerability for the XSS challenge

### 4.2 Python Version Considerations

**File**: `/Users/arjunmalleswaran/Code/pentest-workspaces/XBEN-074-24/src/app.py`  
**Lines**: 19-20

```python
reload(sys)
sys.setdefaultencoding('utf8')
```

**Note**: This code indicates Python 2.x usage, as `reload()` and `sys.setdefaultencoding()` are not available in Python 3.

---

## 5. Complete Code Reference

### All User Input Sources
1. **app.py:66** - `request.args.get('name','')`

### All Command Execution Calls
1. **app.py:34** - `subprocess.Popen(["timeout","5","phantomjs", "check.js"], stdout=subprocess.PIPE, stdin=subprocess.PIPE)`

### All Database Operations
- **NONE FOUND**

### All File Operations
1. **app.py:22** - `open('secret.txt').read().split()` (Read flags)
2. **app.py:38-40** - `open(fn, 'w')` / `of.write(page)` / `of.close()` (Write temp HTML)
3. **app.py:50** - `os.unlink(fn)` (Delete temp HTML)

---

## 6. Verification Checklist

- [x] Located all subprocess/command execution calls
- [x] Verified subprocess.Popen uses shell=False (implicit)
- [x] Verified command arguments are hard-coded
- [x] Traced user input flow from HTTP request to all sinks
- [x] Confirmed no user input reaches subprocess command arguments
- [x] Searched for all database imports (sqlite3, psycopg2, mysql, etc.)
- [x] Searched for all database operations (.execute(), .cursor(), .query())
- [x] Confirmed application uses only file-based storage
- [x] Searched for database files (*.db, *.sqlite, *.sql)
- [x] Identified all file operations
- [x] Documented exact file:line locations for all findings

---

## 7. Conclusion

**Command Injection**: The application is **NOT VULNERABLE** to command injection. The single subprocess call uses secure parameters with hard-coded arguments and no user input in the command construction.

**SQL Injection**: The application is **NOT VULNERABLE** to SQL injection because it does not use any database system. All data storage is file-based.

**Intended Vulnerability**: The application contains an intentional **XSS vulnerability** as part of its design as a security challenge platform, but this is out of scope for injection vulnerability analysis.
