import type { ButtonHTMLAttributes } from "react";

import { cx } from "@/lib/design/cx";

export type ButtonVariant = "primary" | "ghost" | "quiet";
export type ButtonSize = "md" | "sm";

/**
 * Shared class string, exported so an anchor or a Link can wear the same
 * shape without this component growing an `asChild` and a Slot dependency.
 *
 * Colours, hover, press and disabled live in src/styles/base.css under
 * `.loxe-button`, because states cannot be expressed as inline styles and
 * a control's colours belong in the token layer, not in a component file.
 */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(
    "loxe-button",
    `loxe-button--${variant}`,
    size === "md" ? "loxe-button--md" : "loxe-button--sm",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Button
 * docs/design/design-system.md §7.3, §8.1
 *
 * Not the shadcn default and not a reskin of it: a pill with a rose-gold
 * fill, an --ink-100 label and a 0.985 press. No gradient, no neon outer
 * glow, no coloured box-shadow halo, because in this product glow is
 * atmospheric and has a position. It comes from the celestial body, never
 * from a control.
 *
 * Hover moves nothing. The press is the only transform, at 120ms.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      data-variant={variant}
      className={buttonClassName(variant, size, className)}
    />
  );
}
