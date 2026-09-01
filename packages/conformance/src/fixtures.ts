export type FixtureId = `S0-${"M" | "C" | "X"}0${1 | 2 | 3 | 4 | 5}`;
export interface ConformanceFixture {
  readonly id: FixtureId;
  readonly title: string;
  readonly c2cRefs: readonly string[];
  readonly given: Readonly<Record<string, unknown>>;
  readonly when: Readonly<{ commandType: string; payload: Readonly<Record<string, unknown>> }>;
  readonly then: readonly Readonly<Record<string, unknown>>[];
  readonly mustNot: readonly string[];
}

export const sprint0Fixtures: readonly ConformanceFixture[] = [
  { id:"S0-M01", title:"Comparison without Choice", c2cRefs:["C2C-INV-006"], given:{candidates:["supplier-a","supplier-b"]}, when:{commandType:"compareCandidates",payload:{dominant:"supplier-a"}}, then:[{recordType:"comparison-result",status:"known"}], mustNot:["choice","selection","decision","commitment"] },
  { id:"S0-M02", title:"Access without Authority", c2cRefs:["C2C-INV-004","C2C-E005"], given:{actor:"employee",systemAccess:true,approvalLimit:1000}, when:{commandType:"recordDecision",payload:{amount:5000}}, then:[{error:"C2C_E005_AUTHORITY_INVALID"}], mustNot:["authorization","commitment"] },
  { id:"S0-M03", title:"Decision without Commitment", c2cRefs:["C2C-INV-007"], given:{merchant:"merchant-1"}, when:{commandType:"recordDecision",payload:{supplier:"supplier-a"}}, then:[{recordType:"decision"}], mustNot:["commitment","purchase-outcome"] },
  { id:"S0-M04", title:"Attempt without Outcome", c2cRefs:["C2C-INV-009"], given:{authorizedAgent:"merchant-1"}, when:{commandType:"attributeAct",payload:{act:"transmit-order",response:"rejected"}}, then:[{recordType:"act"}], mustNot:["purchase-outcome","completed-purchase"] },
  { id:"S0-M05", title:"Delegation boundary", c2cRefs:["C2C-INV-004","C2C-E005"], given:{delegatorLimit:1000,delegate:"buyer-1"}, when:{commandType:"delegateAuthority",payload:{requestedLimit:5000}}, then:[{error:"C2C_E005_AUTHORITY_INVALID"}], mustNot:["authority-above-1000"] },
  { id:"S0-C01", title:"Natural Transformation", c2cRefs:["C2C-INV-009"], given:{cocoaCondition:"sound"}, when:{commandType:"recordOccurrence",payload:{change:"degraded",cause:"natural"}}, then:[{recordType:"transformation"}], mustNot:["agent","act","intent"] },
  { id:"S0-C02", title:"Feasible but inadmissible", c2cRefs:["C2C-INV-005"], given:{shipmentPossible:true,clearance:false}, when:{commandType:"evaluateShipment",payload:{}}, then:[{family:"FEASIBILITY",status:"known",result:"feasible"},{family:"ADMISSIBILITY",result:"prohibited"}], mustNot:["authorization"] },
  { id:"S0-C03", title:"Initiated then interrupted", c2cRefs:["C2C-INV-010"], given:{loadingReady:true}, when:{commandType:"markInterrupted",payload:{cause:"power-failure"}}, then:[{recordType:"initiation"},{recordType:"interruption"}], mustNot:["completion","delivery-outcome"] },
  { id:"S0-C04", title:"Completion versus Outcome", c2cRefs:["C2C-INV-011"], given:{shipmentArrived:true,cocoaDamaged:true}, when:{commandType:"recordOutcome",payload:{}}, then:[{recordType:"completion"},{recordType:"outcome",status:"rejected"},{recordType:"consequence",effect:"damage"}], mustNot:["value-realized"] },
  { id:"S0-C05", title:"Outcome versus Value", c2cRefs:["C2C-INV-012"], given:{conformingDelivery:true,buyerInsolvent:true}, when:{commandType:"recordValueStatus",payload:{}}, then:[{recordType:"outcome",status:"known"},{recordType:"value-status",status:"incomplete"}], mustNot:["value-realized"] },
  { id:"S0-X01", title:"Untyped null", c2cRefs:["C2C-INV-019","C2C-ST-01"], given:{authorityRef:null}, when:{commandType:"authorizeAct",payload:{}}, then:[{error:"C2C_E005_AUTHORITY_INVALID"}], mustNot:["implicit-unauthorized-default","authorization"] },
  { id:"S0-X02", title:"Stale dependency", c2cRefs:["C2C-E007"], given:{resultVersion:1,inventoryVersion:1}, when:{commandType:"amendInventory",payload:{inventoryVersion:2}}, then:[{recordType:"computation-result",status:"stale"}], mustNot:["overwrite-result-v1"] },
  { id:"S0-X03", title:"Enterprise personification", c2cRefs:["C2C-INV-017"], given:{collectiveAttributionRule:false}, when:{commandType:"attributeAct",payload:{agent:"enterprise-1"}}, then:[{error:"C2C_E006_INVARIANT_VIOLATION"}], mustNot:["enterprise-act"] },
  { id:"S0-X04", title:"Seventh computation family", c2cRefs:["C2C-INV-018"], given:{registeredFamilies:6}, when:{commandType:"registerEvaluationFamily",payload:{family:"OPTIMIZATION"}}, then:[{error:"C2C_E012_UNSUPPORTED_EXTENSION"}], mustNot:["canonical-family-OPTIMIZATION"] },
  { id:"S0-X05", title:"Semantic round-trip", c2cRefs:["C2C-INV-020"], given:{bundle:"canonical-sample-v1"}, when:{commandType:"verifySemanticRoundTrip",payload:{}}, then:[{semanticEquivalent:true}], mustNot:["identity-loss","history-loss","status-loss","provenance-loss"] }
] as const;

if (sprint0Fixtures.length !== 15) throw new Error(`Expected 15 fixtures, got ${sprint0Fixtures.length}`);
