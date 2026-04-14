"use client";

import { X, Server } from "lucide-react";
import { API_ROUTES } from "@/lib/api-routes";
import { toast } from "sonner";
import { Button } from "../ui";
import { Input } from "@/components/ui/shadcn/input";
import { useForm } from "react-hook-form";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const createVMSchema = z.object({
  name: z.string().optional(),
  region: z.string().min(1),
  serverType: z.string().min(1),
});

type CreateVMValues = z.infer<typeof createVMSchema>;

interface CreateVMDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateVMDialog({ onClose, onCreated }: CreateVMDialogProps) {
  const form = useForm<CreateVMValues>({
    resolver: zodResolver(createVMSchema),
    defaultValues: { name: "", region: "ash", serverType: "cpx11" },
  });

  const onSubmit = async (values: CreateVMValues) => {
    try {
      const res = await fetch(API_ROUTES.cloudVms.list, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name?.trim() || undefined,
          region: values.region,
          serverType: values.serverType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create VM");
        return;
      }

      toast.success("VM creation started!");
      onCreated();
    } catch {
      toast.error("Failed to create VM");
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-titlebar z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">Create VM</h2>
          </div>
          <Button variant="ghost" size="sm" icon={<X />} onClick={onClose} aria-label="Close" />
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="e.g. prod-vm-1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ash">Ashburn, US</SelectItem>
                        <SelectItem value="hil">Hillsboro, US</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serverType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Server Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cpx11">CPX11 — 2 vCPU, 2 GB (~€4/mo)</SelectItem>
                        <SelectItem value="cpx21">CPX21 — 3 vCPU, 4 GB (~€8/mo)</SelectItem>
                        <SelectItem value="cpx31">CPX31 — 4 vCPU, 8 GB (~€14/mo)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" icon={<Server />} loading={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating..." : "Create VM"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
