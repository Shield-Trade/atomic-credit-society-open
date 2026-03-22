# Open Source Release Package

This folder is prepared for public/open-source release.

## Included
- Source code (`backend`, `frontend`, `agents`)
- Public docs (`docs` except private server runbook)
- Deployment scripts (`deploy/scripts`)
- Environment templates (`.env.example`, `backend/.env.example`, `frontend/.env.example`)

## Sanitization Applied
- Removed private runtime env files (`.env`, `backend/.env`, `frontend/.env`)
- Removed private server runbook (`docs/server.md`)
- Replaced personal admin emails with `admin@example.com` in release copy
- Excluded local/build artifacts (`node_modules`, `.next`, `backend/dist`, `tsbuildinfo`, deployment runtime state/logs)

## Before Publishing
1. Review `.env.example` values and defaults.
2. Set your own admin bootstrap strategy.
3. Verify no organization-specific information remains.
