"use client";

import { useMutation } from "urql";
import { CREATE_PIPELINE, ADD_PIPELINE_STAGE } from "@/lib/graphql/mutations";
import { Input, FormField, FormDialog } from "@/components/ui";
import { useResourceForm } from "@/hooks/useCrud";

interface PipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Create a pipeline and seed a default 3-stage flow (Intake → Review → Done). */
export function PipelineDialog({ open, onOpenChange, onSaved }: PipelineDialogProps) {
  const [, createPipeline] = useMutation(CREATE_PIPELINE);
  const [, addStage] = useMutation(ADD_PIPELINE_STAGE);
  const f = useResourceForm({
    open,
    onOpenChange,
    empty: { name: "" },
    submit: async (v) => {
      if (!v.name.trim()) return "Name is required";
      const res = await createPipeline({ name: v.name.trim() });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? res.error.message ?? "Failed to create pipeline";
      const pid = res.data?.createPipeline?.id;
      if (pid) {
        // Seed a sensible default 3-stage flow (Intake → Review → Done).
        await addStage({ pipelineId: pid, name: "Intake", order: 0 });
        await addStage({
          pipelineId: pid,
          name: "Review",
          order: 1,
          isReviewStage: true,
          requireApproval: true,
        });
        await addStage({ pipelineId: pid, name: "Done", order: 2 });
      }
      return null;
    },
    onDone: onSaved,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New pipeline"
      description="Seeds a default 3-stage flow: Intake → Review → Done."
      onSubmit={f.onSubmit}
      submitLabel="Create pipeline"
      busy={f.busy}
      error={f.error}
      submitDisabled={!f.values.name.trim()}
    >
      <FormField label="Name">
        <Input placeholder="e.g. Content review" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} />
      </FormField>
    </FormDialog>
  );
}
