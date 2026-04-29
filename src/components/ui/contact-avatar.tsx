import { cn, avatarColorClass } from "@/lib/utils";
import { initialsFor } from "@/lib/format";

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-base",
} as const;

export function ContactAvatar({
  email,
  displayName,
  size = "md",
  className,
}: {
  email: string;
  displayName: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const colors = avatarColorClass(email);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        colors.bg,
        colors.text,
        className,
      )}
      aria-hidden
    >
      {initialsFor(displayName, email)}
    </div>
  );
}
