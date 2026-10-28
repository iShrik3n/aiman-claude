import { useEffect, useRef, useState } from "react";

type Skin = "cyan" | "amber" | "xeno" | "crimson";

const SKINS: { id: Skin; label: string }[] = [
  { id: "cyan", label: "CRYO-CYAN (AIMAN)" },
  { id: "amber", label: "K-JÖFOL AMBER" },
  { id: "xeno", label: "XENO BIO-GREEN" },
  { id: "crimson", label: "CRIMSON POD" },
];

function readSkin(): Skin {
  try {
    const saved = localStorage.getItem("oc_xeno_skin");
    if (saved === "amber" || saved === "xeno" || saved === "crimson") return saved;
  } catch {}
  return "cyan";
}

/** Thin Enlightenment/Y2K skin selector strip inside the bridge deck. */
export function XenoMicrobar() {
  const [skin, setSkin] = useState<Skin>(readSkin);

  useEffect(() => {
    document.documentElement.dataset.xenoSkin = skin;
    try {
      localStorage.setItem("oc_xeno_skin", skin);
    } catch {}
  }, [skin]);

  return (
    <div className="xeno-microbar">
      <div className="xeno-micro-left">
        <span className="xeno-ping" />
        <b>ENLIGHTENMENT DR16 // XENO-SKIN ENGINE v2.99</b>
        <span className="xeno-sep">|</span>
        <span>WM_CLASS: "Aiman_K-Jofol_BioPod"</span>
      </div>
      <div className="xeno-micro-right">
        <span className="xeno-micro-label">HULL CORE SKIN:</span>
        {SKINS.map((item) => (
          <button
            key={item.id}
            className={"xeno-skin-pill" + (skin === item.id ? " active" : "")}
            onClick={() => setSkin(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
        <span className="xeno-sep">|</span>
        <span className="xeno-micro-status">LCD: DARK CRT</span>
        <span className="xeno-micro-status">SFX: ON</span>
      </div>
    </div>
  );
}

export function XenoPodTop() {
  return (
    <div className="xeno-pod-decor xeno-pod-top">
      <span className="xeno-rivet" />
      <span className="xeno-heatsink" />
      <span className="xeno-pod-label">POD-01 // MATRIX</span>
      <span className="xeno-heatsink short" />
      <span className="xeno-rivet" />
    </div>
  );
}

export function XenoPodBottom() {
  return (
    <div className="xeno-pod-decor xeno-pod-bottom">
      <span className="xeno-rivet" />
      <span className="xeno-speaker" />
      <span className="xeno-pod-label">KJ-99X</span>
      <span className="xeno-rivet" />
    </div>
  );
}

export function XenoFooter() {
  return (
    <footer className="xeno-footer">
      <span className="xeno-rivet" />
      <b>HULL INTEGRITY: 100%</b>
      <span className="xeno-footer-sep">//</span>
      <span>LCD DISPLAY MODE: CLASSIC K-JOFOL MONOCHROME DOT-MATRIX</span>
      <span className="xeno-spacer" />
      <span>WINAMP DSP PLUG-IN: <b>XENO-ENHANCER v3.1</b></span>
      <span className="xeno-heatsink short" />
      <span className="xeno-rivet" />
    </footer>
  );
}

/** Small animated Winamp-style spectrum pod next to the brand. */
export function XenoVisualizer() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let phase = 0;
    const heights = new Array(16).fill(4);
    const peaks = new Array(16).fill(6);

    const draw = () => {
      frame = requestAnimationFrame(draw);
      phase += 0.14;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 16; i++) {
        const target = Math.max(
          3,
          Math.min(
            canvas.height - 2,
            (Math.sin(phase + i * 0.55) * 0.5 + 0.5) * (canvas.height - 7) + Math.random() * 7,
          ),
        );
        heights[i] += (target - heights[i]) * 0.34;
        peaks[i] = Math.max(2, heights[i] > peaks[i] ? heights[i] : peaks[i] - 0.3);
        const x = i * 6 + 2;
        ctx.fillStyle = "#79e7ff";
        ctx.fillRect(x, canvas.height - heights[i], 4, heights[i]);
        ctx.fillStyle = "#e8ffff";
        ctx.fillRect(x, canvas.height - peaks[i] - 2, 4, 1.5);
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="xeno-visualizer" title="xeno spectrum / 44kHz">
      <div className="xeno-visualizer-top">
        <span>04:37</span>
        <span>160kbps</span>
      </div>
      <canvas ref={ref} width={96} height={24} />
      <div className="xeno-visualizer-label">SPECTRUM // 44kHz</div>
    </div>
  );
}
