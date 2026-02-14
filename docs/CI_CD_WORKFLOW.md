# Dexter CI/CD Workflow Guide

This guide explains the complete workflow from local development to production deployment on Vercel.

---

## Overview

```
Local Development → Commit → Push → GitHub Actions (CI) → Vercel (CD)
                                            ↓
                                    [Lint, Type Check, Test, Build]
                                            ↓
                              Vercel auto-deploys on success
```

---

## Step 1: Local Development

### Make your changes
```bash
# Ensure you're on the right branch
git checkout main          # or create a feature branch
git checkout -b feature/my-feature

# Make code changes...

# Test locally
bun install                # Install dependencies
bun run dev                # Run CLI locally
cd web && bun run dev      # Run web UI locally (http://localhost:3000)
```

### Verify before committing
```bash
# Type check
bun run typecheck

# Lint web app
cd web && bun run lint

# Run tests
bun test
```

---

## Step 2: Commit Changes

```bash
# Stage your changes
git add <specific-files>   # Preferred: add specific files
# or
git add .                  # Add all changes (be careful with .env files)

# Commit with a descriptive message
git commit -m "feat: add new feature"
```

### Commit Message Convention
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

---

## Step 3: Push to GitHub

```bash
# Push to remote
git push origin main              # Direct to main (if you have access)
# or
git push origin feature/my-feature  # Push feature branch
```

### Creating a Pull Request (recommended workflow)
1. Push your feature branch
2. Go to GitHub → "Pull requests" → "New pull request"
3. Select your branch → Create PR
4. Wait for CI checks to pass
5. Merge when approved

---

## Step 4: GitHub Actions CI (Automatic)

When you push or open a PR, GitHub Actions automatically runs:

### CI Pipeline (`.github/workflows/ci.yml`)

| Job | What it does | Runs on |
|-----|--------------|---------|
| **Lint & Type Check** | ESLint + TypeScript validation | Push to `main`/`develop`, PRs |
| **Tests** | Runs `bun test` | Push to `main`/`develop`, PRs |
| **Build** | Verifies the app builds | After lint & tests pass |

### View CI Status
- Go to your repo → "Actions" tab
- Green checkmark ✓ = passed
- Red X ✗ = failed (click to see logs)

---

## Step 5: Vercel Deployment (Automatic)

Vercel is connected to your GitHub repo and **automatically deploys** when:

| Trigger | Deployment Type | URL |
|---------|-----------------|-----|
| Push to `main` | **Production** | `your-app.vercel.app` |
| Push to other branches | **Preview** | `your-app-git-branch-name.vercel.app` |
| Pull Request | **Preview** | Unique URL per PR |

### Vercel Build Process
1. Detects push to GitHub
2. Pulls code
3. Runs: `bun install && cd web && bun install`
4. Runs: `cd web && bun run build`
5. Deploys to Vercel's edge network

### View Deployment Status
- **GitHub**: Check commit status or PR checks
- **Vercel Dashboard**: [vercel.com/dashboard](https://vercel.com/dashboard)

---

## Environment Variables

### Local Development
Create a `.env` file in the project root (never commit this):
```bash
cp env.example .env
# Edit .env with your actual API keys
```

### Vercel (Production)
Set environment variables in Vercel Dashboard:

1. Go to [vercel.com](https://vercel.com) → Your Project → Settings → Environment Variables
2. Add each variable:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `FINANCIAL_DATASETS_API_KEY` | Yes | Financial data API |
| `LIBSQL_URL` | Optional | Turso LibSQL URL for persistent memory |
| `LIBSQL_AUTH_TOKEN` | Optional | Required with `LIBSQL_URL` |

### Via Vercel CLI
```bash
vercel env add LIBSQL_URL           # Prompts for value
vercel env ls                        # List all env vars
```

---

## Complete Workflow Example

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes
# ... edit files ...

# 3. Test locally
cd web && bun run dev
# Verify changes work

# 4. Commit
git add .
git commit -m "feat: implement my feature"

# 5. Push
git push origin feature/my-feature

# 6. Create PR on GitHub
# - CI runs automatically
# - Vercel creates preview deployment
# - Review the preview URL

# 7. Merge PR
# - Production deployment triggers automatically

# 8. Verify
# - Check Vercel dashboard for deployment status
# - Test production URL
```

---

## Manual Deployment (Backup)

If automatic deployment fails, trigger manually:

### Via GitHub Actions
1. Go to Actions → "Manual Deploy to Vercel"
2. Click "Run workflow"
3. Select branch → Run

### Via Vercel CLI
```bash
# Install Vercel CLI
bun add -g vercel

# Login (first time)
vercel login

# Deploy preview
vercel

# Deploy to production
vercel --prod
```

---

## Troubleshooting

### CI Failed
```bash
# Check the Actions tab on GitHub for error logs
# Common fixes:
bun run typecheck    # Fix type errors
cd web && bun run lint  # Fix lint errors
bun test             # Fix failing tests
```

### Vercel Build Failed
- Check Vercel dashboard → Deployments → Click failed deployment → View logs
- Common issues:
  - Missing environment variables
  - Build command errors
  - Dependency issues

### Preview Not Working
- Ensure branch is pushed to GitHub
- Check Vercel project settings → Git → Connected repository

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `git status` | See changed files |
| `git diff` | See changes |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Commit staged changes |
| `git push origin <branch>` | Push to GitHub |
| `vercel` | Deploy preview |
| `vercel --prod` | Deploy production |
| `vercel env ls` | List env vars |
