# Application Audit - Round 2

## Executive Summary

Following the Phase 1 MVP cleanup (47% bundle reduction), this audit identifies remaining dead code, unused exports, and simplification opportunities in the UI codebase.

**Key Metrics:**
| Metric | Before Phase 1 | After Phase 1 | After Round 2 (Projected) |
|--------|----------------|---------------|---------------------------|
| Main Bundle | ~1,035kb | 360.48kb | ~340kb |
| ServerCard Chunk | 372kb | 18.76kb | 18.76kb |
| InstallModal Chunk | - | 59.15kb | 59.15kb |
| API Methods | ~45 | ~45 | ~26 |
| Store Items | ~25 | ~25 | ~10 |

**Summary of Findings:**
- 19 unused API methods (42% of total)
- 10 unused types in api/client.ts
- 15+ unused store items across 4 stores
- 3 unused React Query hooks
- 15 lines of dead CSS (recharts)
- 1 unused helper function

---

## 1. Dead Code Found

### 1.1 Dead CSS (index.css:319-332)

Recharts was removed but its CSS remains:

```css
/* DEAD - Remove these lines */
.recharts-cartesian-grid-horizontal line,
.recharts-cartesian-grid-vertical line {
  stroke-opacity: 0.1;
}

.recharts-tooltip-wrapper {
  z-index: 1000;
}

.recharts-default-tooltip {
  background-color: rgba(17, 24, 39, 0.95) !important;
  border: 1px solid rgba(75, 85, 99, 0.5) !important;
  border-radius: 0.5rem !important;
}
```

**Action:** Delete lines 319-332 from `src/index.css`

### 1.2 Dead Helper Function (useMetricsStore.ts)

```typescript
// DEAD - formatMetricsForChart is defined but never imported anywhere
export function formatMetricsForChart(history: MetricsDataPoint[]) {
  return history.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString(),
    cpu: point.cpu,
    memory: point.memory,
  }));
}
```

**Action:** Delete `formatMetricsForChart` function from `src/stores/useMetricsStore.ts`

---

## 2. API Client Cleanup

### 2.1 Unused API Methods (19 total)

**File:** `src/api/client.ts`

| Method | Category | Reason Unused |
|--------|----------|---------------|
| `setupTotp` | TOTP | 2FA removed |
| `verifyTotp` | TOTP | 2FA removed |
| `disableTotp` | TOTP | 2FA removed |
| `verifyTotpLogin` | TOTP | 2FA removed |
| `getSessions` | Sessions | Session mgmt removed |
| `revokeSession` | Sessions | Session mgmt removed |
| `revokeAllSessions` | Sessions | Session mgmt removed |
| `getServices` | Services | Never implemented in UI |
| `startService` | Services | Never implemented in UI |
| `stopService` | Services | Never implemented in UI |
| `restartService` | Services | Never implemented in UI |
| `getServiceLogs` | Services | Never implemented in UI |
| `getProxyRoutes` | Proxy | Never used |
| `createProxyRoute` | Proxy | Never used |
| `updateProxyRoute` | Proxy | Never used |
| `deleteProxyRoute` | Proxy | Never used |
| `getAuditLog` | Audit | Never implemented in UI |
| `getGroups` | Groups | Group mgmt removed |
| `createGroup` | Groups | Group mgmt removed |

### 2.2 Unused Types (10 total)

| Type | Reason |
|------|--------|
| `TotpSetupResponse` | 2FA removed |
| `TotpVerifyResponse` | 2FA removed |
| `Session` | Session mgmt removed |
| `SessionsResponse` | Session mgmt removed |
| `Service` | Services never implemented |
| `ServiceLogsResponse` | Services never implemented |
| `ProxyRoute` | Proxy routes never implemented |
| `AuditLogEntry` | Audit log never implemented |
| `AuditLogResponse` | Audit log never implemented |
| `Group` | Group mgmt removed |

**Action:** Remove all 19 methods and 10 types from `src/api/client.ts`

---

## 3. Store Cleanup

### 3.1 useStore.ts (87.5% Unused)

**File:** `src/stores/useStore.ts`

| Item | Status | Notes |
|------|--------|-------|
| `connected` | USED | WebSocket status |
| `setConnected` | USED | WebSocket status |
| `selectedServerId` | UNUSED | Never read |
| `setSelectedServerId` | UNUSED | Never called |
| `installModalOpen` | UNUSED | Modal managed locally |
| `installModalApp` | UNUSED | Modal managed locally |
| `openInstallModal` | UNUSED | Modal managed locally |
| `closeInstallModal` | UNUSED | Modal managed locally |

**Action:** Remove 6 unused items, keep only `connected` and `setConnected`

### 3.2 useAuthStore.ts

| Item | Status | Notes |
|------|--------|-------|
| `user` | USED | Current user |
| `isAuthenticated` | USED | Auth state |
| `isLoading` | USED | Loading state |
| `error` | USED | Error display |
| `setAuthenticated` | USED | Login flow |
| `setLoading` | USED | Loading state |
| `setError` | USED | Error handling |
| `clearError` | USED | Error handling |
| `logout` | USED | Logout flow |
| `checkAuthStatus` | PARTIALLY | Only called on app mount |

**Status:** Clean - no action needed

### 3.3 useMetricsStore.ts

| Item | Status | Notes |
|------|--------|-------|
| `metricsHistory` | USED | Sparkline data |
| `addMetrics` | USED | WebSocket updates |
| `getServerHistory` | UNUSED | Never called |
| `clearHistory` | UNUSED | Never called |
| `maxDataPoints` | UNUSED | Hardcoded in addMetrics |
| `formatMetricsForChart` | UNUSED | Export, never imported |

**Action:** Remove 4 unused items

### 3.4 useThemeStore.ts

| Item | Status | Notes |
|------|--------|-------|
| `theme` | USED | Theme value |
| `setTheme` | USED | Theme toggle |
| `toggleTheme` | UNUSED | setTheme used instead |

**Action:** Remove `toggleTheme`

---

## 4. Hook Cleanup

### 4.1 Unused React Query Hooks (useApi.ts)

| Hook | Status | Notes |
|------|--------|-------|
| `useServices` | UNUSED | Services not implemented |
| `useServiceLogs` | UNUSED | Services not implemented |
| `useAuditLog` | UNUSED | Audit log not implemented |

**Action:** Remove 3 unused hooks from `src/hooks/useApi.ts`

### 4.2 Mutation Hooks to Remove

| Hook | Status | Notes |
|------|--------|-------|
| `useStartService` | UNUSED | Services not implemented |
| `useStopService` | UNUSED | Services not implemented |
| `useRestartService` | UNUSED | Services not implemented |

**Action:** Remove 3 unused mutations

---

## 5. Component Analysis

### 5.1 Largest Components by Lines

| File | Lines | Status |
|------|-------|--------|
| `api/client.ts` | 794 | Needs cleanup (above) |
| `MountCard.tsx` | 480 | Complex but necessary |
| `AppDetailModal.tsx` | 460 | Complex but necessary |
| `InstallModal.tsx` | ~400 | Complex but necessary |
| `ServerCard.tsx` | ~350 | Acceptable |

### 5.2 Component Recommendations

**AppDetailModal.tsx (460 lines):**
- Contains multiple sub-sections (Info, Logs, Config, Actions)
- Consider extracting into sub-components if adding features
- Current size acceptable for now

**MountCard.tsx (480 lines):**
- Handles complex NFS/CIFS mount configuration
- Size justified by feature complexity
- No immediate simplification needed

---

## 6. Recommendations

### Immediate Actions (High Impact)

1. **Delete recharts CSS** - 15 lines, zero risk
2. **Delete `formatMetricsForChart`** - Dead export
3. **Slim useStore.ts** - Remove 6 unused items (75% reduction)
4. **Slim useMetricsStore.ts** - Remove 4 unused items

### Medium Priority

5. **Clean api/client.ts** - Remove 19 methods, 10 types (~200 lines)
6. **Clean useApi.ts hooks** - Remove 6 unused hooks (~60 lines)
7. **Remove `toggleTheme`** - Minor cleanup

### Consider for Future

8. **Bundle analysis** - Consider further code splitting for MountCard
9. **API client refactor** - Group methods by domain if adding features

---

## 7. Updated Stats (After Cleanup)

| Metric | Current | After Cleanup |
|--------|---------|---------------|
| api/client.ts | 794 lines | ~594 lines |
| useStore.ts | ~40 lines | ~15 lines |
| useMetricsStore.ts | ~80 lines | ~50 lines |
| useApi.ts | ~200 lines | ~140 lines |
| index.css | ~350 lines | ~335 lines |
| Total Dead Code | ~300 lines | 0 lines |

---

## 8. Remaining Technical Debt

### Acceptable Complexity

- **MountCard.tsx** - Complex but well-structured
- **AppDetailModal.tsx** - Feature-dense modal
- **InstallModal.tsx** - Multi-step wizard

### Areas to Monitor

- **api/client.ts** - May grow with new features; consider domain splitting
- **WebSocket hooks** - Monitor for memory leaks on long sessions

### No Action Needed

- **Bundle size** - 360kb main bundle is acceptable for admin UI
- **Dependencies** - All remaining deps are actively used
- **Test coverage** - 98 tests passing, good coverage

---

## Appendix: File Inventory

### Files to Modify

| File | Action | Lines Affected |
|------|--------|----------------|
| `src/index.css` | Delete lines 319-332 | -15 |
| `src/stores/useStore.ts` | Remove 6 items | -25 |
| `src/stores/useMetricsStore.ts` | Remove 4 items + helper | -30 |
| `src/stores/useThemeStore.ts` | Remove toggleTheme | -5 |
| `src/api/client.ts` | Remove 19 methods, 10 types | -200 |
| `src/hooks/useApi.ts` | Remove 6 hooks | -60 |

**Total lines to remove:** ~335 lines
