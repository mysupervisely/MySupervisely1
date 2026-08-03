import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full max-w-md px-4 sm:max-w-2xl", className)}
      {...props}
    />
  );
}
