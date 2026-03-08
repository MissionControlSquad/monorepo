"use client";

import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { FolderKanban, Type, FileText, Users } from "lucide-react";
import { useMutation, useQuery, useClient } from "urql";
import { PROFILES_QUERY, PROJECTS_QUERY } from "../../lib/graphql/queries";
import { CREATE_PROJECT } from "../../lib/graphql/mutations";
import { ProjectMemberEditor } from "./ProjectMemberEditor";
import { Button } from "../ui";
import { Input } from "@/components/ui/shadcn/input";
import type { ProfileWithAgent } from "@/lib/types";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  memberProfileIds: z.array(z.string()),
});

type CreateProjectValues = z.infer<typeof createProjectSchema>;

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const client = useClient();
  const [, executeCreateProject] = useMutation(CREATE_PROJECT);
  const [profilesResult] = useQuery({ query: PROFILES_QUERY });
  const profiles = profilesResult.data?.profiles;

  const form = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "", description: "", memberProfileIds: [] },
  });

  // Find the Squad Lead's profile ID by checking agent.role
  const squadLeadProfileId = profiles?.find(
    (p: ProfileWithAgent) => p.agent?.role === "Squad Lead",
  )?.id;

  const handleToggleMember = (profileId: string) => {
    const current = form.getValues("memberProfileIds");
    form.setValue(
      "memberProfileIds",
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  };

  const onSubmit = async (values: CreateProjectValues) => {
    try {
      await executeCreateProject({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        memberProfileIds: values.memberProfileIds,
      });
      await client.query(PROJECTS_QUERY, {}, { requestPolicy: "network-only" }).toPromise();
      toast.success("Project created");
      form.reset();
      onClose();
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleClose = () => {
    if (!form.formState.isSubmitting) {
      form.reset();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md sm:max-w-md p-0 gap-0 rounded-2xl" showCloseButton={false}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
                    <FolderKanban className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-foreground">
                      New Project
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Group tasks and agents by initiative.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 space-y-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-muted-foreground" />
                      Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Website Redesign"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      Description
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Optional project description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Members */}
              {profiles && profiles.length > 0 && (
                <FormField
                  control={form.control}
                  name="memberProfileIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        Members
                      </FormLabel>
                      <FormDescription>Squad Lead is auto-added to every project.</FormDescription>
                      <ProjectMemberEditor
                        profiles={profiles}
                        selectedIds={field.value}
                        onToggle={handleToggleMember}
                        disabledIds={squadLeadProfileId ? [squadLeadProfileId] : []}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted border-t border-border flex items-center justify-end gap-2.5 rounded-b-2xl">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleClose}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
