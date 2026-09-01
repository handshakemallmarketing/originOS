import { OriginApplication, runCocoaProcurementAndProcessing } from "@originos/application";
import { JsonFileCanonicalRepository } from "@originos/repository";

export const cliStatus = "Software Sprint 1 executable Cocoa vertical slice" as const;

export const runCocoaDemo = async (storePath: string) => {
  const application = new OriginApplication(new JsonFileCanonicalRepository(storePath));
  return runCocoaProcurementAndProcessing(application, {
    runId: "cocoa-demo", quantityKg: 1000, originRef: "originos:farm-ghana-1",
    merchantRef: "originos:merchant-1", warehouseRef: "originos:warehouse-1", processorRef: "originos:processor-1"
  });
};
