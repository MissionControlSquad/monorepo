"use client";

import { forwardRef } from "react";
import { Button as ShadcnButton, type buttonVariants } from "@/components/ui/shadcn/button";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning" | "link";
type ButtonSize = "sm" | "md" | "lg" | "xs" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
}

const variantMap: Record<ButtonVariant, VariantProps<typeof buttonVariants>["variant"]> = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  danger: "destructive",
  success: "success",
  warning: "warning",
  link: "link",
};

const sizeMap: Record<ButtonSize, VariantProps<typeof buttonVariants>["size"]> = {
  xs: "xs",
  sm: "sm",
  md: "default",
  lg: "lg",
  icon: "icon",
  "icon-xs": "icon-xs",
  "icon-sm": "icon-sm",
  "icon-lg": "icon-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      icon,
      iconRight,
      loading,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <ShadcnButton
        ref={ref}
        variant={variantMap[variant]}
        size={sizeMap[size]}
        disabled={disabled || loading}
        className={cn("rounded-lg", className)}
        {...props}
      >
        {loading ? <Spinner className="-ml-0.5" /> : icon}
        {children}
        {iconRight}
      </ShadcnButton>
    );
  },
);

Button.displayName = "Button";
