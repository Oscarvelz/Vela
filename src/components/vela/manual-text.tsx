/* The manual's rich text: a name written [[like this]] wears the dotted
 * underline. Inside the manual it is a door (a button that jumps to the
 * living control); inside a (?) bubble it is inert — the name reads as a
 * name, and the bubble's own footer is the way into the manual. */
import { Fragment, type ReactNode } from "react";
import { LINKS } from "@/lib/vela/manual";

export function richText(text: string, opts?: { onLink?: (term: string) => void }): ReactNode[] {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  return parts.map((part, i) => {
    const m = /^\[\[([^\]]+)\]\]$/.exec(part);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const term = m[1];
    if (LINKS[term] && opts?.onLink) {
      return (
        <button key={i} type="button" className="name-ref" onClick={() => opts.onLink!(term)}>
          {term}
        </button>
      );
    }
    return (
      <span key={i} className="name-ref">
        {term}
      </span>
    );
  });
}
