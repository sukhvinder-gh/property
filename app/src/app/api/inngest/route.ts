import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { assessProperty } from "@/lib/inngest/functions/assess";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [assessProperty],
});
