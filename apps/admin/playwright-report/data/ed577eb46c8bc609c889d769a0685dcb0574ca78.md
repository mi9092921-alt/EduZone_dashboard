# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.setup.ts >> authenticate
- Location: tests\e2e\auth.setup.ts:5:6

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /.*(dashboard|activities|en|ar)$/
Received string:  "http://localhost:3000/en/login"
Timeout: 20000ms

Call log:
  - Expect "toHaveURL" with timeout 20000ms
    23 × unexpected value "http://localhost:3000/en/login"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
    - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
        - img [ref=e8]
    - alert [ref=e11]
    - generic [ref=e13]:
        - generic [ref=e14]:
            - img [ref=e16]
            - heading "EduZone Admin" [level=3] [ref=e18]
            - paragraph [ref=e19]: Sign in to your administration panel
        - generic [ref=e20]:
            - generic [ref=e21]:
                - img [ref=e22]
                - paragraph [ref=e24]: Invalid email or password. Please try again.
            - generic [ref=e25]:
                - generic [ref=e26]:
                    - text: Email address
                    - textbox "Email address" [ref=e28]:
                        - /placeholder: admin@eduzone.com
                        - text: admin@eduzone-test.com
                - generic [ref=e29]:
                    - generic [ref=e30]:
                        - generic [ref=e31]: Password
                        - button "Show" [ref=e32]
                    - textbox "Password" [ref=e34]:
                        - /placeholder: ••••••••
                        - text: Test1234!
                - button "Sign In" [ref=e35]
        - paragraph [ref=e37]: EduZone Admin Control v0.1.0
```

# Test source

```ts
  1  | import { test as setup, expect } from '@playwright/test';
  2  |
  3  | const authFile = 'playwright/.auth/user.json';
  4  |
  5  | setup('authenticate', async ({ page }) => {
  6  |   // Go to login page
  7  |   await page.goto('/login');
  8  |
  9  |   // Fill in credentials
  10 |   // Note: Using seed data from Eduzone_schema_v9.sql
  11 |   await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
  12 |   await page.getByLabel(/password/i).fill('Test1234!'); // Correct password from schema seed
  13 |   await page.getByRole('button', { name: /login|sign in/i }).click();
  14 |
  15 |   // Wait for redirect to dashboard or localized home with generous timeout
> 16 |   await expect(page).toHaveURL(/.*(dashboard|activities|en|ar)$/, { timeout: 20000 });
     |                      ^ Error: expect(page).toHaveURL(expected) failed
  17 |
  18 |   // Wait for sidebar to be visible (evidence of successful auth)
  19 |   await expect(page.getByRole('navigation')).toBeVisible();
  20 |
  21 |   // End of authentication steps
  22 |   await page.context().storageState({ path: authFile });
  23 | });
  24 |
```
