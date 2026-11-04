import { SCENARIOS, type DemoScenario } from "@/world/office/officeMeeting";
import { useEffect, useState } from "react";
import { useVisitStore } from "@/world/office/officeVisit";
import { useOfficeStore } from "@/world/office/officeStore";

/** Laboratório da primeira coreografia. Não cria sessões nem mensagens. */
export function VisitControls() {
  const [scenario, setScenario] = useState<DemoScenario>("visit");
  const active = useVisitStore((s) => s.active);
  const paused = useVisitStore((s) => s.paused);
  const label = useVisitStore((s) => s.label);
  const speed = useVisitStore((s) => s.speed);
  const ready = useOfficeStore((s) => s.load === "ready" && !s.figuresError && s.bots.length > 0);
  useEffect(() => () => useVisitStore.getState().reset(), []);
  const start = () => {
    useOfficeStore.getState().backToFloor();
    useVisitStore.getState().start(scenario);
  };
  return (
    <section className="office-visit" aria-label="Simulações do escritório">
      <div><strong>Simulações do escritório</strong>
        <label className="office-scenario">Cena <select value={scenario} disabled={active} onChange={(event) => {
          const next = event.target.value as DemoScenario;
          setScenario(next);
          useVisitStore.setState({ scenario: next, time: 0, label: SCENARIOS[next].title });
        }}>
          {Object.entries(SCENARIOS).map(([id, option]) => <option key={id} value={id}>{option.title}</option>)}
        </select></label>
        <p>{SCENARIOS[scenario].detail}</p><span role="status">{label}</span></div>
      <div className="office-visit-actions">
        <button className="office-button primary" disabled={!ready || active} onClick={start}>Iniciar simulação</button>
        <button className="office-button" disabled={!active} onClick={() => useVisitStore.getState().togglePause()}>{paused ? "Continuar" : "Pausar"}</button>
        <button className="office-button" disabled={!ready} onClick={start}>Reiniciar</button>
        <button className="office-button" disabled={!active} onClick={() => useVisitStore.getState().reset()}>Encerrar ensaio</button>
        <label>Ritmo <select value={speed} onChange={(event) => useVisitStore.getState().setSpeed(Number(event.target.value))}>
          <option value={0.5}>0,5×</option><option value={1}>1×</option><option value={1.5}>1,5×</option><option value={2}>2×</option>
        </select></label>
      </div>
      <small>Ensaio visual · nenhuma mensagem é enviada</small>
    </section>
  );
}
