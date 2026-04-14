"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/shadcn/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/Spinner";
import { useAppContext } from "@/components/context/AppContext";
import { API_ROUTES } from "@/lib/api-routes";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  useCase: z.string().min(10, "Please describe the use case in more detail").max(3000),
  priority: z.enum(["nice_to_have", "important", "critical"]),
});

type FormValues = z.infer<typeof schema>;

interface FeatureRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeatureRequestModal({ isOpen, onClose }: FeatureRequestModalProps) {
  const { currentUserProfile } = useAppContext();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", useCase: "", priority: "important" },
  });

  function handleClose() {
    form.reset();
    onClose();
  }

  async function onSubmit(values: FormValues) {
    try {
      const res = await fetch(API_ROUTES.support.featureRequest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          url: window.location.href,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userName: currentUserProfile?.displayName ?? "",
          userEmail: currentUserProfile?.user?.email ?? "",
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      toast.success("Feature request sent — thank you!");
      handleClose();
    } catch {
      toast.error("Failed to send request. Please try again.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Request a Feature</DialogTitle>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Share what you&apos;d like to see and why it would help your workflow.
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feature title</FormLabel>
                  <FormControl>
                    <Input placeholder="Short name for the feature" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Use case */}
            <FormField
              control={form.control}
              name="useCase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Problem / use case</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the problem this would solve or how you'd use it..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority to you</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="nice_to_have">Nice to have</SelectItem>
                      <SelectItem value="important">Important</SelectItem>
                      <SelectItem value="critical">Critical — blocking my work</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="-ml-0.5" />}
                Send Request
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
