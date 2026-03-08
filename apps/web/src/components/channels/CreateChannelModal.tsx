"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "urql";
import { CREATE_CHANNEL } from "../../lib/graphql/mutations";
import { PROJECTS_QUERY } from "../../lib/graphql/queries";
import { useAppContext, useCurrentProject } from "../context/AppContext";
import { Button } from "../ui";
import { Input } from "@/components/ui/shadcn/input";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { useForm } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Project } from "@/lib/types";

const createChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required"),
  slug: z.string().min(1, "Slug is required"),
  visibility: z.enum(["public", "private"]),
  description: z.string().optional(),
  projectId: z.string().nullable(),
});

type CreateChannelValues = z.infer<typeof createChannelSchema>;

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateChannelModal({ isOpen, onClose, onCreated }: CreateChannelModalProps) {
  const router = useRouter();
  const { currentUserProfile } = useAppContext();
  const [, executeCreate] = useMutation(CREATE_CHANNEL);
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY, pause: !isOpen });
  const projects = projectsResult.data?.projects ?? [];
  const createdByProfileId = currentUserProfile?.id ?? null;
  const { projectId: contextProjectId } = useCurrentProject();

  const form = useForm<CreateChannelValues>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      name: "",
      slug: "",
      visibility: "public",
      description: "",
      projectId: null,
    },
  });

  useEffect(() => {
    if (isOpen) {
      form.setValue("projectId", contextProjectId ?? "");
    }
  }, [isOpen, contextProjectId, form]);

  // Auto-derive slug from name
  const nameValue = form.watch("name");
  useEffect(() => {
    if (!nameValue.trim()) {
      form.setValue("slug", "");
      return;
    }
    form.setValue(
      "slug",
      nameValue
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, ""),
    );
  }, [nameValue, form]);

  const onSubmit = async (values: CreateChannelValues) => {
    if (!createdByProfileId) {
      toast.error("You need to be logged in (or have an agent with a profile) to create channels.");
      return;
    }
    try {
      const result = await executeCreate({
        name: values.name.trim(),
        slug: values.slug.trim(),
        visibility: values.visibility,
        description: values.description?.trim() || undefined,
        createdByProfileId,
        projectId: values.projectId && values.projectId !== "" ? values.projectId : undefined,
      });
      const newChannel = result.data?.createChannel;
      toast.success(`Channel #${values.slug} created`);
      form.reset();
      onClose();
      onCreated?.();
      if (newChannel?.slug) router.push(`/channels/${newChannel.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
    }
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md sm:max-w-md p-0 gap-0" showCloseButton={false}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            Create channel
          </DialogTitle>
          <Button variant="ghost" size="sm" icon={<X />} onClick={handleClose} aria-label="Close" />
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="e.g. General" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL)</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="general" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visibility</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="public">Public — anyone can join</SelectItem>
                        <SelectItem value="private">Private — invite only</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {projects.length > 0 && (
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project (optional)</FormLabel>
                      <Select
                        value={field.value ?? "__none__"}
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No project</SelectItem>
                          {projects.map((p: Project) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              disabled={p.status === "archived" || p.shutdownActive}
                            >
                              {p.name}
                              {p.status === "archived"
                                ? " (Archived)"
                                : p.shutdownActive
                                  ? " (Paused)"
                                  : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="What's this channel for?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!createdByProfileId && (
                <p className="text-sm text-warning">
                  Log in or select an agent that has a profile to create channels.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-muted">
              <Button variant="secondary" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!createdByProfileId}
                loading={form.formState.isSubmitting}
              >
                Create
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
