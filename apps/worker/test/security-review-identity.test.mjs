import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
const moduleUrl = process.env.SECURITY_REVIEW_IDENTITY_MODULE
  ? pathToFileURL(process.env.SECURITY_REVIEW_IDENTITY_MODULE).href
  : new URL('../dist/security-review/identity.js', import.meta.url).href;
const { observationIdentity } = await import(moduleUrl);

test('Compose unordered list identity retains setting and service while evidence positions move', () => {
  const before = {services:{web:{cap_add:['SYS_ADMIN','ALL'],security_opt:['seccomp=unconfined','apparmor:unconfined']}}};
  const after = {services:{web:{cap_add:['ALL','CAP_SYS_ADMIN'],security_opt:['apparmor=unconfined','seccomp:unconfined']}}};
  assert.equal(observationIdentity('compose',before,'compose/expanded-capabilities','/services/web/cap_add/0'), observationIdentity('compose',after,'compose/expanded-capabilities','/services/web/cap_add/1'));
  assert.equal(observationIdentity('compose',before,'compose/unconfined-profile','/services/web/security_opt/0'), observationIdentity('compose',after,'compose/unconfined-profile','/services/web/security_opt/1'));
  assert.notEqual(observationIdentity('compose',before,'compose/expanded-capabilities','/services/web/cap_add/0'), observationIdentity('compose',before,'compose/expanded-capabilities','/services/web/cap_add/1'));
});
test('OpenAPI alternative and scope ordering preserve the security declaration identity', () => {
  const before = {paths:{'/items':{get:{security:[{Missing:[]},{OAuth:['write','read']}]}}}};
  const after = {paths:{'/items':{get:{security:[{OAuth:['read','write']},{Missing:[]}]}}}};
  assert.match(observationIdentity('openapi',before,'openapi/undeclared-security-scheme','/paths/~1items/get/security/0/Missing'), /^[a-f0-9]{64}$/);
  assert.equal(observationIdentity('openapi',before,'openapi/undeclared-security-scheme','/paths/~1items/get/security/0/Missing'),observationIdentity('openapi',after,'openapi/undeclared-security-scheme','/paths/~1items/get/security/1/Missing'));
  assert.equal(observationIdentity('openapi',before,'openapi/undeclared-oauth-scope','/paths/~1items/get/security/1/OAuth/0'),observationIdentity('openapi',after,'openapi/undeclared-oauth-scope','/paths/~1items/get/security/0/OAuth/1'));
});
test('identity reflects requirement context changes and rejects unresolvable pointers', () => {
  const before={security:[{Missing:[]}]};
  const after={security:[{Missing:[],Other:[]}]};
  const identity=observationIdentity('openapi',before,'openapi/undeclared-security-scheme','/security/0/Missing');
  assert.match(identity,/^[a-f0-9]{64}$/);
  assert.notEqual(identity,observationIdentity('openapi',after,'openapi/undeclared-security-scheme','/security/0/Missing'));
  assert.equal(observationIdentity('openapi',before,'openapi/undeclared-security-scheme','/security/5/Missing'),null);
  assert.equal(observationIdentity('compose',{},'compose/privileged','/services/no/privileged'),null);
});
