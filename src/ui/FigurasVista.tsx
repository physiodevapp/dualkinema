import { useId } from "react";
import type { OrientacionVista } from "../core/geometria/canonico";

/*
 * Las figuras del selector «cómo se ve a la persona» (fase 5): una persona de pie en ropa de deporte, dibujada con
 * contornos de verdad y no con trazos. Cuerpo entero a unas ocho cabezas de alto, en un lienzo de 100 × 196: la línea de
 * gravedad cae en x = 50 (oreja, hombro, cadera, rodilla y tobillo) y el suelo en y = 190,6. La piel es el color del texto;
 * la ropa y el pelo, el mismo color mezclado con el fondo del panel (opaco, para que las dos mitades de las figuras
 * simétricas no dejen una costura). De perfil, la pierna que ve la cámara lleva los tres gomets en ámbar: es la que se mide.
 */

const ROPA = "color-mix(in srgb, currentColor 58%, var(--color-panel))";
const PANTALON = "color-mix(in srgb, currentColor 36%, var(--color-panel))";
const PELO = "color-mix(in srgb, currentColor 26%, var(--color-panel))";
const LEJOS = "color-mix(in srgb, currentColor 58%, var(--color-panel))";

/**
 * Relleno de la ropa y del pelo: el mismo color como trazo fino, para que la prenda sea una pizca mayor que el cuerpo y la piel
 * no asome en el borde (sin él se veía un filo claro en unos tramos del hombro y del cuello y en otros no).
 */
const tinte = (color: string) =>
  ({
    fill: color,
    stroke: color,
    strokeWidth: 0.9,
    strokeLinejoin: "round",
  }) as const;

type Sagital = Extract<OrientacionVista, { plano: "sagital" }>;
type Frontal = Extract<OrientacionVista, { plano: "frontal" }>;

/** Una sombra suave bajo los pies, en lugar de una línea de suelo. */
const Sombra = ({ rx }: { rx: number }) => (
  <ellipse
    cx="50"
    cy="191"
    rx={rx}
    ry="2.2"
    fill="currentColor"
    opacity="0.12"
  />
);

/* ─── De frente y de espaldas: la mitad izquierda se refleja para la derecha ─── */

/** Tronco y pierna (mitad izquierda): cuello, hombro, costado, cadera, muslo, rodilla, gemelo y tobillo. */
const CUERPO_FRENTE =
  "M50.4 24 H44.8 C44.8 28 44.2 31.4 43.8 34 C43.4 36 41.6 37.2 38.4 38.8 C35 40.2 32.6 41.2 31 42.4 C28.4 44.4 27.4 48 28 52.5 L33.4 56 " +
  "C33.6 66 35.4 74 35.6 80 C35.6 86 32.3 90 32.3 98 C32.3 106 33.2 112 33.4 118 C33.2 126 34.6 132 35.4 138 " +
  "C36 144 35.6 148 35.8 152 C36.4 164 37.2 172 37.6 180 L43.8 180 C43.8 172 45.6 162 46.6 152 " +
  "C46.9 146 46.6 142 46.8 138 C47.2 130 47.4 124 47.5 118 C47.6 110 49 104 50.4 99.5 Z";

/** Brazo izquierdo: deltoides, codo, antebrazo y mano. */
const BRAZO_FRENTE =
  "M27.4 44.6 C24.8 46.6 23.8 51 24 56 C24.2 62 23.6 68 23.4 74 C23.4 80 22.4 88 21.4 96 L21 102 " +
  "C20.4 106 19.6 112 20.6 118 C21.6 122.4 25 122.4 25.8 118 C26.6 112 27 106 27 102 C27.2 96 28.4 86 29.4 78 " +
  "C30.2 72 31.2 66 31.8 58 C32 54 31.4 50 29.6 46.5 Z";

const PIE_FRENTE =
  "M37.4 179 L43.9 179 C44.4 183 44.8 185.6 45.2 187 C45.8 189.6 44 190.6 41 190.6 L36.6 190.6 C34 190.4 33.6 188.2 34.8 186 C36 184 37 182 37.4 179 Z";
const PIE_ESPALDA =
  "M37.8 179 L43.6 179 C44 183 44.4 185.4 44.2 187.6 C44 189.8 42.6 190.8 40.8 190.8 L36.6 190.8 " +
  "C34.4 190.6 33.6 189.2 34 187.6 C34.4 186 36.2 185.6 36.8 184.2 C37.4 182.8 37.6 181 37.8 179 Z";

const SHORT_FRENTE =
  "M35.8 85.5 C34 91 32.1 95 32.1 99 C32.3 108 33 117 33 125 L48.2 125 C48.2 117 48.8 108 50.4 100.5 L50.4 85.5 Z";

/** Camiseta (mitad izquierda): manga corta sobre el brazo; el escote es más bajo de frente que de espaldas. */
const camiseta = (escote: number) =>
  `M43.8 36 C42 37.6 40 38.2 38.4 38.8 C35 40.2 32.6 41.2 31 42.4 C27.2 44.4 24.2 48.2 23.5 53.8 L23.2 57.8 L32.4 59.8 L33.8 62 ` +
  `C34 70 35.7 76 35.9 82 L35.8 88 L50.4 88 L50.4 ${escote} C47.6 ${escote} 45.2 40.6 43.8 36 Z`;

function MitadFrente({ delante }: { delante: boolean }) {
  return (
    <g>
      <path d={delante ? PIE_FRENTE : PIE_ESPALDA} fill="currentColor" />
      <path d={CUERPO_FRENTE} fill="currentColor" />
      <path d={BRAZO_FRENTE} fill="currentColor" />
      <path d={camiseta(delante ? 44.6 : 40.4)} style={tinte(ROPA)} />
      <path d={SHORT_FRENTE} style={tinte(PANTALON)} />
      {!delante && (
        // La espalda: la columna y el borde del omóplato, apenas marcados.
        <g
          fill="none"
          stroke="var(--color-panel)"
          strokeWidth="0.7"
          strokeLinecap="round"
          opacity="0.35"
        >
          <path d="M50.4 44 L50.4 84" />
          <path d="M42.4 48 C44 52 44.4 56 43.8 60" />
        </g>
      )}
    </g>
  );
}

/** Cráneo ancho, pómulos y mandíbula que se estrecha hasta una barbilla redondeada (no en punta). */
const CABEZA_FRENTE =
  "M50 6 C55.8 6 59 10 58.8 15.6 C58.7 18.8 58.2 21.4 57.2 23.6 C56.4 25.6 55.4 27 53.8 28.4 " +
  "C52.6 29.4 51.4 29.8 50 29.8 C48.6 29.8 47.4 29.4 46.2 28.4 C44.6 27 43.6 25.6 42.8 23.6 " +
  "C41.8 21.4 41.3 18.8 41.2 15.6 C41 10 44.2 6 50 6 Z";

/** Una oreja de frente (la izquierda; la derecha es su reflejo): del color de la piel, con el borde interior apenas marcado. */
function OrejaDeFrente() {
  return (
    <g>
      <path
        d="M41.6 16 C40.3 15.5 39.6 16.6 39.9 18.3 C40.1 20 40.9 21 42 20.8 Z"
        fill="currentColor"
      />
      <path
        d="M40.9 17 C40.5 17.9 40.7 18.9 41.2 19.5"
        fill="none"
        stroke="var(--color-panel)"
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.3"
      />
    </g>
  );
}

function CabezaDeFrente() {
  return (
    <g>
      <OrejaDeFrente />
      <g transform="translate(100 0) scale(-1 1)">
        <OrejaDeFrente />
      </g>
      <path d={CABEZA_FRENTE} fill="currentColor" />
      {/* Pelo corto con el flequillo hacia un lado. */}
      <path
        d="M41.2 15.8 C40.6 9.4 44 5.6 50 5.6 C56 5.6 59.4 9.4 58.8 15.8 C58.4 12.8 57.4 11.2 55.8 10.4 C53.6 12 49 12.2 45.4 11 C43.4 11.8 41.9 13.4 41.2 15.8 Z"
        style={tinte(PELO)}
      />
      {/* Rasgos apenas insinuados: cejas, nariz y boca. */}
      <g
        fill="none"
        stroke="var(--color-panel)"
        strokeLinecap="round"
        opacity="0.28"
      >
        <path
          d="M45.2 15 C46.4 14.4 47.8 14.4 48.8 14.9 M51.2 14.9 C52.2 14.4 53.6 14.4 54.8 15"
          strokeWidth="0.7"
        />
        <path
          d="M50 16.6 C49.8 19.4 49.2 20.8 48.4 21.6 C49.4 22.2 50.6 22.2 51.6 21.6"
          strokeWidth="0.6"
        />
        <path d="M47.8 25 C49.2 25.8 50.8 25.8 52.2 25" strokeWidth="0.7" />
      </g>
    </g>
  );
}

/** De espaldas no hay mandíbula: el pelo cubre el cráneo y se recoge en la nuca, sobre el cuello. */
function CabezaDeEspaldas() {
  return (
    <g>
      <OrejaDeFrente />
      <g transform="translate(100 0) scale(-1 1)">
        <OrejaDeFrente />
      </g>
      <path
        d="M50 5.6 C56 5.6 59.2 9.4 58.8 15.6 C58.6 19.4 57.6 22.4 55.8 24.6 C55 25.6 54.8 26.2 54.8 26.8 C52 25.4 48 25.4 45.2 26.8 C45.2 26.2 45 25.6 44.2 24.6 C42.4 22.4 41.4 19.4 41.2 15.6 C40.8 9.4 44 5.6 50 5.6 Z"
        style={tinte(PELO)}
      />
    </g>
  );
}

/**
 * Persona de frente (la cámara ve la cara) o de espaldas (la cámara ve la nuca). Simétrica: de frente no hace falta decir qué
 * pierna se analiza, sale de la vista de perfil. Se distinguen por el pelo, las orejas, el escote y los pies.
 */
export function Frente({ ve }: { ve: Frontal["ve"] }) {
  const delante = ve === "delante";
  return (
    <svg viewBox="0 0 100 196" className="h-32" aria-hidden="true">
      <Sombra rx={26} />
      <MitadFrente delante={delante} />
      <g transform="translate(100 0) scale(-1 1)">
        <MitadFrente delante={delante} />
      </g>
      {delante ? <CabezaDeFrente /> : <CabezaDeEspaldas />}
    </svg>
  );
}

/* ─── De perfil, mirando a la derecha (a la izquierda se refleja) ─── */

/** Cabeza y cuello de perfil en un solo contorno: frente, nariz, labios, barbilla, garganta, nuca y occipital. */
const CABEZA_PERFIL =
  "M50 6 C57 6 60.5 10 60.4 15.5 C60.4 17.5 61.2 18.5 62.2 19.7 L60.6 21 C60.8 22.6 60.2 24.4 59.4 25.4 " +
  "C59 27.2 57.8 28.4 56.2 29.4 C55.2 30.2 55 31.6 55.2 33.2 C55.4 35.8 55.8 38.4 56.6 41 L44 41 " +
  "C44.8 37 45.8 33 45.6 29.2 C43 27.6 41 22.6 40.6 18 C40 11 43 6 50 6 Z";
const PELO_PERFIL =
  "M40.8 16 C40.4 10 43.6 5.8 50 5.8 C56.8 5.8 60.2 9.8 60.4 14.4 C57 11.4 52 10.6 48.4 12.4 " +
  "C45.8 13.8 44.6 16.4 44.8 20.6 C44.8 24 45.6 26.6 45.6 29.2 C42.8 27.6 40.8 22 40.8 16 Z";
/** Tronco de perfil: la curva de la espalda, el glúteo, el pecho y el vientre. */
const TRONCO_PERFIL =
  "M44.8 37 C41.6 39.6 38.8 46 38.8 56 C38.6 66 40.6 74 41.5 80 C40 86 36.4 90 35.6 98 C35.2 104 36.6 108 38 110 " +
  "L57.6 106 C59 102 60 99 60.6 96 C61.8 88 60.6 80 60 74 C60.6 68 62.4 62 62.2 54 C61.8 45 58 40.4 55.2 38.4 Z";
/** Pierna de perfil, de la cadera al pie: glúteo, isquiotibiales, hueco poplíteo, gemelo, tendón, talón, empeine y dedos. */
const PIERNA_PERFIL =
  "M37 104 C36.4 108 38 110 38.6 112 C40 120 43 130 45 142 C43.6 146 43 150 43.4 154 C44.2 160 46.4 168 47.2 177 " +
  "C46.6 180 45.2 182 44.6 184 C43.6 186.6 43.8 190.3 46.2 190.3 L69.6 190.3 C71.8 190 71.6 187 69.5 186 " +
  "C64 183.6 58 181.4 54.2 179 L54.8 168 C55.8 160 57 152 57.4 146 C57.6 143 57.4 140 57.4 138 " +
  "C59 130 59.2 120 58.6 112 C58.4 108 58 106 57.6 104 L50 98 Z";
const BRAZO_PERFIL =
  "M45.4 43.4 C48.8 42.2 54.8 43 56.6 48 C57.4 54 56.6 62 56 70 C57 76 58.4 84 59.6 92 C60.2 98 60.4 102 60.2 106 " +
  "C61 112 60.6 118 58.6 120 C56 121.6 54 119 54 116 C53.8 110 53.2 104 52.6 98 C52 92 51 84 49.4 78 " +
  "C47.4 72 46.6 66 46.2 58 C45.8 52 45 46 45.4 42 Z";
const CAMISETA_PERFIL =
  "M44.2 34.6 C41 36.6 38 44 38.2 56 C38.5 66 40.6 74 41.4 80 L41.6 88 L61 88 C61 80 60.4 76 60 74 " +
  "C60.6 68 62.6 62 62.4 54 C62 46 59.6 40.4 56.4 37.4 C53 40.6 47.4 39.4 44.2 34.6 Z";
const MANGA_PERFIL =
  "M44.6 41.6 C46.6 40.8 52 40.6 55 41.8 C57.4 43.4 57.8 46.8 57.4 50.4 L57.2 58.4 L45.6 57.4 C45.2 52 44.4 46 44.6 41.6 Z";
const SHORT_PERFIL =
  "M41.5 86 C40 90 36 92 35.2 98 C34.8 104 36.4 110 38.4 114 L40 126 L58.8 127 C59.6 120 59.4 112 58.8 108 " +
  "C60.2 104 61.4 100 61.2 96 L61 86 Z";

/**
 * Persona de perfil que mira hacia `mira` (dibujada mirando a la derecha y reflejada si mira a la izquierda). Sobre la pierna
 * que ve la cámara, los tres gomets del modelo —trocánter, epicóndilo y maléolo— unidos por los dos segmentos que se miden.
 */
export function Perfil({ mira }: { mira: Sagital["mira"] }) {
  const recorte = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 196"
      className="h-32"
      aria-hidden="true"
      style={{ transform: mira === "izquierda" ? "scaleX(-1)" : undefined }}
    >
      <Sombra rx={28} />
      {/* La pierna de detrás, apenas asomando. */}
      <clipPath id={recorte}>
        <rect x="0" y="118" width="100" height="80" />
      </clipPath>
      <path
        d={PIERNA_PERFIL}
        transform="translate(50 100) skewX(2.6) translate(-50 -100)"
        clipPath={`url(#${recorte})`}
        style={{ fill: LEJOS }}
      />
      <path d={TRONCO_PERFIL} fill="currentColor" />
      {/* La cabeza y el cuello van bajo la camiseta: su borde inferior queda tapado por el cuello curvo. */}
      <path d={CABEZA_PERFIL} fill="currentColor" />
      <path d={PIERNA_PERFIL} fill="currentColor" />
      <path d={CAMISETA_PERFIL} style={tinte(ROPA)} />
      <path d={SHORT_PERFIL} style={tinte(PANTALON)} />
      <path d={BRAZO_PERFIL} fill="currentColor" />
      <path d={MANGA_PERFIL} style={tinte(ROPA)} />
      {/* La oreja: pequeña, del color de la piel y con su borde y el hélix apenas marcados. */}
      <path
        d="M48.8 15.8 C46.8 15.6 46.4 19.2 47.8 21.4 C48.6 22.6 50.4 22.2 50.4 20.2 C50.4 18 50 16.2 48.8 15.8 Z"
        fill="currentColor"
        stroke="var(--color-panel)"
        strokeWidth="0.5"
        strokeLinejoin="round"
        opacity="1"
        style={{ strokeOpacity: 0.3 }}
      />
      <path
        d="M48.6 17 C47.8 17.4 47.8 19.6 48.8 20.6"
        fill="none"
        stroke="var(--color-panel)"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.28"
      />
      <path d={PELO_PERFIL} style={tinte(PELO)} />
      {/* Los segmentos y los gomets de la pierna que se mide. */}
      <path
        d="M47.5 99 L51 139 L50.2 179.5"
        fill="none"
        className="stroke-acento"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {[
        [47.5, 99],
        [51, 139],
        [50.2, 179.5],
      ].map(([x, y]) => (
        <circle
          key={y}
          cx={x}
          cy={y}
          r="2.5"
          className="fill-acento stroke-panel"
          strokeWidth="0.9"
        />
      ))}
    </svg>
  );
}
