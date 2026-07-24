# Bear House Classic - Codebase Audit

## Overview
Bear House Classic is a Family Operating System (FamilyOS) built with React (Vite) and Supabase. It serves as a centralized hub for household management, including features like chore tracking, quality time planning, pantry inventory, household memory, and more. The application is designed to be multi-tenant, allowing multiple households to use the same deployment with data isolation.

## Architecture
### Frontend
- **Framework**: React 18 with Vite bundler
- **State Management**: Primarily React Context (`AppContext`) combined with localStorage and Supabase for persistence
- **Routing**: React Router DOM v6
- **UI Components**: Radix UI primitives + Tailwind CSS
- **Data Fetching**: TanStack React Query (v5)
- **Form Handling**: React Hook Form with Zod validation
- **Notifications**: Sonner toast system
- **Charts**: Recharts
- **Calendar**: React Day Picker
- **Rich Text**: Marked (for markdown rendering)

### Backend/API
- **Platform**: Vercel Edge Functions
- **Database**: Supabase Postgres
- **Authentication**: Supabase Auth (Google OAuth)
- **API Design**: REST-like endpoints under `/api/` directory
- **Edge Functions**: Used for all API routes to leverage Vercel's global edge network
- **Third-party Integrations**:
  - Stripe (billing/subscriptions)
  - Gemini & Claude (AI vision/chat)
  - Gmail (suggestions/sync)
  - Walmart (receipt scanning)
  - Home Assistant (camera/webhook)
  - SimpleFin (financial data)
  - Weather API

### Data Layer
- **Primary**: Supabase Postgres
- **Key Tables**:
  - `households`: One per family/tenant
  - `household_members`: Users within a household (with roles: superadmin, admin, child, pet)
  - `family_data`: Key-value store for household-scoped data (pantry, tasks, memories, etc.)
  - `household_memory`: Structured memory entries (rules, inventory, procedures) for AI context
- **Access Pattern**: 
  - All Supabase calls go through Edge Functions using service_role key (bypassing RLS for writes)
  - RLS policies restrict reads to authenticated users within their household
  - Browser-side uses anon key for reads only (writes proxied through Edge Functions)

### Authentication Flow
1. User signs in via Google OAuth (handled by Supabase Auth)
2. On successful auth, frontend stores Supabase access token in sessionStorage
3. For API calls, frontend sends Bearer token to Edge Functions
4. Edge Functions verify token via Supabase `/auth/v1/user` endpoint
5. Resolve household_id from `household_members` table using auth_user_id
6. All subsequent database queries are scoped to that household_id

## Dependencies Analysis
### Production Dependencies (Notable)
- `@supabase/supabase-js@^2.49.4`: Official Supabase client (used sparingly, mostly in Edge Functions)
- `@tanstack/react-query@^5.56.2`: Excellent choice for data fetching/caching
- `@radix-ui/*`: Accessible UI primitives (good)
- `lucide-react@^0.462.0`: Consistent icon set
- `zod@^3.23.8`: Runtime validation (used with React Hook Form)
- `stripe@^22.3.2`: Payment processing
- `react-hook-form@^7.53.0`: Performant form management
- `sonner@^1.5.0`: Toast notifications
- `recharts@^2.12.7`: Charting library
- `react-day-picker@^8.10.1`: Date picker
- `date-fns@^3.6.0`: Date utilities
- `clsx@^2.1.1` + `tailwind-merge@^2.5.2`: Class conditional utilities
- `class-variance-authority@^0.7.1`: CVA for component variants
- `embla-carousel-react@^8.3.0`: Touch-friendly carousel
- `highlight.js@^11.9.0`: Syntax highlighting
- `marked@^12.0.1`: Markdown parsing
- `next-themes@^0.3.0`: Theme switching
- `vaul@^0.9.3`: Drawer component
- `uuid@^11.1.0`: ID generation
- `input-otp@^1.2.4`: OTP inputs
- `react-resizable-panels@^2.1.3`: Resizable layouts

### Dev Dependencies
- `vitest@^4.1.10`: Testing framework
- `@vitejs/plugin-react-swc@^3.5.0`: Fast React refresh
- `eslint@^9.9.0`: Linting
- `tailwindcss@^3.4.11`: Styling
- `typescript@^5.5.3`: Type safety

## Security Observations
### Strengths
1. **Row Level Security (RLS)**: Implemented on Supabase tables to enforce tenant isolation at the database level
2. **Token Handling**: 
   - Access tokens never stored in localStorage (only sessionStorage)
   - API keys (Gemini, Claude, etc.) stored in environment variables on Vercel
   - Browser-side code never sees secret keys (proxied through Edge Functions)
3. **Authentication**: Delegated to Supabase Auth (Google OAuth)
4. **Input Validation**: Uses Zod and React Hook Form for client-side validation
5. **CORS**: Likely configured via Vercel (need to verify)

### Potential Issues
1. **Service Role Overuse**: Edge Functions use Supabase service_role key for ALL database operations (including reads). This bypasses RLS and creates a trusted boundary that, if compromised, could expose all household data. 
   - **Recommendation**: Use anon key for read operations where possible, reserving service_role only for writes/admin operations
2. **API Key Rotation**: No visible mechanism for rotating third-party API keys without redeploy
3. **Session Management**: Relies solely on Supabase session handling; no custom refresh token rotation visible
4. **Content Security Policy (CSP)**: Not evident in code - Vercel may provide defaults but should be audited
5. **Dependency Vulnerabilities**: Need to run `npm audit` and check for known vulnerabilities

## Data Layer Analysis
### Strengths
1. **Multi-tenant Design**: Clear separation via `household_id` foreign key
2. **Schema Evolution**: Migration history shows thoughtful evolution (added webhook tokens, billing bypass, etc.)
3. **Key-Value Pattern**: `family_data` table provides flexible storage for feature-specific data
4. **Memory System**: `household_memory` table provides structured context for AI features

### Concerns
1. **family_data Table**: 
   - Currently stores disparate types of data (JSON blobs) in a single table
   - No schema enforcement on the `value` column (JSONB)
   - Query performance may degrade as table grows
   - Consider splitting into domain-specific tables for frequently queried data
2. **Indexing**: Need to verify indexes exist on:
   - `household_members(household_id, auth_user_id)`
   - `family_data(household_id, key)`
   - `household_memory(household_id)` (if added)
3. **Migration Safety**: 
   - Some migrations contain data manipulation (e.g., backfilling household_id)
   - Should ensure migrations are idempotent and tested
4. **Backup Strategy**: Supabase provides built-in backups, but verify retention and restore procedures

## Frontend Analysis
### Strengths
1. **Code Organization**: 
   - Clear separation: `/src/components`, `/src/lib`, `/src/contexts`, `/src/hooks`
   - Feature-based grouping within components (familyos/ sections)
2. **TypeScript**: Strict typing throughout (tsconfig.json shows strict settings)
3. **Reusability**: 
   - Custom hooks (`use-mobile`, `use-toast`)
   - Shared utilities in `/src/lib`
   - Component library built on Radix primitives
4. **Performance**:
   - Vite dev server provides fast HMR
   - React Query handles caching and deduplication
   - Code splitting via dynamic imports (not observed but Vite supports it)
5. **Accessibility**: 
   - Radix UI components are accessible by default
   - Proper use of ARIA attributes observed in some components

### Areas for Improvement
1. **Bundle Size**: 
   - Heavy dependencies: `@tanstack/react-query`, `recharts`, `react-day-picker`, `embla-carousel`
   - Consider code-splitting heavy libraries
   - Analyze with `vite build --mode analyzer`
2. **State Management**:
   - Over-reliance on localStorage for sync (`saveJSON` pushes to cloud but creates potential conflicts)
   - Consider moving fully to Supabase with real-time subscriptions where appropriate
   - Current hybrid approach (localStorage + Supabase) risks inconsistencies
3. **Error Handling**:
   - Limited error boundaries observed
   - API error handling varies by component
4. **Loading States**:
   - Some components show immediate UI without loading indicators
   - React Query provides loading states but not consistently used
5. **Testing Coverage**:
   - Some test files exist (`*.test.ts`) but overall coverage appears low
   - Critical paths (auth, payments, AI features) need more tests

## API Routes (Edge Functions) Analysis
### Strengths
1. **Edge Deployment**: Global low-latency API access
2. **Separation of Concerns**: Each feature has its own file (`chat.ts`, `vision.ts`, `finance.ts`, etc.)
3. **Centralized Helpers**: 
   - `_db.ts`: Supabase utilities with proper error handling
   - `_billingAuth.ts`: Stripe webhook validation
   - `_notify.ts`: Notification abstraction
4. **Caching**: 
   - Some functions use SWR or manual caching (not pervasive)
   - Consider implementing edge caching for read-heavy endpoints

### Issues Found
1. **Inconsistent Error Handling**:
   - Some functions return JSON error objects, others throw
   - Standardized error response format would improve consistency
2. **Repeated Code**:
   - Authorization checks (`resolveHouseholdId`) duplicated in every endpoint
   - Could be abstracted into middleware
3. **Environment Validation**:
   - Some functions check for API keys, others assume they exist
   - Centralized config validation would improve reliability
4. **Rate Limiting**:
   - No visible rate limiting on API endpoints (especially important for AI/webhook endpoints)
   - Vulnerable to abuse or accidental DDOS
5. **Input Validation**:
   - Minimal validation on incoming request bodies beyond basic existence checks
   - Could benefit from Zod schemas for each endpoint
6. **Logging**:
   - Limited structured logging (mostly console.error)
   - Would benefit from proper logging service integration

## Specific Component Findings
### HermesChat.tsx
- Uses `callClaude` helper from `/src/lib/familyos.ts`
- Properly handles streaming? (Not observed - appears to be full response)
- Memory injection: Correctly uses `assembleMemoryPrompt` for household context
- Error handling: Basic try/catch with error display

### CameraViewer.tsx
- References `ha-cameras.ts` API endpoint
- Appears to fetch camera streams from Home Assistant integration
- No apparent error handling for stream failures

### ReceiptScanner.tsx
- Uses on-device vision (`onDeviceVision.ts`) for processing
- Falls back to cloud vision if on-device fails
- Privacy-conscious design (local processing first)

### Pantry Section
- Uses localStorage-first approach with cloud sync via `saveJSON`
- Potential race conditions if multiple tabs open
- No conflict resolution strategy

## DevOps & Deployment
### Build Process
- `vite build` for production
- Vercel handles deployment via Git integration
- Environment variables configured in Vercel dashboard

### Observations
1. **Preview Deployments**: Likely enabled (default Vercel behavior)
2. **Branch Deployments**: Probably set up for preview branches
3. **Production Protection**: 
   - Vercel provides preview URLs, production domain (hotmessexpress.lol)
   - Need to verify branch deployment settings
4. **Monitoring**: 
   - No evident error tracking (Sentry, LogRocket, etc.)
   - Vercel provides basic analytics and error tracking
5. **Database Migrations**:
   - Supabase migrations managed via CLI
   - Need to verify migration execution process in CI/CD
6. **Secrets Management**:
   - API keys stored in Vercel environment variables
   - Supabase keys likely also in Vercel env (should verify not in repo)

## Recommendations

### Immediate (Next Sprint)
1. **Implement API Middleware**: 
   - Create authorization middleware to eliminate duplicated `resolveHouseholdId` calls
   - Add standardized error response format
2. **Add Rate Limiting**:
   - Implement basic rate limiting on API endpoints (especially `/api/chat`, `/api/vision`)
   - Consider Vercel's edge middleware or Upstash rate limiting
3. **Improve Input Validation**:
   - Add Zod validation schemas for all API endpoints
   - Validate both query parameters and request bodies
4. **Run Security Audit**:
   - Execute `npm audit` and fix any high/critical vulnerabilities
   - Consider using Dependabot or similar for ongoing vulnerability monitoring
5. **Add Logging Integration**:
   - Integrate with a logging service (e.g., Vercel Log Drawer, Logtail, etc.)
   - Ensure structured logging for production debugging

### Short-Term (Next Quarter)
1. **Database Optimization**:
   - Analyze query performance with Supabase's built-in stats
   - Consider splitting `family_data` into domain-specific tables
   - Add missing indexes and verify existing ones
2. **State Management Refinement**:
   - Evaluate moving away from localStorage hybrid model
   - Consider Supabase real-time subscriptions for collaborative features
   - Implement conflict resolution strategy for offline-first scenarios
3. **Testing Expansion**:
   - Increase test coverage for critical paths (auth, payments, AI)
   - Add end-to-end tests with Playwright or Cypress
   - Set up CI pipeline that runs tests on PRs
4. **Performance Optimization**:
   - Use `vite build --mode analyzer` to identify bundle bloat
   - Implement code splitting for large libraries (charts, calendars)
   - Optimize image assets and implement lazy loading

### Long-Term
1. **Observability Stack**:
   - Implement distributed tracing (if microservices grow)
   - Add user analytics (privacy-first)
   - Implement feature flagging system
2. **Architecture Evolution**:
   - Evaluate moving to React Server Components or Next.js for better SEO/performance
   - Consider modularizing features into independent packages
   - Investigate offline-first capabilities with IndexedDB + Service Workers
3. **Compliance & Security**:
   - Conduct third-party security audit
   - Implement regular penetration testing
   - Ensure GDPR/CCPA compliance for data handling
   - Add data export/delete features for users

## Conclusion
Bear House Classic represents a solid foundation for a family operating system with thoughtful architecture and modern technology choices. The multi-tenant design using Supabase is well-executed, and the feature set addresses real household management needs.

The primary areas for improvement center around:
1. **Security hardening** (particularly reducing reliance on service_role keys)
2. **Consistency and reliability** (standardized error handling, validation, logging)
3. **Performance optimization** (bundle analysis, code splitting)
4. **Testing and observability** (increasing test coverage, adding production monitoring)

Addressing these items will significantly improve the platform's robustness, scalability, and maintainability while maintaining its rapid development velocity.

---
*Audit conducted: 2026-07-22*
*Version: Based on master branch as of af702f4*
*Note: see PLAN.md for a 2026-07-24 re-verification of these findings against current code — several items below (rate limiting, input validation, family_data indexing, test coverage) had already been partially or fully addressed by the time this update ran.*