import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StudioApp } from "@/character-studio/StudioApp";
import "@/character-studio/studio.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Elemento #root não encontrado.");
}

createRoot(container).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
