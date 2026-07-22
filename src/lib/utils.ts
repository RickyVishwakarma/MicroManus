/** Minimal, dependency-free class-name joiner (clsx-lite). */
export function cn(
  ...inputs: (string | false | null | undefined)[]
): string {
  return inputs.filter(Boolean).join(" ");
}
