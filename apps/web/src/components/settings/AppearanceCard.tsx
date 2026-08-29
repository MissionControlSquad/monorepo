"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/hooks/useTheme";
import { Card } from "@/components/ui";

// Appearance settings — light / dark / system theme (parity #25).
const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="text-sm text-muted-foreground">Choose how AgentCenter looks.</p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-2 rounded-md border p-3 text-sm transition ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        Light and Dark set a fixed theme. System follows your device&apos;s appearance setting and
        switches automatically when it changes.
      </p>
    </Card>
  );
}
