/**
 * SOC 2 Trust Services Criteria Framework Definition.
 * Source: https://us.aicpa.org/interestareas/frc/assuranceadvisoryservices/trustdataintegritytaskforce
 *
 * Note: This is a simplified subset focused on web application security aspects.
 * Full SOC 2 compliance requires comprehensive operational and organizational controls.
 */

import type { ComplianceFramework } from '../types';

export const SOC2_TRUST_PRINCIPLES: ComplianceFramework = {
  id: 'soc2-trust-principles',
  name: 'SOC 2 Trust Services',
  version: '2017',
  description:
    'SOC 2 is a voluntary compliance standard for service organizations, developed by the American Institute of CPAs (AICPA). It specifies how organizations should manage customer data based on five trust service principles: security, availability, processing integrity, confidentiality, and privacy.',
  publisher: 'AICPA',
  url: 'https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/socforserviceorganizations',
  categories: [
    {
      id: 'CC1',
      name: 'Control Environment',
      description:
        'The set of standards, processes, and structures that provide the basis for carrying out internal control across the organization.',
      severity: 'medium',
      controls: [
        {
          id: 'CC1.1',
          name: 'Commitment to Integrity and Ethics',
          description: 'The entity demonstrates a commitment to integrity and ethical values',
          testCriteria: [
            'Code of conduct is defined and communicated',
            'Ethical standards are enforced',
            'Management sets tone at the top',
          ],
          remediationGuidance:
            'Establish and communicate a code of conduct. Enforce ethical standards consistently. Leadership should model expected behavior.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CC1.4',
          name: 'Commitment to Competence',
          description: 'The entity demonstrates a commitment to attract, develop, and retain competent individuals',
          testCriteria: [
            'Competency requirements are defined',
            'Training is provided',
            'Performance is evaluated',
          ],
          remediationGuidance:
            'Define competency requirements for security roles. Provide regular training. Evaluate and address competency gaps.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'CC2',
      name: 'Communication and Information',
      description:
        'Information is necessary for the entity to carry out internal control responsibilities to support the achievement of its objectives.',
      severity: 'medium',
      controls: [
        {
          id: 'CC2.1',
          name: 'Information Quality',
          description: 'The entity obtains or generates and uses relevant, quality information',
          testCriteria: [
            'Security information is collected and analyzed',
            'Information quality is maintained',
            'Relevant information is available when needed',
          ],
          remediationGuidance:
            'Implement security monitoring and logging. Ensure log quality and completeness. Make security information accessible to relevant personnel.',
          cweIds: ['CWE-778'],
          relatedCategories: ['config'],
        },
        {
          id: 'CC2.2',
          name: 'Internal Communication',
          description: 'The entity internally communicates information necessary to support functioning of internal control',
          testCriteria: [
            'Security policies are communicated',
            'Incidents are reported and communicated',
            'Changes are communicated to affected parties',
          ],
          remediationGuidance:
            'Communicate security policies and procedures. Establish incident reporting channels. Communicate changes that affect security.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'CC3',
      name: 'Risk Assessment',
      description:
        'Risk assessment involves a dynamic and iterative process for identifying and assessing risks to the achievement of objectives.',
      severity: 'high',
      controls: [
        {
          id: 'CC3.1',
          name: 'Risk Identification',
          description: 'The entity specifies objectives and identifies risks to achievement of objectives',
          testCriteria: [
            'Security objectives are defined',
            'Risks are identified and documented',
            'Risk assessments are performed regularly',
          ],
          remediationGuidance:
            'Define clear security objectives. Conduct regular risk assessments. Document and track identified risks.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CC3.2',
          name: 'Risk Analysis',
          description: 'The entity identifies and analyzes risks to determine how risks should be managed',
          testCriteria: [
            'Risk likelihood and impact are assessed',
            'Risk tolerance is defined',
            'Risk responses are determined',
          ],
          remediationGuidance:
            'Analyze risk likelihood and potential impact. Define risk tolerance levels. Determine appropriate risk responses.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CC3.4',
          name: 'Fraud Risk',
          description: 'The entity considers the potential for fraud in assessing risks',
          testCriteria: [
            'Fraud risks are identified',
            'Controls address fraud risks',
            'Segregation of duties is maintained',
          ],
          remediationGuidance:
            'Identify potential fraud scenarios. Implement controls to prevent and detect fraud. Maintain segregation of duties.',
          cweIds: ['CWE-269'],
          relatedCategories: ['authz'],
        },
      ],
    },
    {
      id: 'CC5',
      name: 'Control Activities',
      description:
        'Control activities are the actions established through policies and procedures that help ensure that management\'s directives to mitigate risks to the achievement of objectives are carried out.',
      severity: 'high',
      controls: [
        {
          id: 'CC5.1',
          name: 'Control Activities for Risk Mitigation',
          description: 'The entity selects and develops control activities that contribute to mitigation of risks',
          testCriteria: [
            'Controls are designed and implemented',
            'Controls address identified risks',
            'Control effectiveness is monitored',
          ],
          remediationGuidance:
            'Design and implement controls based on risk assessment. Ensure controls effectively mitigate identified risks. Monitor control effectiveness.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CC5.2',
          name: 'Technology General Controls',
          description: 'The entity selects and develops general control activities over technology',
          testCriteria: [
            'Access controls are implemented',
            'Change management is established',
            'IT operations are controlled',
          ],
          remediationGuidance:
            'Implement access controls for systems and data. Establish change management procedures. Control IT operations and infrastructure.',
          cweIds: ['CWE-284'],
          relatedCategories: ['authz', 'config'],
        },
      ],
    },
    {
      id: 'CC6',
      name: 'Logical and Physical Access Controls',
      description:
        'Logical and physical access to systems and data is restricted to authorized users.',
      severity: 'critical',
      controls: [
        {
          id: 'CC6.1',
          name: 'Access Management',
          description: 'The entity implements logical access security software, infrastructure, and architectures',
          testCriteria: [
            'Access control systems are implemented',
            'Authentication mechanisms are in place',
            'Access is restricted based on need',
          ],
          remediationGuidance:
            'Implement access control systems. Use strong authentication mechanisms. Restrict access based on the principle of least privilege.',
          cweIds: ['CWE-284', 'CWE-287'],
          relatedCategories: ['auth', 'authz'],
        },
        {
          id: 'CC6.2',
          name: 'Access Registration and Authorization',
          description: 'The entity registers authorized users and authorizes their access',
          testCriteria: [
            'User registration process exists',
            'Authorization is based on business need',
            'Access approvals are documented',
          ],
          remediationGuidance:
            'Implement formal user registration process. Base authorization on business need. Document and review access approvals.',
          cweIds: ['CWE-284', 'CWE-862'],
          relatedCategories: ['authz'],
        },
        {
          id: 'CC6.3',
          name: 'Access Removal',
          description: 'The entity removes access to protected information assets when appropriate',
          testCriteria: [
            'Access is revoked upon termination',
            'Access reviews are performed',
            'Unused accounts are disabled',
          ],
          remediationGuidance:
            'Revoke access promptly upon termination or role change. Perform regular access reviews. Disable inactive accounts.',
          cweIds: ['CWE-284'],
          relatedCategories: ['authz'],
        },
        {
          id: 'CC6.6',
          name: 'System Boundary Protection',
          description: 'The entity implements controls to prevent or detect and act upon introduction of unauthorized or malicious software',
          testCriteria: [
            'Malware protection is implemented',
            'Network boundaries are protected',
            'Intrusion detection is in place',
          ],
          remediationGuidance:
            'Deploy anti-malware solutions. Implement firewall and network security controls. Use intrusion detection and prevention systems.',
          cweIds: ['CWE-494'],
          relatedCategories: ['config'],
        },
        {
          id: 'CC6.7',
          name: 'Transmission Protection',
          description: 'The entity restricts the transmission, movement, and removal of information',
          testCriteria: [
            'Data in transit is encrypted',
            'Data transfer is authorized',
            'Removable media is controlled',
          ],
          remediationGuidance:
            'Encrypt data in transit using TLS. Authorize and monitor data transfers. Control and track removable media.',
          cweIds: ['CWE-319', 'CWE-311'],
          relatedCategories: ['crypto'],
        },
      ],
    },
    {
      id: 'CC7',
      name: 'System Operations',
      description:
        'The entity manages system operations to ensure continuity and security.',
      severity: 'high',
      controls: [
        {
          id: 'CC7.1',
          name: 'Vulnerability Management',
          description: 'The entity identifies, evaluates, and manages vulnerabilities',
          testCriteria: [
            'Vulnerability scanning is performed',
            'Patches are applied timely',
            'Vulnerabilities are tracked to closure',
          ],
          remediationGuidance:
            'Perform regular vulnerability scanning. Apply security patches promptly. Track vulnerabilities to resolution.',
          cweIds: ['CWE-1035'],
          relatedCategories: ['config'],
        },
        {
          id: 'CC7.2',
          name: 'Security Event Monitoring',
          description: 'The entity monitors system components and the operation of those components',
          testCriteria: [
            'Security events are logged',
            'Logs are monitored',
            'Anomalies are investigated',
          ],
          remediationGuidance:
            'Implement comprehensive security logging. Monitor logs for security events. Investigate and respond to anomalies.',
          cweIds: ['CWE-778', 'CWE-223'],
          relatedCategories: ['config'],
        },
        {
          id: 'CC7.3',
          name: 'Security Incident Response',
          description: 'The entity evaluates security events to determine whether they could or have resulted in a failure',
          testCriteria: [
            'Incident response procedures exist',
            'Incidents are classified and prioritized',
            'Root cause analysis is performed',
          ],
          remediationGuidance:
            'Establish incident response procedures. Classify and prioritize security incidents. Conduct root cause analysis and implement corrective actions.',
          cweIds: [],
          relatedCategories: [],
        },
        {
          id: 'CC7.4',
          name: 'Incident Response and Recovery',
          description: 'The entity responds to identified security incidents',
          testCriteria: [
            'Incidents are contained promptly',
            'Recovery procedures are executed',
            'Lessons learned are documented',
          ],
          remediationGuidance:
            'Contain incidents quickly to minimize impact. Execute recovery procedures. Document lessons learned and improve processes.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'CC8',
      name: 'Change Management',
      description:
        'Changes to infrastructure, data, software, and procedures are authorized, designed, developed, configured, documented, tested, approved, and implemented.',
      severity: 'high',
      controls: [
        {
          id: 'CC8.1',
          name: 'Change Authorization',
          description: 'The entity authorizes, designs, develops or acquires, configures, documents, tests, approves, and implements changes',
          testCriteria: [
            'Changes are authorized before implementation',
            'Changes are tested before deployment',
            'Changes are documented',
          ],
          remediationGuidance:
            'Implement change authorization process. Test changes in non-production environments. Document all changes and approvals.',
          cweIds: [],
          relatedCategories: ['config'],
        },
      ],
    },
    {
      id: 'CC9',
      name: 'Risk Mitigation',
      description:
        'The entity identifies, selects, and develops risk mitigation activities for risks arising from potential business disruptions.',
      severity: 'medium',
      controls: [
        {
          id: 'CC9.1',
          name: 'Business Continuity',
          description: 'The entity identifies, develops, and implements activities to recover from identified security incidents',
          testCriteria: [
            'Business continuity plan exists',
            'Recovery procedures are documented',
            'Plans are tested regularly',
          ],
          remediationGuidance:
            'Develop and maintain business continuity plans. Document recovery procedures. Test plans regularly and update based on lessons learned.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'C1',
      name: 'Confidentiality',
      description:
        'Information designated as confidential is protected as committed or agreed.',
      severity: 'critical',
      controls: [
        {
          id: 'C1.1',
          name: 'Confidential Information Identification',
          description: 'The entity identifies and maintains confidential information',
          testCriteria: [
            'Confidential data is classified',
            'Data handling procedures exist',
            'Confidentiality requirements are documented',
          ],
          remediationGuidance:
            'Implement data classification scheme. Define handling procedures for each classification level. Document confidentiality requirements.',
          cweIds: ['CWE-200'],
          relatedCategories: [],
        },
        {
          id: 'C1.2',
          name: 'Confidential Information Disposal',
          description: 'The entity disposes of confidential information as committed or agreed',
          testCriteria: [
            'Data retention policies exist',
            'Secure disposal procedures are used',
            'Disposal is documented',
          ],
          remediationGuidance:
            'Define data retention policies. Use secure disposal methods (e.g., cryptographic erasure, physical destruction). Document disposal activities.',
          cweIds: ['CWE-212'],
          relatedCategories: [],
        },
      ],
    },
    {
      id: 'PI1',
      name: 'Processing Integrity',
      description:
        'System processing is complete, valid, accurate, timely, and authorized.',
      severity: 'high',
      controls: [
        {
          id: 'PI1.1',
          name: 'Processing Accuracy and Completeness',
          description: 'The entity implements policies and procedures to ensure processing is complete and accurate',
          testCriteria: [
            'Input validation is implemented',
            'Processing errors are detected',
            'Output is verified for accuracy',
          ],
          remediationGuidance:
            'Implement comprehensive input validation. Detect and handle processing errors. Verify output accuracy and completeness.',
          cweIds: ['CWE-20'],
          relatedCategories: ['injection'],
        },
        {
          id: 'PI1.2',
          name: 'Processing Authorization',
          description: 'The entity implements policies to ensure processing is authorized',
          testCriteria: [
            'Transaction authorization is enforced',
            'Processing is performed by authorized users',
            'Authorization is logged',
          ],
          remediationGuidance:
            'Enforce transaction authorization. Restrict processing to authorized users. Log authorization and processing activities.',
          cweIds: ['CWE-862'],
          relatedCategories: ['authz'],
        },
      ],
    },
    {
      id: 'A1',
      name: 'Availability',
      description:
        'The system is available for operation and use as committed or agreed.',
      severity: 'high',
      controls: [
        {
          id: 'A1.1',
          name: 'Availability Objectives',
          description: 'The entity maintains, monitors, and evaluates availability objectives',
          testCriteria: [
            'Availability SLAs are defined',
            'Availability is monitored',
            'Capacity planning is performed',
          ],
          remediationGuidance:
            'Define availability SLAs and SLOs. Implement availability monitoring. Perform capacity planning to meet demand.',
          cweIds: ['CWE-400'],
          relatedCategories: [],
        },
        {
          id: 'A1.2',
          name: 'Environmental Protections',
          description: 'The entity authorizes, designs, develops, implements, operates, approves, maintains, and monitors environmental protections',
          testCriteria: [
            'Data center environmental controls exist',
            'Redundancy is implemented',
            'Backup power is available',
          ],
          remediationGuidance:
            'Implement environmental controls (HVAC, fire suppression). Deploy redundant systems. Ensure backup power availability.',
          cweIds: [],
          relatedCategories: [],
        },
      ],
    },
  ],
};
