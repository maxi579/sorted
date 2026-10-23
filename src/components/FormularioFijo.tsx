import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colores } from '../constants/tema';
import type { FilaFijo } from '../lib/datos';
import { pareceSuscripcion } from '../lib/fijos';
import { formatearEntradaMonto, leerMonto, montoATexto } from '../lib/formato';
import { CATEGORIAS, type Categoria, type MedioPago, type TipoFijo } from '../lib/tipos';
import { Boton, Campo, Chip, Etiqueta, Texto as Text } from './ui';

export type ValoresFijo = {
  descripcion: string;
  tipo: TipoFijo;
  montoTexto: string;
  montoVariable: boolean;
  moneda: 'ARS' | 'USD';
  diaTexto: string;
  medioId: string | null;
  debitoAutomatico: boolean;
  categoria: Categoria;
};

export function valoresFijoVacios(): ValoresFijo {
  return {
    descripcion: '',
    tipo: 'servicio',
    montoTexto: '',
    montoVariable: false,
    moneda: 'ARS',
    diaTexto: '10',
    medioId: null,
    debitoAutomatico: false,
    categoria: 'Servicios',
  };
}

export function valoresDesdeFijo(fijo: FilaFijo): ValoresFijo {
  return {
    descripcion: fijo.descripcion,
    tipo: fijo.tipo,
    montoTexto: fijo.monto ? montoATexto(fijo.monto) : '',
    montoVariable: fijo.monto === null,
    moneda: fijo.moneda,
    diaTexto: String(fijo.dia),
    medioId: fijo.tarjeta_id,
    debitoAutomatico: fijo.debito_automatico,
    categoria: (fijo.categoria ?? 'Servicios') as Categoria,
  };
}

// Valida el formulario y arma la fila para guardar
export function prepararFijo(v: ValoresFijo): { error: string } | { fila: FilaFijo } {
  const monto = leerMonto(v.montoTexto);
  const dia = Number(v.diaTexto);
  if (!v.descripcion.trim()) return { error: 'Poné un nombre, por ejemplo "Luz" o "Netflix".' };
  if (!v.montoVariable && !(monto > 0)) return { error: 'Escribí el monto, o marcá que cambia cada mes.' };
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: 'El día tiene que ser un número del 1 al 31.' };
  if (v.debitoAutomatico && v.montoVariable) return { error: 'Para anotarlo solo necesito un monto fijo.' };
  return {
    fila: {
      descripcion: v.descripcion.trim(),
      tipo: v.tipo,
      monto: v.montoVariable ? null : monto,
      moneda: v.moneda,
      dia,
      tarjeta_id: v.medioId,
      debito_automatico: v.debitoAutomatico,
      categoria: v.categoria,
      activo: true,
    },
  };
}

type Props = {
  inicial: ValoresFijo;
  medios: MedioPago[];
  onGuardar: (fila: FilaFijo) => Promise<void>;
  onCancelar: () => void;
};

export default function FormularioFijo({ inicial, medios, onGuardar, onCancelar }: Props) {
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (cambios: Partial<ValoresFijo>) => setV({ ...v, ...cambios });

  async function guardar() {
    const preparado = prepararFijo(v);
    if ('error' in preparado) return setError(preparado.error);
    setError(null);
    setGuardando(true);
    try {
      await onGuardar(preparado.fila);
    } catch (e) {
      setError((e as Error).message);
    }
    setGuardando(false);
  }

  return (
    <View>
      <Campo
        etiqueta="¿Qué es?"
        placeholder="Ej: Luz, Alquiler, Netflix"
        value={v.descripcion}
        onChangeText={(descripcion) => {
          // Si escribe "Netflix", ya lo marcamos como suscripción
          const esSuscripcion = pareceSuscripcion(descripcion);
          cambiar(esSuscripcion && v.tipo === 'servicio' ? { descripcion, tipo: 'suscripcion', categoria: 'Entretenimiento' } : { descripcion });
        }}
      />

      <Etiqueta>Tipo</Etiqueta>
      <View style={styles.chips}>
        <Chip etiqueta="🧾 Servicio o cuenta" activo={v.tipo === 'servicio'} onPress={() => cambiar({ tipo: 'servicio' })} />
        <Chip etiqueta="📺 Suscripción" activo={v.tipo === 'suscripcion'} onPress={() => cambiar({ tipo: 'suscripcion' })} />
      </View>

      <View style={styles.interruptor}>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>El monto cambia cada mes</Text>
          <Text style={styles.ayuda}>Como la luz o el gas: te pido el monto cuando llega la factura.</Text>
        </View>
        <Switch
          value={v.montoVariable}
          onValueChange={(montoVariable) => cambiar({ montoVariable, debitoAutomatico: montoVariable ? false : v.debitoAutomatico })}
          trackColor={{ true: colores.primario, false: colores.borde }}
          thumbColor={colores.texto}
        />
      </View>

      <View style={styles.fila}>
        {!v.montoVariable && (
          <Campo
            etiqueta="¿Cuánto es por mes?"
            contenedor={{ flex: 2 }}
            value={v.montoTexto}
            onChangeText={(t) => cambiar({ montoTexto: formatearEntradaMonto(t) })}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        )}
        <Campo
          etiqueta="Día que vence"
          contenedor={{ flex: 1 }}
          value={v.diaTexto}
          onChangeText={(diaTexto) => cambiar({ diaTexto })}
          keyboardType="number-pad"
          maxLength={2}
        />
      </View>

      <Etiqueta>Moneda</Etiqueta>
      <View style={styles.chips}>
        <Chip etiqueta="Pesos" activo={v.moneda === 'ARS'} onPress={() => cambiar({ moneda: 'ARS' })} />
        <Chip etiqueta="Dólares" activo={v.moneda === 'USD'} onPress={() => cambiar({ moneda: 'USD' })} />
      </View>

      <Etiqueta>¿Con qué lo pagás?</Etiqueta>
      <View style={styles.chips}>
        {medios.map((m) => (
          <Chip key={m.id} etiqueta={m.nombre} activo={v.medioId === m.id} onPress={() => cambiar({ medioId: m.id })} />
        ))}
        <Chip etiqueta="Efectivo / transferencia" activo={v.medioId === null} onPress={() => cambiar({ medioId: null })} />
      </View>

      {!v.montoVariable && (
        <View style={styles.interruptor}>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Se debita solo</Text>
            <Text style={styles.ayuda}>Lo anoto yo el día que vence, no tenés que hacer nada.</Text>
          </View>
          <Switch
            value={v.debitoAutomatico}
            onValueChange={(debitoAutomatico) => cambiar({ debitoAutomatico })}
            trackColor={{ true: colores.primario, false: colores.borde }}
            thumbColor={colores.texto}
          />
        </View>
      )}

      <Etiqueta>Categoría</Etiqueta>
      <View style={styles.chips}>
        {CATEGORIAS.map((c) => (
          <Chip key={c} etiqueta={c} activo={v.categoria === c} onPress={() => cambiar({ categoria: c })} />
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.fila}>
        <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} estilo={styles.botonFila} />
        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} estilo={styles.botonFila} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  titulo: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  ayuda: { color: colores.textoSecundario, fontSize: 13, marginTop: 2, lineHeight: 18 },
  error: { color: colores.error, marginTop: 14, fontSize: 15, textAlign: 'center' },
  botonFila: { flex: 1, marginTop: 20 },
});
