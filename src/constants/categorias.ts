import type { Ionicons } from '@expo/vector-icons';
import type { Categoria } from '../lib/tipos';

type Estilo = { icono: keyof typeof Ionicons.glyphMap; color: string };

export const ESTILO_CATEGORIA: Record<Categoria, Estilo> = {
  'Comida y salidas': { icono: 'fast-food-outline', color: '#F2A35E' },
  Supermercado: { icono: 'cart-outline', color: '#5FD49A' },
  Transporte: { icono: 'car-outline', color: '#7AAEF2' },
  Servicios: { icono: 'flash-outline', color: '#E9C452' },
  Compras: { icono: 'bag-handle-outline', color: '#E890BC' },
  Salud: { icono: 'medkit-outline', color: '#EE8A80' },
  Entretenimiento: { icono: 'game-controller-outline', color: '#AE9EF0' },
  Educación: { icono: 'school-outline', color: '#56CDBD' },
  Otros: { icono: 'ellipsis-horizontal-circle-outline', color: '#A3B1AA' },
};

export function estiloCategoria(categoria: string | null): Estilo {
  return ESTILO_CATEGORIA[(categoria ?? 'Otros') as Categoria] ?? ESTILO_CATEGORIA.Otros;
}
