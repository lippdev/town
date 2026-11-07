import { useEffect, useState } from "react";
import { useProgress } from "@react-three/drei";

export interface LoadProgress {
  active: boolean;
  loaded: number;
  total: number;
}

const read = (): LoadProgress => {
  const { active, loaded, total } = useProgress.getState();
  return { active, loaded, total };
};

/**
 * Progresso dos arquivos (glTF e texturas) sem rerender no meio de outra renderização.
 *
 * O gerenciador de carregamento do three atualiza o `useProgress` enquanto um componente
 * que chama `useGLTF` ainda está renderizando. Assinar o store direto com o hook faz o React
 * tentar atualizar este componente durante a renderização daquele, e ele avisa. Aqui a
 * assinatura é manual e a atualização espera o próximo quadro.
 */
export function useLoadProgress(): LoadProgress {
  const [progress, setProgress] = useState(read);
  useEffect(() => {
    let frame = 0;
    const unsubscribe = useProgress.subscribe(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = read();
        setProgress((previous) => (previous.active === next.active && previous.loaded === next.loaded && previous.total === next.total ? previous : next));
      });
    });
    return () => {
      unsubscribe();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return progress;
}
