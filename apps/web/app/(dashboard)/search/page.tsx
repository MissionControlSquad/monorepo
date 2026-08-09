import { Suspense } from "react";
import { SearchPage } from "@/views/SearchPage";

// useSearchParams requires a Suspense boundary in the app router.
export default function Search() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
