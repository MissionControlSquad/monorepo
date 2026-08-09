"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronUp, Paperclip, X } from "lucide-react";
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
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(10, "Please describe the issue in more detail").max(5000),
});

type FormValues = z.infer<typeof schema>;

interface AutoCapturedData {
  url: string;
  browser: string;
  os: string;
  screenRes: string;
  viewport: string;
  timezone: string;
  geo: string;
}

function captureClientData(): AutoCapturedData {
  const ua = navigator.userAgent;

  // Browser detection
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("OPR")) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    browser = `Chrome ${match?.[1] ?? ""}`;
  } else if (ua.includes("Firefox")) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    browser = `Firefox ${match?.[1] ?? ""}`;
  } else if (ua.includes("Safari") && !ua.includes("Chrome")) {
    const match = ua.match(/Version\/([\d.]+)/);
    browser = `Safari ${match?.[1] ?? ""}`;
  } else if (ua.includes("Edg")) {
    const match = ua.match(/Edg\/([\d.]+)/);
    browser = `Edge ${match?.[1] ?? ""}`;
  }

  // OS detection
  let os = "Unknown";
  if (ua.includes("Windows NT 10")) os = "Windows 10/11";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    os = `macOS ${match?.[1]?.replace(/_/g, ".") ?? ""}`;
  } else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return {
    url: window.location.href,
    browser,
    os,
    screenRes: `${window.screen.width}×${window.screen.height}`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    geo: "",
  };
}

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2 MB

export function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const { currentUserProfile } = useAppContext();
  const [autoData, setAutoData] = useState<AutoCapturedData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", severity: "medium", description: "" },
  });

  // Capture client data when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const data = captureClientData();
    setAutoData(data);

    // Non-blocking geo lookup
    fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) })
      .then((r) => r.json())
      .then((json: { city?: string; country_name?: string }) => {
        const geo = [json.city, json.country_name].filter(Boolean).join(", ");
        setAutoData((prev) => (prev ? { ...prev, geo } : prev));
      })
      .catch(() => {}); // geo is optional — never block the user
  }, [isOpen]);

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("Screenshot must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshotBase64(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function clearScreenshot() {
    setScreenshotBase64(null);
    setScreenshotName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    form.reset();
    setAutoData(null);
    setDetailsOpen(false);
    clearScreenshot();
    onClose();
  }

  async function onSubmit(values: FormValues) {
    try {
      const res = await fetch(API_ROUTES.support.bugReport, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...autoData,
          screenshotBase64,
          userName: currentUserProfile?.displayName ?? "",
          userEmail: currentUserProfile?.user?.email ?? "",
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      toast.success("Bug report sent — thank you!");
      handleClose();
    } catch {
      toast.error("Failed to send report. Please try again.");
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Report a Bug</DialogTitle>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe the issue and we&apos;ll look into it right away.
          </p>
        </DialogHeader>

        <Form {...form}>
          {/* eslint-disable-next-line react-hooks/refs -- react-hook-form's handleSubmit is stable; react-hooks/refs false positive */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief summary of the issue" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Severity */}
            <FormField
              control={form.control}
              name="severity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Severity</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select severity" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low — minor inconvenience</SelectItem>
                      <SelectItem value="medium">Medium — affects workflow</SelectItem>
                      <SelectItem value="high">High — major feature broken</SelectItem>
                      <SelectItem value="critical">Critical — system unusable</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Steps to reproduce, what you expected vs. what happened..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Screenshot */}
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium leading-none">Screenshot (optional)</p>
              {screenshotName ? (
                <div className="flex items-center gap-2 text-sm text-foreground border border-border rounded-md px-3 py-2">
                  <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{screenshotName}</span>
                  <button
                    type="button"
                    onClick={clearScreenshot}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm text-muted-foreground border border-dashed border-border rounded-md px-3 py-2 hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Paperclip className="w-4 h-4" />
                  Attach a screenshot
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScreenshotChange}
              />
            </div>

            {/* Auto-captured technical details (collapsible) */}
            {autoData && (
              <div className="border border-border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  <span>Technical details (auto-captured)</span>
                  {detailsOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                {detailsOpen && (
                  <div className="px-3 pb-3 pt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs border-t border-border">
                    {(
                      [
                        ["URL", autoData.url],
                        ["Browser", autoData.browser],
                        ["OS", autoData.os],
                        ["Screen", autoData.screenRes],
                        ["Viewport", autoData.viewport],
                        ["Timezone", autoData.timezone],
                        ...(autoData.geo ? [["Location", autoData.geo]] : []),
                      ] as [string, string][]
                    ).map(([label, value]) => (
                      <>
                        <span className="text-muted-foreground shrink-0">{label}</span>
                        <span className="text-foreground break-all">{value}</span>
                      </>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="-ml-0.5" />}
                Send Report
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
