import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

// El "foco" del recorrido guiado: el contexto compartido y <Objetivo>, que marca lo que se puede iluminar.
// Está aparte de Tutorial.tsx para que cualquier componente (por ejemplo el encabezado) lo use sin importar todo el recorrido.

export type Rect = { x: number; y: number; ancho: number; alto: number };

type ContextoTutorial = {
  activo: boolean;
  /** Cambia en cada paso: los objetivos se vuelven a medir */
  version: number;
  objetivoActual: string | null;
  registrar: (id: string, rect: Rect) => void;
  /** Arranca un recorrido (el principal o el de una sección) */
  empezar: (nombre?: string) => void;
};

export const Contexto = createContext<ContextoTutorial>({
  activo: false,
  version: 0,
  objetivoActual: null,
  registrar: () => {},
  empezar: () => {},
});

export const useTutorial = () => useContext(Contexto);

// Envuelve algo que el recorrido puede iluminar. Se mide solo cuando le toca.
export function Objetivo({ id, children, estilo }: { id: string; children: ReactNode; estilo?: ViewStyle }) {
  const { objetivoActual, version, registrar } = useTutorial();
  const vista = useRef<View>(null);
  const esElActual = objetivoActual === id;

  const medir = useCallback(() => {
    vista.current?.measureInWindow((x, y, ancho, alto) => {
      if (ancho > 0 && alto > 0) registrar(id, { x, y, ancho, alto });
    });
  }, [id, registrar]);

  useEffect(() => {
    if (!esElActual) return;
    // Esperamos a que terminen las animaciones de entrada de la pantalla
    const temporizadores = [100, 450, 900].map((ms) => setTimeout(medir, ms));
    return () => temporizadores.forEach(clearTimeout);
  }, [esElActual, version, medir]);

  return (
    <View ref={vista} collapsable={false} style={estilo} onLayout={esElActual ? medir : undefined}>
      {children}
    </View>
  );
}
