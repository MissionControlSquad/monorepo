import { Suspense } from "react";
import { AgentsPage } from "@/views/AgentsPage";

export default function Agents() {
  return (
    <Suspense>
      <AgentsPage />
    </Suspense>
  );
}
