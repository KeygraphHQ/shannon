#!/usr/bin/env pwsh
# Shannon interactive CLI wrapper for Windows
# Usage: .\shannon.ps1 [start|stop|logs|workspaces|help]

param(
    [string]$Command = "interactive",
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$Rest
)

$ScriptDir = $PSScriptRoot

# Load .env file
function Load-Env {
    $envFile = Join-Path $ScriptDir ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim().Trim('"')
                [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
        }
    }
    # Alias GITHUB_COPILOT_TOKEN -> GITHUB_TOKEN if GITHUB_TOKEN is not already set
    if ($env:GITHUB_COPILOT_TOKEN -and -not $env:GITHUB_TOKEN) {
        $env:GITHUB_TOKEN = $env:GITHUB_COPILOT_TOKEN
    }
}

# Detect available auth mode from .env
function Get-AuthMode {
    if ($env:GITHUB_TOKEN -or $env:GITHUB_COPILOT_TOKEN) { return "copilot" }
    if ($env:ANTHROPIC_API_KEY) { return "anthropic" }
    if ($env:CLAUDE_CODE_OAUTH_TOKEN) { return "anthropic" }
    if ($env:OPENAI_API_KEY) { return "openai" }
    if ($env:OPENROUTER_API_KEY) { return "openrouter" }
    return "none"
}

# List available repos
function Get-Repos {
    $reposDir = Join-Path $ScriptDir "repos"
    if (-not (Test-Path $reposDir)) { return @() }
    return Get-ChildItem $reposDir -Directory | Select-Object -ExpandProperty Name
}

# Run the bash shannon script via bash (Git Bash / WSL)
function Invoke-Shannon {
    param([string]$ShArgs)

    # Try bash (Git Bash first, then WSL)
    $bash = $null
    foreach ($candidate in @("bash", "C:\Program Files\Git\bin\bash.exe", "C:\Program Files\Git\usr\bin\bash.exe")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            $bash = $candidate
            break
        }
    }

    if (-not $bash) {
        Write-Host "ERROR: bash not found. Install Git for Windows (includes Git Bash)." -ForegroundColor Red
        exit 1
    }

    # Set MSYS_NO_PATHCONV to avoid path mangling
    $env:MSYS_NO_PATHCONV = "1"

    Push-Location $ScriptDir
    try {
        & $bash -c "./shannon $ShArgs"
    } finally {
        Pop-Location
    }
}

function Show-Banner {
    Write-Host ""
    Write-Host "  ███████╗██╗  ██╗ █████╗ ███╗   ██╗███╗   ██╗ ██████╗ ███╗   ██╗" -ForegroundColor Cyan
    Write-Host "  ██╔════╝██║  ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗████╗  ██║" -ForegroundColor Cyan
    Write-Host "  ███████╗███████║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██╔██╗ ██║" -ForegroundColor Cyan
    Write-Host "  ╚════██║██╔══██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║╚██╗██║" -ForegroundColor Cyan
    Write-Host "  ███████║██║  ██║██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██║ ╚████║" -ForegroundColor Cyan
    Write-Host "  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "           AI Penetration Testing Framework" -ForegroundColor Yellow
    Write-Host ""
}

function Start-Interactive {
    Show-Banner
    Load-Env

    # --- URL ---
    $url = Read-Host "Target URL (e.g. https://example.com)"
    if (-not $url) { Write-Host "URL is required." -ForegroundColor Red; exit 1 }

    # --- REPO (required) ---
    $repos = Get-Repos
    $repo = ""
    if ($repos.Count -gt 0) {
        Write-Host ""
        Write-Host "Available repos:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $repos.Count; $i++) {
            Write-Host "  [$($i+1)] $($repos[$i])"
        }
        $pick = Read-Host "Select repo (number or folder name)"
        if ($pick -match '^\d+$') {
            $idx = [int]$pick
            if ($idx -ge 1 -and $idx -le $repos.Count) {
                $repo = $repos[$idx - 1]
            }
        } elseif ($pick) {
            $repo = $pick
        }
    } else {
        Write-Host ""
        Write-Host "No repos found. Clone or symlink your target repo first:" -ForegroundColor Yellow
        Write-Host "  git clone https://github.com/org/repo ./repos/my-repo" -ForegroundColor DarkGray
        $repo = Read-Host "Repo folder name (under ./repos/)"
    }
    if (-not $repo) {
        Write-Host "REPO is required. Place your target repo under ./repos/ first." -ForegroundColor Red
        exit 1
    }

    # --- AUTH MODE ---
    $authMode = Get-AuthMode
    $copilotFlag = ""
    $routerFlag = ""

    Write-Host ""
    switch ($authMode) {
        "copilot"   { Write-Host "Auth: GitHub Copilot (GITHUB_TOKEN detected)" -ForegroundColor Green; $copilotFlag = "COPILOT=true" }
        "anthropic" { Write-Host "Auth: Anthropic API key detected" -ForegroundColor Green }
        "openai"    { Write-Host "Auth: OpenAI API key detected (router mode)" -ForegroundColor Green; $routerFlag = "ROUTER=true" }
        "openrouter"{ Write-Host "Auth: OpenRouter API key detected (router mode)" -ForegroundColor Green; $routerFlag = "ROUTER=true" }
        default     {
            Write-Host "WARNING: No API key found in .env. Set ANTHROPIC_API_KEY, GITHUB_TOKEN, or OPENAI_API_KEY." -ForegroundColor Yellow
        }
    }

    # --- WORKSPACE (optional) ---
    Write-Host ""
    $workspace = Read-Host "Workspace name (optional, press Enter to skip)"

    # --- Build and run ---
    $shannonArgs = "start URL=$url REPO=$repo"
    if ($copilotFlag) { $shannonArgs += " $copilotFlag" }
    if ($routerFlag)  { $shannonArgs += " $routerFlag" }
    if ($workspace)   { $shannonArgs += " WORKSPACE=$workspace" }

    Write-Host ""
    Write-Host "Running: ./shannon $shannonArgs" -ForegroundColor DarkGray
    Write-Host ""

    Invoke-Shannon $shannonArgs
}

function Show-Help {
    Show-Banner
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\shannon.ps1                  Interactive wizard (prompts for all options)"
    Write-Host "  .\shannon.ps1 start            Interactive wizard"
    Write-Host "  .\shannon.ps1 stop             Stop all containers"
    Write-Host "  .\shannon.ps1 stop clean       Stop and remove all volumes"
    Write-Host "  .\shannon.ps1 logs <id>        Tail logs for a workflow"
    Write-Host "  .\shannon.ps1 workspaces       List all workspaces"
    Write-Host "  .\shannon.ps1 help             Show this help"
    Write-Host ""
    Write-Host "Monitor workflows at http://localhost:8233" -ForegroundColor DarkGray
    Write-Host ""
}

# --- Main dispatch ---
Load-Env

switch ($Command.ToLower()) {
    "start"       { Start-Interactive }
    "interactive" { Start-Interactive }
    "stop" {
        $clean = if ($Rest -contains "clean") { "CLEAN=true" } else { "" }
        Invoke-Shannon "stop $clean"
    }
    "logs" {
        $id = $Rest[0]
        if (-not $id) { Write-Host "Usage: .\shannon.ps1 logs <workflow-id>" -ForegroundColor Red; exit 1 }
        Invoke-Shannon "logs ID=$id"
    }
    "workspaces" { Invoke-Shannon "workspaces" }
    { $_ -in @("help", "--help", "-h") } { Show-Help }
    default { Show-Help }
}
