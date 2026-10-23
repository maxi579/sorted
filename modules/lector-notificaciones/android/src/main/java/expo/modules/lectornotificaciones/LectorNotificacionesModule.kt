package expo.modules.lectornotificaciones

import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Lo que ve JavaScript (src/lib/notificaciones.ts)
class LectorNotificacionesModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LectorNotificaciones")

    Function("tienePermiso") {
      NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
    }

    Function("abrirAjustesDePermiso") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("leerPendientes") {
      Almacen.leer(context)
    }

    Function("borrarPendientes") {
      Almacen.borrar(context)
    }
  }
}
