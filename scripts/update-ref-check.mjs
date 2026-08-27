import { readFileSync, writeFileSync } from 'node:fs';

const refCheck = JSON.parse(readFileSync('function_reference_check.json', 'utf8'));

// Functions found in frontend Grep
const frontendFunctions = [
    'admin_enqueue_bulk_job',
    'admin_cancel_job',
    'admin_get_job',
    'control_user_account',
    'terminate_user_sessions',
    'reset_user_device',
    'enroll_student',
    'revoke_enrollment',
    'admin_get_jobs',
    'admin_get_job_counts',
    'admin_retry_job',
    'log_activity_async',
    'check_user_access',
    'get_users_paginated'
];

for (const ref of refCheck) {
    if (frontendFunctions.includes(ref.name)) {
        ref.refTypes.frontend = true;
    }
}

writeFileSync('function_reference_check.json', JSON.stringify(refCheck, null, 2));
console.log('Updated reference check with Grep results.');
