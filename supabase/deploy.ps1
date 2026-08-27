# ============================================================================
# EduZone Supabase Schema Deployment Script (PowerShell)
# Applies the canonical schema (supabase/schema/*.sql) and runs validation.
#
# The database is in active development. There is exactly one schema
# source of truth: supabase/schema/*.sql (see supabase/schema/README.md and
# the db.migrations.schema_paths list in supabase/config.toml). This script
# does not read or write any file outside that directory plus
# supabase/schema/VALIDATION.sql — it previously referenced a standalone
# `Eduzone_schema_v13.sql`, `Eduzone_seed_qa.sql`, and
# `supabase/seed/00_system_seed_helper.sql`, none of which exist in this
# repository anymore; system + QA seed data is consolidated into
# supabase/schema/11_seed_reference.sql and is applied automatically as
# part of the canonical schema, not as a separate step.
# ============================================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet("local", "staging", "production")]
    [string]$Environment = "local",

    [Parameter(Position = 1)]
    [ValidateSet("false", "true")]
    [string]$DryRun = "false"
)

$ErrorActionPreference = "Stop"

# ============================================================================
# Configuration
# ============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommandPath
$SchemaDir = Join-Path $ScriptDir "schema"
$ValidationScript = Join-Path $SchemaDir "VALIDATION.sql"
$MigrationsDir = Join-Path $ScriptDir "migrations"

# Must match supabase/config.toml's [db.migrations] schema_paths exactly —
# that file (not this script) is the single source of truth for apply
# order. This list exists here only so this script can fail loudly *before*
# calling `supabase db push` if a canonical file has gone missing.
$CanonicalSchemaFiles = @(
    "01_extensions.sql",
    "02_types.sql",
    "03_tables.sql",
    "04_constraints.sql",
    "05_indexes.sql",
    "07_functions.sql",
    "06_views.sql",
    "08_triggers.sql",
    "09_rls.sql",
    "10_permissions.sql",
    "11_seed_reference.sql"
)

# ============================================================================
# Logging Functions
# ============================================================================

function Write-LogInfo {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-LogSuccess {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red
}

function Print-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "========== $Title ==========" -ForegroundColor Cyan
    Write-Host ""
}

# ============================================================================
# Validation
# ============================================================================

function Validate-Prerequisites {
    Print-Header "Validating Prerequisites"

    # Check for required commands
    $requiredCommands = @("supabase")
    foreach ($cmd in $requiredCommands) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            Write-LogError "$cmd is not installed or not in PATH"
            exit 1
        }
    }
    Write-LogSuccess "Required commands found"

    # Check every canonical schema file actually exists before doing anything.
    $missing = @()
    foreach ($file in $CanonicalSchemaFiles) {
        $path = Join-Path $SchemaDir $file
        if (-not (Test-Path $path)) {
            $missing += $path
        }
    }
    if (-not (Test-Path $ValidationScript)) {
        $missing += $ValidationScript
    }
    if ($missing.Count -gt 0) {
        Write-LogError "Missing canonical schema file(s):"
        foreach ($m in $missing) { Write-Host "  - $m" }
        Write-LogError "supabase/schema/ is the single schema source of truth (see supabase/schema/README.md). Do not recreate a file outside it."
        exit 1
    }
    Write-LogSuccess "Canonical schema files found ($($CanonicalSchemaFiles.Count) files + VALIDATION.sql)"

    # Check DB connection
    if ($Environment -eq "local") {
        try {
            $status = & supabase status 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-LogError "Supabase is not running. Run: supabase start"
                exit 1
            }
            Write-LogSuccess "Supabase is running"
        }
        catch {
            Write-LogError "Cannot connect to Supabase"
            exit 1
        }
    }
    else {
        Write-LogWarning "Skipping Supabase status check for $Environment environment"
    }
}

# ============================================================================
# Schema Deployment
# ============================================================================

function Deploy-CanonicalSchema {
    Print-Header "Deploying Canonical Schema ($Environment)"

    if ($DryRun -eq "true") {
        Write-LogWarning "DRY RUN MODE - No changes will be made"
        return
    }

    if ($Environment -eq "local") {
        # `supabase db push` reads db.migrations.schema_paths from
        # supabase/config.toml, which already lists every file in
        # $CanonicalSchemaFiles in dependency order (extensions -> types ->
        # tables -> constraints -> indexes -> views -> functions ->
        # triggers -> rls -> permissions -> seed). System + QA seed data
        # (11_seed_reference.sql) is applied as part of this same push —
        # there is no separate seed step.
        Write-LogInfo "Applying schema via supabase db push..."
        & supabase db push
        if ($LASTEXITCODE -eq 0) {
            Write-LogSuccess "Canonical schema deployed"
        }
        else {
            Write-LogError "Schema deployment failed"
            exit 1
        }
    }
    else {
        Write-LogError "Remote deployment requires manual setup"
        Write-LogInfo "Contact DevOps team for remote deployments"
        exit 1
    }
}

# ============================================================================
# Validation
# ============================================================================

function Validate-Schema {
    Print-Header "Validating Schema"

    if ($Environment -eq "local") {
        Write-LogInfo "Running validation checks (supabase/schema/VALIDATION.sql)..."

        $validationContent = Get-Content $ValidationScript -Raw
        $validationContent | & supabase db execute

        Write-LogSuccess "Validation complete - check results above"
    }
    else {
        Write-LogWarning "Validation not available for $Environment"
    }
}

# ============================================================================
# Migration Info
# ============================================================================

function Show-MigrationsStatus {
    Print-Header "Migration Status"

    # supabase/migrations/ is intentionally empty and stays empty: this
    # project applies the canonical schema directly (declarative
    # schema_paths), not via incremental migration files. This step only
    # reports drift if that convention is ever broken by accident.
    if (-not (Test-Path $MigrationsDir) -or (Get-ChildItem $MigrationsDir -Filter "*.sql" -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
        Write-LogInfo "No migration files present (expected — this project uses declarative schema_paths, not migrations)."
        return
    }

    Write-LogWarning "Unexpected .sql file(s) found in supabase/migrations/ — this project does not use migration files:"
    Get-ChildItem $MigrationsDir -Filter "*.sql" | ForEach-Object {
        Write-Host "  - $($_.Name)"
    }
}

# ============================================================================
# Main Deployment Flow
# ============================================================================

function Main {
    $modeLabel = if ($DryRun -eq "true") { "DRY RUN" } else { "LIVE" }
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  EduZone Supabase Schema Deployment Tool" -ForegroundColor Cyan
    Write-Host "  Environment: $Environment" -ForegroundColor Cyan
    Write-Host "  Mode: $modeLabel" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""

    # Pre-flight checks
    Validate-Prerequisites

    # Deployment sequence
    Deploy-CanonicalSchema

    # Validation
    Validate-Schema

    # Info
    Show-MigrationsStatus

    # Summary
    Print-Header "Deployment Summary"
    Write-LogSuccess "Schema deployment completed successfully!"
    Write-LogInfo "Next steps:"
    Write-Host "  1. Review validation results above"
    Write-Host "  2. Test authentication in the app"
}

# ============================================================================
# Run Main
# ============================================================================

try {
    Main
}
catch {
    Write-LogError "Deployment failed: $_"
    exit 1
}
