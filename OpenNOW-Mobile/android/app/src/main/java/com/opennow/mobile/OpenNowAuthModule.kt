package com.opennow.mobile

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.util.Base64
import android.net.Uri
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.ServerSocket
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale

class OpenNowAuthModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  ActivityEventListener {

  companion object {
    private const val REQUEST_CODE_LOGIN = 9042
    private const val CLIENT_ID = "ZU7sPN-miLujMD95LfOQ453IB0AtjM8sMyvgJ9wCXEQ"
    private const val SCOPES = "openid consent email tk_client age"
    private const val USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NVIDIACEFClient/HEAD/debb5919f6 GFN-PC/2.0.80.173"
    private val REDIRECT_PORTS = listOf(2259, 6460, 7119, 8870, 9096)
  }

  private var pendingPromise: Promise? = null
  private var pendingVerifier: String? = null
  private var pendingPort: Int? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "OpenNowAuth"

  @ReactMethod
  fun login(providerIdpId: String, promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is not available")
      return
    }
    if (pendingPromise != null) {
      promise.reject("LOGIN_IN_PROGRESS", "A login request is already in progress")
      return
    }

    val pkce = generatePkce()
    val port = findAvailablePort()
    val nonce = randomUrlSafeString(24)
    val locale = Locale.getDefault().toLanguageTag()
    val redirectUri = "http://localhost:$port"
    val deviceId = generateDeviceId()

    val authUrl = Uri.parse("https://login.nvidia.com/authorize").buildUpon()
      .appendQueryParameter("response_type", "code")
      .appendQueryParameter("device_id", deviceId)
      .appendQueryParameter("scope", SCOPES)
      .appendQueryParameter("client_id", CLIENT_ID)
      .appendQueryParameter("redirect_uri", redirectUri)
      .appendQueryParameter("ui_locales", locale)
      .appendQueryParameter("nonce", nonce)
      .appendQueryParameter("prompt", "select_account")
      .appendQueryParameter("code_challenge", pkce.second)
      .appendQueryParameter("code_challenge_method", "S256")
      .appendQueryParameter("idp_id", providerIdpId)
      .build()
      .toString()

    pendingPromise = promise
    pendingVerifier = pkce.first
    pendingPort = port

    val intent = Intent(activity, LoginActivity::class.java)
    intent.putExtra(LoginActivity.EXTRA_AUTH_URL, authUrl)
    intent.putExtra(LoginActivity.EXTRA_REDIRECT_PORT, port)
    activity.startActivityForResult(intent, REQUEST_CODE_LOGIN)
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE_LOGIN) return

    val promise = pendingPromise
    val verifier = pendingVerifier
    val port = pendingPort

    pendingPromise = null
    pendingVerifier = null
    pendingPort = null

    if (promise == null || verifier == null || port == null) {
      return
    }

    val code = data?.getStringExtra(LoginActivity.RESULT_CODE)
    val error = data?.getStringExtra(LoginActivity.RESULT_ERROR)

    if (resultCode != Activity.RESULT_OK || code.isNullOrBlank()) {
      promise.reject("LOGIN_CANCELLED", error ?: "Login cancelled")
      return
    }

    Thread {
      try {
        val tokens = exchangeCodeForTokens(code, verifier, port)
        val map = Arguments.createMap().apply {
          putString("accessToken", tokens.optString("accessToken"))
          putString("refreshToken", tokens.optString("refreshToken"))
          putString("idToken", tokens.optString("idToken"))
          putDouble("expiresAt", tokens.optLong("expiresAt").toDouble())
        }
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("TOKEN_EXCHANGE_FAILED", e.message, e)
      }
    }.start()
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun exchangeCodeForTokens(code: String, verifier: String, port: Int): JSONObject {
    val body = listOf(
      "grant_type" to "authorization_code",
      "client_id" to CLIENT_ID,
      "code" to code,
      "redirect_uri" to "http://localhost:$port",
      "code_verifier" to verifier
    ).joinToString("&") { (k, v) -> "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}" }

    val connection = (URL("https://login.nvidia.com/token").openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
      setRequestProperty("Accept", "application/json, text/plain, */*")
      setRequestProperty("Origin", "https://nvfile")
      setRequestProperty("Referer", "https://nvfile/")
      setRequestProperty("User-Agent", USER_AGENT)
    }

    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
      writer.write(body)
      writer.flush()
    }

    val responseCode = connection.responseCode
    val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
    val responseBody = stream.bufferedReader(Charsets.UTF_8).use(BufferedReader::readText)
    if (responseCode !in 200..299) {
      throw IllegalStateException("Token exchange failed ($responseCode): ${responseBody.take(400)}")
    }

    val json = JSONObject(responseBody)
    val expiresIn = json.optLong("expires_in", 3600L)
    return JSONObject().apply {
      put("accessToken", json.optString("access_token"))
      put("refreshToken", json.optString("refresh_token", ""))
      put("idToken", json.optString("id_token", ""))
      put("expiresAt", System.currentTimeMillis() + expiresIn * 1000L)
    }
  }

  private fun findAvailablePort(): Int {
    return REDIRECT_PORTS.firstOrNull { port ->
      try {
        ServerSocket(port).use { true }
      } catch (_: Exception) {
        false
      }
    } ?: REDIRECT_PORTS.first()
  }

  private fun generateDeviceId(): String {
    val androidId = Settings.Secure.getString(reactContext.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    return sha256("$androidId:opennow-mobile")
  }

  private fun generatePkce(): Pair<String, String> {
    val verifier = randomUrlSafeString(96)
    val challenge = Base64.encodeToString(
      MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.UTF_8)),
      Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
    )
    return verifier to challenge
  }

  private fun randomUrlSafeString(byteCount: Int): String {
    val bytes = ByteArray(byteCount)
    SecureRandom().nextBytes(bytes)
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
  }

  private fun sha256(input: String): String {
    return MessageDigest.getInstance("SHA-256")
      .digest(input.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }
}
