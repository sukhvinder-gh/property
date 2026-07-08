import { Inngest } from "inngest";

export interface AssessmentRequestedEvent {
  name: "assessment/requested";
  data: {
    assessmentId: string;
    lotId: string;
    address: string;
    targetDwelling?: { description: string; footprintSqm: number };
  };
}

export const inngest = new Inngest({ id: "property-wealth-os" });
