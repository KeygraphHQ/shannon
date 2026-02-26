# Shannon OpenClaw Integration

An OpenClaw skill for integrating Shannon (AI-powered autonomous penetration testing framework).

## Files

- `SKILL.md` - Main skill documentation (read by OpenClaw agents)
- `shannon-helper.sh` - Helper script for Shannon CLI interaction
- `README.md` - This file

## Setup

1. **Clone Shannon** (if not already done):
   ```bash
   cd /home/opc/.openclaw/workspace
   git clone https://github.com/Admuad/shannon.git
   ```

2. **Configure API key**:
   ```bash
   cd /home/opc/.openclaw/workspace/shannon
   cat > .env << 'EOF'
   ANTHROPIC_API_KEY=your-api-key
   CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
   EOF
   ```

3. **Ensure Docker is running**:
   ```bash
   sudo systemctl start docker  # or use Docker Desktop
   docker info  # Verify it's running
   ```

4. **Update TOOLS.md** (already done):
   ```markdown
   ### Shannon
   - install_path: /home/opc/.openclaw/workspace/shannon
   - helper_script: /home/opc/.openclaw/workspace/skills/shannon/shannon-helper.sh
   ```

## Usage in OpenClaw

Once the skill is installed in `/home/opc/.openclaw/workspace/skills/shannon/`, you can:

```
Start a pentest on https://example.com with repo my-app
```

```
Check the status of all Shannon workspaces
```

```
Show the pentest summary for workspace myapp_2026-02-26
```

```
Schedule a Shannon pentest every Monday at 9 AM for https://myapp.com
```

## Helper Script Functions

The `shannon-helper.sh` script provides these functions:

```bash
# Start a pentest
./shannon-helper.sh start <url> <repo> [config] [workspace]

# Check status
./shannon-helper.sh status [workspace]

# Show logs
./shannon-helper.sh logs <workflow-id> [lines]

# Show summary
./shannon-helper.sh summary <workspace>

# Get latest workspace
./shannon-helper.sh latest

# Check if complete
./shannon-helper.sh complete <workspace>

# Get vulnerability counts
./shannon-helper.sh vulns <workspace>

# List workspaces
./shannon-helper.sh workspaces

# Stop containers
./shannon-helper.sh stop
```

## Notes

- Shannon uses Docker Compose for Temporal orchestration
- Each pentest takes ~1-1.5 hours
- Costs ~$50 in Anthropic API credits per run
- Results are saved to `audit-logs/{workspace}/deliverables/`

## Contributing

This is an integration layer, not a fork of Shannon. For Shannon improvements, see:
- Original repo: https://github.com/KeygraphHQ/shannon
- Fork: https://github.com/Admuad/shannon
