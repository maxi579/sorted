package expo.modules.lectornotificaciones

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// Guarda en el celular las notificaciones con montos hasta que la app las lee.
// Nunca salen del teléfono: la app las interpreta y solo sube el pago que detectó.
object Almacen {
  private const val ARCHIVO = "lector_notificaciones"
  private const val CLAVE = "pendientes"
  private const val MAXIMO = 100

  @Synchronized
  fun agregar(context: Context, notificacion: JSONObject) {
    val lista = leerLista(context)
    // La misma notificación puede llegar dos veces (por ejemplo, cuando se actualiza)
    for (i in 0 until lista.length()) {
      val otra = lista.getJSONObject(i)
      if (otra.optString("texto") == notificacion.optString("texto") && otra.optString("paquete") == notificacion.optString("paquete")) return
    }
    lista.put(notificacion)
    val recortada = JSONArray()
    val desde = maxOf(0, lista.length() - MAXIMO)
    for (i in desde until lista.length()) recortada.put(lista.get(i))
    preferencias(context).edit().putString(CLAVE, recortada.toString()).apply()
  }

  @Synchronized
  fun leer(context: Context): String = leerLista(context).toString()

  @Synchronized
  fun borrar(context: Context) {
    preferencias(context).edit().remove(CLAVE).apply()
  }

  private fun leerLista(context: Context): JSONArray =
    try {
      JSONArray(preferencias(context).getString(CLAVE, "[]"))
    } catch (e: Exception) {
      JSONArray()
    }

  private fun preferencias(context: Context) = context.getSharedPreferences(ARCHIVO, Context.MODE_PRIVATE)
}
