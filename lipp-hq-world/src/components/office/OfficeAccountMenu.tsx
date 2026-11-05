import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

const LINKS = [
  { label: "Painel clássico", href: "/" },
  { label: "Sala Engenharia", href: "/?prototipo=engenharia" },
  { label: "Estúdio de personagens", href: "/personagens.html" },
  { label: "Criar pessoa", href: "/avatares.html" },
  { label: "Editar robôs", href: "/avatares.html?aba=robos" },
];

/** Rodapé da sidebar: quem está usando e o caminho para as outras páginas do HQ. */
export function OfficeAccountMenu({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!node.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="office-account" ref={node} data-scene-keys-off>
      {open && (
        <nav className="office-account-menu" aria-label="Outras páginas" data-account-menu>
          {LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
      )}
      <button type="button" className="office-account-button" aria-expanded={open} data-account-button onClick={() => setOpen((value) => !value)}>
        <span className="office-account-initial" aria-hidden>F</span>
        <span className="office-account-text"><strong>Filipe</strong><small>{detail}</small></span>
        <ChevronsUpDown size={15} aria-hidden />
      </button>
    </div>
  );
}
