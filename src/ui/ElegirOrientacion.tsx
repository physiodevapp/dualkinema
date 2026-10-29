import { useState } from "react";
import type { OrientacionVista } from "../core/geometria/canonico";
import type { Fuente } from "../core/pose/catalogo";
import { Frente, Perfil } from "./FigurasVista";

type Sagital = Extract<OrientacionVista, { plano: "sagital" }>;

interface Props {
  /** `fuente`: con qué se analiza (gomets o sin marcadores), en el primer vídeo y en la segunda vista. */
  onElegir: (o: OrientacionVista, fuente: Fuente) => void;
  /** Para la segunda vista: además del perfil, la cámara de frente o de espaldas. */
  conFrontal?: boolean;
}

const FUENTES: readonly { id: Fuente; texto: string; detalle: string }[] = [
  {
    id: "gomets",
    texto: "Con gomets",
    detalle: "Se marcan y se siguen los gomets pegados a la persona.",
  },
  {
    id: "sinMarcadores",
    texto: "Sin marcadores",
    detalle:
      "El móvil detecta el cuerpo en cada frame. Los gomets se pueden añadir después.",
  },
];

export default function ElegirOrientacion({
  onElegir,
  conFrontal = false,
}: Props) {
  // Fase 5: con gomets o sin marcadores. Solo decide por dónde se empieza: lo otro se puede añadir después.
  const [fuente, setFuente] = useState<Fuente>("gomets");
  const opciones: { mira: Sagital["mira"]; texto: string }[] = [
    { mira: "izquierda", texto: "Mira a la izquierda" },
    { mira: "derecha", texto: "Mira a la derecha" },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-borde bg-panel p-4">
      <div>
        <h2 className="font-serif text-2xl">
          {conFrontal
            ? "¿Cómo se ve a la persona en este vídeo?"
            : "¿Hacia dónde mira la persona?"}
        </h2>
        <p className="mt-1 text-texto-2">
          {conFrontal
            ? "En un vídeo de perfil, hacia dónde mira; en uno de frente, si la cámara la ve de frente o de espaldas."
            : "En el vídeo de perfil. Fija el signo de los ángulos (flexión positiva) sea cual sea el lado grabado, y qué pierna se marca: la que ve la cámara (si mira a la derecha, su pierna derecha)."}
        </p>
        {!conFrontal && (
          <p
            className="mt-2 text-sm text-texto-2"
            data-testid="recordatorio-perfil"
          >
            Si vas a usar dos vistas, empieza por el vídeo de perfil: de él sale
            la pierna que se analiza. El de frente se añade después, en la
            pestaña «Vídeo».
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-xs tracking-wider text-texto-2 uppercase">
          Cómo se analiza
        </h3>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Cómo se analiza"
        >
          {FUENTES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fuente === f.id}
              onClick={() => setFuente(f.id)}
              className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-left ${fuente === f.id ? "border-acento text-texto" : "border-borde text-texto-2"}`}
            >
              <span className="font-medium">{f.texto}</span>
              <span className="text-xs text-texto-2">{f.detalle}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {opciones.map(({ mira, texto }) => (
          <button
            key={mira}
            type="button"
            onClick={() => onElegir({ plano: "sagital", mira }, fuente)}
            className="flex flex-col items-center gap-2 rounded-md border border-borde px-3 py-4 text-texto hover:border-acento focus-visible:border-acento"
          >
            <Perfil mira={mira} />
            {texto}
          </button>
        ))}
        {conFrontal &&
          (["delante", "detras"] as const).map((ve) => (
            <button
              key={ve}
              type="button"
              onClick={() => onElegir({ plano: "frontal", ve }, fuente)}
              className="flex flex-col items-center gap-2 rounded-md border border-borde px-3 py-4 text-texto hover:border-acento focus-visible:border-acento"
            >
              <Frente ve={ve} />
              {ve === "delante"
                ? "La cámara la ve de frente"
                : "La cámara la ve de espaldas"}
            </button>
          ))}
      </div>
    </section>
  );
}
