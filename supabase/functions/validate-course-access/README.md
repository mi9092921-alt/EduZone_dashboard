# validate-course-access

Supabase Edge Function that validates whether the current user has access to a course or lesson.

## Input

Provide one of the following in JSON body:

```json
{ "lesson_id": "uuid" }
```

```json
{ "course_id": "uuid" }
```

## Output

```json
{ "allowed": true, "expires_at": "2026-12-01T00:00:00Z" }
{ "allowed": true, "expires_at": null }
{ "allowed": false, "expires_at": null }
```

## Notes

- If `lesson_id` targets a preview lesson, the function returns `allowed: true` with `expires_at: null`.
- If `lesson_id` targets a non-preview lesson, it resolves the parent `course_id` and checks the user's enrollment.
- `expires_at: null` means lifetime access.
