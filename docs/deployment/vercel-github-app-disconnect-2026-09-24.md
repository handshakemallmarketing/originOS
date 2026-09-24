# Incident note: Vercel GitHub App lost repository access to originOS

Date: 2026-09-24

## What happened

The Vercel GitHub App's **Repository access** (GitHub → Settings → Applications → Vercel) was scoped to "Only select repositories" with just `handshakemallmarketing/WorkersFoodClub` selected. `handshakemallmarketing/originOS` was not in that list — its exact removal/omission date is unknown, but the last confirmed-working deployment was the production build for `main@5d723c8` (PR #11, merged Sep 6).

Effect: Vercel received zero webhook events for this repository. No preview deployments for any PR opened after that point (confirmed absent on PR #13 and on the `originos/release-conformance-completion` branch), and no automatic production deployment on merges to `main` (confirmed: PR #13's merge commit `91c0578` did not deploy). The `origin-os` Vercel project itself, its domains, and its deployment history remained intact throughout — this was purely a lost webhook/App-access connection, not a lost or deleted project.

## How it was found

An assistant-run investigation into "why didn't the merge auto-deploy" initially misdiagnosed the project itself as missing (a separate tooling mistake — passing an explicit `teamId` to the Vercel API 404s for this project; omitting it resolves correctly, see `evidence/current-release/deployment-certification-correction-b3a08fa.json`). Once that was corrected, `mcp__Vercel__get_git_deployment_context` showed `origin-os` absent from the team's `linkedProjects` (only `workers-food-club` listed) despite the project's own deployment history clearly showing a working Git connection through Sep 6. The project's own **Settings → Git** page in the Vercel dashboard showed an explicit `Error: Project Link...` state confirming a broken connection, which traced back to the GitHub App's repository selection.

## Fix

1. GitHub → Settings → Applications → Vercel → Repository access → added `handshakemallmarketing/originOS` to the selected-repositories list, saved.
2. Vercel project → Settings → Git → **Reconnect**.

Confirmed after the fix: the Git settings page shows `handshakemallmarketing/originOS` connected with no error. This is expected to restore automatic preview deployments on future PRs and automatic production deployments on future pushes to `main` without further action.

## What this does not explain

A separate, still-open finding: the Vercel API token/integration behind the assistant's Vercel MCP session received `403 Forbidden — "You don't have permission to create a Production/Preview Deployment for this project"` when attempting to manually trigger a deployment for `origin-os`, both before and after this fix. This is independent of the Git App access issue above (read access to the project always worked; only deployment-creation was blocked) and was not resolved by the Git reconnect. If MCP/API-driven manual deploys to this project are wanted in the future, this permission gap needs separate investigation (likely a project-level Access Group or deployment-source restriction scoped to that integration).

This commit itself exists to give a legitimate, already-Git-connected push something to deploy, since deployments that happened while access was broken (`91c0578`) are not retroactively replayed by fixing the connection — only new pushes trigger a new build.
