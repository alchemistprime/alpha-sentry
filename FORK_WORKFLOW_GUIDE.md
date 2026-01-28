# Fork-Based Repo Workflow Guide

## What We Set Up

Think of it like this: there are now **two copies** of the code on GitHub.

```
┌─────────────────────────────────────┐
│  UPSTREAM (virattt/dexter)          │
│  The original Dexter project        │
│  You can READ from here             │
│  You can NOT write here             │
└──────────────────┬──────────────────┘
                   │
                   │ "git fetch upstream"
                   │ (download their updates)
                   ▼
┌─────────────────────────────────────┐
│  YOUR LOCAL COMPUTER                │
│  /home/devalpha/Develop/Bindle/     │
│  dexter/                            │
│  This is where you work             │
└──────────────────┬──────────────────┘
                   │
                   │ "git push origin"
                   │ (upload your changes)
                   ▼
┌─────────────────────────────────────┐
│  ORIGIN (alchemistprime/alpha-sentry)│
│  YOUR repo - Alpha Sentry           │
│  You can READ and WRITE here        │
│  Your team uses this                │
└─────────────────────────────────────┘
```

## Daily Workflow

**When you make changes:**
```bash
# 1. Make your code changes locally

# 2. Stage them (tell git what to include)
git add .

# 3. Commit (save a snapshot with a message)
git commit -m "Add new feature"

# 4. Push to YOUR repo
git push origin main
```

**When the original Dexter project updates and you want those updates:**
```bash
# 1. Download their latest code (doesn't change your files yet)
git fetch upstream

# 2. Merge their changes into yours
git merge upstream/main

# 3. If there are conflicts, resolve them, then:
git add .
git commit -m "Merge upstream updates"

# 4. Push the combined code to your repo
git push origin main
```

## Key Commands Cheat Sheet

| Command | What it does |
|---------|--------------|
| `git status` | See what files changed |
| `git add .` | Stage all changes |
| `git commit -m "message"` | Save a snapshot |
| `git push origin main` | Upload to YOUR repo |
| `git fetch upstream` | Download original Dexter updates |
| `git merge upstream/main` | Combine their updates with yours |
| `git log --oneline -5` | See last 5 commits |

## Why This Matters

- **You own Alpha Sentry** - you can change anything
- **You stay connected to Dexter** - when they fix bugs or add features, you can pull those in
- **Your customizations are safe** - they live in your repo, separate from theirs
