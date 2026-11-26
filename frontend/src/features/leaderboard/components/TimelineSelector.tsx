import { useId, useState, type ReactNode } from "react";
import { PERIODS, type Period } from "@/shared/api/types";
import { todayKey, validateRange } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/Button";
import { MAX_CUSTOM_DAYS, PERIOD_LABELS } from "../constants";

export interface TimelineSelection {
    period: Period;
    from?: string;
    to?: string;
}

interface TimelineSelectorProps {
    value: Period;
    /** Current (or default) custom range, kept in sync with the URL. */
    from: string;
    to: string;
    onChange: (selection: TimelineSelection) => void;
    disabled?: boolean;
}

const inputClass =
    "h-8 rounded-md border border-line bg-canvas px-2 text-sm text-ink " +
    "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 " +
    "[color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Time-window control: two fixed periods plus a user-selected range.
 * The custom dates are edited locally and only committed on Apply, so typing
 * never fires a request per keystroke.
 */
export const TimelineSelector = ({
    value,
    from,
    to,
    onChange,
    disabled = false,
}: TimelineSelectorProps): ReactNode => {
    const [draftFrom, setDraftFrom] = useState(from);
    const [draftTo, setDraftTo] = useState(to);
    const [error, setError] = useState<string | null>(null);
    const fromId = useId();
    const toId = useId();
    const [lastFrom, setLastFrom] = useState(from);
    const [lastTo, setLastTo] = useState(to);

    // The URL is the source of truth; adjust local drafts when it moves under
    // us instead of syncing through an effect.
    if (from !== lastFrom) {
        setLastFrom(from);
        setDraftFrom(from);
    }
    if (to !== lastTo) {
        setLastTo(to);
        setDraftTo(to);
    }

    const applyCustom = (): void => {
        const result = validateRange(draftFrom, draftTo, MAX_CUSTOM_DAYS);
        if (result.range === null) {
            setError(result.error);
            return;
        }

        setError(null);
        onChange({ period: "custom", ...result.range });
    };

    return (
        <div className="flex flex-col items-start gap-2 sm:items-end">
            <div
                role="radiogroup"
                aria-label="Time period"
                className="inline-flex rounded-lg border border-line bg-surface p-1"
            >
                {PERIODS.map((period) => {
                    const isActive = period === value;
                    return (
                        <button
                            key={period}
                            type="button"
                            role="radio"
                            aria-checked={isActive}
                            disabled={disabled}
                            onClick={() => {
                                if (period !== "custom") {
                                    setError(null);
                                    onChange({ period });
                                    return;
                                }
                                // Keep the range already in the URL (or the default).
                                onChange({ period: "custom", from, to });
                            }}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500",
                                "disabled:cursor-not-allowed disabled:opacity-60",
                                isActive
                                    ? "bg-accent-600 text-white"
                                    : "text-ink-muted hover:text-ink",
                            )}
                        >
                            {PERIOD_LABELS[period]}
                        </button>
                    );
                })}
            </div>

            {value === "custom" && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applyCustom();
                    }}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-2.5"
                    noValidate
                >
                    <label htmlFor={fromId} className="flex flex-col gap-1 text-xs text-ink-faint">
                        From
                        <input
                            id={fromId}
                            type="date"
                            value={draftFrom}
                            max={draftTo.length > 0 ? draftTo : todayKey()}
                            disabled={disabled}
                            onChange={(event) => {
                                setDraftFrom(event.target.value);
                                setError(null);
                            }}
                            className={inputClass}
                        />
                    </label>

                    <label htmlFor={toId} className="flex flex-col gap-1 text-xs text-ink-faint">
                        To
                        <input
                            id={toId}
                            type="date"
                            value={draftTo}
                            min={draftFrom.length > 0 ? draftFrom : undefined}
                            max={todayKey()}
                            disabled={disabled}
                            onChange={(event) => {
                                setDraftTo(event.target.value);
                                setError(null);
                            }}
                            className={inputClass}
                        />
                    </label>

                    <Button type="submit" size="sm" variant="secondary" disabled={disabled}>
                        Apply
                    </Button>

                    {error !== null && (
                        <p role="alert" className="w-full text-xs text-danger">
                            {error}
                        </p>
                    )}
                </form>
            )}
        </div>
    );
};
