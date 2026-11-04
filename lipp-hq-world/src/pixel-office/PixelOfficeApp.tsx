import { useEffect, useRef, useState } from "react";
import { animationCell, animationNameFor, parseSpriteAtlas, type SpriteAtlas } from "@/world/office/spriteAtlas";
import { clampView, MAX_ZOOM_OVER_FIT, resizeView, zoomAround, zoomLevel, type OfficeView, type Size } from "./officeView";
import { advancePixelWalk, initialPixelWalk, pixelPose } from "./pixelWalk";
import "./pixelOffice.css";

/** Tamanho lógico do cenário: a rota e a escala do Filipe são medidas nele. */
const SCENE: Size = { width: 1536, height: 1024 };
const SCENE_URL = "/escritorio/cenario-fonte.png";
const ATLAS_URL = "/characters/filipe/walk.json";
const ATLAS_IMAGE_URL = "/characters/filipe/walk.png";
/** Altura do Filipe em pé, em pixels do cenário: a proporção certa com os móveis. */
const FIGURE_HEIGHT = 134.4;
/** Acima disso a imagem não ganha detalhe, só gasta memória e GPU. */
const MAX_PIXEL_RATIO = 2;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_SPEED = 0.0015;
/** Meia largura e meia altura da sombra no piso, em pixels do cenário. */
const SHADOW = { width: 34, height: 12 };

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
  shadow: CanvasGradient;
}

/** Sombra de raio 1, escalada no desenho: forte sob os pés e sumindo sem borda. */
function softShadow(context: CanvasRenderingContext2D): CanvasGradient {
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, "rgba(38, 24, 26, 0.46)");
  gradient.addColorStop(0.55, "rgba(38, 24, 26, 0.26)");
  gradient.addColorStop(1, "rgba(38, 24, 26, 0)");
  return gradient;
}

function draw(context: CanvasRenderingContext2D, art: Art, walk: ReturnType<typeof initialPixelWalk>, view: OfficeView, ratio: number) {
  const pose = pixelPose(walk);
  const { atlas, figure } = art;
  const animation = atlas.animations[animationNameFor(pose.walking, pose.facing)];
  const cell = animationCell(animation, { distance: walk.meters, time: walk.time });
  const { width, height } = atlas.cell;
  const scale = FIGURE_HEIGHT / atlas.visibleRows;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(view.zoom * ratio, 0, 0, view.zoom * ratio, view.x * ratio, view.y * ratio);
  // redimensionar o canvas zera o contexto: a suavização é ligada a cada desenho
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(art.scene, 0, 0, SCENE.width, SCENE.height);
  context.translate(pose.x, pose.y);
  context.save();
  context.scale(SHADOW.width, SHADOW.height);
  context.fillStyle = art.shadow;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
  if (pose.mirrored) context.scale(-1, 1);
  context.drawImage(figure, cell.column * width, cell.row * height, width, height, (-width / 2) * scale, -atlas.soleRow * scale, width * scale, height * scale);
}

/** Escritório em canvas 2D, sem 3D: as artes originais, com suavização e zoom contínuo. */
export function PixelOfficeApp() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // arrastar e dar zoom só mexem nestes dois: o React só redesenha o rótulo do zoom
  const view = useRef<OfficeView | null>(null);
  const space = useRef<Size | null>(null);
  const [level, setLevel] = useState(1);

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
        const element = canvas.current;
        const context = element?.getContext("2d");
        if (!alive || !element || !context) return;
        const art = { scene, figure, atlas: parseSpriteAtlas(raw), shadow: softShadow(context) };
        let walk = initialPixelWalk();
        let last = performance.now();
        let drawn = "";
        const tick = (now: number) => {
          // aba em segundo plano devolve um intervalo enorme: não vale como caminhada
          if (!reduced) walk = advancePixelWalk(walk, Math.min((now - last) / 1000, 0.1));
          last = now;
          frame = requestAnimationFrame(tick);
          if (!view.current || !space.current) return;
          const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
          const width = Math.round(space.current.width * ratio);
          const height = Math.round(space.current.height * ratio);
          if (element.width !== width) element.width = width;
          if (element.height !== height) element.height = height;
          const pose = pixelPose(walk);
          const animation = art.atlas.animations[animationNameFor(pose.walking, pose.facing)];
          const cell = animationCell(animation, { distance: walk.meters, time: walk.time });
          // só redesenha quando algo muda: parado, quase não gasta CPU
          const { zoom, x, y } = view.current;
          const key = `${pose.x},${pose.y},${cell.row},${cell.column},${pose.mirrored},${zoom},${x},${y},${width},${height}`;
          if (key !== drawn) {
            draw(context, art, walk, view.current, width / space.current.width);
            drawn = key;
          }
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
      const next = { width: element.clientWidth, height: element.clientHeight };
      if (next.width === 0 || next.height === 0) return;
      view.current = resizeView(view.current, SCENE, space.current, next);
      space.current = next;
      setLevel(zoomLevel(view.current, SCENE, next));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = (factor: number) => {
    if (!view.current || !space.current) return;
    const middle = { x: space.current.width / 2, y: space.current.height / 2 };
    view.current = zoomAround(view.current, view.current.zoom * factor, middle, SCENE, space.current);
    setLevel(zoomLevel(view.current, SCENE, space.current));
  };

  // o onWheel do React é passivo e não consegue impedir o zoom da própria página
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!view.current || !space.current) return;
      const box = element.getBoundingClientRect();
      const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
      view.current = zoomAround(view.current, view.current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED), anchor, SCENE, space.current);
      setLevel(zoomLevel(view.current, SCENE, space.current));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="pixel-office">
      <header className="pixel-office-bar">
        <strong>Lipp HQ</strong>
        <span>Escritório: teste, só com o Filipe</span>
      </header>
      <div
        className="pixel-office-stage"
        ref={stage}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !view.current || !space.current) return;
          const { zoom: current, x, y } = view.current;
          view.current = clampView({ zoom: current, x: x + event.clientX - drag.current.x, y: y + event.clientY - drag.current.y }, SCENE, space.current);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <canvas ref={canvas} />
        {error && <p className="pixel-office-error">{error}</p>}
      </div>
      <div className="pixel-office-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Afastar" disabled={level <= 1.001} onClick={() => zoom(1 / ZOOM_STEP)}>−</button>
        <span>{Math.round(level * 100)}%</span>
        <button type="button" aria-label="Aproximar" disabled={level >= MAX_ZOOM_OVER_FIT - 0.001} onClick={() => zoom(ZOOM_STEP)}>+</button>
      </div>
    </div>
  );
}
