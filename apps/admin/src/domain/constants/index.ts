/**
 * Routes that teachers are not allowed to access.
 * If they attempt to visit these, AdminShell will redirect them.
 */
export const TEACHER_FORBIDDEN_ROUTES = ['/users', '/analytics', '/flags', '/settings'];
