/**
 * Shared string formatting utilities.
 * Canonical source — import from here, not from individual page files.
 */

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
