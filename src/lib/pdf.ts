import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Convertir una página HTML en PDF: en el celular con expo-print, en la web con la impresión del navegador.

/** Si esta versión de la app instalada puede hacer PDFs (las viejas no traen el módulo) */
export const puedeExportar = Platform.OS === 'web' || (requireOptionalNativeModule('ExpoPrint') !== null && requireOptionalNativeModule('ExpoSharing') !== null);

/** Convierte la página en PDF y abre el menú para guardarlo o compartirlo */
export async function descargarPDF(html: string, titulo: string) {
  if (Platform.OS === 'web') return imprimirEnLaWeb(html);
  if (!puedeExportar) throw new Error('Para descargar el PDF necesitás la última versión de la app.');
  /* eslint-disable @typescript-eslint/no-require-imports */
  const Print = require('expo-print') as typeof import('expo-print');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: titulo });
}

// En la web: la página se imprime en un marco invisible y el navegador ofrece "Guardar como PDF"
function imprimirEnLaWeb(html: string) {
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  if (!doc || !marco.contentWindow) throw new Error('No se pudo armar el PDF.');
  doc.open();
  doc.write(html);
  doc.close();
  marco.contentWindow.focus();
  marco.contentWindow.print();
  setTimeout(() => marco.remove(), 60_000);
}
