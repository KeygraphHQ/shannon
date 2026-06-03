# Platforms and Networking

This guide covers platform-specific notes and Docker networking behavior.

## Windows

Shannon Lite on Windows is supported through WSL2. Native Windows, including Git Bash, is not supported.

### Ensure WSL2

```powershell
wsl --install
wsl --set-default-version 2

# Check installed distros.
wsl --list --verbose

# If you do not have a distro, install one.
wsl --list --online
wsl --install Ubuntu-24.04

# If your distro shows VERSION 1, convert it to WSL2.
wsl --set-version <distro-name> 2
```

Install Docker Desktop on Windows and enable the WSL2 backend under **Settings > General > Use the WSL 2 based engine**.

Run Shannon Lite inside WSL:

```bash
npx @keygraph/shannon setup
npx @keygraph/shannon start -u https://your-app.com -r /path/to/your-repo
```

Source-build equivalent:

```bash
git clone https://github.com/KeygraphHQ/shannon.git
cd shannon
cp .env.example .env
./shannon start -u https://your-app.com -r /path/to/your-repo
```

To access the Temporal Web UI, run `ip addr` inside WSL to find your WSL IP address, then navigate to `http://<wsl-ip>:8233` in your Windows browser.

Windows Defender may flag exploit code in reports as false positives. Add an exclusion for the Shannon Lite directory or use Docker/WSL2 isolation.

## Linux

Linux works with native Docker. Depending on your Docker setup, you may need `sudo`. If output files have permission issues, ensure your user has access to the Docker socket and workspace directory.

## macOS

macOS works with Docker Desktop installed.

## Testing Local Applications

Docker containers cannot reach `localhost` on your host machine. Use `host.docker.internal` instead:

```bash
npx @keygraph/shannon start -u http://host.docker.internal:3000 -r /path/to/repo
```

Source-build equivalent:

```bash
./shannon start -u http://host.docker.internal:3000 -r /path/to/repo
```

## Custom Hostnames

If your local stack uses custom hostnames mapped in `/etc/hosts`, Shannon Lite forwards those entries into the worker container at scan start.

To disable forwarding:

```bash
export SHANNON_FORWARD_HOSTS=false
```

In source-build mode, you can also add this to `.env`:

```bash
SHANNON_FORWARD_HOSTS=false
```
