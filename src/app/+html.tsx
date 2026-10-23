import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// HTML base de la versión web. Sirve sobre todo para cuando se agrega a la pantalla de inicio del celular:
// ícono y nombre de la app, pantalla completa, barra de estado integrada y fondo oscuro (sin blanco al deslizar).
// Las rutas son relativas para que funcionen en cualquier carpeta (/sorted/, /sorted/app/...).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es-AR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover: la app ocupa toda la pantalla y respeta el notch con env(safe-area-inset-*) */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Sorted</title>
        <meta name="description" content="Tu plata, en orden: cuotas, fijos, efectivo y un asistente que te avisa lo importante." />
        <meta name="theme-color" content="#101614" />

        {/* Instalada en la pantalla de inicio */}
        <link rel="manifest" href="manifest.webmanifest" />
        <link rel="apple-touch-icon" href="apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Sorted" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: estilos }} />
        <script dangerouslySetInnerHTML={{ __html: altoEnIphone }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Instalada en el iPhone, Safari le da a la página un alto 100% que no cuenta la barra de estado de arriba
// y queda una franja vacía abajo de la barra de pestañas. Usamos el alto real de la pantalla.
const altoEnIphone = `
(function () {
  if (window.navigator.standalone !== true) return;
  function fijar() {
    var vertical = window.innerHeight >= window.innerWidth;
    var pantalla = vertical ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    document.documentElement.style.setProperty('--alto-app', Math.max(pantalla, window.innerHeight) + 'px');
  }
  fijar();
  window.addEventListener('resize', fijar);
  window.addEventListener('orientationchange', fijar);
})();
`;

const estilos = `
html, body { background-color: #101614; color-scheme: dark; }
::selection { background: rgba(95, 212, 154, 0.3); }
html, body, #root { height: var(--alto-app, 100%); }
body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; }
`;
