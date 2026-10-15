# Temporal startup timeout: Linux + IPv6 localhost mismatch

## Summary

Shannon failed during startup with:

```text
▲ Temporal did not become ready in time
```

The actual root cause was not a bad image or a broken Shannon install. The Temporal container was starting successfully, but the CLI and Docker health checks were probing `localhost:7233` while the container's Temporal server was only reachable on IPv4.

## Root cause

On this environment, `localhost` resolves to both IPv4 and IPv6, with IPv6 taking precedence:

```bash
getent ahosts localhost
```

Output included:

```text
::1             STREAM localhost
127.0.0.1       STREAM localhost
```

The Temporal server was started with:

```bash
temporal server start-dev --ip 0.0.0.0
```

That binds to IPv4 and is reachable on `0.0.0.0:7233`, not necessarily on the IPv6 loopback path. As a result:

```bash
docker exec shannon-temporal temporal operator cluster health --address localhost:7233
```

failed with:

```text
Error: failed reaching server: context deadline exceeded
```

while the IPv4-only check succeeded:

```bash
docker exec shannon-temporal temporal operator cluster health --address 127.0.0.1:7233
```

with:

```text
SERVING
```

## Evidence from the environment

- `docker ps -a --filter name=shannon-temporal` showed the container was `Up` and running
- `docker exec shannon-temporal ps -ef` showed the `temporal server` process was alive
- `docker inspect --format '{{json .State.Health}}' shannon-temporal` showed the container was `unhealthy`
- The health check repeatedly timed out exactly because the address was wrong for the local network stack

## Fix applied

The CLI and Docker health checks were changed to use the IPv4 loopback explicitly:

- `127.0.0.1:7233` instead of `localhost:7233`

Updated files:

- `apps/cli/src/docker.ts`
- `docker-compose.yml`
- `apps/cli/infra/compose.yml`

## Validation

After the fix, the real health probe succeeded:

```bash
docker exec shannon-temporal temporal operator cluster health --address 127.0.0.1:7233
```

Result:

```text
SERVING
```

## Operational note

The warning from npm about `Unknown project config` is unrelated to this issue. It is just a package-manager warning and not the cause of the Temporal startup timeout.

## How to run locally

Use the local repository build instead of the published npm package while this fix is not yet released:

```bash
cd /workspaces/shannon
./shannon build
./shannon start -u https://ulearn.bcg.com.cn -r /workspaces/shannon
```

Do not rely on:

```bash
npx @keygraph/shannon@latest start ...
```

until the patched version is published.
