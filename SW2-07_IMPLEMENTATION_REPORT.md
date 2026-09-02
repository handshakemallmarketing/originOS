# SW2-07 implementation report — delivery and evidence-backed Value

Release: `0.17.0-alpha.1`

## Accepted capability

OriginOS now closes the first merchant/cocoa path from raw material to Value without collapsing distinct meanings. The existing custody command delivers the complete processed lot to a buyer. A subsequent `recordCocoaDeliveryValue` command atomically creates:

- a delivery Outcome linked to the custody-transfer evidence; and
- a Value status linked to the processed lot, buyer, delivery Outcome, Purpose, evidence, and consideration state.

## Integrity controls

- The lot must be processed cocoa with accepted quality.
- A custody transfer must have delivered it to the declared buyer, who must remain current custodian.
- Buyer and original processor custodian must be distinct.
- Purpose fulfillment must be explicit.
- Consideration must be `settled` or `pending`.
- Purpose and evidence must be present in the application envelope.
- Only fulfilled Purpose plus settled consideration yields `realized`; otherwise Value remains `incomplete`.
- A processed lot can have only one Value status in this bounded slice.

## Verification

Focused tests cover pre-delivery rejection, realized Value, pending consideration, duplicate status, exact UI command mapping, and HTTP persistence. Service integration proves the complete operator chain, audit growth, backup/restore, and restart durability. Full-workspace and clean-source check/build runs are release gates.

## Explicit boundary

SW2-07 records a single delivery and consideration state. It does not implement invoices, partial payments, refunds, disputes, split deliveries, or accounting-ledger settlement. Those require separate identities and transition rules rather than additions to this Value record.
