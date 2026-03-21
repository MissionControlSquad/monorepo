interface SidebarEmptyStateProps {
  icon: React.ReactNode;
  message: string;
  action?: React.ReactNode;
}

export function SidebarEmptyState({ icon, message, action }: SidebarEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="[&_svg]:w-8 [&_svg]:h-8 text-muted-foreground/30 mb-2">{icon}</div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
