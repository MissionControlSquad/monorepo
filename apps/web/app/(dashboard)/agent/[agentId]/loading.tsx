export default function AgentLoading() {
  return (
    <div className="flex-1 p-6 animate-pulse">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-muted rounded-full" />
          <div className="space-y-2">
            <div className="h-6 bg-muted rounded w-48" />
            <div className="h-4 bg-muted rounded w-32" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
