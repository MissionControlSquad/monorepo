"use client";

import { Label } from "@/components/ui/shadcn/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, required, icon, children, className }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
