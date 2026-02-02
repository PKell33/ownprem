# Application Audit Report

**Date:** 2026-02-01
**Scope:** UI Application (`apps/ui/src/`)

---

## Executive Summary

The UI codebase consists of **76 TypeScript/React files** totaling **13,084 lines of code**. The application is well-structured with clear separation of concerns: pages, components, stores, and hooks. The bundle produces several chunks, with the two largest being **ServerCard (372kb)** and **main index (363kb)**, both heavily influenced by the Recharts charting library. Key simplification opportunities include: removing the placeholder Settings page, evaluating whether Storage management is MVP-essential, and potentially deferring the MetricsChart visualization to reduce bundle size.

---

## Part 1: Codebase Structure

### 1.1 Summary Statistics

| Metric | Value |
|--------|-------|
| Total .ts/.tsx files | 76 |
| Total lines of code | 13,084 |
| Test files | 13 |
| Test lines | ~2,400 |
| Production code lines | ~10,700 |

### 1.2 Bundle Size Analysis

| Chunk | Raw Size | Gzip Size |
|-------|----------|-----------|
| `ServerCard-*.js` | 371.90 kB | 110.79 kB |
| `index-*.js` (main) | 362.71 kB | 113.48 kB |
| `index-*.js` (vendor) | 97.64 kB | 27.70 kB |
| `InstallModal-*.js` | 58.03 kB | 16.80 kB |
| `Storage-*.js` | 20.13 kB | 5.04 kB |
| `QueryError-*.js` | 15.82 kB | 5.19 kB |
| `MyAccount-*.js` | 15.49 kB | 4.02 kB |
| `Servers-*.js` | 13.40 kB | 3.13 kB |
| `Apps-*.js` | 10.40 kB | 3.32 kB |
| `index-*.css` | 42.18 kB | 7.42 kB |
| **Total JS** | **~1,035 kB** | **~302 kB** |

**Analysis:** The ServerCard chunk is disproportionately large (372kb) because it includes:
- Recharts library (LineChart, ResponsiveContainer, etc.)
- MetricsChart with 4 variants (full chart, single metric, sparkline, aggregated)
- Multiple modal components

### 1.3 Largest Files (Top 10)

| Rank | File | Lines | Description |
|------|------|-------|-------------|
| 1 | `api/client.ts` | 794 | API client, types, fetch utilities |
| 2 | `pages/MyAccount.tsx` | 672 | 2FA setup, session management |
| 3 | `components/MetricsChart.tsx` | 488 | 4 chart variants using Recharts |
| 4 | `components/MountCard.tsx` | 480 | Storage mount management UI |
| 5 | `components/AppDetailModal.tsx` | 460 | App details with actions |
| 6 | `__tests__/InstallFlow.test.tsx` | 460 | Install modal tests |
| 7 | `pages/Servers.tsx` | 436 | Server list + add modal |
| 8 | `__tests__/Dashboard.test.tsx` | 415 | Dashboard tests |
| 9 | `pages/Storage.tsx` | 406 | NFS/CIFS mount management |
| 10 | `components/ConnectionInfoModal.tsx` | 387 | Connection details display |

---

## Part 2: Feature Inventory

### 2.1 Pages/Routes

| Route | Component | Lines | Purpose | Essential for MVP? |
|-------|-----------|-------|---------|-------------------|
| `/login` | Login | 83 | Authentication | ✅ Yes |
| `/setup-2fa` | TotpSetup | 259 | TOTP enrollment | ⚠️ Conditional |
| `/` | Dashboard | 259 | Overview, stats | ✅ Yes |
| `/servers` | Servers | 436 | Server management | ✅ Yes |
| `/apps` | Apps | 296 | App marketplace | ✅ Yes |
| `/storage` | Storage | 406 | NFS/CIFS mounts | ⚠️ Evaluate |
| `/account` | MyAccount | 672 | 2FA + sessions | ⚠️ Could simplify |
| `/settings` | Settings | 29 | Placeholder | ❌ Remove |
| `/admin` | Admin | 39 | User management | ✅ Yes |

### 2.2 Components

| Component | Lines | Used By | Purpose | Essential? |
|-----------|-------|---------|---------|------------|
| `Layout.tsx` | 222 | All pages | Navigation, sidebar | ✅ Yes |
| `ServerCard/` (total) | ~650 | Dashboard, Servers | Server display + actions | ✅ Yes |
| `AppCard.tsx` | 324 | Apps | App display + actions | ✅ Yes |
| `InstallModal.tsx` | 317 | Apps, ServerCard | App installation | ✅ Yes |
| `AppDetailModal.tsx` | 460 | Apps, ServerCard | App details view | ✅ Yes |
| `MountCard.tsx` | 480 | Storage | Mount management | ⚠️ If Storage kept |
| `ConnectionInfoModal.tsx` | 387 | Apps, ServerCard | Connection info | ✅ Yes |
| `LogViewerModal.tsx` | 326 | Apps, ServerCard | Log streaming | ✅ Yes |
| `EditConfigModal.tsx` | 202 | Apps, ServerCard | Config editing | ✅ Yes |
| `MetricsChart.tsx` | 488 | ServerCard | Charts (4 variants) | ⚠️ Simplify |
| `NodeNetwork.tsx` | 339 | Login | Animated background | ❌ Decorative |
| `Modal.tsx` | 130 | Many | Modal wrapper | ✅ Yes |
| `StatusBadge.tsx` | 49 | Many | Status indicator | ✅ Yes |
| `LoadingSpinner.tsx` | 70 | Many | Loading states | ✅ Yes |
| `QueryError.tsx` | 98 | Many | Error display | ✅ Yes |
| `ErrorBoundary.tsx` | 105 | App | Global error catch | ✅ Yes |
| `ProtectedRoute.tsx` | 23 | App | Auth guard | ✅ Yes |
| `Toaster.tsx` | 20 | App | Toast notifications | ✅ Yes |
| `AppIcon.tsx` | 36 | AppCard, etc. | App icon display | ✅ Yes |

### 2.3 Modals Summary

| Modal | Triggered From | Purpose | Essential? |
|-------|---------------|---------|------------|
| `InstallModal` | Apps, ServerCard | Install app on server | ✅ Yes |
| `AppDetailModal` | Apps, ServerCard | View app details | ✅ Yes |
| `ConnectionInfoModal` | Apps, ServerCard | Show connection info | ✅ Yes |
| `LogViewerModal` | Apps, ServerCard | Stream logs | ✅ Yes |
| `EditConfigModal` | Apps, ServerCard | Edit app config | ✅ Yes |
| `ConfirmActionModal` | ServerCard | Confirm stop/restart/uninstall | ✅ Yes |
| `AddAppModal` | ServerCard | Select app to install | ✅ Yes |
| `CreateUserModal` | Admin | Create user | ✅ Yes |
| Various confirm modals | MyAccount, Storage | Confirm actions | ✅ Yes |

### 2.4 Zustand Stores

| Store | Lines | State | Purpose | Essential? |
|-------|-------|-------|---------|------------|
| `useAuthStore` | 82 | user, isAuthenticated, totpSetupRequired | Auth state | ✅ Yes |
| `useStore` | 31 | connected, selectedServerId, installModal | UI state | ✅ Yes |
| `useMetricsStore` | 82 | history (per server) | Metrics history | ⚠️ If charts kept |
| `useThemeStore` | 61 | theme | Dark/light mode | ✅ Yes |

### 2.5 Custom Hooks

| Hook | Lines | Purpose | Essential? |
|------|-------|---------|------------|
| `useApi.ts` | 234 | React Query hooks for all API calls | ✅ Yes |
| `useWebSocket.ts` | 201 | WebSocket connection + event handlers | ✅ Yes |
| `useLogStream.ts` | 155 | Log streaming WebSocket | ✅ Yes |

### 2.6 API Client

| Section | Lines | Purpose |
|---------|-------|---------|
| Auth methods | ~100 | Login, logout, users, TOTP |
| Server methods | ~30 | CRUD servers |
| App methods | ~20 | Get apps |
| Deployment methods | ~80 | Install, start, stop, logs |
| Mount methods | ~70 | Storage CRUD |
| Types/interfaces | ~250 | TypeScript types |
| Utilities | ~80 | fetchWithAuth, CSRF, error handling |

---

## Part 3: Complexity Analysis

### 3.1 Large Files Analysis

#### `api/client.ts` (794 lines)
**What it does:** Central API client with all endpoints, types, and fetch utilities.
**Why it's large:** Contains ~50 API methods + ~30 type definitions + auth/refresh logic.
**Simplification:** Could split types to separate file, but current structure is functional.

#### `pages/MyAccount.tsx` (672 lines)
**What it does:** Two major features - 2FA setup and session management.
**Why it's large:** Contains two self-contained components (`TwoFactorAuth`, `SessionManagement`).
**Simplification:** Could split into separate files. Session management alone is ~260 lines.

#### `components/MetricsChart.tsx` (488 lines)
**What it does:** Four chart variants using Recharts library.
**Why it's large:** Each variant has its own component with full Recharts integration.
**Simplification:** If only sparklines are needed, could remove `MetricsChart`, `SingleMetricChart`, and `AggregatedMetricsChart` (save ~300 lines and significant bundle size).

#### `components/MountCard.tsx` (480 lines)
**What it does:** Storage mount card with assign/mount/unmount modals.
**Why it's large:** Contains main component + `ServerMountItem` sub-component + modal forms.
**Simplification:** If Storage feature is deferred, entire component can be removed.

### 3.2 Bundle Size Hotspots

| Component | Impact | Reason |
|-----------|--------|--------|
| `Recharts` | ~250kb raw | Full charting library |
| `socket.io-client` | ~60kb raw | WebSocket abstraction |
| `react-query` | ~40kb raw | Server state management |
| `qrcode.react` | ~20kb raw | QR code for TOTP |
| `lucide-react` | ~15kb raw (tree-shaken) | Icons |

---

## Part 4: MVP Alignment Check

### Core Flow: Login → Add Server → Install App → Running

#### Step 1: Login ✅
- **Components:** Login, LoginForm, TotpForm, SetupForm, AuthCard, AuthInput, AuthButton, NodeNetwork
- **Complexity:** Reasonable. TotpForm adds ~132 lines for 2FA.
- **NodeNetwork:** 339 lines for decorative animation. **Non-essential.**

#### Step 2: Add Server ✅
- **Flow:** Click "Add Server" → Enter name/host → Get bootstrap command
- **Components:** Servers page modal, AddServerForm
- **Complexity:** Clean, no issues.

#### Step 3: Deploy Agent ✅
- **Flow:** User runs bootstrap command on server manually
- **UI:** Shows connection status updates via WebSocket
- **Complexity:** Minimal UI involvement, mostly backend.

#### Step 4: Install App ✅
- **Flow:** Browse apps → Select server → Configure → Install
- **Components:** Apps, AppCard, InstallModal
- **Complexity:** InstallModal (317 lines) handles validation and config - appropriate.

#### Step 5: App Running ✅
- **Display:** Status badge, metrics sparklines, action buttons
- **Actions:** Start, stop, restart, logs, connection info, uninstall
- **Complexity:** ServerCard family (~650 lines) handles this well.

### Non-MVP Features Currently Present

| Feature | Location | Lines | MVP Necessity |
|---------|----------|-------|---------------|
| Storage (NFS/CIFS) | Storage.tsx, MountCard.tsx | ~890 | ❌ Can defer |
| Node network animation | NodeNetwork.tsx | 339 | ❌ Decorative |
| Full metrics charts | MetricsChart.tsx | ~300 | ❌ Sparklines sufficient |
| Settings page | Settings.tsx | 29 | ❌ Placeholder |

---

## Part 5: Dependencies Analysis

### Production Dependencies

| Package | Version | Purpose | Essential? | Size Impact |
|---------|---------|---------|------------|-------------|
| `react` | ^19.0.0 | UI framework | ✅ Yes | Core |
| `react-dom` | ^19.0.0 | DOM rendering | ✅ Yes | Core |
| `react-router-dom` | ^7.0.0 | Routing | ✅ Yes | ~20kb |
| `@tanstack/react-query` | ^5.17.9 | Server state | ✅ Yes | ~40kb |
| `zustand` | ^5.0.0 | Client state | ✅ Yes | ~5kb |
| `socket.io-client` | ^4.7.4 | WebSocket | ✅ Yes | ~60kb |
| `lucide-react` | ^0.500.0 | Icons | ✅ Yes | Tree-shaken |
| `zod` | ^3.25.76 | Validation | ✅ Yes | ~15kb |
| `react-hook-form` | ^7.71.1 | Forms | ✅ Yes | ~10kb |
| `@hookform/resolvers` | ^5.2.2 | Zod integration | ✅ Yes | ~3kb |
| `sonner` | ^2.0.7 | Toast notifications | ✅ Yes | ~5kb |
| `recharts` | ^3.7.0 | Charts | ⚠️ Evaluate | ~250kb |
| `qrcode.react` | ^4.2.0 | QR for TOTP | ⚠️ Conditional | ~20kb |

### Dependency Evaluation

**Consider removing/deferring:**
- `recharts` (~250kb) - If sparklines only, could use lightweight alternative or CSS-based solution
- `qrcode.react` (~20kb) - Only needed for TOTP setup, could lazy-load

---

## Part 6: Recommendations

### Immediate (Do Now)

1. **Delete `Settings.tsx` and its route** (29 lines)
   - It's a placeholder that says "settings coming soon"
   - Remove from App.tsx routes and Layout.tsx navigation

2. **Remove NodeNetwork animation** (339 lines)
   - Login page background animation
   - Purely decorative, adds no functionality
   - Location: `components/NodeNetwork.tsx`
   - Update: `pages/Login/index.tsx` to remove usage

### Short-term (This Week)

3. **Simplify MetricsChart to sparklines only**
   - Keep only `Sparkline` component (~160 lines)
   - Remove `MetricsChart`, `SingleMetricChart`, `AggregatedMetricsChart` (~320 lines)
   - This significantly reduces the Recharts bundle impact
   - Or: Replace Recharts sparklines with lightweight SVG-based solution (~50 lines)

4. **Evaluate Storage feature for MVP**
   - Storage management (NFS/CIFS mounts) may not be MVP-essential
   - If deferred:
     - Remove `pages/Storage.tsx` (406 lines)
     - Remove `components/MountCard.tsx` (480 lines)
     - Remove mount-related hooks in `useApi.ts` (~100 lines)
     - Remove from Layout.tsx navigation
     - **Total savings: ~1,000 lines**

5. **Split MyAccount.tsx**
   - Extract `TwoFactorAuth` component to `components/TwoFactorAuth.tsx`
   - Extract `SessionManagement` component to `components/SessionManagement.tsx`
   - Keep MyAccount.tsx as a simple composition (~50 lines)
   - Improves maintainability without losing features

### Deferred (Post-MVP)

6. **Consider lazy-loading TOTP-related code**
   - `qrcode.react` is only needed for TOTP setup
   - Could dynamically import when user enables 2FA

7. **Evaluate Recharts alternatives**
   - For sparklines only, consider:
     - `@nivo/line` (smaller footprint)
     - Custom SVG sparkline (~100 lines)
     - `lightweight-charts` from TradingView

8. **Consider splitting api/client.ts**
   - Types to `api/types.ts`
   - Auth methods to `api/auth.ts`
   - Would improve code organization

---

## Part 7: Dead Code / Safe to Delete

### Confirmed Safe to Delete

| File | Reason |
|------|--------|
| `pages/Settings.tsx` | Placeholder with no functionality |

### Potentially Remove (If Features Deferred)

| Files | Lines | Condition |
|-------|-------|-----------|
| `pages/Storage.tsx` | 406 | If Storage feature deferred |
| `components/MountCard.tsx` | 480 | If Storage feature deferred |
| `components/NodeNetwork.tsx` | 339 | Decorative animation |
| Part of `components/MetricsChart.tsx` | ~320 | If sparklines-only approach |

### No Dead Code Found

The codebase is clean - no unused imports or orphaned components were identified. All components are imported and used appropriately.

---

## Summary

The UI is well-architected with ~13k lines of code. Main simplification opportunities:

| Change | Lines Saved | Bundle Impact |
|--------|-------------|---------------|
| Remove Settings page | 29 | Minimal |
| Remove NodeNetwork | 339 | ~5kb |
| Remove Storage feature | ~1,000 | ~20kb |
| Simplify to sparklines only | ~320 | ~150-200kb |
| **Potential Total** | **~1,700** | **~175-225kb** |

The core MVP flow (Login → Server → App → Running) is solid and doesn't require changes. The above recommendations target non-essential features and optimizations.
