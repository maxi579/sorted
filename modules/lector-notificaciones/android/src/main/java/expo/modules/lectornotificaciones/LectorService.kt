package expo.modules.lectornotificaciones

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

// Android le pasa a este servicio cada notificación que llega (si el usuario dio el permiso).
// Solo guardamos las que tienen un monto ("$ 8.500"); el resto se ignora sin guardarse.
class LectorService : NotificationListenerService() {
  // [$] en vez de \$: en los textos de Kotlin, "$S" se leería como la variable S
  private val conMonto = Regex("""([$]|US[$]|U[$]S|USD)\s?\d""")
  private val pareceGasto = Regex("""(?i)(pagaste|compraste|consumo|compra|d[eé]bito|transferiste|enviaste|extraj|extracci|retiro)""")
  private val pareceIngreso = Regex("""(?i)(recibiste|te (transfiri|envi|pag)|acredit|reintegro|devoluci|cobraste)""")

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName || sbn.isOngoing) return
    val extras = sbn.notification.extras
    val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
    val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
    val completo = "$titulo $texto"
    if (!conMonto.containsMatchIn(completo)) return

    Almacen.agregar(
      this,
      JSONObject()
        .put("paquete", sbn.packageName)
        .put("titulo", titulo)
        .put("texto", texto)
        .put("cuando", sbn.postTime)
    )
    if (pareceGasto.containsMatchIn(completo) && !pareceIngreso.containsMatchIn(completo)) avisar()
  }

  // "Detecté un pago": al tocarlo abre la pantalla de pagos para revisar
  private fun avisar() {
    val gestor = NotificationManagerCompat.from(this)
    if (!gestor.areNotificationsEnabled()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val canal = NotificationChannel(CANAL, "Pagos detectados", NotificationManager.IMPORTANCE_DEFAULT)
      getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
    }
    // sorted:// es el "scheme" de app.json
    val abrir = Intent(Intent.ACTION_VIEW, Uri.parse("sorted://revisar")).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val alTocar = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val aviso = NotificationCompat.Builder(this, CANAL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("💸 Detecté un pago")
      .setContentText("Tocá para anotarlo en un segundo.")
      .setContentIntent(alTocar)
      .setAutoCancel(true)
      .build()
    try {
      gestor.notify(ID_AVISO, aviso)
    } catch (e: SecurityException) {
      // Sin permiso para mostrar notificaciones: el pago igual queda para revisar al abrir la app
    }
  }

  companion object {
    private const val CANAL = "pagos_detectados"
    private const val ID_AVISO = 4021
  }
}
