import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = "md",
  withWordmark = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const iconClass = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  }[size];
  const textClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  }[size];
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", textClass, className)}>
      <Orbit className={cn(iconClass)} strokeWidth={2.25} />
      {withWordmark && <span>Orbit</span>}
    </div>
  );
}
