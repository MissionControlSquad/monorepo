import { Suspense } from "react";
import { CliAuthApprovePage } from "@/views/CliAuthApprovePage";

// useSearchParams requires a Suspense boundary in the app router.
export default function CliAuth() {
  return (
    <Suspense fallback={null}>
      <CliAuthApprovePage />
    </Suspense>
  );
}
