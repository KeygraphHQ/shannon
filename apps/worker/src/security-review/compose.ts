// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReviewDiagnostic, RuleAnalysis, RuleId, StaticIssue } from './types.js';
import { at, isRecord, RULES } from './types.js';

const ALL_RULES = RULES.compose;
const PRIVILEGED = 'compose/privileged';
const HOST = 'compose/host-namespace';
const PROFILE = 'compose/unconfined-profile';
const CAPABILITY = 'compose/expanded-capabilities';

// This identifies unknown top-level/service properties, not full Compose validity.
// Sources checked 2026-09-07: https://docs.docker.com/reference/compose-file/services/
// https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json
const ROOT_KEYS = new Set([
  'version',
  'name',
  'include',
  'services',
  'models',
  'networks',
  'volumes',
  'secrets',
  'configs',
]);
const SERVICE_KEYS = new Set(
  `develop deploy annotations attach build blkio_config cap_add cap_drop cgroup
  cgroup_parent command configs container_name cpu_count cpu_percent cpu_shares cpu_quota cpu_period
  cpu_rt_period cpu_rt_runtime cpus cpuset credential_spec depends_on device_cgroup_rules devices dns
  dns_opt dns_search domainname entrypoint env_file label_file environment expose extends provider
  external_links extra_hosts gpus group_add healthcheck hostname image init ipc isolation labels links
  logging mac_address mem_limit mem_reservation mem_swappiness memswap_limit network_mode models
  networks oom_kill_disable oom_score_adj pid pids_limit platform ports pre_start post_start pre_stop
  privileged profiles pull_policy pull_refresh_after read_only restart runtime scale security_opt
  shm_size secrets sysctls stdin_open stop_grace_period stop_signal storage_opt tmpfs tty ulimits
  use_api_socket user uts userns_mode volumes volumes_from working_dir`.split(/\s+/),
);

// Linux UAPI names; runtime/kernel availability is intentionally not inferred.
// https://github.com/torvalds/linux/blob/v6.12/include/uapi/linux/capability.h
const CAPABILITIES = new Set(
  `AUDIT_CONTROL AUDIT_READ AUDIT_WRITE BLOCK_SUSPEND BPF CHECKPOINT_RESTORE
  CHOWN DAC_OVERRIDE DAC_READ_SEARCH FOWNER FSETID IPC_LOCK IPC_OWNER KILL LEASE LINUX_IMMUTABLE
  MAC_ADMIN MAC_OVERRIDE MKNOD NET_ADMIN NET_BIND_SERVICE NET_BROADCAST NET_RAW PERFMON SETFCAP
  SETGID SETPCAP SETUID SYS_ADMIN SYS_BOOT SYS_CHROOT SYS_MODULE SYS_NICE SYS_PACCT SYS_PTRACE
  SYS_RAWIO SYS_RESOURCE SYS_TIME SYS_TTY_CONFIG SYSLOG WAKE_ALARM`.split(/\s+/),
);

const MESSAGES: Record<(typeof ALL_RULES)[number], { message: string; remediation: string }> = {
  [PRIVILEGED]: {
    message:
      'The service explicitly requests privileged mode. Support and isolation impact depend on the platform and runtime; deployment was not assessed.',
    remediation:
      'Remove privileged mode or set it to false. Declare only the specific permissions the service requires and verify them on the intended platform.',
  },
  [HOST]: {
    message:
      'The service explicitly requests a host network or PID namespace. Platform support and actual namespace use were not assessed.',
    remediation:
      'Remove the host namespace request and use a dedicated container namespace unless the service has a documented requirement for sharing the host namespace.',
  },
  [PROFILE]: {
    message:
      'The service explicitly selects an unconfined seccomp or AppArmor profile. Enforcement depends on Linux kernel and runtime support; deployment was not assessed.',
    remediation:
      'Remove the unconfined override or select an appropriate restrictive profile, then verify that the intended runtime enforces it.',
  },
  [CAPABILITY]: {
    message:
      'The service explicitly adds ALL or SYS_ADMIN Linux capabilities. The effective set also depends on cap_drop, kernel support and runtime context; actual grants were not assessed.',
    remediation:
      'Remove the broad capability addition and declare only the individual capabilities required by the service. Verify the effective set on the intended platform.',
  },
};

function hasInterpolation(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Compose treats $$ as an escaped dollar, and otherwise recognizes $NAME or ${...}.
  // https://docs.docker.com/reference/compose-file/interpolation/
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== '$') continue;
    if (value[index + 1] === '$') {
      index++;
      continue;
    }
    if (value[index + 1] === '{' || /[a-zA-Z_]/.test(value[index + 1] ?? '')) return true;
  }
  return false;
}

function fieldRules(key: string): readonly RuleId[] {
  if (key === 'privileged') return [PRIVILEGED];
  if (key === 'network_mode' || key === 'pid') return [HOST];
  if (key === 'security_opt') return [PROFILE];
  if (key === 'cap_add' || key === 'cap_drop') return [CAPABILITY];
  return ALL_RULES;
}

function composeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  // compose-go v2.9.1 loader/interpolate.go:toBoolean also accepts legacy
  // YAML 1.1 spellings (with a warning in Compose).
  if (['true', 'y', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['false', 'n', 'no', 'off'].includes(value.toLowerCase())) return false;
  return undefined;
}

/** Pure service-declaration review. Parsing/resource limits are enforced by the public API. */
export function analyzeCompose(document: unknown): RuleAnalysis {
  const issues: StaticIssue[] = [];
  const diagnostics: ReviewDiagnostic[] = [];
  const diagnostic = (code: string, pointer: string, ruleIds: readonly RuleId[], message: string): void => {
    diagnostics.push({ code, pointer, ruleIds, message });
  };
  const invalid = (pointer: string, ruleIds: readonly RuleId[] = ALL_RULES): void => {
    diagnostic(
      'compose/invalid-structure',
      pointer,
      ruleIds,
      'The declaration has an unsupported or malformed Compose structure; affected checks are incomplete.',
    );
  };
  const unsupportedValue = (pointer: string, ruleIds: readonly RuleId[]): void => {
    diagnostic(
      'compose/unsupported-value',
      pointer,
      ruleIds,
      'The value is not supported by this declaration check; applicability remains unknown.',
    );
  };
  const issue = (ruleId: (typeof ALL_RULES)[number], pointer: string): void => {
    issues.push({
      ruleId,
      classification: 'configuration-risk',
      applicability: 'declared',
      pointer,
      ...MESSAGES[ruleId],
    });
  };
  const interpolation = (
    value: unknown,
    pointer: string,
    ruleIds: readonly RuleId[],
    ancestors = new Set<object>(),
  ): void => {
    if (hasInterpolation(value)) {
      diagnostic(
        'compose/unresolved-interpolation',
        pointer,
        ruleIds,
        'Compose interpolation was not expanded. The value and its applicability remain unresolved.',
      );
    } else if (value !== null && typeof value === 'object') {
      // Defense in depth for direct module callers; the public parser rejects cycles.
      if (ancestors.has(value)) {
        invalid(pointer, ruleIds);
        return;
      }
      ancestors.add(value);
      for (const [key, child] of Object.entries(value)) interpolation(child, at(pointer, key), ruleIds, ancestors);
      ancestors.delete(value);
    }
  };
  const list = (
    value: unknown,
    pointer: string,
    ruleId: RuleId,
    visit: (value: string, pointer: string) => void,
  ): void => {
    if (!Array.isArray(value)) {
      if (!hasInterpolation(value)) invalid(pointer, [ruleId]);
      return;
    }
    value.forEach((entry, index) => {
      const entryPointer = at(pointer, index);
      if (hasInterpolation(entry)) return;
      if (typeof entry !== 'string') invalid(entryPointer, [ruleId]);
      else visit(entry, entryPointer);
    });
  };
  const privilegeContext = (value: unknown, pointer: string): void => {
    if (!isRecord(value) || !Object.hasOwn(value, 'privileged') || hasInterpolation(value.privileged)) return;
    if (composeBoolean(value.privileged) !== false) {
      diagnostic(
        'compose/unsupported-context',
        at(pointer, 'privileged'),
        [PRIVILEGED],
        'Privileged execution in build or lifecycle hook contexts is outside the supported service-container checks. This declaration was not assessed.',
      );
    }
  };

  if (!isRecord(document)) {
    invalid('');
    return { issues, diagnostics };
  }
  for (const key of Object.keys(document).sort()) {
    if (key.startsWith('x-')) continue;
    const pointer = at('', key);
    if (!ROOT_KEYS.has(key)) {
      diagnostic(
        'compose/unsupported-property',
        pointer,
        ALL_RULES,
        'An unknown Compose property is present; this file is not treated as a fully supported declaration.',
      );
    }
    if (key !== 'services') interpolation(document[key], pointer, ALL_RULES);
    if (key === 'include') {
      diagnostic(
        'compose/unsupported-composition',
        pointer,
        ALL_RULES,
        'Compose includes are not followed. Only declarations in this input file are checked; the composed result remains unknown.',
      );
    } else if ((key === 'version' || key === 'name') && typeof document[key] !== 'string') {
      invalid(pointer);
    } else if (['models', 'networks', 'volumes', 'secrets', 'configs'].includes(key) && !isRecord(document[key])) {
      invalid(pointer);
    }
  }
  if (!isRecord(document.services)) {
    invalid('/services');
    return { issues, diagnostics };
  }

  for (const name of Object.keys(document.services).sort()) {
    const pointer = at('/services', name);
    const service = document.services[name];
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) invalid(pointer);
    if (!isRecord(service)) {
      invalid(pointer);
      continue;
    }

    for (const key of Object.keys(service).sort()) {
      if (key.startsWith('x-')) continue;
      const valuePointer = at(pointer, key);
      const value = service[key];
      interpolation(value, valuePointer, fieldRules(key));
      if (!SERVICE_KEYS.has(key)) {
        diagnostic(
          'compose/unsupported-property',
          valuePointer,
          ALL_RULES,
          'An unknown service property is present; this service is not treated as a fully supported declaration.',
        );
      }
      if (key === 'extends' || key === 'provider') {
        diagnostic(
          'compose/unsupported-composition',
          valuePointer,
          ALL_RULES,
          'Service inheritance or delegated lifecycle is not resolved. Only explicit local declarations are checked.',
        );
      }
      if (key === 'external_links') {
        diagnostic(
          'compose/unresolved-service-reference',
          valuePointer,
          ALL_RULES,
          'External services are not inspected; their declarations and effects remain unknown.',
        );
      }
    }

    if (Object.hasOwn(service, 'profiles')) {
      if (
        !Array.isArray(service.profiles) ||
        service.profiles.some((value) => typeof value !== 'string' || value.length === 0)
      ) {
        if (!hasInterpolation(service.profiles)) invalid(at(pointer, 'profiles'));
      }
    }
    // Profile activation does not change literal declarations; deployed state is
    // outside the result's scope regardless of whether profiles are configured.
    privilegeContext(service.build, at(pointer, 'build'));
    for (const key of ['pre_start', 'post_start', 'pre_stop']) {
      const hooks = service[key];
      if (Array.isArray(hooks)) {
        hooks.forEach((hook, index) => {
          privilegeContext(hook, at(at(pointer, key), index));
        });
      }
    }
    if (Object.hasOwn(service, 'platform') && !hasInterpolation(service.platform)) {
      if (typeof service.platform !== 'string' || service.platform.length === 0) invalid(at(pointer, 'platform'));
      else if (!/^linux(?:\/[^/]+(?:\/[^/]+)?)?$/.test(service.platform)) {
        diagnostic(
          'compose/platform-context',
          at(pointer, 'platform'),
          ALL_RULES,
          'The declared platform is outside the Linux interpretation supported by these checks. Explicit requests are retained, but platform support and effective isolation remain unknown.',
        );
      }
    }

    if (Object.hasOwn(service, 'privileged') && !hasInterpolation(service.privileged)) {
      const value = composeBoolean(service.privileged);
      if (value === true) issue(PRIVILEGED, at(pointer, 'privileged'));
      else if (value !== false) unsupportedValue(at(pointer, 'privileged'), [PRIVILEGED]);
    }
    for (const key of ['network_mode', 'pid']) {
      if (!Object.hasOwn(service, key) || hasInterpolation(service[key])) continue;
      const value = service[key];
      const valuePointer = at(pointer, key);
      if (typeof value !== 'string') invalid(valuePointer, [HOST]);
      else if (value === 'host') issue(HOST, valuePointer);
      else if (
        value.startsWith('service:') &&
        Object.hasOwn(document.services, value.slice(8)) &&
        isRecord(document.services[value.slice(8)])
      ) {
        // A valid local service reference is a known non-host declaration. Do
        // not propagate the referenced service's runtime namespace to this one.
      } else if (/^(service|container):.+$/.test(value)) {
        diagnostic(
          'compose/unresolved-service-reference',
          valuePointer,
          [HOST],
          'The namespace of the referenced service or container is not resolved. Effective host namespace sharing remains unknown.',
        );
      } else if (!(key === 'network_mode' ? ['bridge', 'none', 'default'] : ['', 'private']).includes(value)) {
        unsupportedValue(valuePointer, [HOST]);
      }
    }
    if (Object.hasOwn(service, 'security_opt')) {
      list(service.security_opt, at(pointer, 'security_opt'), PROFILE, (value, valuePointer) => {
        // Docker Compose v2.39.4 pkg/compose/create.go:parseSecurityOpts splits
        // at '=' first, using ':' only when no '=' exists anywhere in the option.
        const separator = value.includes('=') ? value.indexOf('=') : value.indexOf(':');
        const option = separator < 0 ? value : value.slice(0, separator);
        const setting = separator < 0 ? undefined : value.slice(separator + 1);
        if ((option === 'seccomp' || option === 'apparmor') && setting) {
          if (setting === 'unconfined') issue(PROFILE, valuePointer);
        } else if (
          (option === 'label' && setting) ||
          value === 'no-new-privileges' ||
          (option === 'no-new-privileges' && (setting === 'true' || setting === 'false'))
        ) {
          // Other documented options do not imply an unconfined seccomp/AppArmor profile.
        } else unsupportedValue(valuePointer, [PROFILE]);
      });
    }
    for (const key of ['cap_add', 'cap_drop']) {
      if (!Object.hasOwn(service, key)) continue;
      list(service[key], at(pointer, key), CAPABILITY, (value, valuePointer) => {
        // Moby v28.0.0 oci/caps/utils.go:NormalizeLegacyCapabilities uppercases
        // first, handles ALL separately, then accepts the optional CAP_ prefix.
        const upper = value.toUpperCase();
        const capability = upper.startsWith('CAP_') ? upper.slice(4) : upper;
        if (upper !== 'ALL' && !CAPABILITIES.has(capability)) unsupportedValue(valuePointer, [CAPABILITY]);
        else if (key === 'cap_add' && (upper === 'ALL' || capability === 'SYS_ADMIN')) issue(CAPABILITY, valuePointer);
      });
    }
  }

  const comparePointer = (a: { pointer: string }, b: { pointer: string }): number =>
    a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0;
  issues.sort(comparePointer);
  diagnostics.sort((a, b) => comparePointer(a, b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { issues, diagnostics };
}
