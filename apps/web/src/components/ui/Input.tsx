"use client";

import { forwardRef } from "react";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  icon?: React.ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, required, icon, error, className, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <Label className="text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
              {icon}
            </div>
          )}
          <ShadcnInput
            ref={ref}
            aria-invalid={!!error}
            className={cn(
              "h-auto rounded-lg px-3.5 py-2.5",
              icon && "pl-10",
              error &&
                "border-destructive/30 focus-visible:ring-destructive/10 focus-visible:border-destructive",
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
