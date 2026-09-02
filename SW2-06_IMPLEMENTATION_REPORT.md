# SW2-06 implementation report — processed cocoa material lineage

Release: `0.16.0-alpha.1`

## Accepted capability

The operator can select a completed processing output and create one canonical processed-cocoa material lot. The command accepts only the new lot identity and Completion reference. OriginOS derives all material facts from canonical history:

- exact output mass from Completion;
- parent input lot and Transformation linkage;
- input mass and calculated process loss;
- processor custody continuity; and
- accepted or rejected quality status from the linked Outcome.

## Integrity controls

- The Completion must exist and be completed.
- Its Transformation and parent input lot must resolve consistently.
- The completing processor must still be the current custodian.
- Completed output mass must remain positive and no greater than input mass.
- Only one processed lot may be created for a Completion.
- Operators cannot re-enter or override derived mass, lineage, loss, quality, or custody.

## Verification

Focused tests cover missing Completion, exact lineage and conservation, custody discontinuity, duplicate materialization, UI command mapping, and HTTP persistence. The service integration verifies the complete browser-command chain, audit growth, backup/restore, and restart durability. Full-workspace and clean-source check/build runs are release gates.

## Explicit boundary

SW2-06 creates one output lot from one input lot. Lot splitting, merging, co-products, disposal, and Value realization are not inferred. They remain separate future capabilities with their own conservation and acceptance rules.
