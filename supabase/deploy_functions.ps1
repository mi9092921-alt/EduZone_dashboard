param(
    [string]$ConfigFile = 'db_url.txt'
)

$ErrorActionPreference = 'Stop'

$dbUrlFile = if ([System.IO.Path]::IsPathRooted($ConfigFile)) {
    $ConfigFile
} else {
    Join-Path $PSScriptRoot $ConfigFile
}

if (-not (Test-Path -LiteralPath $dbUrlFile)) {
    throw "$ConfigFile is required for authenticated function deployment."
}

$configValues = @{}
foreach ($line in Get-Content -LiteralPath $dbUrlFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $configValues[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

if (-not $configValues['SUPABASE_ACCESS_TOKEN'] -or -not $configValues['SUPABASE_URL']) {
    throw "SUPABASE_ACCESS_TOKEN and SUPABASE_URL are required in $ConfigFile."
}

$env:SUPABASE_ACCESS_TOKEN = $configValues['SUPABASE_ACCESS_TOKEN']
$PROJECT_REF = ([Uri]$configValues['SUPABASE_URL']).Host.Split('.')[0]

$functionNames = @(
    'bulk-action',
    'bulk-export',
    'bulk-worker',
    'create-user',
    'export-report',
    'get-lesson-content',
    'send-push-notification',
    'validate-course-access',
    'log-download-attempt',
    'video-info'
)

foreach ($functionName in $functionNames) {
    Write-Host "Deploying function: $functionName"
    & npx.cmd supabase functions deploy $functionName --project-ref $PROJECT_REF --use-api
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment failed for '$functionName' (exit code $LASTEXITCODE). Verify the token has Edge Functions read-write access to project $PROJECT_REF."
    }
}

