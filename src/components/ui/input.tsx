import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, autoComplete, ...props }, ref) => {
    // A password-type field in this app is almost always an API key/secret
    // (Razorpay, SMTP, WhatsApp, Gemini…), not a login password — and an
    // unmarked one is exactly what Chrome/1Password/LastPass overwrite with an
    // unrelated saved credential the moment the browser decides it "looks like"
    // a login form. That's how an admin email address ended up in the Razorpay
    // Key ID field and silently broke every prepaid payment (COMMON_MISTAKES
    // #115). Default new-password (defeats the save-password prompt AND
    // autofill) unless the caller explicitly asks for something else — a real
    // login field should pass autoComplete="current-password" itself.
    const resolvedAutoComplete = autoComplete ?? (type === 'password' ? 'new-password' : undefined);
    return (
      <input
        type={type}
        autoComplete={resolvedAutoComplete}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
