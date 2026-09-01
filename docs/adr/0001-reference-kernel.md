# ADR-0001: TypeScript reference kernel

Status: Accepted for Software Sprint 0.

Decision: Use strict TypeScript on Node LTS for the reference kernel. Domain packages contain no framework or adapter types.

Consequences: Runtime schemas remain necessary. Alternate implementations conform through canonical export and the same fixtures.

Reversal: Reimplement behind canonical interchange; S0-X05 must remain semantically equivalent.
