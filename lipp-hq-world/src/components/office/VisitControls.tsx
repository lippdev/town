import { useEffect } from "react";
import { useVisitStore } from "@/world/office/officeVisit";
import { useOfficeStore } from "@/world/office/officeStore";

/** Laboratório da primeira coreografia. Não cria sessões nem mensagens. */
export function VisitControls() {
  const active = useVisitStore((s) => s.active);
  const paused = useVisitStore((s) => s.paused);
  const label = useVisitStore((s) => s.label);
  const speed = useVisitStore((s) => s.speed);
  const ready = useOfficeStore((s) => s.load === "ready" && !s.figuresError && s.bots.length > 0);
  useEffect(() => () => useVisitStore.getState().reset(), []);
  const start = () => {
    useOfficeStore.getState().backToFloor();
    useVisitStore.getState().start();
  };
  return (
    <section className="office-visit" aria-label="Ensaio de visita">
      <div><strong>Visita · Pulse → Scout</strong><span role="status">{label}</span></div>
      <div className="office-visit-actions">
        <button className="office-button primary" disabled={!ready || active} onClick={start}>Simular visita</button>
        <button className="office-button" disabled={!active} onClick={() => useVisitStore.getState().togglePause()}>{paused ? "Continuar" : "Pausar"}</button>
        <button className="office-button" disabled={!ready} onClick={start}>Reiniciar</button>
        <label>Ritmo <select value={speed} onChange={(event) => useVisitStore.getState().setSpeed(Number(event.target.value))}>
          <option value={0.5}>0,5×</option><option value={1}>1×</option><option value={1.5}>1,5×</option><option value={2}>2×</option>
        </select></label>
      </div>
      <small>Ensaio visual · nenhuma mensagem é enviada</small>
    </section>
  );
}
