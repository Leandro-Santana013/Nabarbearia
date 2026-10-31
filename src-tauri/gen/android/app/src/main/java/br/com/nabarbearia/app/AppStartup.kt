package br.com.nabarbearia.app

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import android.window.SplashScreenView

/** Keep the launch logo above the live WebView until its destination is drawn. */
class AppStartup(private val activity: MainActivity) {
  private val handler = Handler(Looper.getMainLooper())
  private var cover: View? = null
  private var splash: SplashScreenView? = null
  private var generation = 0L
  private var finished = false
  var onTimeout: () -> Unit = {}

  init {
    if (Build.VERSION.SDK_INT >= 31) {
      activity.splashScreen.setOnExitAnimationListener { view ->
        if (finished) view.remove() else splash = view
      }
    }
    begin()
  }

  fun begin() {
    generation++
    finished = false
    handler.removeCallbacksAndMessages(null)
    if (cover == null) {
      val panel = FrameLayout(activity).apply {
        setBackgroundColor(activity.getColor(R.color.app_background))
        isClickable = true
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
      }
      val size = (96 * activity.resources.displayMetrics.density).toInt()
      panel.addView(ImageView(activity).apply {
        setImageResource(R.mipmap.ic_launcher_foreground)
        scaleType = ImageView.ScaleType.FIT_CENTER
      }, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
      (activity.window.decorView as ViewGroup).addView(panel,
        ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      cover = panel
    }
    handler.postDelayed({ if (!finished) onTimeout() }, 25000)
  }

  fun waitForContent(webView: WebView) {
    val request = generation
    fun poll() {
      if (finished || request != generation) return
      webView.evaluateJavascript("document.documentElement.dataset.naReady === 'true'") { ready ->
        if (finished || request != generation) return@evaluateJavascript
        if (ready == "true") {
          // onPageFinished alone doesn't mean the new DOM can be drawn.
          webView.postVisualStateCallback(request, object : WebView.VisualStateCallback() {
            override fun onComplete(requestId: Long) {
              webView.postOnAnimation { if (request == generation) dismiss() }
            }
          })
        } else handler.postDelayed({ poll() }, 50)
      }
    }
    poll()
  }

  fun dismiss() {
    finished = true
    handler.removeCallbacksAndMessages(null)
    if (Build.VERSION.SDK_INT >= 31) splash?.remove()
    splash = null
    cover?.let { (it.parent as? ViewGroup)?.removeView(it) }
    cover = null
  }

  fun close() { generation++; dismiss() }
}
