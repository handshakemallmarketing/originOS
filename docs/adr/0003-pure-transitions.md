# ADR-0003: Pure transition functions

Status: Accepted.

Decision: Commands are data. Kernel transitions return either a new immutable record version or a structured canonical error. They perform no I/O.

Consequence: Repository, time, ID generation, and external evidence are injected as explicit inputs.

Reversal: Not permitted inside Sprint 0 without C2C impact review.
