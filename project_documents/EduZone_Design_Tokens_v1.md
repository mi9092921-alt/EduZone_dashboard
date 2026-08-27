EduZone Design Tokens & Figma Handoff v1.0  **|  CONFIDENTIAL**


**EduZone**

**Design Tokens & Figma Handoff**

Admin Dashboard — MUI v5 + Tailwind + RTL (Arabic) Reference

*Version 1.0  |  2026-03-08*


|**Version**|1\.0|
| :- | :- |
|**Token Format**|CSS Custom Properties + MUI theme tokens + Tailwind config|
|**Figma Library**|EduZone/Admin DS (shared library, auto-synced via Token Studio)|
|**Framework**|Next.js 15 + MUI v5 + Tailwind CSS v3 + RTL support|
|**Status**|**APPROVED — use for all Sprint 1+ components**|


# **1. Color System**
**SINGLE SOURCE:** All colors defined once in packages/design-system/src/tokens/colors.ts and exported as CSS vars, MUI theme palette, and Tailwind config. Never hardcode hex values in components.

## **1.1 Primary Palette**

||**Token**|**Hex**|**RGB**|**Usage**|
| :-: | :-: | :-: | :-: | :-: |
| |**color.primary.950**|#0F2D52|*15,45,82*|Page headers, sidebar background, cover sections|
| |**color.primary.700**|#1B4F8A|*27,79,138*|Primary buttons, active nav items, focus rings|
| |**color.primary.500**|#2E86C1|*46,134,193*|Links, secondary actions, info states|
| |**color.primary.400**|#5BA4CF|*91,164,207*|Hover states on primary buttons|
| |**color.primary.200**|#A9CCE3|*169,204,227*|Disabled primary, input borders on focus|
| |**color.primary.50**|#DBEAFE|*219,234,254*|Chip backgrounds, selected row highlight|

## **1.2 Neutral / Gray Palette**

||**Token**|**Hex**|**RGB**|**Usage**|
| :-: | :-: | :-: | :-: | :-: |
| |**color.neutral.950**|#1A1A2E|*26,26,46*|Body text, headings, icon fills|
| |**color.neutral.600**|#475569|*71,85,105*|Secondary text, placeholder text, subtitles|
| |**color.neutral.400**|#94A3B8|*148,163,184*|Disabled text, inactive icons|
| |**color.neutral.200**|#CBD5E1|*203,213,225*|Dividers, table borders, input borders|
| |**color.neutral.50**|#F1F5F9|*241,245,249*|Table row alt bg, card backgrounds|
| |**color.neutral.0**|#FFFFFF|*255,255,255*|Card surface, dialog backgrounds|

## **1.3 Semantic / Status Palette**

||**Token**|**Hex**|**RGB**|**Usage**|
| :-: | :-: | :-: | :-: | :-: |
| |**color.success.700**|#0E7C61|*14,124,97*|Success toasts, active badges, locked=false indicator|
| |**color.success.50**|#DCFCE7|*220,252,231*|Success toast background, green chip bg|
| |**color.warning.700**|#B7600A|*183,96,10*|Warning badges, suspension indicators|
| |**color.warning.50**|#FEF3C7|*254,243,199*|Warning chip background, caution panels|
| |**color.error.700**|#B91C1C|*185,28,28*|Error toasts, ban badges, destructive actions|
| |**color.error.50**|#FEE2E2|*254,226,226*|Error toast background, danger chip bg|
| |**color.info.700**|#1B4F8A|*27,79,138*|Info toasts, maintenance banners|
| |**color.info.50**|#DBEAFE|*219,234,254*|Info toast background, note panels|

## **1.4 Risk Level Colors (Audit & Activity)**

||**Token**|**Hex**|**RGB**|**Usage**|
| :-: | :-: | :-: | :-: | :-: |
| |**color.risk.low**|#475569|*71,85,105*|Low-risk activity rows — muted gray|
| |**color.risk.medium**|#B7600A|*183,96,10*|Medium-risk rows — amber|
| |**color.risk.high**|#B91C1C|*185,28,28*|High-risk rows — red, triggers security toast|
| |**color.risk.critical**|#7C2D12|*124,45,18*|Critical rows — dark red, triggers alert badge|

## **1.5 Dark Mode Overrides**
**NOTE:** Dark mode uses CSS class-based switching (.dark on <html>). MUI theme uses mode:'dark' toggled via ThemeProvider. The token names remain identical; only their resolved values change.

|**Token**|**Light Value**|**Dark Value**|**Notes**|
| :-: | :-: | :-: | :-: |
|**color.neutral.0**|#FFFFFF|#0F172A|Card/dialog background|
|**color.neutral.50**|#F1F5F9|#1E293B|Page background|
|**color.neutral.200**|#CBD5E1|#334155|Borders and dividers|
|**color.neutral.950**|#1A1A2E|#F8FAFC|Body text (inverted)|
|**color.primary.700**|#1B4F8A|#3B82F6|Primary buttons (brighter in dark)|
|**color.primary.50**|#DBEAFE|#1E3A5F|Selected row / chip bg (dark)|


# **2. Typography**
## **2.1 Font Stack**

|**Language**|**Primary Font**|**Fallback**|**Load Strategy**|
| :-: | :-: | :-: | :-: |
|Latin / Numbers|**Inter**|*system-ui, sans-serif*|next/font/google — variable; preload; swap|
|Arabic (RTL)|**Cairo**|*Tajawal, Arial, sans-serif*|next/font/google — subset=arabic; preload; swap|
|Monospace (code)|**JetBrains Mono**|*Menlo, Courier New, monospace*|next/font/google — preload:false (dev tools only)|

## **2.2 Type Scale**

|**Token**|**Size**|**Line-H**|**Weight**|**Letter-Sp**|**Usage**|
| :-: | :-: | :-: | :-: | :-: | :-: |
|**text.display**|32px|40px|700|−0.5px|Page titles (e.g. User Management)|
|**text.h1**|24px|32px|700|−0.25px|Section headings in dialogs, profile drawer|
|**text.h2**|20px|28px|600|0|Card titles, stat labels|
|**text.h3**|16px|24px|600|0|Sub-section headings, table group labels|
|**text.body.lg**|16px|24px|400|0|Primary body text, descriptions|
|**text.body.md**|14px|20px|400|0|Table cells, form field values, badge text|
|**text.body.sm**|12px|16px|400|0\.1px|Captions, timestamps, helper text|
|**text.label**|12px|16px|500|0\.4px|Form labels, data-grid column headers|
|**text.code**|13px|20px|400|0|Code blocks (JetBrains Mono)|
|**text.overline**|11px|16px|600|1\.0px|Section dividers, "ONLINE" badge text|

## **2.3 RTL (Arabic) Typography Rules**
- Apply dir="rtl" and lang="ar" on the root <html> when locale=ar. MUI's RTL plugin (stylis-plugin-rtl) auto-mirrors CSS logical properties.
- Font size for Arabic: multiply Latin size by 1.1 (e.g. 14px → 15.4px) — Cairo renders smaller optically.
- Line-height for Arabic: minimum 1.8 (not 1.5) — Arabic diacritics need extra vertical space.
- Never use letter-spacing > 0 for Arabic text — breaks character joining.
- Numerals in Arabic locale: use Eastern Arabic (٠١٢٣) for displayed numbers in content; Western Arabic (0123) for form inputs, IDs, and codes.

// MUI RTL setup — apps/web/src/theme/rtl.tsx

import createCache from '@emotion/cache';

import stylisRTLPlugin from 'stylis-plugin-rtl';

export const rtlCache = createCache({

`  `key: 'muirtl',

`  `stylisPlugins: [stylisRTLPlugin],

});


# **3. Spacing & Layout**
## **3.1 Base Unit**
All spacing uses an 8px base unit (MUI default). The spacing scale is: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px.

|**Token**|**px**|**MUI spacing()**|**Typical Usage**|
| :-: | :-: | :-: | :-: |
|**space.0.5**|4px|spacing(0.5)|Icon padding, chip inner gap|
|**space.1**|8px|spacing(1)|Input inner padding, list item gaps|
|**space.1.5**|12px|spacing(1.5)|Card inner horizontal padding (compact)|
|**space.2**|16px|spacing(2)|Standard component padding, button padding|
|**space.3**|24px|spacing(3)|Card padding, dialog padding, section gaps|
|**space.4**|32px|spacing(4)|Between sections, sidebar section spacing|
|**space.5**|40px|spacing(5)|Page top padding, hero section padding|
|**space.6**|48px|spacing(6)|Between major page sections|
|**space.8**|64px|spacing(8)|Page horizontal margin on tablet|
|**space.12**|96px|spacing(12)|Page horizontal margin on desktop|

## **3.2 Layout Grid**

|**Breakpoint**|**Width**|**Columns**|**Sidebar + Content**|
| :-: | :-: | :-: | :-: |
|**xs  (mobile)**|<600px|4|No sidebar — hamburger menu. Content: 100% − 32px|
|**sm  (tablet)**|600px|8|Sidebar: collapsed (64px). Content: calc(100% − 64px)|
|**md  (laptop)**|900px|12|Sidebar: 240px expanded. Content: calc(100% − 240px)|
|**lg  (desktop)**|1200px|12|Sidebar: 240px. Content max-width: 1400px centered|
|**xl  (wide)**|1536px|12|Sidebar: 260px. Content max-width: 1600px centered|

## **3.3 Sidebar Dimensions**

|**State**|**Width**|**Notes**|
| :-: | :-: | :-: |
|**Expanded (LTR)**|240px|Logo + nav labels visible. z-index: 1200|
|**Collapsed (icons only)**|64px|Icons only + Tooltip on hover. Smooth 200ms transition.|
|**Mobile drawer**|280px|Temporary overlay. Closes on backdrop click or nav.|
|**RTL mirror**|same|Sidebar on RIGHT in RTL layout. transform:translateX mirrors automatically via stylis-plugin-rtl.|

## **3.4 z-index Scale**

|**Layer**|**z-index**|**Components**|
| :-: | :-: | :-: |
|**base**|**0**|Page content, cards, tables|
|**raised**|**1**|Sticky table headers, floating action buttons|
|**overlay**|**100**|Dropdowns, select menus, autocomplete popovers|
|**sidebar**|**1200**|AdminShell sidebar|
|**topbar**|**1300**|AdminShell app bar|
|**drawer**|**1400**|Profile Drawer, Settings panel, Bulk Progress|
|**modal**|**1500**|Confirm dialogs, action dialogs|
|**toast**|**1600**|Snackbar / toast notifications|
|**tooltip**|**1700**|MUI Tooltip components|
|**spotlight**|**9999**|Maintenance wizard overlay, App Lock screen|


# **4. Component Token Reference**
## **4.1 Buttons**

|**State / Variant**|**Background**|**Text / Border**|**Notes**|
| :-: | :-: | :-: | :-: |
|**Primary / default**|color.primary.700 (#1B4F8A)|#FFFFFF|height 40px; border-radius 8px; padding 10px 20px|
|**Primary / hover**|color.primary.500 (#2E86C1)|#FFFFFF|box-shadow: 0 2px 8px rgba(46,134,193,0.4)|
|**Primary / disabled**|color.neutral.200 (#CBD5E1)|color.neutral.400|cursor:not-allowed; opacity 0.6|
|**Secondary / default**|transparent|color.primary.700 / 1.5px border|background:transparent; border solid|
|**Secondary / hover**|color.primary.50 (#DBEAFE)|color.primary.700|no border change on hover|
|**Danger / default**|color.error.700 (#B91C1C)|#FFFFFF|Used: Delete, Ban, Revoke actions|
|**Danger / hover**|#991B1B (darker red)|#FFFFFF|—|
|**Loading state**|same as default|same|Replace label with CircularProgress size=20|

## **4.2 Status Chips / Badges**

|**Chip Variant**|**Background**|**Text Color**|**Used For**|
| :-: | :-: | :-: | :-: |
|**active**|#DCFCE7|#0E7C61|account\_status=active; enrollment=active|
|**locked**|#FEE2E2|#B91C1C|account\_status=locked|
|**suspended**|#FEF3C7|#B7600A|account\_status=suspended|
|**banned**|#FEE2E2|#7C2D12|account\_status=banned; darkest red|
|**processing**|#DBEAFE|#1B4F8A|Job status=processing; bulk in-progress|
|**pending**|#FEF3C7|#B7600A|job\_queue status=pending|
|**done**|#DCFCE7|#0E7C61|job\_queue status=done|
|**failed**|#FEE2E2|#B91C1C|job\_queue status=failed or dead|
|**super\_admin**|#0F2D52|#FFFFFF|Role badge — navy pill|
|**admin**|#1B4F8A|#FFFFFF|Role badge — steel blue|
|**teacher**|#7C3AED|#FFFFFF|Role badge — purple|
|**student**|#475569|#FFFFFF|Role badge — gray|

## **4.3 Data Grid (MUI X)**

|**Element**|**Token**|**Value**|
| :-: | :-: | :-: |
|**Row height (default)**|grid.row.height|52px|
|**Row height (compact)**|grid.row.height.compact|40px|
|**Row alt background**|grid.row.altBg|color.neutral.50 (#F1F5F9)|
|**Row hover background**|grid.row.hover|color.primary.50 (#DBEAFE) at 60% opacity|
|**Row selected background**|grid.row.selected|color.primary.50 (#DBEAFE)|
|**Row selected border-left**|grid.row.selectedBorder|3px solid color.primary.700 (#1B4F8A)|
|**Header background**|grid.header.bg|color.neutral.50 (#F1F5F9)|
|**Header text**|grid.header.text|color.neutral.600 (#475569), 600 weight, text.label (12px)|
|**Header sort icon**|grid.header.sortIcon|color.primary.500 (#2E86C1)|
|**Pagination color**|grid.pagination.active|color.primary.700|
|**Checkbox checked**|grid.checkbox|color.primary.700|
|**Border color**|grid.border|color.neutral.200 (#CBD5E1)|
|**Loading overlay**|grid.overlay.loading|color.neutral.0 at 80% opacity + CircularProgress|

## **4.4 Form Inputs**

|**State**|**Border / Outline**|**Notes**|
| :-: | :-: | :-: |
|**Default**|1px / color.neutral.200|Label: text.label / color.neutral.600|
|**Hover**|1px / color.primary.500|Subtle blue on hover|
|**Focused**|2px / color.primary.700|Focus ring: 3px rgba(27,79,138,0.25)|
|**Error**|2px / color.error.700|Helper text: color.error.700; shake animation 300ms|
|**Disabled**|1px / color.neutral.200|Background: color.neutral.50; text: color.neutral.400|
|**Read-only**|0 / none|Background: color.neutral.50; no border|
|**RTL Arabic**|same|text-align:right; dir=rtl; Cairo font; height +4px for diacritics|

## **4.5 Toast / Snackbar Variants**

|**Variant**|**Background**|**Icon Color**|**Auto-dismiss**|
| :-: | :-: | :-: | :-: |
|**success**|color.success.50|color.success.700|3000ms|
|**error**|color.error.50|color.error.700|null — user must dismiss manually|
|**warning**|color.warning.50|color.warning.700|5000ms|
|**info**|color.info.50|color.info.700|4000ms|
|**security alert**|#FEE2E2|color.error.700|null — stacks in alert panel with badge count|


# **5. Motion, Shadows & Border Radius**
## **5.1 Transition Tokens**

|**Token**|**Duration**|**Easing**|**Usage**|
| :-: | :-: | :-: | :-: |
|**motion.instant**|0ms|linear|Tooltip open; badge count update|
|**motion.fast**|100ms|ease-out|Button hover bg; chip color change|
|**motion.standard**|200ms|ease-in-out|Sidebar collapse; drawer open; row highlight|
|**motion.enter**|250ms|cubic-bezier(0,0,0.2,1)|Dialog open; toast enter; page transition|
|**motion.exit**|200ms|cubic-bezier(0.4,0,1,1)|Dialog close; toast exit|
|**motion.bounce**|300ms|cubic-bezier(0.34,1.56,0.64,1)|Success badge; confirm checkmark|
|**motion.shake**|300ms|ease-in-out|Form error — translateX keyframes|

**REDUCED MOTION:** Wrap all animations in @media (prefers-reduced-motion: reduce) { transition: none; animation: none; } MUI does this automatically when useMediaQuery('(prefers-reduced-motion: reduce)') is true.

## **5.2 Elevation / Shadow Scale**

|**Token**|**CSS Value**|**Usage**|
| :-: | :-: | :-: |
|**shadow.0**|none|Flat elements, table cells|
|**shadow.1**|0 1px 3px rgba(0,0,0,0.08)|Input fields, secondary cards|
|**shadow.2**|0 2px 8px rgba(0,0,0,0.10)|Primary cards, stat widgets|
|**shadow.3**|0 4px 16px rgba(0,0,0,0.12)|Floating buttons, popovers|
|**shadow.4**|0 8px 24px rgba(0,0,0,0.15)|Drawers, sidebar|
|**shadow.5**|0 16px 40px rgba(0,0,0,0.18)|Dialogs, modals|
|**shadow.focus**|0 0 0 3px rgba(27,79,138,0.25)|Focus ring (all focusable elements)|
|**shadow.danger**|0 0 0 3px rgba(185,28,28,0.25)|Focus ring on destructive dialogs|

## **5.3 Border Radius**

|**Token**|**Value**|**Components**|
| :-: | :-: | :-: |
|**radius.sm**|4px|Chips, badges, small tags, code spans|
|**radius.md**|8px|Buttons, inputs, cards, table container|
|**radius.lg**|12px|Dialogs, drawers, popovers, stat cards|
|**radius.xl**|16px|Profile avatar, feature flag toggles|
|**radius.full**|9999px|Avatar, pill chips, loading skeleton|


# **6. Figma Handoff Specification**
## **6.1 Layer Naming Convention**
All Figma layers follow the format: ComponentName/Variant/State. This maps directly to the MUI component variant prop.

|**Figma Layer Name**|**MUI Component**|**Props**|
| :-: | :-: | :-: |
|**Button/Primary/Default**|<Button variant="contained">|*color="primary", disabled=false*|
|**Button/Primary/Loading**|<Button variant="contained">|*loading=true (LoadingButton)*|
|**Button/Danger/Default**|<Button variant="contained">|*color="error"*|
|**Chip/Status/active**|<Chip label="Active">|*color="success", size="small"*|
|**DataGrid/Row/Selected**|<DataGrid>|*selectedRows contains rowId*|
|**ProfileDrawer/Tab/Sessions**|<Drawer> + <Tabs>|*value="sessions"*|
|**Dialog/Confirm/Danger**|<Dialog>|*custom ConfirmDialog component*|
|**Toast/security-alert**|<Snackbar> + <Alert>|*severity="error", persist=true*|
|**PermissionGate/Hidden**|<PermissionGate>|*children hidden, no DOM node*|
|**Sidebar/Collapsed**|<AdminShell sidebar>|*sidebarOpen=false*|

## **6.2 Component States Checklist**
Every interactive component in Figma must include all applicable states before dev handoff:

|**Component**|**Default**|**Hover**|**Active/Focus**|**Disabled**|**Error / Loading**|
| :-: | :-: | :-: | :-: | :-: | :-: |
|**Button (all variants)**|**✓**|**✓**|**✓**|**✓**|**✓ loading**|
|**Text Input**|**✓**|**✓**|**✓ focused**|**✓**|**✓ error**|
|**Select / Autocomplete**|**✓**|**✓**|**✓ open**|**✓**|**✓ error**|
|**DataGrid Row**|**✓**|**✓ hover**|**✓ selected**|—|**✓ loading overlay**|
|**Sidebar Nav Item**|**✓**|**✓**|**✓ active**|—|—|
|**Status Chip**|**✓**|—|—|—|—|
|**Action Menu (3-dot)**|**✓**|**✓**|**✓ open**|**✓**|—|
|**Confirm Dialog**|**✓**|—|—|—|**✓ loading submit**|
|**Profile Drawer**|**✓ each tab**|—|—|—|**✓ loading states per tab**|
|**Bulk Progress Panel**|**✓ pending**|—|**✓ processing**|—|**✓ failed state**|

## **6.3 Spacing Annotation Rules**
- All spacing annotations use the 8px grid token names (space.2 not "16px").
- Annotate: padding-top/bottom, padding-left/right, gap between siblings, margin-top for section breaks.
- For RTL components: annotate both LTR and RTL padding separately if they differ.
- Min-width and min-height must be annotated for all containers.

## **6.4 Accessibility Annotations**
- Every interactive element: annotate role, aria-label (or aria-labelledby), and keyboard shortcut if applicable.
- Focus order: number each focusable element in logical tab order (left-to-right for LTR, right-to-left for RTL).
- Color contrast: annotate text+background pairs. Minimum: 4.5:1 for normal text, 3:1 for large text (WCAG 2.1 AA).
- Icon-only buttons: must have visible tooltip AND aria-label.

## **6.5 Token Studio Configuration**
// packages/design-system/tokens/tokens.json (Token Studio format)

{

`  `"color": {

`    `"primary": {

`      `"700": { "$value": "#1B4F8A", "$type": "color" },

`      `"500": { "$value": "#2E86C1", "$type": "color" }

`    `}

`  `},

`  `"spacing": {

`    `"2": { "$value": "16", "$type": "spacing" }

`  `},

`  `"borderRadius": {

`    `"md": { "$value": "8", "$type": "borderRadius" }

`  `}

}

**SYNC:** Token Studio plugin pushes changes to GitHub → CI generates theme.ts + tailwind.config.ts automatically. Never manually edit these generated files.
EduZone Platform  |  MUI v5 + Tailwind + RTL  |  Page  of 
