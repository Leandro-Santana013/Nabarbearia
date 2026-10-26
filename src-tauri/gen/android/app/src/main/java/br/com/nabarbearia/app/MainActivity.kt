package br.com.nabarbearia.app

import android.os.Bundle
import android.graphics.Color
import android.app.DownloadManager
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = true
  private var appWebView: WebView? = null

  override fun onResume() {
    super.onResume()
    appWebView?.evaluateJavascript("window.dispatchEvent(new Event('staff-resume'))", null)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
    val delegate = if (WebViewFeature.isFeatureSupported(WebViewFeature.GET_WEB_VIEW_CLIENT)) {
      WebViewCompat.getWebViewClient(webView)
    } else RustWebViewClient(webView as RustWebView, this)
    var failed = false
    var retryUrl = "https://na-barbearia.duckdns.org/equipe"
    var errorPanel: View? = null
    fun hideError() {
      errorPanel?.let { (it.parent as? ViewGroup)?.removeView(it) }
      errorPanel = null
    }
    fun showError() {
      if (errorPanel != null) return
      val panel = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = android.view.Gravity.CENTER
        setPadding(48, 48, 48, 48)
        setBackgroundColor(Color.WHITE)
        addView(TextView(this@MainActivity).apply {
          text = "Não foi possível conectar à NA Barbearia.\nVerifique sua internet e tente novamente."
          textSize = 18f
          gravity = android.view.Gravity.CENTER
        })
        addView(Button(this@MainActivity).apply {
          text = "Tentar novamente"
          setOnClickListener { hideError(); webView.loadUrl(retryUrl) }
        })
      }
      errorPanel = panel
      (findViewById<View>(android.R.id.content) as ViewGroup).addView(panel,
        ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    webView.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        delegate.shouldInterceptRequest(view, request)
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val teamHost = "na-barbearia.duckdns.org"
        if (uri.scheme == "https" && uri.host == teamHost) {
          val path = uri.path ?: ""
          if (path != "/equipe" && !path.startsWith("/equipe/") && path != "/api/v1/staff/android/apk") {
            view.loadUrl("https://$teamHost/equipe")
            return true
          }
          return delegate.shouldOverrideUrlLoading(view, request)
        }
        if (BuildConfig.DEBUG && uri.host == "127.0.0.1") return delegate.shouldOverrideUrlLoading(view, request)
        if (uri.scheme == "https" && (uri.host == "wa.me" || uri.host == "api.whatsapp.com")) {
          try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (_: android.content.ActivityNotFoundException) { }
        }
        return true
      }
      override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
        failed = false
        retryUrl = url
        delegate.onPageStarted(view, url, favicon)
      }
      override fun onPageFinished(view: WebView, url: String) {
        delegate.onPageFinished(view, url)
        if (!failed) hideError()
      }
      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) { failed = true; showError() }
        else delegate.onReceivedError(view, request, error)
      }
      override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, error: WebResourceResponse) {
        if (request.isForMainFrame && error.statusCode >= 500) { failed = true; showError() }
        else delegate.onReceivedHttpError(view, request, error)
      }
    }
    webView.setDownloadListener { url, _, _, _, _ ->
      val uri = Uri.parse(url)
      if (uri.scheme == "https" && uri.host == "na-barbearia.duckdns.org" && uri.path == "/api/v1/staff/android/apk") {
        val request = DownloadManager.Request(uri)
          .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
          .setMimeType("application/vnd.android.package-archive")
          .setTitle("NA Barbearia — atualização")
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "NA-Barbearia-${System.currentTimeMillis()}.apk")
        (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(Color.WHITE, Color.WHITE),
      navigationBarStyle = SystemBarStyle.light(Color.WHITE, Color.WHITE),
    )
    super.onCreate(savedInstanceState)
    val content = findViewById<android.view.View>(android.R.id.content)
    content.setBackgroundColor(Color.WHITE)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
