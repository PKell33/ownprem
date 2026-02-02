# Web UI Comprehensive Audit Report

**Date:** 2026-01-31
**Scope:** `apps/ui/src/`
**Categories:** Code Quality, Performance, Accessibility, UX/UI, Testing, Security

---

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 2 | 0 | 3 | 1 |
| Code Quality | 0 | 4 | 4 | 5 |
| Performance | 0 | 4 | 5 | 6 |
| Accessibility | 0 | 3 | 4 | 4 |
| UX/UI | 0 | 2 | 5 | 3 |
| Testing | 1 | 1 | 0 | 0 |
| **Total** | **3** | **14** | **21** | **19** |

---

## 1. CRITICAL ISSUES (Fix Immediately)

### SEC-001: Credentials Embedded in URLs
**Category:** Security
**Location:** `components/ConnectionInfoModal.tsx:66-72`

**Description:** RPC credentials (username/password) are embedded directly in connection URLs:
```typescript
return `${scheme}://${creds.rpcuser}:${creds.rpcpassword}@${host}${service.path}`;
```

**Risk:**
- Credentials exposed in browser history
- URLs with credentials copied to clipboard (line 340, 364, 375)
- QR codes contain credentials (line 260, 267)
- May appear in server access logs

**Fix:**
```typescript
// Display credentials separately, never in URLs
const connectionUrl = `${scheme}://${host}:${port}`;
// Show credentials in separate copy-able fields
<CopyField label="Username" value={creds.rpcuser} />
<CopyField label="Password" value={creds.rpcpassword} secret />
<CopyField label="URL" value={connectionUrl} />
```

---

### SEC-002: Unvalidated URL Construction for External Links
**Category:** Security
**Location:** `components/AppCard.tsx:169`, `components/ServerCard.tsx:375`

**Description:** App manifest `basePath` used directly as `href` without validation:
```typescript
<a href={app.webui.basePath} target="_blank" rel="noopener noreferrer">
```

**Risk:** If manifest contains malicious URLs (`javascript:`, `data:`), XSS is possible.

**Fix:**
```typescript
const validateUrl = (path: string): string | null => {
  try {
    const url = new URL(path, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
};

const safeUrl = validateUrl(app.webui.basePath);
{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer">}
```

---

### TEST-001: Zero UI Test Coverage
**Category:** Testing
**Location:** `apps/ui/` (entire directory)

**Description:** No test files exist (`*.test.tsx`, `*.spec.tsx`). Critical user flows are completely untested:
- Authentication (login, logout, 2FA)
- App installation/uninstallation
- Server management
- Form validation

**Risk:** Regressions go undetected. Refactoring is risky.

**Fix:**
1. Add Vitest + React Testing Library to `package.json`
2. Create tests for critical paths:
   - `__tests__/auth.test.tsx` - Login flow
   - `__tests__/install.test.tsx` - App installation
   - `components/__tests__/Modal.test.tsx` - Modal behavior

---

## 2. HIGH PRIORITY (Fix Soon)

### CODE-001: ServerCard Component Too Large (635 lines)
**Category:** Code Quality
**Location:** `components/ServerCard.tsx`

**Description:** Single component manages:
- Server metrics display
- 5 different modals (AppDetail, ConnectionInfo, Logs, EditConfig, Install)
- All app action handlers (start/stop/restart/uninstall)
- Menu state, deletion confirmation, filter logic

**Fix:** Split into smaller components:
```
ServerCard.tsx (200 lines)
├── ServerMetrics.tsx
├── ServerDeploymentList.tsx
├── ServerActions.tsx
└── hooks/useServerModals.ts
```

---

### CODE-002: Duplicated Permission Checking Logic
**Category:** Code Quality
**Location:** `pages/Dashboard.tsx:23`, `pages/Apps.tsx:33-34`, `pages/Servers.tsx:28`

**Description:** Same permission check repeated across pages:
```typescript
const canOperate = user?.isSystemAdmin ||
  user?.groups?.some(g => g.role === 'admin' || g.role === 'operator') || false;
```

**Fix:** Extract to custom hook:
```typescript
// hooks/usePermissions.ts
export function usePermissions() {
  const user = useAuthStore(s => s.user);
  return {
    canOperate: user?.isSystemAdmin ||
      user?.groups?.some(g => ['admin', 'operator'].includes(g.role)) || false,
    isSystemAdmin: user?.isSystemAdmin || false,
  };
}
```

---

### CODE-003: Duplicated Confirmation Dialog Pattern
**Category:** Code Quality
**Location:** `pages/Apps.tsx:63-106`, `pages/Servers.tsx:300-370`, `components/ServerCard.tsx:140-166`

**Description:** `getConfirmModalContent()` pattern duplicated with switch statements returning title/message/buttonClass objects.

**Fix:** Create shared hook:
```typescript
// hooks/useConfirmAction.ts
export function useConfirmAction<T extends string>() {
  const [action, setAction] = useState<{ type: T; id: string } | null>(null);
  const confirm = (type: T, id: string) => setAction({ type, id });
  const cancel = () => setAction(null);
  return { action, confirm, cancel, isOpen: !!action };
}
```

---

### CODE-004: Missing Error Boundaries
**Category:** Code Quality
**Location:** App-wide

**Description:** No React Error Boundaries. Component errors crash entire app.

**Fix:**
```typescript
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={...} />;
    }
    return this.props.children;
  }
}

// App.tsx - wrap routes
<ErrorBoundary>
  <Routes>...</Routes>
</ErrorBoundary>
```

---

### PERF-001: No Route-Based Code Splitting
**Category:** Performance
**Location:** `App.tsx:1-13`

**Description:** All page components statically imported. Initial bundle includes all pages even if user only visits Dashboard.

**Fix:**
```typescript
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Servers = React.lazy(() => import('./pages/Servers'));
const Apps = React.lazy(() => import('./pages/Apps'));
// ... etc

<Suspense fallback={<PageLoader />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    ...
  </Routes>
</Suspense>
```

---

### PERF-002: Missing React.memo on List Item Components
**Category:** Performance
**Location:** `components/ServerCard.tsx`, `components/AppCard.tsx`

**Description:** Cards rendered in loops re-render on any parent state change.

**Fix:**
```typescript
export const ServerCard = React.memo(function ServerCard(props: Props) {
  // ...
});

export const AppCard = React.memo(function AppCard(props: Props) {
  // ...
});
```

---

### PERF-003: Callback Props Not Memoized
**Category:** Performance
**Location:** `pages/Dashboard.tsx:111-114`, `pages/Servers.tsx:110-113`, `pages/Apps.tsx:158-190`

**Description:** Inline arrow functions passed as props break child memoization:
```typescript
onStartApp={(id) => startMutation.mutate(id)}
onStopApp={(id) => stopMutation.mutate(id)}
```

**Fix:**
```typescript
const handleStart = useCallback((id: string) => {
  startMutation.mutate(id);
}, [startMutation]);

const handleStop = useCallback((id: string) => {
  stopMutation.mutate(id);
}, [stopMutation]);
```

---

### PERF-004: Polling Ignores Page Visibility
**Category:** Performance
**Location:** `hooks/useApi.ts:9, 42, 59`

**Description:** Queries poll every 10-30s even when tab is hidden:
```typescript
refetchInterval: 30000,  // useServers
refetchInterval: 10000,  // useDeployments
```

**Fix:**
```typescript
import { usePageVisibility } from './usePageVisibility';

export function useServers() {
  const isVisible = usePageVisibility();
  return useQuery({
    queryKey: ['servers'],
    queryFn: () => api.getServers(),
    refetchInterval: isVisible ? 30000 : false,
  });
}
```

---

### A11Y-001: Icon-Only Buttons Missing ARIA Labels
**Category:** Accessibility
**Location:** `components/AppCard.tsx:135-163`, `components/ServerCard.tsx:331-356`, `components/LogViewerModal.tsx:190-198`

**Description:** Action buttons (play, stop, restart, settings) use only icons with `title` attribute. Screen readers don't announce purpose.

**Fix:**
```typescript
<button
  onClick={handleStart}
  aria-label="Start application"
  title="Start"
  className="p-1.5 rounded hover:bg-green-600/20 text-green-500"
>
  <Play size={14} aria-hidden="true" />
</button>
```

---

### A11Y-002: Clickable Divs Instead of Buttons
**Category:** Accessibility
**Location:** `components/AppCard.tsx:57-59`

**Description:** Card header uses `<div onClick>` instead of semantic button:
```typescript
<div onClick={onClick} className="p-4 cursor-pointer hover:...">
```

**Fix:**
```typescript
<button
  type="button"
  onClick={onClick}
  className="w-full text-left p-4 hover:bg-[var(--bg-secondary)]"
>
```

---

### A11Y-003: Dropdown Menu Not Keyboard Accessible
**Category:** Accessibility
**Location:** `components/Layout.tsx:114-157`

**Description:** User menu dropdown lacks keyboard navigation (arrow keys, Escape to close).

**Fix:**
```typescript
<button
  onClick={() => setShowUserMenu(!showUserMenu)}
  onKeyDown={(e) => {
    if (e.key === 'Escape') setShowUserMenu(false);
    if (e.key === 'ArrowDown' && showUserMenu) {
      e.preventDefault();
      // Focus first menu item
    }
  }}
  aria-expanded={showUserMenu}
  aria-haspopup="menu"
>
```

---

### UX-001: No Error Display for Failed Page Loads
**Category:** UX/UI
**Location:** `pages/Dashboard.tsx`, `pages/Servers.tsx`, `pages/Apps.tsx`

**Description:** Pages use query hooks but never display errors. Failed fetches show perpetual "Loading...".

**Fix:**
```typescript
const { data, isLoading, error } = useServers();

if (error) {
  return (
    <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
      <p className="text-red-400">Failed to load servers</p>
      <button onClick={() => refetch()}>Retry</button>
    </div>
  );
}
```

---

### UX-002: Installation Errors Don't Revert Modal State
**Category:** UX/UI
**Location:** `components/InstallModal.tsx:75-87`

**Description:** If installation fails, `step` stays at 'installing'. User sees blank screen. Error only shown in toast.

**Fix:**
```typescript
} catch (err) {
  console.error('Install failed:', err);
  setStep('configure');  // Revert to previous step
  setError(err.message); // Show error in modal
  showError(err.message);
}
```

---

### TEST-002: No E2E Tests
**Category:** Testing
**Location:** Project-wide

**Description:** No Playwright/Cypress tests for user flows.

**Fix:** Add Playwright with critical path tests:
```typescript
// e2e/auth.spec.ts
test('user can login and see dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="username"]', 'admin');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toContainText('Dashboard');
});
```

---

## 3. MEDIUM PRIORITY (Plan For)

### SEC-003: TOTP Secret Display Lacks Timeout
**Location:** `pages/MyAccount.tsx:55, 130`

TOTP secrets remain visible indefinitely. Add auto-clear after 60 seconds.

---

### SEC-004: Audit Log Details Display
**Location:** `pages/Admin.tsx:930`

`JSON.stringify(log.details)` displayed directly. While React escapes, could confuse users with log injection.

---

### SEC-005: Log Filter Regex Not Validated
**Location:** `components/LogViewerModal.tsx:121`

User regex passed to API without client-side validation. Add try-catch around `new RegExp()`.

---

### CODE-005: Complex Modal State Management
**Location:** `pages/Apps.tsx:24-29`, `components/ServerCard.tsx:51-60`

Each component manages 5+ modal state variables. Extract to `useModalState()` hook.

---

### CODE-006: Deeply Nested JSX in Login Page
**Location:** `pages/Login.tsx:226-581`

Nested ternaries for different form views. Extract to separate components.

---

### CODE-007: Inline Object Creation in Renders
**Location:** `pages/Apps.tsx:158-190`, `components/MetricsChart.tsx:67-73`

Inline style objects and closures in `.map()` loops cause re-renders.

---

### CODE-008: Inconsistent Loading State Handling
**Location:** Multiple pages

Some use spinners, some use text, some miss loading states entirely.

---

### PERF-005: useMetricsStore Inefficient Updates
**Location:** `stores/useMetricsStore.ts:45-54`

Spreads entire history object on every metric update. Use Map instead.

---

### PERF-006: AggregatedMetricsChart O(n*m) Complexity
**Location:** `components/MetricsChart.tsx:390-418`

For each timestamp, loops through all servers. Build lookup Map instead.

---

### PERF-007: Duplicate WebSocket Connection for Logs
**Location:** `hooks/useLogStream.ts:39-43`

Creates new Socket.IO connection per LogViewerModal instead of reusing.

---

### PERF-008: Inline Chart Style Objects
**Location:** `components/MetricsChart.tsx:27-31, 138-142`

Colors/styles objects recreated on every render.

---

### PERF-009: Linear App Lookups in Loops
**Location:** `components/ServerCard.tsx:81-83, 290-301`

`apps.find()` called for each deployment. Build Map once.

---

### A11Y-004: Table Headers Missing scope
**Location:** `pages/Dashboard.tsx:195-202`

Add `scope="col"` to `<th>` elements.

---

### A11Y-005: Color-Only Status Indicators
**Location:** `components/StatusBadge.tsx:6-30`

Status communicated primarily through color. Add icons for colorblind users.

---

### A11Y-006: Modal Focus Management
**Location:** `components/Modal.tsx`

No explicit focus trap. Add focus management for older browsers.

---

### A11Y-007: QR Code Missing Alt Text
**Location:** `components/ConnectionInfoModal.tsx:371`

Add `aria-label` to QR code component.

---

### UX-003: Text-Only Loading Indicators
**Location:** `pages/Dashboard.tsx:97-98`, `pages/Servers.tsx:93-94`

Plain "Loading..." text instead of spinners. Replace with `<Loader2>`.

---

### UX-004: No Skeleton Loading
**Location:** `pages/Dashboard.tsx:97-119`

Page jumps from "Loading..." to full content. Add skeleton cards.

---

### UX-005: Touch Targets Too Small
**Location:** `components/AppCard.tsx:135-222`, `components/ServerCard.tsx:330-441`

Action buttons are 26px. Mobile guidelines recommend 44px minimum.

---

### UX-006: Table Not Scrollable on Mobile
**Location:** `pages/Dashboard.tsx:194-221`

No `overflow-x-auto` wrapper causes horizontal overflow.

---

### UX-007: Modal Overflow on Mobile
**Location:** `components/Modal.tsx:77`

`overflow: hidden` prevents scrolling on small viewports.

---

## 4. LOW PRIORITY (Nice to Have)

### CODE-009: Commented Incomplete Code
**Location:** `pages/Dashboard.tsx:38-40`

Hardcoded app list for web UI detection instead of using manifest.

---

### CODE-010: Magic Numbers
**Location:** `components/LogViewerModal.tsx:137, 296`, `pages/MyAccount.tsx:143`

Hardcoded values (1000, 5000, 2000) should be constants.

---

### CODE-011: Type Assertions Without Safety
**Location:** `components/ServerCard.tsx:134`

Assumes `appName` exists without TypeScript guarantee.

---

### CODE-012: Inconsistent Error Message Formatting
**Location:** Multiple files

Mix of toast errors, modal alerts, and inline messages.

---

### CODE-013: Missing Input Validation
**Location:** `pages/Servers.tsx:375-416`, `components/InstallModal.tsx:305-369`

Forms have minimal validation beyond `required`.

---

### PERF-010: Images Not Lazy Loaded
**Location:** `components/AppIcon.tsx:24-30`

Add `loading="lazy"` to app icons.

---

### PERF-011: Sparkline Path Recalculated
**Location:** `components/MetricsChart.tsx:285-295`

Memoize SVG path calculation.

---

### PERF-012: Chart Formatters Not Memoized
**Location:** `components/MetricsChart.tsx:75-78, 182-183`

Inline formatter functions cause re-renders.

---

### PERF-013: Recharts Bundle Size
**Location:** `package.json`

Recharts adds ~50KB gzipped. Consider lighter alternative.

---

### PERF-014: Lucide Icons Bundle
**Location:** `package.json`

Verify tree-shaking removes unused icons.

---

### PERF-015: Duplicate Query Cache Updates
**Location:** `hooks/useWebSocket.ts:99-125`

Three separate cache updates on deployment status. Consolidate.

---

### A11Y-008: Form Labels Not Associated
**Location:** `components/InstallModal.tsx:151-162`

Select missing `id` for `htmlFor` association.

---

### A11Y-009: Required Field Indicator
**Location:** `components/InstallModal.tsx:320`

Asterisk without `aria-label="required"`.

---

### A11Y-010: Disabled Button Contrast
**Location:** `components/EditConfigModal.tsx:97`

`disabled:text-gray-500` may have insufficient contrast.

---

### A11Y-011: Focus Ring Missing on Select
**Location:** `components/InstallModal.tsx:151-162`

Missing `focus:ring-2` class.

---

### UX-008: Inconsistent Button Styling
**Location:** Multiple files

Mix of `bg-accent`, inline gradients, `bg-gray-100`.

---

### UX-009: Hard-Coded Colors
**Location:** `pages/Login.tsx:18-71`, `components/ConnectionInfoModal.tsx`

Use CSS variables instead of `rgba(122, 162, 247, 0.2)`.

---

### UX-010: Inconsistent Spacing
**Location:** `components/ServerCard.tsx:264-284`, `components/AppCard.tsx:120-225`

Mix of `gap-1`, `gap-0.5`, `gap-2` without pattern.

---

## Summary: Top 10 Fixes by Impact

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| 1 | SEC-001: Remove credentials from URLs | Security | Medium |
| 2 | SEC-002: Validate basePath URLs | Security | Low |
| 3 | TEST-001: Add unit tests | Quality | High |
| 4 | CODE-004: Add error boundaries | Stability | Low |
| 5 | PERF-001: Route code splitting | Performance | Low |
| 6 | A11Y-001: ARIA labels on buttons | Accessibility | Low |
| 7 | UX-001: Error states for failed loads | UX | Low |
| 8 | CODE-001: Split ServerCard | Maintainability | Medium |
| 9 | PERF-002: React.memo on cards | Performance | Low |
| 10 | UX-003: Spinner loading indicators | UX | Low |

---

## Appendix: File Complexity Analysis

| File | Lines | Issues | Recommendation |
|------|-------|--------|----------------|
| `components/ServerCard.tsx` | 635 | 8 | Split urgently |
| `pages/Login.tsx` | 581 | 3 | Extract form views |
| `pages/Admin.tsx` | 950+ | 2 | Split into tabs |
| `components/MetricsChart.tsx` | 500+ | 6 | Memoize, extract |
| `hooks/useApi.ts` | 300+ | 3 | Good, minor fixes |
| `api/client.ts` | 250+ | 1 | Well structured |
