package com.opennow.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class LoginActivity : Activity() {
  companion object {
    const val EXTRA_AUTH_URL = "auth_url"
    const val EXTRA_REDIRECT_PORT = "redirect_port"
    const val RESULT_CODE = "auth_code"
    const val RESULT_ERROR = "auth_error"
  }

  private lateinit var webView: WebView
  private var redirectPort: Int = 2259

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val authUrl = intent.getStringExtra(EXTRA_AUTH_URL) ?: run {
      finish()
      return
    }
    redirectPort = intent.getIntExtra(EXTRA_REDIRECT_PORT, 2259)

    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.loadsImagesAutomatically = true
      settings.userAgentString =
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"

      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          val url = request.url
          if (url.host == "localhost" && url.port == redirectPort) {
            val result = Intent()
            val code = url.getQueryParameter("code")
            val error = url.getQueryParameter("error")
            if (code != null) {
              result.putExtra(RESULT_CODE, code)
            } else {
              result.putExtra(RESULT_ERROR, url.getQueryParameter("error_description") ?: error ?: "cancelled")
            }
            setResult(RESULT_OK, result)
            finish()
            return true
          }
          return false
        }
      }

      loadUrl(authUrl)
    }

    setContentView(webView)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (webView.canGoBack()) {
      webView.goBack()
    } else {
      val result = Intent()
      result.putExtra(RESULT_ERROR, "cancelled")
      setResult(RESULT_OK, result)
      finish()
    }
  }
}
