import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

const HOLD_MS = 1200;
const isHoldKey = (event: KeyboardEvent) => event.key === " " || event.key === "Enter";

/** Aprovar exige segurar: um clique distraído nunca autoriza uma ação. Vale para mouse, toque e teclado. */
export function HoldToApprove({ onApprove }: { onApprove: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);
  const start = () => {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onApprove();
    }, HOLD_MS);
  };
  useEffect(() => cancel, [cancel]);

  return (
    <button
      type="button"
      className="conv-hold"
      data-holding={holding}
      data-approve-hold
      aria-label="Segure para aprovar"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (!isHoldKey(event)) return;
        event.preventDefault();
        cancel();
      }}
    >
      <span className="conv-hold-fill" aria-hidden />
      <span className="conv-hold-label"><Check size={14} aria-hidden /> Segure para aprovar</span>
    </button>
  );
}
