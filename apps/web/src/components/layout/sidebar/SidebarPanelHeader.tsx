interface SidebarPanelHeaderProps {
  title: string;
  count?: number;
  countLabel?: string;
  action?: React.ReactNode;
}

export function SidebarPanelHeader({ title, count, countLabel, action }: SidebarPanelHeaderProps) {
  return (
    <div className="flex-shrink-0 px-4 pt-4 pb-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      {count != null && countLabel && (
        <p className="text-[11px] text-muted-foreground">
          {count} {countLabel}
          {count !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
