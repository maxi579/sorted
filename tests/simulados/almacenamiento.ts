// Reemplaza a @react-native-async-storage/async-storage en los tests: guarda todo en memoria.
// Los tests importan este mismo archivo para dejar datos preparados o provocar errores.

export const guardado = new Map<string, string>();
export const fallas = { leer: false, guardar: false };

export function reiniciarAlmacenamiento() {
  guardado.clear();
  fallas.leer = false;
  fallas.guardar = false;
}

const AsyncStorage = {
  async getItem(clave: string) {
    if (fallas.leer) throw new Error('No se pudo leer');
    return guardado.get(clave) ?? null;
  },
  async setItem(clave: string, valor: string) {
    if (fallas.guardar) throw new Error('No se pudo guardar');
    guardado.set(clave, valor);
  },
  async multiSet(pares: [string, string][]) {
    if (fallas.guardar) throw new Error('No se pudo guardar');
    for (const [clave, valor] of pares) guardado.set(clave, valor);
  },
};

export default AsyncStorage;
