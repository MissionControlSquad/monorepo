"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
  FormMessage,
} from "@/components/ui/shadcn/form";
import { Input } from "@/components/ui/shadcn/input";
import { Button } from "@/components/ui/shadcn/button";
import { Loader2 } from "lucide-react";

const resetSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetValues = z.infer<typeof resetSchema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/logo.png"
            alt="AgentCenter"
            width={48}
            height={48}
            className="w-12 h-12 rounded-xl mb-5 inline-block"
          />
          <h1 className="text-xl font-semibold text-foreground">Invalid Reset Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This password reset link is invalid or missing a token.
          </p>
          <Button asChild className="mt-6">
            <Link href="/login">Back to Login</Link>
          </Button>
        </div>
      </div>
    );
  }

  async function onSubmit(values: ResetValues) {
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, newPassword: values.newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        form.setError("root", { message: data.error || "Failed to reset password" });
        return;
      }

      toast.success("Password reset successfully!");
      if (data.autoLogin) {
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch {
      form.setError("root", { message: "Something went wrong. Please try again." });
    }
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
          <h1 className="text-xl font-semibold text-foreground">Reset Your Password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter a new password for your account
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-xl border border-border bg-card p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Min. 8 characters" autoFocus {...field} />
                    </FormControl>
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

              {form.formState.errors.root && (
                <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
              )}

              <Button type="submit" disabled={form.formState.isSubmitting} className="w-full mt-2">
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                {form.formState.isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link href="/login" className="hover:text-foreground transition-colors">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
