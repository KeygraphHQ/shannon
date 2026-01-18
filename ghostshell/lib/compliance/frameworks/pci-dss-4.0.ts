/**
 * PCI-DSS v4.0 Framework Definition.
 * Source: https://www.pcisecuritystandards.org/document_library
 *
 * Note: This is a simplified subset focused on web application security.
 * Full PCI-DSS compliance requires additional operational and physical controls.
 */

import type { ComplianceFramework } from '../types';

export const PCI_DSS_4_0: ComplianceFramework = {
  id: 'pci-dss-4.0',
  name: 'PCI-DSS',
  version: '4.0',
  description:
    'The Payment Card Industry Data Security Standard (PCI-DSS) is a set of security standards designed to ensure that all companies that accept, process, store or transmit credit card information maintain a secure environment.',
  publisher: 'PCI Security Standards Council',
  url: 'https://www.pcisecuritystandards.org/',
  categories: [
    {
      id: 'REQ-1',
      name: 'Install and Maintain Network Security Controls',
      description:
        'Network security controls (NSCs), such as firewalls and other network security technologies, are network policy enforcement points that typically control network traffic between two or more logical or physical network segments.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-1.2',
          name: 'Network Security Control Configuration',
          description: 'NSCs are configured and maintained to restrict connections between untrusted networks',
          testCriteria: [
            'Firewall rules restrict inbound and outbound traffic',
            'Default deny policy is implemented',
            'DMZ is properly configured for public-facing components',
          ],
          remediationGuidance:
            'Configure network security controls to implement default deny policies. Restrict connections to only necessary traffic. Place public-facing components in a DMZ.',
          cweIds: ['CWE-923'],
          relatedCategories: ['config'],
        },
        {
          id: 'REQ-1.4',
          name: 'Restrict Cardholder Data Environment Connections',
          description: 'Connections between trusted and untrusted networks are controlled',
          testCriteria: [
            'CDE boundaries are clearly defined',
            'Access to CDE is restricted and monitored',
            'Segmentation controls are in place',
          ],
          remediationGuidance:
            'Define clear boundaries for the cardholder data environment. Implement network segmentation. Monitor and restrict all connections to/from the CDE.',
          cweIds: ['CWE-284'],
          relatedCategories: ['config', 'authz'],
        },
      ],
    },
    {
      id: 'REQ-2',
      name: 'Apply Secure Configurations',
      description:
        'Malicious individuals often use vendor default passwords and other vendor default settings to compromise systems. These defaults are easily discovered and exploited.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-2.2',
          name: 'System Components Securely Configured',
          description: 'System components are configured and managed securely',
          testCriteria: [
            'Default passwords are changed',
            'Unnecessary services are disabled',
            'Security parameters are properly configured',
          ],
          remediationGuidance:
            'Change all vendor-supplied defaults including passwords. Disable or remove unnecessary services, protocols, and functionality. Apply security hardening guidelines.',
          cweIds: ['CWE-16', 'CWE-1188', 'CWE-798'],
          relatedCategories: ['config', 'auth'],
        },
        {
          id: 'REQ-2.3',
          name: 'Wireless Environments Secured',
          description: 'Wireless environments connected to CDE are configured securely',
          testCriteria: [
            'Strong encryption is used for wireless',
            'Default wireless settings are changed',
            'Wireless networks are properly segmented',
          ],
          remediationGuidance:
            'Use WPA3 or WPA2-Enterprise. Change default SSIDs and passwords. Segment wireless networks from the CDE.',
          cweIds: ['CWE-311'],
          relatedCategories: ['crypto', 'config'],
        },
      ],
    },
    {
      id: 'REQ-3',
      name: 'Protect Stored Account Data',
      description:
        'Protection methods such as encryption, truncation, masking, and hashing are critical components of cardholder data protection.',
      severity: 'critical',
      controls: [
        {
          id: 'REQ-3.4',
          name: 'PAN Rendered Unreadable',
          description: 'PAN is rendered unreadable anywhere it is stored',
          testCriteria: [
            'PAN is encrypted or hashed when stored',
            'Strong cryptography is used',
            'Keys are properly managed',
          ],
          remediationGuidance:
            'Use strong encryption (AES-256) or one-way hashing (with salt) for stored PAN. Implement proper key management. Never store PAN in plain text.',
          cweIds: ['CWE-311', 'CWE-312', 'CWE-327'],
          relatedCategories: ['crypto'],
        },
        {
          id: 'REQ-3.5',
          name: 'Cryptographic Keys Protected',
          description: 'Cryptographic keys used to protect stored account data are secured',
          testCriteria: [
            'Access to keys is restricted',
            'Keys are stored securely',
            'Key management procedures are documented',
          ],
          remediationGuidance:
            'Store keys in secure key management systems. Restrict access to keys to minimal personnel. Implement key rotation procedures.',
          cweIds: ['CWE-320', 'CWE-321', 'CWE-798'],
          relatedCategories: ['crypto', 'authz'],
        },
      ],
    },
    {
      id: 'REQ-4',
      name: 'Protect Cardholder Data with Strong Cryptography',
      description:
        'Sensitive cardholder data must be protected during transmission over networks that are easily accessed by malicious individuals.',
      severity: 'critical',
      controls: [
        {
          id: 'REQ-4.2',
          name: 'PAN Protected During Transmission',
          description: 'PAN is protected with strong cryptography during transmission',
          testCriteria: [
            'TLS 1.2+ is used for all transmissions',
            'Strong cipher suites are configured',
            'Certificates are valid and properly verified',
          ],
          remediationGuidance:
            'Use TLS 1.2 or higher for all cardholder data transmissions. Configure strong cipher suites. Properly validate server certificates.',
          cweIds: ['CWE-319', 'CWE-326', 'CWE-327'],
          relatedCategories: ['crypto'],
        },
      ],
    },
    {
      id: 'REQ-5',
      name: 'Protect All Systems Against Malware',
      description:
        'Malicious software, commonly referred to as "malware" - including viruses, worms, and Trojans - enters the network during many business-approved activities.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-5.2',
          name: 'Anti-Malware Solution Deployed',
          description: 'Malware is prevented, detected, and addressed',
          testCriteria: [
            'Anti-malware is deployed on all applicable systems',
            'Signatures are kept up to date',
            'Scans are performed regularly',
          ],
          remediationGuidance:
            'Deploy anti-malware solutions on all systems commonly affected by malware. Keep signatures current. Perform regular scans and real-time protection.',
          cweIds: ['CWE-507'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'REQ-6',
      name: 'Develop and Maintain Secure Systems and Software',
      description:
        'Security vulnerabilities in systems and applications may allow criminals to access PAN and other cardholder data.',
      severity: 'critical',
      controls: [
        {
          id: 'REQ-6.2',
          name: 'Bespoke and Custom Software Developed Securely',
          description: 'Custom software is developed securely',
          testCriteria: [
            'Secure coding guidelines are followed',
            'Code reviews are performed',
            'Common vulnerabilities are addressed',
          ],
          remediationGuidance:
            'Follow secure coding guidelines (OWASP). Perform code reviews. Test for common vulnerabilities including injection, XSS, and authentication flaws.',
          cweIds: ['CWE-89', 'CWE-79', 'CWE-287'],
          relatedCategories: ['injection', 'xss', 'auth'],
        },
        {
          id: 'REQ-6.3',
          name: 'Security Vulnerabilities Identified and Addressed',
          description: 'Security vulnerabilities are identified and addressed',
          testCriteria: [
            'Vulnerability scanning is performed regularly',
            'Patches are applied in a timely manner',
            'Critical vulnerabilities are addressed within 30 days',
          ],
          remediationGuidance:
            'Perform regular vulnerability scans. Prioritize remediation based on risk. Apply critical security patches within 30 days.',
          cweIds: ['CWE-1035'],
          relatedCategories: ['config'],
        },
        {
          id: 'REQ-6.4',
          name: 'Public-Facing Web Applications Protected',
          description: 'Public-facing web applications are protected against attacks',
          testCriteria: [
            'Web application firewall (WAF) is deployed',
            'Application security testing is performed',
            'Vulnerabilities are remediated',
          ],
          remediationGuidance:
            'Deploy a web application firewall. Perform regular application security testing. Remediate identified vulnerabilities promptly.',
          cweIds: ['CWE-79', 'CWE-89', 'CWE-918'],
          relatedCategories: ['xss', 'injection', 'ssrf'],
        },
      ],
    },
    {
      id: 'REQ-7',
      name: 'Restrict Access to System Components',
      description:
        'To ensure critical data can only be accessed by authorized personnel, systems and processes must be in place to limit access based on need to know.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-7.2',
          name: 'Access Appropriately Defined and Assigned',
          description: 'Access to system components and data is appropriately defined and assigned',
          testCriteria: [
            'Access is based on job function',
            'Role-based access control is implemented',
            'Access reviews are performed regularly',
          ],
          remediationGuidance:
            'Implement role-based access control. Define access based on job function and need to know. Perform regular access reviews.',
          cweIds: ['CWE-284', 'CWE-269'],
          relatedCategories: ['authz'],
        },
      ],
    },
    {
      id: 'REQ-8',
      name: 'Identify Users and Authenticate Access',
      description:
        'Assigning a unique identification (ID) to each person ensures that actions taken on critical data and systems are performed by, and can be traced to, known and authorized users.',
      severity: 'critical',
      controls: [
        {
          id: 'REQ-8.2',
          name: 'User Identification Managed',
          description: 'User identification and related accounts are managed throughout their lifecycle',
          testCriteria: [
            'Unique IDs are assigned to each user',
            'Shared accounts are prohibited or controlled',
            'Account lifecycle is managed',
          ],
          remediationGuidance:
            'Assign unique IDs to each user. Avoid shared accounts. Implement account lifecycle management including provisioning, review, and deprovisioning.',
          cweIds: ['CWE-287', 'CWE-306'],
          relatedCategories: ['auth'],
        },
        {
          id: 'REQ-8.3',
          name: 'Strong Authentication for Users and Administrators',
          description: 'Strong authentication is established for users and administrators',
          testCriteria: [
            'Multi-factor authentication is implemented',
            'Strong passwords are required',
            'Authentication attempts are limited',
          ],
          remediationGuidance:
            'Implement MFA for all access to CDE. Require strong passwords (12+ characters). Lock accounts after 10 failed attempts.',
          cweIds: ['CWE-287', 'CWE-307', 'CWE-521'],
          relatedCategories: ['auth'],
        },
        {
          id: 'REQ-8.5',
          name: 'MFA Systems Properly Configured',
          description: 'Multi-factor authentication systems are configured to prevent misuse',
          testCriteria: [
            'MFA is required for all CDE access',
            'MFA factors are independent',
            'MFA cannot be bypassed',
          ],
          remediationGuidance:
            'Require MFA for all remote access and non-console access to CDE. Use independent authentication factors. Prevent MFA bypass.',
          cweIds: ['CWE-308'],
          relatedCategories: ['auth'],
        },
      ],
    },
    {
      id: 'REQ-10',
      name: 'Log and Monitor All Access',
      description:
        'Logging mechanisms and the ability to track user activities are critical in preventing, detecting, or minimizing the impact of a data compromise.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-10.2',
          name: 'Audit Logs Implemented',
          description: 'Audit logs are implemented to support detection of anomalies and suspicious activity',
          testCriteria: [
            'Access to cardholder data is logged',
            'Administrative actions are logged',
            'Security events are logged',
          ],
          remediationGuidance:
            'Log all access to cardholder data and system components. Log administrative actions. Log authentication attempts and security events.',
          cweIds: ['CWE-778', 'CWE-223'],
          relatedCategories: ['config'],
        },
        {
          id: 'REQ-10.3',
          name: 'Audit Logs Protected',
          description: 'Audit logs are protected from destruction and unauthorized modifications',
          testCriteria: [
            'Logs are protected from modification',
            'Access to logs is restricted',
            'Log integrity is verified',
          ],
          remediationGuidance:
            'Protect logs using access controls. Use secure, centralized logging. Implement log integrity monitoring.',
          cweIds: ['CWE-117', 'CWE-532'],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'REQ-11',
      name: 'Test Security of Systems and Networks Regularly',
      description:
        'Vulnerabilities are being discovered continually by malicious individuals and researchers, and being introduced by new software. System components must be tested frequently.',
      severity: 'high',
      controls: [
        {
          id: 'REQ-11.3',
          name: 'External and Internal Vulnerabilities Identified',
          description: 'External and internal vulnerabilities are regularly identified, prioritized, and addressed',
          testCriteria: [
            'Quarterly vulnerability scans are performed',
            'Penetration testing is performed annually',
            'Vulnerabilities are remediated based on risk',
          ],
          remediationGuidance:
            'Perform quarterly internal and external vulnerability scans. Conduct annual penetration testing. Remediate vulnerabilities based on risk ranking.',
          cweIds: ['CWE-1035'],
          relatedCategories: ['config'],
        },
        {
          id: 'REQ-11.4',
          name: 'Penetration Testing Performed',
          description: 'External and internal penetration testing is regularly performed',
          testCriteria: [
            'Annual penetration testing is performed',
            'Both network and application layer testing is conducted',
            'Findings are remediated and retested',
          ],
          remediationGuidance:
            'Perform penetration testing at least annually and after significant changes. Test both network and application layers. Remediate findings and verify fixes.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'REQ-12',
      name: 'Support Information Security with Organizational Policies',
      description:
        'A strong security policy sets the security tone for the whole entity and informs personnel what is expected of them.',
      severity: 'medium',
      controls: [
        {
          id: 'REQ-12.3',
          name: 'Security Awareness Program',
          description: 'Security awareness education is an ongoing activity',
          testCriteria: [
            'Security training is provided annually',
            'Training covers relevant threats',
            'Awareness of policies is verified',
          ],
          remediationGuidance:
            'Provide security awareness training upon hire and annually. Cover current threats and security policies. Test awareness and understanding.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
  ],
};
