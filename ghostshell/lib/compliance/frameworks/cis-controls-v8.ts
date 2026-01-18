/**
 * CIS Controls v8 Framework Definition.
 * Source: https://www.cisecurity.org/controls/v8
 *
 * Note: This is a simplified subset focused on web application security aspects.
 * Full CIS Controls compliance requires comprehensive infrastructure and operational controls.
 */

import type { ComplianceFramework } from '../types';

export const CIS_CONTROLS_V8: ComplianceFramework = {
  id: 'cis-controls-v8',
  name: 'CIS Controls',
  version: '8',
  description:
    'CIS Controls (formerly known as the SANS Top 20) are a prioritized set of actions that collectively form a defense-in-depth set of best practices that mitigate the most common attacks against systems and networks.',
  publisher: 'Center for Internet Security',
  url: 'https://www.cisecurity.org/controls/v8',
  categories: [
    {
      id: 'CIS-01',
      name: 'Inventory and Control of Enterprise Assets',
      description:
        'Actively manage (inventory, track, and correct) all enterprise assets connected to the infrastructure physically, virtually, remotely, and those within cloud environments.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-01.1',
          name: 'Asset Inventory',
          description: 'Establish and maintain detailed enterprise asset inventory',
          testCriteria: [
            'All assets are inventoried',
            'Inventory is kept up to date',
            'Asset details are captured (IP, MAC, owner)',
          ],
          remediationGuidance:
            'Implement automated asset discovery. Maintain detailed asset inventory including hardware, software, and cloud resources. Update inventory regularly.',
          cweIds: [],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-01.2',
          name: 'Unauthorized Asset Detection',
          description: 'Ensure unauthorized assets are detected and addressed',
          testCriteria: [
            'Network scanning detects new devices',
            'Unauthorized devices are isolated',
            'Rogue asset procedures exist',
          ],
          remediationGuidance:
            'Implement network access control. Scan for unauthorized devices. Establish procedures for handling rogue assets.',
          cweIds: [],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'CIS-02',
      name: 'Inventory and Control of Software Assets',
      description:
        'Actively manage (inventory, track, and correct) all software on the network so that only authorized software is installed and can execute.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-02.1',
          name: 'Software Inventory',
          description: 'Establish and maintain software inventory',
          testCriteria: [
            'All software is inventoried',
            'Version information is tracked',
            'Unauthorized software is identified',
          ],
          remediationGuidance:
            'Maintain inventory of all installed software including versions. Use automated tools to discover software. Identify and remove unauthorized software.',
          cweIds: ['CWE-1035'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-02.3',
          name: 'Application Allowlisting',
          description: 'Ensure only authorized software can execute',
          testCriteria: [
            'Application allowlisting is enabled',
            'Unauthorized execution is blocked',
            'Allowlist is maintained',
          ],
          remediationGuidance:
            'Implement application allowlisting. Block execution of unauthorized software. Maintain and update allowlist regularly.',
          cweIds: ['CWE-494'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'CIS-03',
      name: 'Data Protection',
      description:
        'Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data.',
      severity: 'critical',
      controls: [
        {
          id: 'CIS-03.1',
          name: 'Data Classification',
          description: 'Establish data classification scheme',
          testCriteria: [
            'Data classification scheme exists',
            'Data is labeled appropriately',
            'Handling procedures match classification',
          ],
          remediationGuidance:
            'Establish data classification scheme (public, internal, confidential, restricted). Label data according to classification. Define handling procedures for each level.',
          cweIds: ['CWE-200'],
          relatedCategories: [],
        },
        {
          id: 'CIS-03.10',
          name: 'Encrypt Sensitive Data in Transit',
          description: 'Encrypt sensitive data in transit',
          testCriteria: [
            'TLS is used for data transmission',
            'Strong cipher suites are configured',
            'Certificate validation is enforced',
          ],
          remediationGuidance:
            'Use TLS 1.2 or higher for all sensitive data transmission. Configure strong cipher suites. Validate certificates properly.',
          cweIds: ['CWE-319', 'CWE-326'],
          relatedCategories: ['crypto'],
        },
        {
          id: 'CIS-03.11',
          name: 'Encrypt Sensitive Data at Rest',
          description: 'Encrypt sensitive data at rest',
          testCriteria: [
            'Sensitive data is encrypted at rest',
            'Strong encryption algorithms are used',
            'Keys are properly managed',
          ],
          remediationGuidance:
            'Encrypt sensitive data at rest using AES-256 or equivalent. Implement proper key management. Use authenticated encryption modes.',
          cweIds: ['CWE-311', 'CWE-312'],
          relatedCategories: ['crypto'],
        },
      ],
    },
    {
      id: 'CIS-04',
      name: 'Secure Configuration of Enterprise Assets and Software',
      description:
        'Establish and maintain the secure configuration of enterprise assets and software.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-04.1',
          name: 'Secure Configuration Process',
          description: 'Establish secure configuration process',
          testCriteria: [
            'Secure configuration standards exist',
            'Configurations are documented',
            'Compliance is verified',
          ],
          remediationGuidance:
            'Develop secure configuration standards based on industry benchmarks. Document configurations. Regularly verify compliance.',
          cweIds: ['CWE-16', 'CWE-1188'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-04.7',
          name: 'Manage Default Accounts',
          description: 'Manage default accounts on enterprise assets and software',
          testCriteria: [
            'Default accounts are disabled or secured',
            'Default passwords are changed',
            'Unnecessary accounts are removed',
          ],
          remediationGuidance:
            'Change all default credentials. Disable or remove default accounts when possible. Document any required default accounts.',
          cweIds: ['CWE-798', 'CWE-1188'],
          relatedCategories: ['auth', 'config'],
        },
      ],
    },
    {
      id: 'CIS-05',
      name: 'Account Management',
      description:
        'Use processes and tools to assign and manage authorization to credentials for user accounts, including administrator accounts, as well as service accounts.',
      severity: 'critical',
      controls: [
        {
          id: 'CIS-05.1',
          name: 'Account Inventory',
          description: 'Establish and maintain account inventory',
          testCriteria: [
            'All accounts are inventoried',
            'Account owners are identified',
            'Privileged accounts are documented',
          ],
          remediationGuidance:
            'Maintain inventory of all accounts including service accounts. Identify account owners and purpose. Document privileged accounts separately.',
          cweIds: ['CWE-284'],
          relatedCategories: ['auth', 'authz'],
        },
        {
          id: 'CIS-05.3',
          name: 'Disable Dormant Accounts',
          description: 'Disable dormant accounts',
          testCriteria: [
            'Dormant accounts are identified',
            'Inactive accounts are disabled',
            'Account activity is monitored',
          ],
          remediationGuidance:
            'Identify accounts inactive for 45+ days. Disable dormant accounts. Monitor and report on account activity.',
          cweIds: ['CWE-284'],
          relatedCategories: ['auth'],
        },
        {
          id: 'CIS-05.4',
          name: 'Restrict Administrator Privileges',
          description: 'Restrict administrator privileges to dedicated admin accounts',
          testCriteria: [
            'Admin accounts are separate from user accounts',
            'Admin access is limited to need',
            'Admin activity is logged',
          ],
          remediationGuidance:
            'Use dedicated admin accounts separate from daily user accounts. Limit admin access based on need. Log and monitor all admin activities.',
          cweIds: ['CWE-269', 'CWE-284'],
          relatedCategories: ['authz'],
        },
      ],
    },
    {
      id: 'CIS-06',
      name: 'Access Control Management',
      description:
        'Use processes and tools to create, assign, manage, and revoke access credentials and privileges for user, administrator, and service accounts.',
      severity: 'critical',
      controls: [
        {
          id: 'CIS-06.1',
          name: 'Access Granting Process',
          description: 'Establish access granting process',
          testCriteria: [
            'Access request process exists',
            'Access is authorized before granting',
            'Access grants are documented',
          ],
          remediationGuidance:
            'Implement formal access request and approval process. Require authorization before granting access. Document all access grants.',
          cweIds: ['CWE-284', 'CWE-862'],
          relatedCategories: ['authz'],
        },
        {
          id: 'CIS-06.2',
          name: 'Access Revoking Process',
          description: 'Establish access revoking process',
          testCriteria: [
            'Access is revoked on termination',
            'Role change triggers access review',
            'Revocation is timely',
          ],
          remediationGuidance:
            'Revoke access immediately upon termination. Review access when roles change. Implement timely revocation procedures.',
          cweIds: ['CWE-284'],
          relatedCategories: ['authz'],
        },
        {
          id: 'CIS-06.3',
          name: 'Multi-Factor Authentication',
          description: 'Require MFA for externally-exposed applications',
          testCriteria: [
            'MFA is enabled for external access',
            'MFA is required for privileged accounts',
            'MFA methods are secure',
          ],
          remediationGuidance:
            'Enable MFA for all externally-exposed applications. Require MFA for privileged accounts. Use secure MFA methods (not SMS).',
          cweIds: ['CWE-287', 'CWE-308'],
          relatedCategories: ['auth'],
        },
        {
          id: 'CIS-06.5',
          name: 'Role-Based Access Control',
          description: 'Implement role-based access control',
          testCriteria: [
            'RBAC is implemented',
            'Roles are defined and documented',
            'Access is based on role',
          ],
          remediationGuidance:
            'Implement role-based access control. Define roles based on job function. Assign access based on roles, not individuals.',
          cweIds: ['CWE-284', 'CWE-269'],
          relatedCategories: ['authz'],
        },
      ],
    },
    {
      id: 'CIS-07',
      name: 'Continuous Vulnerability Management',
      description:
        'Develop a plan to continuously assess and track vulnerabilities on all enterprise assets within the enterprise\'s infrastructure.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-07.1',
          name: 'Vulnerability Management Process',
          description: 'Establish and maintain vulnerability management process',
          testCriteria: [
            'Vulnerability management process exists',
            'Responsibilities are assigned',
            'Process is documented',
          ],
          remediationGuidance:
            'Establish formal vulnerability management process. Assign responsibilities. Document procedures and SLAs.',
          cweIds: ['CWE-1035'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-07.4',
          name: 'Automated Application Vulnerability Scanning',
          description: 'Perform automated application vulnerability scanning',
          testCriteria: [
            'Application scanning is performed',
            'DAST tools are used',
            'Scan frequency meets requirements',
          ],
          remediationGuidance:
            'Perform regular application vulnerability scanning. Use dynamic application security testing (DAST) tools. Scan at least monthly or per release.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CIS-07.5',
          name: 'Vulnerability Remediation',
          description: 'Perform automated application vulnerability remediation',
          testCriteria: [
            'Vulnerabilities are prioritized',
            'Remediation timelines are defined',
            'Remediation is tracked',
          ],
          remediationGuidance:
            'Prioritize vulnerabilities based on risk. Define remediation timelines based on severity. Track remediation to completion.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'CIS-08',
      name: 'Audit Log Management',
      description:
        'Collect, alert, review, and retain audit logs of events that could help detect, understand, or recover from an attack.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-08.2',
          name: 'Collect Audit Logs',
          description: 'Collect audit logs',
          testCriteria: [
            'Audit logging is enabled',
            'Logs capture security events',
            'Logs are centralized',
          ],
          remediationGuidance:
            'Enable audit logging on all systems. Capture security-relevant events. Centralize logs for analysis.',
          cweIds: ['CWE-778', 'CWE-223'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-08.3',
          name: 'Ensure Adequate Log Storage',
          description: 'Ensure adequate audit log storage',
          testCriteria: [
            'Log storage is sufficient',
            'Retention requirements are met',
            'Storage capacity is monitored',
          ],
          remediationGuidance:
            'Ensure sufficient log storage capacity. Meet retention requirements (90+ days). Monitor storage capacity.',
          cweIds: ['CWE-778'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-08.5',
          name: 'Collect Detailed Audit Logs',
          description: 'Collect detailed audit logs',
          testCriteria: [
            'Logs include command-line data',
            'Logs capture authentication events',
            'Logs include data access events',
          ],
          remediationGuidance:
            'Enable detailed logging including command-line parameters. Log all authentication events. Capture data access and modification events.',
          cweIds: ['CWE-778'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'CIS-10',
      name: 'Malware Defenses',
      description:
        'Prevent or control the installation, spread, and execution of malicious applications, code, or scripts on enterprise assets.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-10.1',
          name: 'Deploy Anti-Malware',
          description: 'Deploy and maintain anti-malware software',
          testCriteria: [
            'Anti-malware is deployed',
            'Signatures are updated',
            'Real-time protection is enabled',
          ],
          remediationGuidance:
            'Deploy anti-malware on all applicable systems. Keep signatures current. Enable real-time scanning and protection.',
          cweIds: ['CWE-494'],
          relatedCategories: ['config'],
        },
        {
          id: 'CIS-10.5',
          name: 'Enable Anti-Exploitation Features',
          description: 'Enable anti-exploitation features',
          testCriteria: [
            'DEP/ASLR is enabled',
            'Exploit protection is configured',
            'Browser sandboxing is enabled',
          ],
          remediationGuidance:
            'Enable DEP and ASLR. Configure exploit protection features. Use browser sandboxing and security features.',
          cweIds: [],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'CIS-14',
      name: 'Security Awareness and Skills Training',
      description:
        'Establish and maintain a security awareness program to influence behavior among the workforce to be security conscious.',
      severity: 'medium',
      controls: [
        {
          id: 'CIS-14.1',
          name: 'Security Awareness Program',
          description: 'Establish and maintain security awareness program',
          testCriteria: [
            'Awareness program exists',
            'Training is provided regularly',
            'Completion is tracked',
          ],
          remediationGuidance:
            'Establish security awareness program. Provide training upon hire and annually. Track and enforce completion.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CIS-14.6',
          name: 'Train Developers in Secure Coding',
          description: 'Train workforce on secure coding',
          testCriteria: [
            'Secure coding training is provided',
            'OWASP Top 10 is covered',
            'Training is updated regularly',
          ],
          remediationGuidance:
            'Provide secure coding training to developers. Cover OWASP Top 10 and common vulnerabilities. Update training for new threats.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'CIS-16',
      name: 'Application Software Security',
      description:
        'Manage the security life cycle of in-house developed, hosted, or acquired software to prevent, detect, and remediate security weaknesses.',
      severity: 'critical',
      controls: [
        {
          id: 'CIS-16.1',
          name: 'Secure Application Development Process',
          description: 'Establish and maintain secure application development process',
          testCriteria: [
            'SDLC includes security activities',
            'Security requirements are defined',
            'Security testing is performed',
          ],
          remediationGuidance:
            'Integrate security into SDLC. Define security requirements upfront. Perform security testing throughout development.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CIS-16.4',
          name: 'Static Application Security Testing',
          description: 'Establish and manage SAST process',
          testCriteria: [
            'SAST tools are used',
            'Code is scanned before deployment',
            'Findings are remediated',
          ],
          remediationGuidance:
            'Implement SAST in CI/CD pipeline. Scan code before deployment. Remediate identified vulnerabilities.',
          cweIds: ['CWE-89', 'CWE-79'],
          relatedCategories: ['injection', 'xss'],
        },
        {
          id: 'CIS-16.5',
          name: 'Dynamic Application Security Testing',
          description: 'Establish and manage DAST process',
          testCriteria: [
            'DAST tools are used',
            'Applications are tested in staging',
            'Findings are remediated',
          ],
          remediationGuidance:
            'Implement DAST testing. Test applications in staging environment. Remediate identified vulnerabilities before production.',
          cweIds: ['CWE-89', 'CWE-79', 'CWE-918'],
          relatedCategories: ['injection', 'xss', 'ssrf'],
        },
        {
          id: 'CIS-16.9',
          name: 'Train Developers in Secure Coding',
          description: 'Ensure developers receive secure coding training',
          testCriteria: [
            'Developers receive secure coding training',
            'Training covers common vulnerabilities',
            'Training is updated regularly',
          ],
          remediationGuidance:
            'Provide secure coding training to all developers. Cover OWASP Top 10 and language-specific vulnerabilities. Update training annually.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CIS-16.12',
          name: 'Input Validation',
          description: 'Implement code-level security measures to prevent common web vulnerabilities',
          testCriteria: [
            'Input validation is implemented',
            'Output encoding is used',
            'Parameterized queries are used',
          ],
          remediationGuidance:
            'Validate all input on server side. Encode output based on context. Use parameterized queries for database operations.',
          cweIds: ['CWE-20', 'CWE-79', 'CWE-89'],
          relatedCategories: ['injection', 'xss'],
        },
      ],
    },
    {
      id: 'CIS-17',
      name: 'Incident Response Management',
      description:
        'Establish a program to develop and maintain an incident response capability to prepare, detect, and quickly respond to an attack.',
      severity: 'high',
      controls: [
        {
          id: 'CIS-17.1',
          name: 'Incident Response Plan',
          description: 'Designate personnel to manage incident handling',
          testCriteria: [
            'Incident response plan exists',
            'Roles are defined',
            'Contact information is current',
          ],
          remediationGuidance:
            'Develop incident response plan. Define roles and responsibilities. Maintain current contact information.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CIS-17.4',
          name: 'Establish Incident Handling Process',
          description: 'Establish and maintain incident handling process',
          testCriteria: [
            'Incident handling process is documented',
            'Process covers detection through recovery',
            'Process is regularly tested',
          ],
          remediationGuidance:
            'Document incident handling procedures. Cover detection, analysis, containment, eradication, recovery. Test process through exercises.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
  ],
};
