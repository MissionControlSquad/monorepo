interface SidebarSkeletonProps {
  count?: number;
  height?: string;
}

export function SidebarSkeleton({ count = 3, height = "h-10" }: SidebarSkeletonProps) {
  return (
    <div className="p-2 space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`bg-muted rounded-lg animate-pulse ${height}`} />
      ))}
    </div>
  );
}
