import { useEffect, useRef, useState } from "react";
import { animationCell, animationNameFor, parseSpriteAtlas, type SpriteAtlas } from "@/world/office/spriteAtlas";
import { advancePixelWalk, fitScale, initialPixelWalk, pixelPose } from "./pixelWalk";
import "./pixelOffice.css";

const SCENE = { width: 640, height: 427 };
const SCENE_URL = "/escritorio/cenario.png";
const ATLAS_URL = "/characters/filipe/pixel/walk.json";
const ATLAS_IMAGE_URL = "/characters/filipe/pixel/walk.png";
const MAX_EXTRA_ZOOM = 3;
const SHADOW_ROWS = [6, 9, 10, 9, 6];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Não consegui carregar ${url}.`));
    image.src = url;
  });
}

interface Art {
  scene: HTMLImageElement;
  figure: HTMLImageElement;
  atlas: SpriteAtlas;
}

function draw(context: CanvasRenderingContext2D, art: Art, walk: ReturnType<typeof initialPixelWalk>) {
  const pose = pixelPose(walk);
  const { atlas, figure } = art;
  const animation = atlas.animations[animationNameFor(pose.walking, pose.facing)];
  const cell = animationCell(animation, { distance: walk.meters, time: walk.time });
  const x = Math.round(pose.x);
  const y = Math.round(pose.y);
  context.drawImage(art.scene, 0, 0);
  context.fillStyle = "rgba(38, 24, 26, 0.32)";
  SHADOW_ROWS.forEach((width, row) => context.fillRect(x - width, y - 2 + row, width * 2, 1));
  const { width, height } = atlas.cell;
  const left = x - Math.floor(width / 2);
  const top = y - atlas.soleRow;
  context.save();
  if (pose.mirrored) {
    context.translate(left * 2 + width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(figure, cell.column * width, cell.row * height, width, height, left, top, width, height);
  context.restore();
}

/** Escritório em pixel art: um canvas 2D ampliado por fator inteiro, sem 3D. */
export function PixelOfficeApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, fit: 1, x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void Promise.all([
      loadImage(SCENE_URL),
      loadImage(ATLAS_IMAGE_URL),
      fetch(ATLAS_URL).then((response) => {
        if (!response.ok) throw new Error(`Não consegui carregar ${ATLAS_URL}.`);
        return response.json();
      }),
    ])
      .then(([scene, figure, raw]) => {
        const context = canvas.current?.getContext("2d");
        if (!alive || !context) return;
        context.imageSmoothingEnabled = false;
        const art = { scene, figure, atlas: parseSpriteAtlas(raw) };
        let walk = initialPixelWalk();
        let last = performance.now();
        let drawn = "";
        const tick = (now: number) => {
          // aba em segundo plano devolve um intervalo enorme: não vale como caminhada
          if (!reduced) walk = advancePixelWalk(walk, Math.min((now - last) / 1000, 0.1));
          last = now;
          const pose = pixelPose(walk);
          const animation = art.atlas.animations[animationNameFor(pose.walking, pose.facing)];
          const cell = animationCell(animation, { distance: walk.meters, time: walk.time });
          // só redesenha quando algo muda: parado, quase não gasta CPU
          const key = `${Math.round(pose.x)},${Math.round(pose.y)},${cell.row},${cell.column},${pose.mirrored}`;
          if (key !== drawn) {
            draw(context, art, walk);
            drawn = key;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const place = () => {
      const ratio = window.devicePixelRatio;
      const fit = fitScale(element.clientWidth * ratio, element.clientHeight * ratio, SCENE.width, SCENE.height);
      setView((current) => clampView({ ...current, fit, scale: Math.max(fit, Math.min(current.scale, fit + MAX_EXTRA_ZOOM)) }, element));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = (change: number) => {
    const element = stage.current;
    if (!element) return;
    setView((current) => {
      const scale = Math.max(current.fit, Math.min(current.scale + change, current.fit + MAX_EXTRA_ZOOM));
      const ratio = scale / current.scale;
      const middleX = element.clientWidth / 2;
      const middleY = element.clientHeight / 2;
      return clampView({ ...current, scale, x: middleX - (middleX - current.x) * ratio, y: middleY - (middleY - current.y) * ratio }, element);
    });
  };

  const drag = useRef<{ x: number; y: number } | null>(null);
  const ratio = window.devicePixelRatio;
  return (
    <div className="pixel-office">
      <header className="pixel-office-bar">
        <strong>Lipp HQ</strong>
        <span>Escritório em pixel art: teste, só com o Filipe</span>
      </header>
      <div
        className="pixel-office-stage"
        ref={stage}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !stage.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          const element = stage.current;
          setView((current) => clampView({ ...current, x: current.x + dx, y: current.y + dy }, element));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <canvas
          ref={canvas}
          width={SCENE.width}
          height={SCENE.height}
          style={{
            width: (SCENE.width * view.scale) / ratio,
            height: (SCENE.height * view.scale) / ratio,
            transform: `translate(${Math.round(view.x * ratio) / ratio}px, ${Math.round(view.y * ratio) / ratio}px)`,
          }}
        />
        {error && <p className="pixel-office-error">{error}</p>}
      </div>
      <div className="pixel-office-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Afastar" disabled={view.scale <= view.fit} onClick={() => zoom(-1)}>−</button>
        <span>{view.scale}×</span>
        <button type="button" aria-label="Aproximar" disabled={view.scale >= view.fit + MAX_EXTRA_ZOOM} onClick={() => zoom(1)}>+</button>
      </div>
    </div>
  );
}

/** Menor que a tela, centraliza; maior, não deixa arrastar para fora do cenário. */
function clampView<T extends { scale: number; x: number; y: number }>(view: T, element: HTMLElement): T {
  const ratio = window.devicePixelRatio;
  const axis = (position: number, scene: number, space: number) => {
    const size = (scene * view.scale) / ratio;
    return size <= space ? (space - size) / 2 : Math.min(0, Math.max(space - size, position));
  };
  return { ...view, x: axis(view.x, SCENE.width, element.clientWidth), y: axis(view.y, SCENE.height, element.clientHeight) };
}
