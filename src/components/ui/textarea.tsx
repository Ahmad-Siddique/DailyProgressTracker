import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea className={cn("db-input min-h-[5.5rem] resize-y", className)} ref={ref} {...props} />
));
Textarea.displayName = "Textarea";