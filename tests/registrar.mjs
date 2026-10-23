// Permite correr los tests de src/lib con Node sin herramientas extra:
// Node ya entiende TypeScript, solo le enseñamos a resolver imports sin extensión ('./finanzas' → './finanzas.ts').
// Los módulos nativos de React Native y Expo no se pueden cargar en Node: se reemplazan por versiones en memoria (tests/simulados/).
import { register } from 'node:module';

const simulados = {
  '@react-native-async-storage/async-storage': 'almacenamiento.ts',
  'expo-notifications': 'notificaciones.ts',
  'react-native': 'react-native.ts',
};
const destinos = Object.fromEntries(
  Object.entries(simulados).map(([modulo, archivo]) => [modulo, new URL(`./simulados/${archivo}`, import.meta.url).href])
);

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const destinos = ${JSON.stringify(destinos)};
      export async function resolve(especificador, contexto, siguiente) {
        if (Object.hasOwn(destinos, especificador)) return { url: destinos[especificador], shortCircuit: true };
        try {
          return await siguiente(especificador, contexto);
        } catch (error) {
          if (especificador.startsWith('.')) return siguiente(especificador + '.ts', contexto);
          throw error;
        }
      }
    `)
);
