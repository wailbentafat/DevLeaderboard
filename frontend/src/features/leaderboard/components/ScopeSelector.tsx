import type { ReactNode } from "react";
import { SCOPES, type Scope } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import { SCOPE_LABELS } from "../constants";

interface ScopeSelectorProps {
    value: Scope;
    onChange: (scope: Scope) => void;
    disabled?: boolean;
}

/**
 * Who the board counts: everyone who contributed, or the Dev department only.
 * A filter on the same table, not a second page.
 */
export const ScopeSelector = ({
    value,
    onChange,
    disabled = false,
}: ScopeSelectorProps): ReactNode => (
    <div
        role="radiogroup"
        aria-label="Contributors"
        className="inline-flex rounded-lg border border-line bg-surface p-1"
    >
        {SCOPES.map((scope) => {
            const isActive = scope === value;
            return (
                <button
                    key={scope}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    disabled={disabled}
                    onClick={() => onChange(scope)}
                    className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        isActive ? "bg-accent-600 text-white" : "text-ink-muted hover:text-ink",
                    )}
                >
                    {SCOPE_LABELS[scope]}
                </button>
            );
        })}
    </div>
);
