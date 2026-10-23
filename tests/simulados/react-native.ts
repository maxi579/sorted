// Reemplaza a react-native en los tests: de todo el paquete, src/lib solo usa Platform.
// Los tests cambian OS antes de importar el módulo que lo lee ('android', 'ios' o 'web').
export const Platform = { OS: 'android' as string };
