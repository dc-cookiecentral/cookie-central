# Cookie Central

Operational dashboard for Dirty Cookie's white-label retail business (Walmart + Kroger) through Cortina Foods.

**Stack:** React + Vite + Supabase + Vercel  
**Builder:** Caroline Friedrich (BD Venture Studio LLC)  
**Users:** Shahira (CEO), Marc (COO), David (Biz Exec), Paul (Biz Exec), Maria (Ops)

## Quick Start

```bash
# Install dependencies
npm install

# Link Supabase (project is connected to this GitHub repo)
npx supabase link --project-ref YOUR_PROJECT_REF

# Run initial migration
npx supabase db push

# Set up environment
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase dashboard > Settings > API

# Run locally
npm run dev
```

## Supabase + GitHub Integration

This project uses Supabase with GitHub integration. Migrations in `supabase/migrations/` auto-deploy when pushed to main.

```bash
# Create a new migration
npx supabase migration new my_migration_name

# Push migrations to remote
npx supabase db push

# Pull remote schema changes
npx supabase db pull
```

## Project Structure

```
cookie-central/
├── docs/
│   ├── BUILD_PLAN.md                  # Phase 1-3 task breakdown
│   ├── ARCHITECTURE.md                # Data flow + tech stack
│   ├── DATA_MODEL.md                  # Tables, columns, relationships
│   ├── DECISIONS.md                   # Architecture decision records
│   └── PEOPLE.md                      # Org chart + contacts
├── supabase/
│   └── migrations/
│       └── 20260521000000_initial_schema.sql   # Full schema (auto-deploys via GitHub)
├── src/                               # React app (created during build)
├── prototype/
│   └── CookieCentral_Complete.jsx     # Approved UI prototype (build spec)
├── .claude/
│   └── instructions.md                # Claude Code project context
├── .env.example
├── .gitignore
└── README.md
```

## Build Plan

See `docs/BUILD_PLAN.md` for the full phase 1-3 breakdown.

**Phase 1 target:** 8-9 working days  
**Demo deadline:** Thursday May 29, 2026 (Marc + David)

## Key Links

- **GitHub:** Connected to Supabase for auto-migrations on push to main
- **Supabase project:** [fill after `supabase link`]
- **Vercel deployment:** [fill after `vercel deploy`]
- **Prototype:** `prototype/CookieCentral_Complete.jsx`
- **Operational email:** systems@dirtycookie.com
