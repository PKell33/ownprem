# UI Refactor Sprint Summary

## Audit Issues Summary

| Severity | Category | Issue | Status |
|----------|----------|-------|--------|
| P0 Critical | Security | SEC-001: serviceName allows path traversal | **Fixed** |
| P0 Critical | Security | SEC-002: capabilities whitelist missing | **Fixed** |
| P1 High | Stability | Modal race conditions in React StrictMode | **Fixed** |
| P1 High | Performance | Unnecessary re-renders without memoization | **Fixed** |
| P1 High | Performance | Background polling wastes resources | **Fixed** |
| P2 Medium | Architecture | Monolithic components (700+ lines) | **Fixed** |
| P2 Medium | Stability | No error boundaries for component isolation | **Fixed** |
| P2 Medium | UX | Inconsistent loading/error states | **Fixed** |
| P3 Low | Accessibility | Icon buttons missing aria-labels | **Fixed** |
| P3 Low | Accessibility | Forms missing semantic HTML | **Fixed** |
| P3 Low | Quality | No unit tests for UI components | **Fixed** |

---

## 1. Executive Summary

This sprint addressed critical security vulnerabilities, architectural debt, and user experience issues in the Ownprem UI. The work included fixing 2 critical security issues (path traversal and privilege escalation vectors), resolving modal race conditions affecting 14 components, splitting 3 monolithic files (2,300+ combined lines) into modular architectures, implementing a 3-tier error boundary system, adding comprehensive memoization for performance, and establishing a complete testing infrastructure with 111 tests across 10 test files. The changes improve security posture, reduce bundle fragmentation through code splitting (10 lazy-loaded page chunks), and establish patterns for maintainable UI development going forward.

**Key Metrics:**
- Security issues fixed: 2 critical (P0), 4 high/medium
- Files refactored: 43 files modified, 48+ new component files created
- Test count: 111 tests across 10 test files
- Bundle: Route-based code splitting with 10 lazy-loaded page chunks
- Lines reorganized: ~2,300 lines from 3 monolithic files into modular structures

---

## 2. Security Fixes

### SEC-001: Service Name Path Traversal

**Issue:** The `serviceName` field in app manifests accepted arbitrary values, allowing potential path traversal attacks when the privileged helper wrote systemd service files (e.g., `../../../etc/passwd`).

**Fix:** Added validation requiring all service names to match the `ownprem-*` prefix pattern. The privileged helper now validates this pattern before any file operations.

**Files Changed:**
- `apps/privileged-helper/src/validator.ts` - Added serviceName pattern validation
- `packages/shared/src/validation/manifest.ts` - Schema validation for serviceName
- All `app-definitions/*/manifest.yaml` - Updated to use `ownprem-{appname}` convention

### SEC-002: Capabilities Whitelist Missing

**Issue:** The `capabilities` field in app manifests could specify arbitrary Linux capabilities, potentially allowing privilege escalation (e.g., `CAP_SYS_ADMIN`).

**Fix:** Implemented a strict whitelist of allowed capabilities. Only safe capabilities required for legitimate app functionality are permitted.

**Allowed Capabilities:**
- `CAP_NET_BIND_SERVICE` - Bind to ports < 1024
- `CAP_NET_RAW` - Raw socket access (for ping, etc.)
- `CAP_SETUID`, `CAP_SETGID` - User/group switching

**Files Changed:**
- `apps/privileged-helper/src/validator.ts` - Capabilities whitelist enforcement
- `packages/shared/src/validation/manifest.ts` - Schema validation for capabilities

### Modal Race Condition Bug

**Root Cause:** Modals were always mounted in the DOM with `isOpen` controlling visibility. In React StrictMode, this caused double-mounting issues where modals would open unexpectedly or fail to close properly.

**Fix:** Enforced conditional rendering pattern where modals are only mounted when needed:

```tsx
// Before (problematic)
<Modal isOpen={showModal} onClose={...} />

// After (fixed)
{showModal && <Modal onClose={...} />}
```

**Scope:** 14 modals fixed across 8 files:
- ServerCard: AddAppModal
- MountCard: AssignMountModal, ConfirmUnmountModal
- Admin: CreateGroupModal, AddMemberModal, CreateUserModal
- Servers: AddServerModal, SetupServerModal, ServerGuideModal
- Storage: AddMountModal
- MyAccount: Disable2FAModal, Setup2FAModal, EndSessionsModal
- HAConfig: ConfigureHAModal

---

## 3. Architecture Improvements

### Component Splits

#### ServerCard (773 lines → modular structure)

**Before:**
- Single file: `ServerCard.tsx` (773 lines)
- Issues: Hard to test, difficult to maintain, all logic intertwined

**After:**
```
ServerCard/
├── ServerCard.tsx (243 lines) - Main component with React.memo
├── ServerCardHeader.tsx (161 lines) - Memoized header with dropdown
├── ServerCardMetrics.tsx (46 lines) - Memoized metrics display
├── DeploymentItem.tsx (184 lines) - Memoized app row
├── AppSelectButton.tsx (35 lines) - App selection UI
├── MetricItem.tsx (25 lines) - Individual metric
├── types.ts (48 lines) - TypeScript interfaces
├── utils.ts (15 lines) - Helper functions
├── modals/
│   ├── AddAppModal.tsx (91 lines)
│   └── ConfirmActionModal.tsx (84 lines)
└── index.ts - Exports
```

**Benefits:**
- Each component is independently testable
- Clear separation of concerns
- Memoization prevents unnecessary re-renders
- Modals isolated for conditional rendering

#### Admin Page (973 lines → modular structure)

**Before:**
- Single file: `Admin.tsx` (973 lines)
- Issues: Mixed concerns (users, groups, audit), hard to navigate

**After:**
```
Admin/
├── index.tsx (51 lines) - Page with tab state
├── AdminTabs.tsx (36 lines) - Tab navigation
├── types.ts (3 lines) - Type definitions
├── sections/
│   ├── UserManagement.tsx (206 lines)
│   ├── GroupManagement.tsx (318 lines)
│   └── AuditLog.tsx (178 lines)
└── modals/
    ├── CreateUserModal.tsx (124 lines)
    ├── CreateGroupModal.tsx (83 lines)
    └── AddMemberModal.tsx (71 lines)
```

**Benefits:**
- Each section wrapped in error boundary
- Tab content lazy-loaded on demand
- Modals colocated with their sections

#### Login Page (582 lines → modular structure)

**Before:**
- Single file: `Login.tsx` (582 lines)
- Issues: Three different views in one file, shared components duplicated

**After:**
```
Login/
├── index.tsx (83 lines) - State machine for views
├── types.ts (66 lines) - TypeScript types
├── components/
│   ├── AuthCard.tsx (73 lines) - Shared wrapper
│   ├── AuthButton.tsx (52 lines) - Styled button
│   └── AuthInput.tsx (64 lines) - Form input
└── views/
    ├── LoginForm.tsx (94 lines) - Login view
    ├── SetupForm.tsx (106 lines) - Admin setup
    └── TotpForm.tsx (132 lines) - 2FA verification
```

**Benefits:**
- State machine pattern for clear flow control
- Reusable auth components
- Each view independently testable

### Code Splitting Results

All page routes are now lazy-loaded using `React.lazy()`:

| Chunk | Size (gzip) | Contents |
|-------|-------------|----------|
| `index.js` (main) | 114.26 KB | React, React Query, router, shared libs |
| `ServerCard.js` | 110.68 KB | ServerCard + charts + Recharts |
| `InstallModal.js` | 17.45 KB | Installation wizard |
| `index-vendor.js` | 27.70 KB | Vendor dependencies |
| `Dashboard.js` | 2.30 KB | Dashboard page |
| `Servers.js` | 3.15 KB | Servers page |
| `Apps.js` | 3.41 KB | Apps marketplace page |
| `Storage.js` | 5.08 KB | Storage management |
| `Settings.js` | 3.00 KB | Settings page |
| `MyAccount.js` | 3.95 KB | Account settings |
| `Admin.js` | (included in sections) | Admin page |
| `TotpSetup.js` | 2.26 KB | 2FA setup wizard |
| `CertificateSetup.js` | 3.16 KB | Certificate setup |

**Lazy-Loaded Page Chunks:** 10 routes

---

## 4. Performance Optimizations

### Memoization Additions

**Components using `React.memo`:**
- `ServerCard` - Prevents re-render on parent state changes
- `ServerCardHeader` - Isolated header updates
- `ServerCardMetrics` - Metrics display isolation
- `DeploymentItem` - Individual deployment row
- `MetricItem` - Single metric value
- `AppCard` - App marketplace card
- `MetricsChart` - Chart rendering (expensive)

**`useCallback` usage (72+ instances):**
```typescript
// Example from ServerCard
const handleStartApp = useCallback((deploymentId: string) => {
  onStartApp?.(deploymentId);
}, [onStartApp]);

const handleStopApp = useCallback((deploymentId: string) => {
  onStopApp?.(deploymentId);
}, [onStopApp]);
```

**`useMemo` usage for expensive computations:**
```typescript
// Example from ServerCard
const installedAppNames = useMemo(() =>
  new Set(deployments?.map(d => d.appName) || []),
  [deployments]
);

const availableApps = useMemo(() =>
  apps?.filter(app => !installedAppNames.has(app.name) && !app.mandatory) || [],
  [apps, installedAppNames]
);

const sortedDeployments = useMemo(() =>
  [...(deployments || [])].sort((a, b) => {
    // System apps first, then alphabetical
  }),
  [deployments]
);
```

### Polling Improvements

**Before:** All queries polled continuously, even when browser tab was hidden.

**After:** Visibility-aware polling with appropriate stale times:

| Query | Interval | Background | Stale Time | Rationale |
|-------|----------|------------|------------|-----------|
| `useServers` | 30s | Off | 30s | Server list changes rarely |
| `useDeployments` | 10s | Off | 5s | Status changes during operations |
| `useSystemStatus` | 10s | Off | 10s | Health monitoring |
| `useApps` | - | - | 5min | App manifests are static |
| `useMounts` | - | - | 1min | Mount definitions stable |
| `useServerMounts` | 30s | Off | 30s | Mount status changes rarely |

```typescript
// Example configuration
export function useDeployments(serverId?: string) {
  return useQuery({
    queryKey: ['deployments', serverId],
    queryFn: () => api.getDeployments(serverId),
    refetchInterval: 10000,
    refetchIntervalInBackground: false, // Stop polling when hidden
    staleTime: 5000,
  });
}
```

---

## 5. Stability Improvements

### Error Boundary Implementation (3 Levels)

**1. ErrorBoundary (Base)**
- Location: `src/components/ErrorBoundary.tsx`
- Purpose: Catch errors, render fallback UI
- Features: Custom fallback support, reset capability, onError callback

**2. PageErrorBoundary**
- Location: `src/components/PageErrorBoundary.tsx`
- Purpose: Full-page error display
- Features: "Go to Dashboard" navigation, expandable stack trace in dev

**3. ComponentErrorBoundary**
- Location: `src/components/ComponentErrorBoundary.tsx`
- Purpose: Inline error display for component isolation
- Features: Compact mode, keeps rest of page functional

**Usage Pattern:**
```tsx
// Page level
<PageErrorBoundary>
  <Dashboard />
</PageErrorBoundary>

// Component level
<ComponentErrorBoundary componentName="Server: Production">
  <ServerCard server={server} />
</ComponentErrorBoundary>
```

### Error State Handling Pattern

**QueryError Component:**
```tsx
// Full error display
<QueryError
  error={error}
  refetch={refetch}
  message="Failed to load servers"
/>

// Inline/compact variant
<InlineQueryError error={error} refetch={refetch} />
```

Features:
- Detects network vs application errors
- Shows appropriate message
- Provides retry button when refetch available

### Loading State Standardization

**LoadingSpinner Component:**
```tsx
// Full-page loading
<PageLoadingSpinner message="Loading dashboard..." />

// Section loading
<LoadingSpinner message="Loading servers..." />

// Inline loading
<InlineLoadingSpinner />
```

---

## 6. Accessibility Improvements

### Icon Buttons

**Count Fixed:** 53+ icon-only buttons across components

**Pattern Established:**
```tsx
// Before
<button onClick={handleDelete}>
  <Trash2 size={16} />
</button>

// After
<button
  onClick={handleDelete}
  aria-label={`Delete ${item.name}`}
>
  <Trash2 size={16} aria-hidden="true" />
</button>
```

### Semantic HTML Changes

**Clickable Divs → Buttons:**
```tsx
// Before
<div className="card" onClick={handleClick}>

// After
<button
  className="card"
  onClick={handleClick}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabIndex={0}
  aria-label="View server details"
>
```

**Dropdown Menus:**
```tsx
<div role="menu" aria-label="Server actions">
  <button role="menuitem">Start</button>
  <button role="menuitem">Stop</button>
</div>
```

### Form Accessibility Pattern

```tsx
<div>
  <label htmlFor="username">Username</label>
  <input
    id="username"
    type="text"
    aria-required="true"
    aria-describedby="username-hint"
    autoComplete="username"
  />
  <p id="username-hint">Enter your username</p>
  {error && (
    <p role="alert" aria-live="polite">{error}</p>
  )}
</div>
```

**Form Groups:**
```tsx
<fieldset>
  <legend>Select Server</legend>
  <div role="radiogroup" aria-label="Server selection">
    {servers.map(s => (
      <label key={s.id}>
        <input type="radio" name="server" value={s.id} />
        {s.name}
      </label>
    ))}
  </div>
</fieldset>
```

### Keyboard Navigation

**Global Focus Styles (`index.css`):**
```css
/* Keyboard focus indicator */
*:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Remove outline for mouse users */
*:focus:not(:focus-visible) {
  outline: none;
}
```

---

## 7. Testing Infrastructure

### Stack

- **Test Runner:** Vitest 4.0
- **Testing Library:** React Testing Library + user-event
- **Environment:** jsdom
- **Coverage:** v8 provider

### Test Count

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| Dashboard.test.tsx | 11 | Page integration, API states |
| Admin.test.tsx | 16 | Tab navigation, user/group mgmt |
| InstallFlow.test.tsx | 13 | Installation wizard flow |
| ServerCard.test.tsx | 17 | Card rendering, interactions |
| LoginForm.test.tsx | 15 | Form validation, submission |
| Login.test.tsx | 9 | Page flow, 2FA |
| QueryError.test.tsx | 11 | Error states, retry |
| Modal.test.tsx | 9 | Modal behavior, accessibility |
| ErrorBoundary.test.tsx | 7 | Error catching, fallbacks |
| smoke.test.tsx | 3 | Basic rendering |
| **Total** | **111** | |

### Mock Data Factories

**Location:** `src/test/factories.ts`

```typescript
// Server factories
createMockServer(overrides?)
createMockServers(count, overrides?)
createCoreServer(overrides?)

// Deployment factories
createMockDeployment(overrides?)
createMockDeployments(count, overrides?)

// App factories
createMockApp(overrides?)
createMockApps(names[])

// User/Group factories
createMockUser(overrides?)
createMockUsers(count, overrides?)
createMockAdminUser(overrides?)
createMockGroup(overrides?)
createMockGroups(count)
createMockGroupWithMembers(overrides?)

// State factories
createMockAuthState(overrides?)
createMockAdminAuthState(overrides?)
createMockSystemStatus(overrides?)
createMockValidationResponse(overrides?)

// Test isolation
resetFactoryCounters()
```

### Coverage of Critical Paths

- **Authentication flow:** Login, 2FA, setup wizard
- **Dashboard rendering:** Loading, error, data states
- **Server management:** Cards, status, deployments
- **Admin functions:** User CRUD, group management, tabs
- **App installation:** Server selection, config, API calls
- **Error handling:** Boundaries, query errors, retries

---

## 8. Files Changed

### Major Files Modified

| File | Changes |
|------|---------|
| `src/App.tsx` | Added Suspense, lazy loading, error boundaries |
| `src/components/Modal.tsx` | Added documentation, fixed patterns |
| `src/hooks/useApi.ts` | Added staleTime, background polling control |
| `src/index.css` | Added focus-visible styles |

### New Files Created

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/components/ServerCard/` | 10 files | Modular ServerCard |
| `src/pages/Admin/` | 8 files | Modular Admin page |
| `src/pages/Login/` | 7 files | Modular Login page |
| `src/components/` | ErrorBoundary, QueryError, LoadingSpinner | Shared UI |
| `src/test/` | factories.ts, utils.tsx, setup.ts | Testing infrastructure |
| `src/**/__tests__/` | 10 test files | Component tests |

---

## 9. Patterns Established

### Modal Rendering Pattern

**Always use conditional rendering:**
```tsx
// Correct
const [showModal, setShowModal] = useState(false);

return (
  <>
    <button onClick={() => setShowModal(true)}>Open</button>
    {showModal && (
      <Modal onClose={() => setShowModal(false)}>
        Content
      </Modal>
    )}
  </>
);
```

### Error Handling Pattern

```tsx
// Page level
function MyPage() {
  const { data, isLoading, error, refetch } = useMyQuery();

  if (isLoading) return <LoadingSpinner message="Loading..." />;
  if (error) return <QueryError error={error} refetch={refetch} />;

  return <MyContent data={data} />;
}

// With error boundary wrapper
<PageErrorBoundary>
  <MyPage />
</PageErrorBoundary>
```

### Form Accessibility Pattern

```tsx
function MyForm() {
  return (
    <form>
      <div>
        <label htmlFor="field-name">Field Label</label>
        <input
          id="field-name"
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={error ? 'field-error' : undefined}
        />
        {error && (
          <p id="field-error" role="alert">{error}</p>
        )}
      </div>
    </form>
  );
}
```

### Component Organization Pattern

```
ComponentName/
├── ComponentName.tsx    # Main component (React.memo wrapped)
├── SubComponent.tsx     # Memoized sub-components
├── types.ts             # TypeScript interfaces
├── utils.ts             # Helper functions (if needed)
├── modals/              # Related modals
│   └── SomeModal.tsx
├── __tests__/
│   └── ComponentName.test.tsx
└── index.ts             # Exports
```

### Memoization Pattern

```tsx
const MyComponent = memo(function MyComponent({ data, onAction }) {
  // Memoize expensive computations
  const processedData = useMemo(() =>
    data.map(transform).filter(validate),
    [data]
  );

  // Memoize callbacks passed to children
  const handleClick = useCallback((id) => {
    onAction?.(id);
  }, [onAction]);

  return <Child data={processedData} onClick={handleClick} />;
});
```

---

## 10. Remaining Recommendations

### Addressed in This Sprint
- [x] Critical security vulnerabilities (SEC-001, SEC-002)
- [x] Modal race conditions
- [x] Component architecture (monolithic files)
- [x] Performance (memoization, polling)
- [x] Error boundaries
- [x] Loading/error state consistency
- [x] Accessibility (ARIA, semantic HTML)
- [x] Testing infrastructure

### Future Improvements to Consider

| Priority | Item | Description |
|----------|------|-------------|
| Medium | E2E Tests | Add Playwright tests for critical user journeys |
| Medium | Storybook | Component documentation and visual testing |
| Low | Bundle Analysis | Further optimization of ServerCard chunk (110KB) |
| Low | Skeleton Loading | Replace spinners with content placeholders |
| Low | Virtualization | Virtual scrolling for long lists (audit log, users) |
| Low | i18n | Internationalization support |

### Technical Debt Noted

1. **Large Chunks:** ServerCard bundle (110KB gzip) includes Recharts - consider dynamic import for charts
2. **Console Warnings:** Some React StrictMode act() warnings remain in tests (non-blocking)
3. **Test Coverage:** Some complex components (MountCard, HAConfig) lack dedicated tests

---

*Document generated: 2026-01-31*
*Sprint duration: UI Refactor Sprint*
*Total commits: 4 major commits (290e986, a855e0b, 7756d16, 285517a)*
