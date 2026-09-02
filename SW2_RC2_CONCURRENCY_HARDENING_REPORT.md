# SW2-RC2 hardening report — serialized command execution

Release: `0.17.0-rc.2`

## Accepted control

The application now owns a FIFO execution gate. Every command completes its repository read, idempotency check, kernel transition, and atomic append before the next queued command reads state. The gate releases in a `finally` block, so validation or persistence failure cannot permanently block later commands.

## Defect prevented

Before this control, two commands with different command identifiers could read the same canonical state concurrently. Both could pass kernel-level semantic uniqueness checks before either append became visible. Atomic append alone did not protect cross-command meaning.

The RC2 acceptance test launches two processed-lot materialization commands for one Completion concurrently. Exactly one command succeeds; the second observes the committed processed lot and is rejected with `C2C_E010_TRANSITION_INVALID`.

## Operational boundary

This control is sufficient for the current single-process service architecture. It deliberately serializes all commands, favoring correctness over throughput during bounded alpha.

It is not a distributed lock. Before running multiple service replicas, OriginOS must move this boundary into PostgreSQL using a transaction-scoped advisory lock, serializable aggregate transaction, or equivalent database-enforced semantic constraint. Multi-instance deployment remains a production blocker.

## Decision

**PASS for single-service bounded alpha. Multi-instance production remains NO-GO.**
