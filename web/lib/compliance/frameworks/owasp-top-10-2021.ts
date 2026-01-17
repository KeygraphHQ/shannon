/**
 * OWASP Top 10 (2021) Framework Definition.
 * Source: https://owasp.org/Top10/
 */

import type { ComplianceFramework } from '../types';

export const OWASP_TOP_10_2021: ComplianceFramework = {
  id: 'owasp-top-10-2021',
  name: 'OWASP Top 10',
  version: '2021',
  description:
    'The OWASP Top 10 is a standard awareness document for developers and web application security. It represents a broad consensus about the most critical security risks to web applications.',
  publisher: 'OWASP Foundation',
  url: 'https://owasp.org/Top10/',
  categories: [
    {
      id: 'A01',
      name: 'Broken Access Control',
      description:
        'Access control enforces policy such that users cannot act outside of their intended permissions. Failures typically lead to unauthorized information disclosure, modification, or destruction of all data or performing a business function outside the user\'s limits.',
      severity: 'critical',
      controls: [
        {
          id: 'A01.01',
          name: 'Least Privilege',
          description: 'Deny access by default and implement least privilege principles',
          testCriteria: [
            'Access is denied by default except for public resources',
            'Users can only access resources they own or are authorized to',
            'Role-based access control is properly implemented',
          ],
          remediationGuidance:
            'Implement proper access control mechanisms that deny by default. Use role-based access control (RBAC) and ensure users can only access resources they are authorized for.',
          cweIds: ['CWE-284', 'CWE-285', 'CWE-639', 'CWE-862', 'CWE-863'],
          relatedCategories: ['authz', 'auth'],
        },
        {
          id: 'A01.02',
          name: 'Directory Traversal Prevention',
          description: 'Prevent unauthorized access to files and directories',
          testCriteria: [
            'User input is validated to prevent path traversal',
            'File access is restricted to intended directories',
            'Symbolic links cannot be abused to access restricted files',
          ],
          remediationGuidance:
            'Validate and sanitize all user input used in file paths. Use allowlists for permitted directories and file extensions.',
          cweIds: ['CWE-22', 'CWE-23', 'CWE-36'],
          relatedCategories: ['injection', 'config'],
        },
        {
          id: 'A01.03',
          name: 'CORS Configuration',
          description: 'Properly configure CORS to prevent unauthorized cross-origin access',
          testCriteria: [
            'CORS headers restrict access to trusted origins',
            'Credentials are only shared with trusted domains',
            'Wildcard origins are not used with credentials',
          ],
          remediationGuidance:
            'Configure CORS to explicitly allow only trusted origins. Never use wildcards with credentials. Validate Origin headers server-side.',
          cweIds: ['CWE-346', 'CWE-942'],
          relatedCategories: ['config', 'authz'],
        },
      ],
    },
    {
      id: 'A02',
      name: 'Cryptographic Failures',
      description:
        'Failures related to cryptography (or lack thereof) often lead to exposure of sensitive data. Previously known as Sensitive Data Exposure.',
      severity: 'critical',
      controls: [
        {
          id: 'A02.01',
          name: 'Data Encryption in Transit',
          description: 'Encrypt all data transmitted over networks',
          testCriteria: [
            'TLS 1.2 or higher is used for all connections',
            'Strong cipher suites are configured',
            'Certificate validation is properly implemented',
          ],
          remediationGuidance:
            'Use TLS 1.2 or higher for all network communications. Configure strong cipher suites and enable HSTS. Properly validate certificates.',
          cweIds: ['CWE-319', 'CWE-523', 'CWE-757'],
          relatedCategories: ['crypto', 'config'],
        },
        {
          id: 'A02.02',
          name: 'Data Encryption at Rest',
          description: 'Encrypt sensitive data stored in databases and files',
          testCriteria: [
            'Sensitive data is encrypted before storage',
            'Strong encryption algorithms are used (AES-256)',
            'Encryption keys are properly managed',
          ],
          remediationGuidance:
            'Encrypt all sensitive data at rest using AES-256 or equivalent. Implement proper key management with rotation. Use authenticated encryption modes.',
          cweIds: ['CWE-311', 'CWE-312', 'CWE-313'],
          relatedCategories: ['crypto'],
        },
        {
          id: 'A02.03',
          name: 'Password Storage',
          description: 'Securely hash and store passwords',
          testCriteria: [
            'Passwords are hashed with strong algorithms (bcrypt, Argon2)',
            'Unique salts are used for each password',
            'Hash work factor is appropriately configured',
          ],
          remediationGuidance:
            'Use Argon2id or bcrypt for password hashing. Configure appropriate work factors. Never store passwords in plain text or reversible encryption.',
          cweIds: ['CWE-256', 'CWE-257', 'CWE-328', 'CWE-916'],
          relatedCategories: ['auth', 'crypto'],
        },
      ],
    },
    {
      id: 'A03',
      name: 'Injection',
      description:
        'Injection flaws, such as SQL, NoSQL, OS, and LDAP injection, occur when untrusted data is sent to an interpreter as part of a command or query.',
      severity: 'critical',
      controls: [
        {
          id: 'A03.01',
          name: 'SQL Injection Prevention',
          description: 'Prevent SQL injection through parameterized queries',
          testCriteria: [
            'All database queries use parameterized statements',
            'User input is never concatenated into SQL strings',
            'ORM frameworks are used correctly',
          ],
          remediationGuidance:
            'Use parameterized queries or prepared statements for all database operations. Never concatenate user input into SQL queries. Use ORM frameworks with proper escaping.',
          cweIds: ['CWE-89', 'CWE-564'],
          relatedCategories: ['injection'],
        },
        {
          id: 'A03.02',
          name: 'Command Injection Prevention',
          description: 'Prevent OS command injection',
          testCriteria: [
            'User input is never passed directly to system commands',
            'Command arguments are properly escaped',
            'Alternative APIs are used instead of shell execution',
          ],
          remediationGuidance:
            'Avoid passing user input to system commands. Use language-specific APIs instead of shell execution. If unavoidable, use proper escaping and allowlists.',
          cweIds: ['CWE-77', 'CWE-78'],
          relatedCategories: ['injection'],
        },
        {
          id: 'A03.03',
          name: 'XSS Prevention',
          description: 'Prevent cross-site scripting attacks',
          testCriteria: [
            'All output is properly encoded for context',
            'Content Security Policy is implemented',
            'DOM manipulation uses safe APIs',
          ],
          remediationGuidance:
            'Encode all output based on context (HTML, JavaScript, CSS, URL). Implement Content Security Policy. Use frameworks that auto-escape output.',
          cweIds: ['CWE-79', 'CWE-80', 'CWE-87'],
          relatedCategories: ['xss', 'injection'],
        },
      ],
    },
    {
      id: 'A04',
      name: 'Insecure Design',
      description:
        'Insecure design is a broad category representing different weaknesses, expressed as missing or ineffective control design.',
      severity: 'high',
      controls: [
        {
          id: 'A04.01',
          name: 'Threat Modeling',
          description: 'Design with security threats in mind',
          testCriteria: [
            'Threat modeling is performed during design phase',
            'Security requirements are defined and tracked',
            'Attack surfaces are identified and minimized',
          ],
          remediationGuidance:
            'Perform threat modeling during design. Define security requirements upfront. Use secure design patterns and minimize attack surface.',
          cweIds: ['CWE-1110'],
          relatedCategories: ['config'],
        },
        {
          id: 'A04.02',
          name: 'Rate Limiting',
          description: 'Implement rate limiting to prevent abuse',
          testCriteria: [
            'Rate limiting is applied to sensitive endpoints',
            'Brute force attacks are detected and blocked',
            'Resource consumption is bounded',
          ],
          remediationGuidance:
            'Implement rate limiting on authentication endpoints, APIs, and resource-intensive operations. Use exponential backoff for repeated failures.',
          cweIds: ['CWE-770', 'CWE-799'],
          relatedCategories: ['auth', 'config'],
        },
      ],
    },
    {
      id: 'A05',
      name: 'Security Misconfiguration',
      description:
        'Security misconfiguration is the most commonly seen issue. This is commonly a result of insecure default configurations, incomplete or ad hoc configurations, open cloud storage, misconfigured HTTP headers, and verbose error messages.',
      severity: 'high',
      controls: [
        {
          id: 'A05.01',
          name: 'Secure Defaults',
          description: 'Use secure default configurations',
          testCriteria: [
            'Default credentials are changed',
            'Unnecessary features are disabled',
            'Security headers are configured',
          ],
          remediationGuidance:
            'Change all default credentials. Disable unnecessary features, ports, and services. Configure security headers (CSP, X-Frame-Options, etc.).',
          cweIds: ['CWE-16', 'CWE-1188'],
          relatedCategories: ['config'],
        },
        {
          id: 'A05.02',
          name: 'Error Handling',
          description: 'Handle errors securely without information disclosure',
          testCriteria: [
            'Error messages do not reveal sensitive information',
            'Stack traces are not exposed to users',
            'Errors are properly logged internally',
          ],
          remediationGuidance:
            'Return generic error messages to users. Log detailed errors internally. Never expose stack traces or database errors in production.',
          cweIds: ['CWE-209', 'CWE-215'],
          relatedCategories: ['config'],
        },
        {
          id: 'A05.03',
          name: 'Security Headers',
          description: 'Configure proper HTTP security headers',
          testCriteria: [
            'Content-Security-Policy is configured',
            'X-Frame-Options or frame-ancestors is set',
            'X-Content-Type-Options is set to nosniff',
          ],
          remediationGuidance:
            'Configure all recommended security headers: CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy.',
          cweIds: ['CWE-693', 'CWE-1021'],
          relatedCategories: ['config', 'xss'],
        },
      ],
    },
    {
      id: 'A06',
      name: 'Vulnerable and Outdated Components',
      description:
        'Components, such as libraries, frameworks, and other software modules, run with the same privileges as the application. If a vulnerable component is exploited, such an attack can facilitate serious data loss or server takeover.',
      severity: 'high',
      controls: [
        {
          id: 'A06.01',
          name: 'Dependency Management',
          description: 'Keep dependencies up to date and secure',
          testCriteria: [
            'Dependencies are inventoried and tracked',
            'Known vulnerabilities are monitored',
            'Updates are applied in a timely manner',
          ],
          remediationGuidance:
            'Maintain a software bill of materials (SBOM). Regularly scan for vulnerabilities. Apply security patches promptly.',
          cweIds: ['CWE-1035', 'CWE-1104'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'A07',
      name: 'Identification and Authentication Failures',
      description:
        'Confirmation of the user\'s identity, authentication, and session management is critical to protect against authentication-related attacks.',
      severity: 'critical',
      controls: [
        {
          id: 'A07.01',
          name: 'Strong Authentication',
          description: 'Implement strong authentication mechanisms',
          testCriteria: [
            'Multi-factor authentication is available',
            'Password complexity requirements are enforced',
            'Account lockout is implemented after failed attempts',
          ],
          remediationGuidance:
            'Implement MFA for sensitive operations. Enforce strong password policies. Lock accounts after repeated failed attempts.',
          cweIds: ['CWE-287', 'CWE-306', 'CWE-307'],
          relatedCategories: ['auth'],
        },
        {
          id: 'A07.02',
          name: 'Session Management',
          description: 'Securely manage user sessions',
          testCriteria: [
            'Session tokens are generated securely',
            'Sessions expire after inactivity',
            'Session fixation is prevented',
          ],
          remediationGuidance:
            'Use cryptographically secure session token generation. Set appropriate session timeouts. Regenerate session IDs after authentication.',
          cweIds: ['CWE-384', 'CWE-613', 'CWE-614'],
          relatedCategories: ['auth'],
        },
        {
          id: 'A07.03',
          name: 'Credential Recovery',
          description: 'Implement secure password recovery',
          testCriteria: [
            'Password reset tokens are secure and time-limited',
            'Recovery questions are not used alone',
            'Email enumeration is prevented',
          ],
          remediationGuidance:
            'Use secure, time-limited tokens for password reset. Do not reveal if email exists. Implement rate limiting on recovery endpoints.',
          cweIds: ['CWE-640', 'CWE-203'],
          relatedCategories: ['auth'],
        },
      ],
    },
    {
      id: 'A08',
      name: 'Software and Data Integrity Failures',
      description:
        'Software and data integrity failures relate to code and infrastructure that does not protect against integrity violations.',
      severity: 'high',
      controls: [
        {
          id: 'A08.01',
          name: 'Integrity Verification',
          description: 'Verify integrity of software and data',
          testCriteria: [
            'Digital signatures are verified for updates',
            'Dependencies are verified against known hashes',
            'Data integrity is validated',
          ],
          remediationGuidance:
            'Verify digital signatures on software updates. Use lockfiles and verify dependency hashes. Implement data integrity checks.',
          cweIds: ['CWE-345', 'CWE-494', 'CWE-502'],
          relatedCategories: ['config'],
        },
        {
          id: 'A08.02',
          name: 'Insecure Deserialization',
          description: 'Prevent insecure deserialization attacks',
          testCriteria: [
            'Serialized data from untrusted sources is validated',
            'Type checks are enforced during deserialization',
            'Deserialization of user input is avoided',
          ],
          remediationGuidance:
            'Do not deserialize data from untrusted sources. Implement integrity checks. Use safe deserialization libraries with type restrictions.',
          cweIds: ['CWE-502'],
          relatedCategories: ['injection'],
        },
      ],
    },
    {
      id: 'A09',
      name: 'Security Logging and Monitoring Failures',
      description:
        'Without logging and monitoring, breaches cannot be detected. Insufficient logging, detection, monitoring, and active response occurs any time.',
      severity: 'medium',
      controls: [
        {
          id: 'A09.01',
          name: 'Security Event Logging',
          description: 'Log security-relevant events',
          testCriteria: [
            'Authentication events are logged',
            'Authorization failures are logged',
            'Data access and changes are logged',
          ],
          remediationGuidance:
            'Log all authentication attempts, authorization failures, input validation failures, and sensitive data access. Include sufficient context for investigation.',
          cweIds: ['CWE-778', 'CWE-223'],
          relatedCategories: ['config'],
        },
        {
          id: 'A09.02',
          name: 'Log Protection',
          description: 'Protect logs from tampering and unauthorized access',
          testCriteria: [
            'Logs are protected from modification',
            'Log access is restricted',
            'Logs are backed up and retained appropriately',
          ],
          remediationGuidance:
            'Store logs securely with access controls. Use append-only storage. Implement log integrity checking and appropriate retention.',
          cweIds: ['CWE-117', 'CWE-532'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'A10',
      name: 'Server-Side Request Forgery (SSRF)',
      description:
        'SSRF flaws occur whenever a web application is fetching a remote resource without validating the user-supplied URL.',
      severity: 'critical',
      controls: [
        {
          id: 'A10.01',
          name: 'URL Validation',
          description: 'Validate and sanitize user-supplied URLs',
          testCriteria: [
            'URL scheme is restricted to allowed protocols',
            'Internal IP addresses and hostnames are blocked',
            'URL redirects are not followed or are validated',
          ],
          remediationGuidance:
            'Validate URL schemes (allow only http/https). Block internal IP ranges and cloud metadata endpoints. Do not follow redirects or validate redirect destinations.',
          cweIds: ['CWE-918'],
          relatedCategories: ['ssrf', 'injection'],
        },
        {
          id: 'A10.02',
          name: 'Network Segmentation',
          description: 'Segment networks to limit SSRF impact',
          testCriteria: [
            'Outbound connections are restricted',
            'Internal services are not accessible from untrusted zones',
            'Firewall rules limit server-side requests',
          ],
          remediationGuidance:
            'Implement network segmentation. Use firewall rules to restrict outbound connections from application servers. Isolate sensitive internal services.',
          cweIds: ['CWE-918'],
          relatedCategories: ['ssrf', 'config'],
        },
      ],
    },
  ],
};
