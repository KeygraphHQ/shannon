# Coverage and Roadmap

A Web Security Testing (WST) checklist is a comprehensive guide that systematically outlines security tests for web applications, covering areas like information gathering, authentication, session management, input validation, and error handling to identify and mitigate vulnerabilities.

The checklist below highlights the specific WST categories and items that our product consistently and reliably addresses. While Shannon's dynamic detection often extends to other areas, we believe in transparency and have only checked the vulnerabilities we are designed to consistently catch. **Our coverage is strategically focused on the WST controls that are applicable to today's Web App technology stacks.**

We are actively working to expand this coverage to provide an even more comprehensive security solution for modern web applications.

## Current Coverage

Shannon currently targets the following classes of *exploitable* vulnerabilities:
- Broken Authentication & Authorization
- SQL Injection (SQLi)
- Command Injection
- Cross-Site Scripting (XSS)
- Server-Side Request Forgery (SSRF)

## What Shannon Does Not Cover

This list is not exhaustive of all potential security risks. Shannon does not, for example, report on issues that it cannot actively exploit, such as the use of vulnerable third-party libraries, weak encryption algorithms, or insecure configurations. These types of static-analysis findings are the focus of our upcoming **Keygraph Code Security (SAST)** product.

## WST Testing Checklist

| Test ID | Test Name | Status |
| --- | --- | --- |
| **WSTG-INFO** | **Information Gathering** |  |
| WSTG-INFO-01 | Conduct Search Engine Discovery and Reconnaissance for Information Leakage |  |
| WSTG-INFO-02 | Fingerprint Web Server | ✅ |
| WSTG-INFO-03 | Review Webserver Metafiles for Information Leakage |  |
| WSTG-INFO-04 | Enumerate Applications on Webserver |  |
| WSTG-INFO-05 | Review Webpage Content for Information Leakage |  |
| WSTG-INFO-06 | Identify Application Entry Points | ✅ |
| WSTG-INFO-07 | Map Execution Paths Through Application | ✅ |
| WSTG-INFO-08 | Fingerprint Web Application Framework | ✅ |
| WSTG-INFO-09 | Fingerprint Web Application | ✅ |
| WSTG-INFO-10 | Map Application Architecture | ✅ |
|  |  |  |
| **WSTG-CONF** | **Configuration and Deploy Management Testing** |  |
| WSTG-CONF-01 | Test Network Infrastructure Configuration | ✅ |
| WSTG-CONF-02 | Test Application Platform Configuration |  |
| WSTG-CONF-03 | Test File Extensions Handling for Sensitive Information |  |
| WSTG-CONF-04 | Review Old Backup and Unreferenced Files for Sensitive Information |  |
| WSTG-CONF-05 | Enumerate Infrastructure and Application Admin Interfaces |  |
| WSTG-CONF-06 | Test HTTP Methods |  |
| WSTG-CONF-07 | Test HTTP Strict Transport Security |  |
| WSTG-CONF-08 | Test RIA Cross Domain Policy |  |
| WSTG-CONF-09 | Test File Permission |  |
| WSTG-CONF-10 | Test for Subdomain Takeover | ✅ |
| WSTG-CONF-11 | Test Cloud Storage |  |
| WSTG-CONF-12 | Testing for Content Security Policy |  |
| WSTG-CONF-13 | Test Path Confusion |  |
| WSTG-CONF-14 | Test Other HTTP Security Header Misconfigurations |  |
|  |  |  |
| **WSTG-IDNT** | **Identity Management Testing** |  |
| WSTG-IDNT-01 | Test Role Definitions | ✅ |
| WSTG-IDNT-02 | Test User Registration Process | ✅ |
| WSTG-IDNT-03 | Test Account Provisioning Process | ✅ |
| WSTG-IDNT-04 | Testing for Account Enumeration and Guessable User Account | ✅ |
| WSTG-IDNT-05 | Testing for Weak or Unenforced Username Policy | ✅ |
|  |  |  |
| **WSTG-ATHN** | **Authentication Testing** |  |
| WSTG-ATHN-01 | Testing for Credentials Transported over an Encrypted Channel | ✅ |
| WSTG-ATHN-02 | Testing for Default Credentials | ✅ |
| WSTG-ATHN-03 | Testing for Weak Lock Out Mechanism | ✅ |
| WSTG-ATHN-04 | Testing for Bypassing Authentication Schema | ✅ |
| WSTG-ATHN-05 | Testing for Vulnerable Remember Password |  |
| WSTG-ATHN-06 | Testing for Browser Cache Weakness |  |
| WSTG-ATHN-07 | Testing for Weak Password Policy | ✅ |
| WSTG-ATHN-08 | Testing for Weak Security Question Answer | ✅ |
| WSTG-ATHN-09 | Testing for Weak Password Change or Reset Functionalities | ✅ |
| WSTG-ATHN-10 | Testing for Weaker Authentication in Alternative Channel | ✅ |
| WSTG-ATHN-11 | Testing Multi-Factor Authentication (MFA) | ✅ |
|  |  |  |
| **WSTG-ATHZ** | **Authorization Testing** |  |
| WSTG-ATHZ-01 | Testing Directory Traversal File Include | ✅ |
| WSTG-ATHZ-02 | Testing for Bypassing Authorization Schema | ✅ |
| WSTG-ATHZ-03 | Testing for Privilege Escalation | ✅ |
| WSTG-ATHZ-04 | Testing for Insecure Direct Object References | ✅ |
| WSTG-ATHZ-05 | Testing for OAuth Weaknesses | ✅ |
|  |  |  |
| **WSTG-SESS** | **Session Management Testing** |  |
| WSTG-SESS-01 | Testing for Session Management Schema | ✅ |
| WSTG-SESS-02 | Testing for Cookies Attributes | ✅ |
| WSTG-SESS-03 | Testing for Session Fixation | ✅ |
| WSTG-SESS-04 | Testing for Exposed Session Variables |  |
| WSTG-SESS-05 | Testing for Cross Site Request Forgery | ✅ |
| WSTG-SESS-06 | Testing for Logout Functionality | ✅ |
| WSTG-SESS-07 | Testing Session Timeout | ✅ |
| WSTG-SESS-08 | Testing for Session Puzzling |  |
| WSTG-SESS-09 | Testing for Session Hijacking |  |
| WSTG-SESS-10 | Testing JSON Web Tokens | ✅ |
| WSTG-SESS-11 | Testing for Concurrent Sessions |  |
|  |  |  |
| **WSTG-INPV** | **Input Validation Testing** |  |
| WSTG-INPV-01 | Testing for Reflected Cross Site Scripting | ✅ |
| WSTG-INPV-02 | Testing for Stored Cross Site Scripting | ✅ |
| WSTG-INPV-03 | Testing for HTTP Verb Tampering |  |
| WSTG-INPV-04 | Testing for HTTP Parameter pollution |  |
| WSTG-INPV-05 | Testing for SQL Injection | ✅ |
| WSTG-INPV-06 | Testing for LDAP Injection |  |
| WSTG-INPV-07 | Testing for XML Injection |  |
| WSTG-INPV-08 | Testing for SSI Injection |  |
| WSTG-INPV-09 | Testing for XPath Injection |  |
| WSTG-INPV-10 | Testing for IMAP SMTP Injection |  |
| WSTG-INPV-11 | Testing for Code Injection | ✅ |
| WSTG-INPV-12 | Testing for Command Injection | ✅ |
| WSTG-INPV-13 | Testing for Format String Injection |  |
| WSTG-INPV-14 | Testing for Incubated Vulnerabilities |  |
| WSTG-INPV-15 | Testing for HTTP Splitting Smuggling |  |
| WSTG-INPV-16 | Testing for HTTP Incoming Requests |  |
| WSTG-INPV-17 | Testing for Host Header Injection |  |
| WSTG-INPV-18 | Testing for Server-Side Template Injection | ✅ |
| WSTG-INPV-19 | Testing for Server-Side Request Forgery | ✅ |
| WSTG-INPV-20 | Testing for Mass Assignment |  |
|  |  |  |
| **WSTG-ERRH** | **Error Handling** |  |
| WSTG-ERRH-01 | Testing for Improper Error Handling |  |
| WSTG-ERRH-02 | Testing for Stack Traces |  |
|  |  |  |
| **WSTG-CRYP** | **Cryptography** |  |
| WSTG-CRYP-01 | Testing for Weak Transport Layer Security | ✅ |
| WSTG-CRYP-02 | Testing for Padding Oracle |  |
| WSTG-CRYP-03 | Testing for Sensitive Information Sent Via Unencrypted Channels | ✅ |
| WSTG-CRYP-04 | Testing for Weak Encryption |  |
|  |  |  |
| **WSTG-BUSLOGIC** | **Business Logic Testing** |  |
| WSTG-BUSL-01 | Test Business Logic Data Validation |  |
| WSTG-BUSL-02 | Test Ability to Forge Requests |  |
| WSTG-BUSL-03 | Test Integrity Checks |  |
| WSTG-BUSL-04 | Test for Process Timing |  |
| WSTG-BUSL-05 | Test Number of Times a Function Can Be Used Limits |  |
| WSTG-BUSL-06 | Testing for the Circumvention of Work Flows |  |
| WSTG-BUSL-07 | Test Defenses Against Application Misuse |  |
| WSTG-BUSL-08 | Test Upload of Unexpected File Types |  |
| WSTG-BUSL-09 | Test Upload of Malicious Files |  |
| WSTG-BUSL-10 | Test Payment Functionality |  |
|  |  |  |
| **WSTG-CLIENT** | **Client-side Testing** |  |
| WSTG-CLNT-01 | Testing for DOM Based Cross Site Scripting | ✅ |
| WSTG-CLNT-02 | Testing for JavaScript Execution | ✅ |
| WSTG-CLNT-03 | Testing for HTML Injection | ✅ |
| WSTG-CLNT-04 | Testing for Client-Side URL Redirect | ✅ |
| WSTG-CLNT-05 | Testing for CSS Injection |  |
| WSTG-CLNT-06 | Testing for Client-Side Resource Manipulation |  |
| WSTG-CLNT-07 | Test Cross Origin Resource Sharing |  |
| WSTG-CLNT-08 | Testing for Cross Site Flashing |  |
| WSTG-CLNT-09 | Testing for Clickjacking |  |
| WSTG-CLNT-10 | Testing WebSockets |  |
| WSTG-CLNT-11 | Test Web Messaging |  |
| WSTG-CLNT-12 | Test Browser Storage | ✅ |
| WSTG-CLNT-13 | Testing for Cross Site Script Inclusion | ✅ |
| WSTG-CLNT-14 | Testing for Reverse Tabnabbing |  |
|  |  |  |
| **WSTG-APIT** | **API Testing** |  |
| WSTG-APIT-01 | API Reconnaissance | ✅ |
| WSTG-APIT-02 | API Broken Object Level Authorization | ✅ |
| WSTG-APIT-99 | Testing GraphQL | ✅ |
|  |  |  |
