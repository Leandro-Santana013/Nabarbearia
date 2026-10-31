package br.com.nabarbearia.app

import android.os.Bundle
import android.graphics.Color
import android.content.Intent
import android.net.Uri
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
  private var hasResumed = false
  private var updater: AppUpdater? = null
  private var startup: AppStartup? = null

  override fun onResume() {
    super.onResume()
    if (updater?.onResume() != true && hasResumed) refreshSessionAndInterface()
    hasResumed = true
  }

  // Revalidate access without tearing down a live dashboard. Fetch the entry
  // in the background; only a changed bundle needs a covered full reload.
  private fun refreshSessionAndInterface() {
    appWebView?.evaluateJavascript("""
      (async () => {
        window.dispatchEvent(new Event('staff-resume'));
        try {
          const response = await fetch('/equipe', {cache:'no-store', signal:AbortSignal.timeout(5000)});
          if (!response.ok) return;
          const html = new DOMParser().parseFromString(await response.text(), 'text/html');
          const selector = 'script[type="module"][src]';
          const next = html.querySelector(selector)?.getAttribute('src');
          const current = document.querySelector(selector)?.getAttribute('src');
          if (next && current && next !== current) location.reload();
        } catch (_) { /* Session handling presents real connection failures. */ }
      })();
    """.trimIndent(), null)
  }

  override fun onPause() {
    updater?.onPause()
    super.onPause()
  }

  override fun onDestroy() {
    startup?.close()
    updater?.close()
    super.onDestroy()
  }

  override fun onWebViewCreate(webView: WebView) {
    webView.setBackgroundColor(getColor(R.color.app_background))
    super.onWebViewCreate(webView)
    appWebView = webView
    val marker = if (BuildConfig.DEBUG) "NABarbeariaDebug" else "NABarbearia"
    webView.settings.userAgentString += " $marker/${BuildConfig.VERSION_CODE}"
    updater = AppUpdater(this, webView)
    // Wry installs its client and content view after this hook. Configure on
    // attachment so it cannot overwrite the wrapper or remove the error panel.
    webView.post { configureWebView(webView) }
  }

  private fun configureWebView(webView: WebView) {
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
      startup?.dismiss()
      if (errorPanel != null) return
      val panel = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = android.view.Gravity.CENTER
        setPadding(48, 48, 48, 48)
        setBackgroundColor(Color.WHITE)
        addView(TextView(this@MainActivity).apply {
          text = "Não foi possível conectar à NA Barbearia.\nVerifique sua internet e tente novamente."
          textSize = 18f
          setTextColor(Color.rgb(17, 24, 39))
          gravity = android.view.Gravity.CENTER
        })
        addView(Button(this@MainActivity).apply {
          text = "Tentar novamente"
          isAllCaps = false
          setTextColor(Color.WHITE)
          backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(0, 153, 255))
          setOnClickListener { hideError(); webView.loadUrl(retryUrl) }
        })
      }
      errorPanel = panel
      (findViewById<View>(android.R.id.content) as ViewGroup).addView(panel,
        ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    startup?.onTimeout = { failed = true; showError() }
    webView.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        delegate.shouldInterceptRequest(view, request)
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        val teamHost = "na-barbearia.duckdns.org"
        if (uri.scheme == "https" && uri.host == teamHost) {
          val path = uri.path ?: ""
          if (path == "/api/v1/staff/android/apk") {
            if (request.isForMainFrame) updater?.start(uri.toString())
            return true
          }
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
        startup?.begin()
        failed = false
        retryUrl = url
        delegate.onPageStarted(view, url, favicon)
      }
      override fun onPageFinished(view: WebView, url: String) {
        delegate.onPageFinished(view, url)
        if (!failed) { hideError(); startup?.waitForContent(view) }
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
      updater?.start(url)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    val background = getColor(R.color.app_background)
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(background, background),
      navigationBarStyle = SystemBarStyle.light(background, background),
    )
    super.onCreate(savedInstanceState)
    startup = AppStartup(this)
    val content = findViewById<android.view.View>(android.R.id.content)
    content.setBackgroundColor(background)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
