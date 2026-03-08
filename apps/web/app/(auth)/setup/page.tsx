"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { Input } from "@/components/ui/shadcn/input";
import { Button } from "@/components/ui";
import { Loader2 } from "lucide-react";

const setupSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SetupValues = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const form = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.setupComplete) {
          router.replace("/login");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function onSubmit(values: SetupValues) {
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.username.trim(), password: values.password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Setup failed");
        return;
      }

      toast.success("Admin account created!");
      router.push("/");
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="AgentCenter"
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl mb-5 inline-block"
          />
          <h1 className="text-xl font-semibold text-foreground">Set up AgentCenter</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create your admin account to start managing your AI agents
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="admin" autoFocus {...field} />
                    </FormControl>
                    <FormDescription>At least 3 characters</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter a strong password" {...field} />
                    </FormControl>
                    <FormDescription>At least 8 characters</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Re-enter your password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full mt-2">
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                {form.formState.isSubmitting ? "Creating account..." : "Create Admin Account"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <a
            href="https://agentcenter.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            agentcenter.cloud
          </a>{" "}
          &middot; One-time setup
        </p>
      </div>
    </div>
  );
}
