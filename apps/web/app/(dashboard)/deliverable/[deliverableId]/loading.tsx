export default function DeliverableLoading() {
  return (
    <div className="relative z-[60]">
      {/* Backdrop — matches DeliverableFullView Dialog */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-0 lg:overflow-y-auto">
        <div className="h-full lg:h-auto lg:flex lg:min-h-full lg:items-center lg:justify-center lg:p-4">
          <div className="w-full h-full lg:h-auto lg:max-w-4xl overflow-hidden lg:rounded-2xl bg-background shadow-2xl">
            <div className="flex flex-col h-full lg:h-[85vh]">
              {/* Header */}
              <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-border animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {/* Badge row */}
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-16 bg-muted rounded-full" />
                    </div>
                    {/* Title */}
                    <div className="h-6 bg-muted rounded w-2/3" />
                    {/* Agent + timestamp row */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="w-5 h-5 bg-muted rounded-full" />
                      <div className="h-3 bg-muted rounded w-20" />
                      <div className="h-3 bg-muted rounded w-16" />
                    </div>
                  </div>
                  {/* Close button */}
                  <div className="h-8 w-8 bg-muted rounded-lg shrink-0" />
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 sm:px-6 py-4 sm:py-5 animate-pulse space-y-3">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-32 bg-muted rounded-lg w-full mt-2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
