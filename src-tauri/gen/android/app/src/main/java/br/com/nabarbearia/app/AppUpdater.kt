package br.com.nabarbearia.app

import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

/** Downloads only the staff APK, then hands installation to Android for confirmation. */
class AppUpdater(private val activity: MainActivity, private val webView: WebView) {
  private val manager = activity.getSystemService(DownloadManager::class.java)
  private val preferences = activity.getSharedPreferences("android-update", 0)
  private val handler = Handler(Looper.getMainLooper())
  private var foreground = true
  private var installing = false
  private var waitingPermission = false
  private val poll = object : Runnable {
    override fun run() { if (foreground) inspect(true) }
  }

  private fun notify(state: String, message: String) {
    val uri = Uri.parse(webView.url ?: return)
    if (uri.scheme != "https" || uri.host != "na-barbearia.duckdns.org") return
    val data = JSONObject().put("state", state).put("message", message)
    webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('na-android-update',{detail:$data}))", null)
  }

  fun start(url: String) {
    val uri = Uri.parse(url)
    if (uri.scheme != "https" || uri.host != "na-barbearia.duckdns.org" || uri.path != "/api/v1/staff/android/apk") return
    if (preferences.getLong("download", -1) != -1L && inspect(true)) return
    try {
      val name = "NA-Barbearia-${System.currentTimeMillis()}.apk"
      val request = DownloadManager.Request(uri)
        .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
        .setMimeType("application/vnd.android.package-archive")
        .setTitle("NA Barbearia — atualização")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, name)
      val id = manager.enqueue(request)
      preferences.edit().putLong("download", id).putString("file", name).apply()
      inspect(true)
    } catch (_: Exception) {
      notify("error", "Não foi possível iniciar o download. Verifique sua internet e tente novamente.")
    }
  }

  private fun clear() {
    installing = false
    waitingPermission = false
    val id = preferences.getLong("download", -1)
    if (id != -1L) manager.remove(id)
    preferences.edit().clear().apply()
    handler.removeCallbacks(poll)
  }

  /** Returns true while the updater owns the foreground; prevents reloads mid-install. */
  fun onResume(): Boolean {
    foreground = true
    if (installing) {
      installing = false
      notify("ready", "Se a instalação foi cancelada, toque em Instalar atualização para tentar novamente.")
      return true
    }
    if (waitingPermission) {
      waitingPermission = false
      if (Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()) return inspect(true)
      notify("permission", "Permita que a NA Barbearia instale atualizações e tente novamente.")
      return true
    }
    return inspect(true)
  }

  fun onPause() { foreground = false; handler.removeCallbacks(poll) }
  fun close() { handler.removeCallbacksAndMessages(null) }

  private fun inspect(installWhenReady: Boolean): Boolean {
    val id = preferences.getLong("download", -1)
    if (id == -1L) return false
    try {
      manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
        if (!cursor.moveToFirst()) { clear(); notify("error", "O download não está mais disponível. Tente novamente."); return false }
        when (cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))) {
          DownloadManager.STATUS_FAILED -> { clear(); notify("error", "Não foi possível baixar a atualização. Entre novamente se sua sessão expirou e tente outra vez."); return false }
          DownloadManager.STATUS_SUCCESSFUL -> {
            val file = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), preferences.getString("file", "")!!)
            if (!validUpdate(file)) { clear(); notify("error", "O arquivo não é uma atualização válida deste aplicativo. Tente novamente."); return false }
            notify("ready", "Download concluído. Confirme a instalação para continuar.")
            if (installWhenReady && foreground) install(file)
          }
          else -> {
            notify("downloading", "Baixando a atualização. Aguarde a confirmação de instalação do Android.")
            handler.removeCallbacks(poll)
            handler.postDelayed(poll, 1000)
          }
        }
      }
      return true
    } catch (_: Exception) {
      clear()
      notify("error", "Não foi possível preparar a atualização. Tente novamente.")
      return false
    }
  }

  @Suppress("DEPRECATION")
  private fun validUpdate(file: File): Boolean {
    val pm = activity.packageManager
    val candidate = pm.getPackageArchiveInfo(file.absolutePath, PackageManager.GET_SIGNATURES) ?: return false
    val current = pm.getPackageInfo(activity.packageName, PackageManager.GET_SIGNATURES)
    val candidateVersion = if (Build.VERSION.SDK_INT >= 28) candidate.longVersionCode else candidate.versionCode.toLong()
    val currentVersion = if (Build.VERSION.SDK_INT >= 28) current.longVersionCode else current.versionCode.toLong()
    if (candidate.packageName != activity.packageName || candidateVersion <= currentVersion) return false
    val oldSigners = current.signatures ?: return false
    val newSigners = candidate.signatures ?: return false
    return oldSigners.isNotEmpty() && oldSigners.toSet() == newSigners.toSet()
  }

  private fun install(file: File) {
    if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
      waitingPermission = true
      notify("permission", "Autorize a instalação de atualizações da NA Barbearia nesta tela do Android.")
      activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
      return
    }
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
    installing = true
    notify("installing", "Confirme a instalação na tela do Android. Sua conta e seus dados serão mantidos.")
    activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
  }
}
