import * as React from "react"

import { cn } from "@/lib/utils"
import {
  isNumericZeroValue,
  stripLeadingZerosFromNumericInput,
} from "@/lib/numericInput"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, ...props }, ref) => {
    const isNumber = type === "number"
    const isControlled = value !== undefined
    const [showEmptyInsteadOfZero, setShowEmptyInsteadOfZero] = React.useState(false)

    React.useEffect(() => {
      if (!isNumber || !isControlled) return
      if (value !== "" && !isNumericZeroValue(value)) {
        setShowEmptyInsteadOfZero(false)
      }
    }, [isNumber, isControlled, value])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!isNumber) {
        onChange?.(event)
        return
      }
      const raw = event.target.value
      if (raw === "") {
        setShowEmptyInsteadOfZero(true)
        onChange?.(event)
        return
      }
      setShowEmptyInsteadOfZero(false)
      const cleaned = stripLeadingZerosFromNumericInput(raw)
      if (cleaned !== raw) {
        event.target.value = cleaned
      }
      onChange?.(event)
    }

    const resolvedValue = (() => {
      if (!isNumber || !isControlled) return value
      if (showEmptyInsteadOfZero && isNumericZeroValue(value)) return ""
      if (typeof value === "string") return stripLeadingZerosFromNumericInput(value)
      return value
    })()

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-input text-foreground px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input dark:text-foreground dark:border-border",
          type === "number" &&
            "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
        ref={ref}
        {...props}
        {...(isControlled ? { value: resolvedValue } : {})}
        onChange={handleChange}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
