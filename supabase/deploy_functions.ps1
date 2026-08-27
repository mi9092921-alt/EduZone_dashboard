$dbUrlFile = Join-Path $PSScriptRoot 'db_url.txt'
if (-not (Test-Path -LiteralPath $dbUrlFile)) {
    throw 'supabase/db_url.txt is required for authenticated function deployment.'
}

$configValues = @{}
foreach ($line in Get-Content -LiteralPath $dbUrlFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $configValues[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

if (-not $configValues['SUPABASE_ACCESS_TOKEN'] -or -not $configValues['SUPABASE_URL']) {
    throw 'SUPABASE_ACCESS_TOKEN and SUPABASE_URL are required in supabase/db_url.txt.'
}

$env:SUPABASE_ACCESS_TOKEN = $configValues['SUPABASE_ACCESS_TOKEN']
$PROJECT_REF = ([Uri]$configValues['SUPABASE_URL']).Host.Split('.')[0]

npx supabase functions deploy bulk-action --project-ref $PROJECT_REF
npx supabase functions deploy bulk-export --project-ref $PROJECT_REF
npx supabase functions deploy bulk-worker --project-ref $PROJECT_REF
npx supabase functions deploy create-user --project-ref $PROJECT_REF
npx supabase functions deploy export-report --project-ref $PROJECT_REF
npx supabase functions deploy get-lesson-content --project-ref $PROJECT_REF
npx supabase functions deploy send-push-notification --project-ref $PROJECT_REF
npx supabase functions deploy validate-course-access --project-ref $PROJECT_REF
npx supabase functions deploy log-download-attempt --project-ref $PROJECT_REF
npx supabase functions deploy video-info --project-ref $PROJECT_REF

