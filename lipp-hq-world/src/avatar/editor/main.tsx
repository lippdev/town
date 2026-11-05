import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";

const AvatarApp = lazy(() => import("@/avatar/editor/AvatarApp").then((module) => ({ default: module.AvatarApp })));
const ThumbBooth = lazy(() => import("@/avatar/editor/ThumbBooth").then((module) => ({ default: module.ThumbBooth })));

const container = document.getElementById("root");
if (!container) {
  throw new Error("Elemento #root não encontrado.");
}

const booth = import.meta.env.DEV && new URLSearchParams(window.location.search).has("miniaturas");

createRoot(container).render(
  <StrictMode>
    <Suspense fallback={<p className="cs-boot">Abrindo o editor…</p>}>{booth ? <ThumbBooth /> : <AvatarApp />}</Suspense>
  </StrictMode>,
);
