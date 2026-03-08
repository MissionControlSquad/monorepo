"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { AGENT_QUERY } from "../lib/graphql/queries";
import { UPDATE_AGENT_PROFILE } from "../lib/graphql/mutations/agents";
import { Breadcrumbs, Button, Card, PageLayout } from "../components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { ProfileAvatar } from "../components/ui/ProfileAvatar";
import { MentionTextArea } from "../components/common/MentionTextArea";
import { useMentionData, useMentionSuggestions } from "../components/context/MentionDataContext";
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

const agentEditSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().min(1, "Role is required"),
  personality: z.string().optional(),
  identityEmoji: z.string().optional(),
  username: z.string().optional(),
});

type AgentEditValues = z.infer<typeof agentEditSchema>;

export function AgentEditPage({ agentId }: { agentId: string }) {
  const router = useRouter();
  const [{ data, fetching }] = useQuery({ query: AGENT_QUERY, variables: { id: agentId } });
  const [{ fetching: saving }, updateProfile] = useMutation(UPDATE_AGENT_PROFILE);

  const mentionSuggestionSources = useMentionSuggestions();
  const { profileById, agentById, taskById, projectById } = useMentionData();
  const mentionMaps = useMemo(
    () => ({ profileById, agentById, taskById, projectById }),
    [profileById, agentById, taskById, projectById],
  );

  const agent = data?.agent;

  const form = useForm<AgentEditValues>({
    resolver: zodResolver(agentEditSchema),
    defaultValues: { name: "", role: "", personality: "", identityEmoji: "", username: "" },
  });

  useEffect(() => {
    if (agent) {
      form.reset({
        name: agent.name || "",
        role: agent.role || "",
        personality: agent.personality || "",
        identityEmoji: agent.identityEmoji || "",
        username: agent.username || "",
      });
    }
  }, [agent, form]);

  const handleSave = async (values: AgentEditValues) => {
    const result = await updateProfile({
      id: agentId,
      name: values.name,
      role: values.role,
      personality: values.personality,
      identityEmoji: values.identityEmoji,
    });

    if (result.error) {
      toast.error("Failed to update agent profile");
    } else {
      toast.success("Agent profile updated");
      router.push(`/agents?id=${agentId}`);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <AlertCircle className="w-8 h-8" />
        <p className="text-sm font-medium">Agent not found</p>
      </div>
    );
  }

  return (
    <PageLayout maxWidth="narrow">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Agents", href: "/agents" },
          { label: agent.name || "Edit Agent" },
        ]}
      />
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-sm px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <ProfileAvatar agentId={agentId} size="lg" className="ring-2 ring-white/30" />
          <h1 className="text-xl font-bold">Edit Agent</h1>
        </div>
      </div>

      {/* Form */}
      <Card padding="lg" className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="e.g. Nova, Rex, Luna" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground mr-1">@</span>
                      <FormControl>
                        <Input
                          type="text"
                          disabled
                          className="bg-muted text-muted-foreground cursor-not-allowed"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>Username cannot be changed after creation</FormDescription>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Role <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="e.g. Research Specialist" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="identityEmoji"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Emoji</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="🤖" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="personality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instructions / Personality</FormLabel>
                  <MentionTextArea
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    rows={4}
                    placeholder="Agent personality, behavior guidelines, and specific instructions... (@ to mention)"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                    suggestionSources={mentionSuggestionSources}
                    mentionMaps={mentionMaps}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Link
                href={`/agents?id=${agentId}`}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-gray-800 transition"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={saving} loading={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </PageLayout>
  );
}
