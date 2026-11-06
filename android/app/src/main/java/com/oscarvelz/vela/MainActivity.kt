package com.oscarvelz.vela

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Message
import android.os.SystemClock
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/**
 * Vela for Android: a thin shell around the Vela web app (private, end-to-end encrypted diary), loaded live from
 * GitHub Pages so every web release arrives on its own (the service worker keeps it working offline after the first
 * open). The app's WebView storage is its own, separate from Chrome's: the journal comes back by signing in and typing
 * the passphrase once on this phone.
 *
 * The page talks to the app through window.VelaNative (src/lib/vela/native.ts in the web source, feature-detected
 * there): Back (VelaBack → exitApp at Home), bar colours, the phone's BiometricPrompt for the app lock (WebAuthn does
 * not work in a plain WebView), downloads into Downloads/Vela, and leave/return signals for the lock timer.
 * Nothing in the web app changes when VelaNative is absent.
 *
 * Privacy: no Android/Google backup of the app's data (manifest), the Recents thumbnail is blank, and the shell's
 * own breadcrumbs hold only app events (start, page loaded, page process lost), never anything from the journal.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var frame: FrameLayout
    private lateinit var statusBg: View
    private val home = "https://oscarvelz.github.io/Vela/"
    private val prefs by lazy { getSharedPreferences("vela-shell", MODE_PRIVATE) }
    private var topColor = Color.parseColor("#0D1636")
    private var bottomColor = Color.parseColor("#0D1636")
    private var topDark = true
    private var bottomDark = true
    private var fileCb: ValueCallback<Array<Uri>>? = null
    private var geoAsk: Pair<String, GeolocationPermissions.Callback>? = null
    @Volatile private var trusted = false
    @Volatile private var pageReady = false
    private val saves = ConcurrentHashMap<String, Save>()
    private val crashes = ArrayList<Long>()
    private val crumbLock = Any()

    private class Save(val uri: Uri, val out: OutputStream, val name: String)

    companion object {
        private const val RQ_FILES = 7
        private const val RQ_GEO = 10
        private const val AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        private const val REPO_RELEASES = "https://api.github.com/repos/Oscarvelz/Vela/releases?per_page=30"
    }

    /* ---------- language of the shell's own words (the page tells it; the phone's language until then) ---------- */

    private fun es(): Boolean = (prefs.getString("lang", null) ?: Locale.getDefault().language) == "es"
    private fun tr(en: String, es: String) = if (es()) es else en

    /* ---------- breadcrumbs: app events only, never journal content ---------- */

    private fun addCrumb(text: String) {
        val line = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(Date()) + " " + text.replace('\n', ' ').take(160)
        synchronized(crumbLock) {
            val a = runCatching { JSONArray(prefs.getString("crumbs", "[]")) }.getOrElse { JSONArray() }
            a.put(line)
            val keep = JSONArray()
            for (i in maxOf(0, a.length() - 30) until a.length()) keep.put(a.getString(i))
            prefs.edit().putString("crumbs", keep.toString()).commit()
        }
    }

    private fun crumbLines(): List<String> = synchronized(crumbLock) {
        val a = runCatching { JSONArray(prefs.getString("crumbs", "[]")) }.getOrElse { JSONArray() }
        (0 until a.length()).map { a.getString(it) }
    }

    private fun webViewVersion(): String = runCatching { WebView.getCurrentWebViewPackage()?.versionName }.getOrNull() ?: "?"

    private fun details(): String =
        "Vela for Android ${BuildConfig.VERSION_NAME}, Android ${Build.VERSION.RELEASE}, ${Build.MODEL}, WebView ${webViewVersion()}\n" +
            crumbLines().joinToString("\n")

    private fun esc(t: String) = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    /** The shell's own pages (offline, page restarted): readable text on the remembered theme colour. */
    private fun shellPage(message: String, link: String, crumbs: Boolean, autoOpenMs: Int): String {
        val bg = String.format("#%06X", 0xFFFFFF and topColor)
        val fg = if (topDark) "#EEF1FA" else "#141A2E"
        val muted = if (topDark) "#C9CFE3" else "#3A4360"
        val accent = if (topDark) "#FFC85A" else "#8A4B0F"
        val box = if (topDark) "rgba(255,255,255,.07)" else "rgba(0,0,0,.06)"
        val sb = StringBuilder()
        sb.append("<html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>")
        sb.append("<body style=\"background:$bg;color:$fg;font:18px/1.45 sans-serif;padding:28px;margin:0\">")
        sb.append("<p style=\"margin:0 0 18px\">${esc(message)}</p>")
        sb.append("<p style=\"margin:0 0 18px\"><a id=\"go\" style=\"color:$accent;font-weight:600\" href=\"$home\">${esc(link)}</a><span id=\"t\" style=\"color:$muted;font-size:15px\"></span></p>")
        if (crumbs) {
            val last = crumbLines().takeLast(8)
            if (last.isNotEmpty()) {
                sb.append("<p style=\"margin:0 0 6px;font-size:14px;color:$muted\">${esc(tr("Last steps before it stopped:", "Últimos pasos antes de detenerse:"))}</p>")
                sb.append("<pre style=\"white-space:pre-wrap;word-break:break-word;font:13px/1.4 monospace;color:$fg;background:$box;border-radius:10px;padding:10px;margin:0 0 12px\">")
                sb.append(esc(last.joinToString("\n")))
                sb.append("</pre>")
                sb.append("<button id=\"cp\" style=\"font:15px sans-serif;color:$fg;background:$box;border:1px solid $accent;border-radius:10px;padding:9px 16px\">${esc(tr("Copy details", "Copiar detalles"))}</button>")
            }
        }
        val opens = tr(" · opens in ", " · se abre en ")
        val copied = tr("Copied", "Copiado")
        sb.append("<script>")
        sb.append("var left=${autoOpenMs / 1000},tm=null,t=document.getElementById('t');")
        sb.append("function tick(){if(left<=0){location.href='$home';return;}t.textContent='$opens'+left+' s';left--;tm=setTimeout(tick,1000);}")
        if (autoOpenMs > 0) sb.append("tick();")
        sb.append("var cp=document.getElementById('cp');if(cp)cp.onclick=function(){if(tm){clearTimeout(tm);tm=null;t.textContent='';}")
        sb.append("try{VelaNative.copyDetails();cp.textContent='$copied';}catch(e){}};")
        sb.append("</script></body></html>")
        return sb.toString()
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        topColor = prefs.getInt("top", topColor); bottomColor = prefs.getInt("bottom", bottomColor)
        topDark = prefs.getBoolean("topDark", true); bottomDark = prefs.getBoolean("bottomDark", true)
        addCrumb("shell start ${BuildConfig.VERSION_NAME}, WebView ${webViewVersion()}, Android ${Build.VERSION.RELEASE}")
        // A private diary: Recents shows a blank card instead of a picture of the open journal. Android 13+ can do
        // that without blocking screenshots (Oscar sends screenshots of bugs); older phones need FLAG_SECURE.
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false)
        else window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.setDecorFitsSystemWindows(false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        window.isNavigationBarContrastEnforced = false
        window.isStatusBarContrastEnforced = false

        root = FrameLayout(this)
        frame = FrameLayout(this)
        statusBg = View(this)
        web = makeWeb()
        frame.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(frame, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(statusBg, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.TOP))
        // The page sits between the system bars like the installed PWA; the status bar shows the colour at the top of
        // the page, the navigation bar the colour at its bottom (both sent by the page).
        root.setOnApplyWindowInsetsListener { _, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            frame.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            statusBg.layoutParams = (statusBg.layoutParams as FrameLayout.LayoutParams).apply { height = bars.top }
            WindowInsets.CONSUMED
        }
        setContentView(root)
        applyBars()
        // Always a fresh page: a fresh launch must show the app lock, never a restored open journal.
        web.loadUrl(authUrl(intent) ?: home)
        checkUpdate()
    }

    /** Builds the page's WebView. Also used to start a fresh one if the page's process is ever lost. */
    private fun makeWeb(): WebView {
        val w = WebView(this)
        w.setBackgroundColor(topColor)
        w.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true; databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false; allowContentAccess = true
            setSupportMultipleWindows(true); javaScriptCanOpenWindowsAutomatically = true
            setGeolocationEnabled(true)
            textZoom = 100
            saveFormData = false
            userAgentString = "$userAgentString VelaAndroid/${BuildConfig.VERSION_NAME}"
        }
        ServiceWorkerController.getInstance().serviceWorkerWebSettings.apply {
            cacheMode = WebSettings.LOAD_DEFAULT; allowContentAccess = true; allowFileAccess = false
        }
        CookieManager.getInstance().setAcceptCookie(true)
        runCatching { w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false) }
        w.addJavascriptInterface(Bridge(), "VelaNative")
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                if (isVela(r.url)) return false
                openOutside(r.url); return true
            }
            override fun onPageStarted(v: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                trusted = url != null && isVela(Uri.parse(url)); pageReady = false
            }
            override fun onPageFinished(v: WebView, url: String?) {
                trusted = url != null && isVela(Uri.parse(url)); pageReady = trusted
                if (pageReady) addCrumb("page loaded")
            }
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: WebResourceError) {
                if (!r.isForMainFrame) return
                v.loadDataWithBaseURL(home, shellPage(
                    tr("Vela needs the internet the first time it opens; after that it opens offline.",
                       "Vela necesita internet la primera vez que se abre; después se abre sin conexión."),
                    tr("Try again", "Intentar de nuevo"), false, 0), "text/html", "utf-8", null)
            }
            // If the page's process dies (out of memory, say), Android would close the whole app unless the app says it
            // handled it. Start a fresh page instead (it opens on the lock screen, as every fresh page does).
            override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                val crashed = runCatching { detail.didCrash() }.getOrDefault(true)
                addCrumb(if (crashed) "PAGE PROCESS CRASHED (didCrash=true)" else "PAGE PROCESS KILLED BY ANDROID, likely for memory")
                recoverWeb(v)
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                fileCb?.onReceiveValue(null); fileCb = cb
                return try { pickFiles(p); true } catch (e: Exception) { fileCb = null; false }
            }
            override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
                if (Uri.parse(origin).host != "oscarvelz.github.io") { cb.invoke(origin, false, false); return }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false); return
                }
                geoAsk = origin to cb
                requestPermissions(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION), RQ_GEO)
            }
            // target=_blank / window.open: Vela pages stay here, everything else opens in its own app or the browser.
            override fun onCreateWindow(v: WebView, dialog: Boolean, gesture: Boolean, msg: Message): Boolean {
                val probe = WebView(this@MainActivity)
                var done = false
                fun take(pv: WebView, u: Uri?): Boolean {
                    if (u == null || u.scheme == "about" || done) return true
                    done = true
                    if (isVela(u)) web.loadUrl(u.toString()) else openOutside(u)
                    pv.post { pv.stopLoading(); pv.destroy() }
                    return true
                }
                probe.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(pv: WebView, r: WebResourceRequest): Boolean = take(pv, r.url)
                    override fun onPageStarted(pv: WebView, url: String?, favicon: android.graphics.Bitmap?) { take(pv, url?.let { Uri.parse(it) }) }
                }
                (msg.obj as WebView.WebViewTransport).webView = probe
                msg.sendToTarget()
                return true
            }
        }
        w.setDownloadListener { url, _, _, _, _ ->
            // blob:/data: downloads are taken by the page (native.ts) and saved into Downloads/Vela; real links open outside.
            if (url.startsWith("http")) openOutside(Uri.parse(url))
        }
        return w
    }

    /** A fresh page after the old one's process was lost, so the app stays open instead of closing. */
    private fun recoverWeb(dead: WebView) {
        if (dead !== web) { runCatching { (dead.parent as? ViewGroup)?.removeView(dead); dead.destroy() }; return }
        fileCb?.onReceiveValue(null); fileCb = null
        frame.removeView(dead)
        runCatching { dead.destroy() }
        val now = SystemClock.elapsedRealtime()
        crashes.add(now)
        crashes.removeAll { now - it > 60_000 }
        web = makeWeb()
        frame.addView(web, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        applyBars()
        if (crashes.size >= 3) {
            web.loadDataWithBaseURL(home, shellPage(
                tr("Vela had to reopen its page several times in a minute, so it is waiting here. Your journal is safe and encrypted on this phone.",
                   "Vela tuvo que reabrir su página varias veces en un minuto, así que espera aquí. Tu diario está a salvo y cifrado en este teléfono."),
                tr("Open Vela", "Abrir Vela"), true, 0), "text/html", "utf-8", null)
        } else {
            web.loadDataWithBaseURL(home, shellPage(
                tr("Vela's page stopped, so the app reopened it. Your journal is safe.",
                   "La página de Vela se detuvo y la app la reabrió. Tu diario está a salvo."),
                tr("Open Vela now", "Abrir Vela ahora"), true, 6000), "text/html", "utf-8", null)
        }
    }

    private fun isVela(u: Uri): Boolean {
        val s = u.scheme ?: return false
        if (s == "blob" || s == "data" || s == "about") return true
        val path = u.path ?: ""
        return s == "https" && u.host == "oscarvelz.github.io" && (path == "/Vela" || path.startsWith("/Vela/"))
    }

    private fun openOutside(u: Uri) {
        try {
            val i = when (u.scheme) {
                "intent" -> Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME).apply { selector = null; component = null }
                "mailto" -> Intent(Intent.ACTION_SENDTO, u)
                else -> Intent(Intent.ACTION_VIEW, u)
            }
            if (u.scheme == "http" || u.scheme == "https" || u.scheme == "intent") i.addCategory(Intent.CATEGORY_BROWSABLE)
            startActivity(i)
        } catch (_: Exception) {
            Toast.makeText(this, tr("No app can open this link.", "No hay una app para abrir este enlace."), Toast.LENGTH_SHORT).show()
        }
    }

    private fun dispatch(js: String) = runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(js, null) }

    private fun applyBars() {
        statusBg.setBackgroundColor(topColor)
        root.setBackgroundColor(bottomColor)
        frame.setBackgroundColor(bottomColor)
        web.setBackgroundColor(topColor)
        window.decorView.setBackgroundColor(bottomColor)
        val ls = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
        val ln = WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance((if (topDark) 0 else ls) or (if (bottomDark) 0 else ln), ls or ln)
    }

    private fun parseColor(s: String): Int? = runCatching {
        val t = s.trim()
        when {
            t.startsWith("#") -> Color.parseColor(t)
            t.startsWith("rgb") -> { val n = Regex("[\\d.]+").findAll(t).map { it.value.toFloat() }.toList(); Color.rgb(n[0].toInt(), n[1].toInt(), n[2].toInt()) }
            else -> null
        }
    }.getOrNull()

    /* ---------- files: the backup picker ---------- */

    private fun pickFiles(p: WebChromeClient.FileChooserParams) {
        val accept = p.acceptTypes.flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        val imagesOnly = accept.isNotEmpty() && accept.all { it.startsWith("image/") }
        val multiple = p.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
        // Exact MIME filters hide .json backups that phones label oddly, so only pictures are filtered.
        val intent = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).apply {
            type = if (imagesOnly) "image/*" else "*/*"
            if (multiple) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        try { startActivityForResult(intent, RQ_FILES) }
        catch (e: ActivityNotFoundException) { startActivityForResult(p.createIntent(), RQ_FILES) }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(rq: Int, rc: Int, d: Intent?) {
        if (rq != RQ_FILES) { super.onActivityResult(rq, rc, d); return }
        val cd = d?.clipData
        val res: Array<Uri>? = if (rc != RESULT_OK) null
            else if (cd != null && cd.itemCount > 0) Array(cd.itemCount) { cd.getItemAt(it).uri }
            else d?.data?.let { arrayOf(it) }
        fileCb?.onReceiveValue(res); fileCb = null
    }

    override fun onRequestPermissionsResult(rq: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(rq, perms, results)
        if (rq != RQ_GEO) return
        val (origin, cb) = geoAsk ?: return
        geoAsk = null
        cb.invoke(origin, results.any { it == PackageManager.PERMISSION_GRANTED }, false)
    }

    /* ---------- the bridge ---------- */

    inner class Bridge {
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun versionCode(): Int = BuildConfig.VERSION_CODE

        @JavascriptInterface fun setBars(top: String, bottom: String, darkTop: Boolean, darkBottom: Boolean) {
            if (!trusted) return
            val t = parseColor(top) ?: return
            val b = parseColor(bottom) ?: t
            runOnUiThread {
                topColor = t; bottomColor = b; topDark = darkTop; bottomDark = darkBottom
                prefs.edit().putInt("top", t).putInt("bottom", b).putBoolean("topDark", darkTop).putBoolean("bottomDark", darkBottom).apply()
                applyBars()
            }
        }

        @JavascriptInterface fun setLang(lang: String) {
            if (!trusted || (lang != "es" && lang != "en")) return
            prefs.edit().putString("lang", lang).apply()
        }

        /** Back on Home with nothing open (or on the lock screen): Vela's rule is that Back leaves the app. */
        @JavascriptInterface fun exitApp() {
            if (!trusted) return
            runOnUiThread { finish() }
        }

        @JavascriptInterface fun canAuth(): String {
            val bm = getSystemService(BiometricManager::class.java) ?: return "no"
            return if (bm.canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS) "yes" else "no"
        }

        @JavascriptInterface fun authenticate(id: String, title: String, subtitle: String) {
            if (!trusted) { authReply(id, false, "failed"); return }
            runOnUiThread {
                try {
                    val prompt = BiometricPrompt.Builder(this@MainActivity)
                        .setTitle(title.ifBlank { tr("Unlock Vela", "Desbloquear Vela") })
                        .setSubtitle(subtitle)
                        .setAllowedAuthenticators(AUTH)
                        .build()
                    prompt.authenticate(CancellationSignal(), mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = authReply(id, true, "")
                        override fun onAuthenticationError(code: Int, msg: CharSequence) = authReply(id, false,
                            when (code) {
                                BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED, BiometricPrompt.BIOMETRIC_ERROR_CANCELED -> "cancel"
                                BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT -> "timeout"
                                BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT, BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE,
                                BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS, BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL -> "unsupported"
                                else -> "failed"
                            })
                        // onAuthenticationFailed (a finger not recognised) keeps the prompt open: no reply yet.
                    })
                } catch (e: Exception) { authReply(id, false, "failed") }
            }
        }

        @JavascriptInterface fun saveBegin(name: String, mime: String): String {
            if (!trusted) return "error"
            return try {
                val clean = name.replace(Regex("[\\\\/:*?\"<>|\\n\\r]"), "_").trim().ifBlank { "Vela" }.take(120)
                val v = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, clean)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                    put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/Vela/")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: return "error"
                val out = contentResolver.openOutputStream(uri, "w") ?: return "error"
                var shown = clean
                contentResolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) shown = c.getString(0) ?: clean }
                val id = java.util.UUID.randomUUID().toString()
                saves[id] = Save(uri, out, shown)
                id
            } catch (e: Exception) { "error" }
        }

        @JavascriptInterface fun saveChunk(id: String, b64: String): String {
            val s = saves[id] ?: return "error"
            return try { s.out.write(Base64.decode(b64, Base64.DEFAULT)); "ok" }
            catch (e: Exception) { drop(id); "error" }
        }

        @JavascriptInterface fun saveEnd(id: String, template: String): String {
            val s = saves.remove(id) ?: return "error"
            return try {
                s.out.close()
                contentResolver.update(s.uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                val msg = template.ifBlank { tr("Saved in Downloads › Vela: %s", "Guardado en Descargas › Vela: %s") }.replace("%s", s.name)
                runOnUiThread { Toast.makeText(this@MainActivity, msg, Toast.LENGTH_LONG).show() }
                "ok"
            } catch (e: Exception) { runCatching { contentResolver.delete(s.uri, null, null) }; "error" }
        }

        /** The shell's breadcrumbs (app events only) onto the clipboard, for a bug report. */
        @JavascriptInterface fun copyDetails() {
            val text = details()
            runOnUiThread {
                runCatching { getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Vela", text)) }
            }
        }
    }

    private fun drop(id: String) {
        val s = saves.remove(id) ?: return
        runCatching { s.out.close() }; runCatching { contentResolver.delete(s.uri, null, null) }
    }

    private fun authReply(id: String, ok: Boolean, code: String) =
        dispatch("dispatchEvent(new CustomEvent('velanative-auth',{detail:{id:${JSONObject.quote(id)},ok:$ok,code:${JSONObject.quote(code)}}}))")

    /* ---------- back ---------- */

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!pageReady) { plainBack(); return }
        // Vela's own back stack decides (back-stack.ts: innermost layer first, other tabs return Home); at Home with
        // nothing open, or on the lock screen, it calls exitApp(). The lock screen's Back never opens the journal.
        web.evaluateJavascript("(function(){try{return window.VelaBack?window.VelaBack():'none'}catch(e){return 'none'}})()") { r ->
            if (r == null || r.contains("none")) plainBack()
        }
    }

    private fun plainBack() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    /* ---------- leaving and coming back (the lock timer also hears it from the page's own visibility) ---------- */

    override fun onStart() {
        super.onStart()
        if (::web.isInitialized && pageReady) dispatch("dispatchEvent(new Event('velanative-visible'))")
    }

    override fun onStop() {
        if (::web.isInitialized && pageReady) dispatch("dispatchEvent(new Event('velanative-hidden'))")
        CookieManager.getInstance().flush()
        super.onStop()
    }

    /* ---------- updates of the app itself ---------- */

    /** If GitHub has a newer android-N release with Vela.apk, offer it (at most once a day per version) and install in place. */
    private fun checkUpdate() = Thread {
        try {
            val c = URL(REPO_RELEASES).openConnection() as HttpURLConnection
            c.setRequestProperty("Accept", "application/vnd.github+json"); c.connectTimeout = 8000; c.readTimeout = 8000
            val list = JSONArray(c.inputStream.bufferedReader().readText())
            var best = BuildConfig.VERSION_CODE
            var url: String? = null
            for (i in 0 until list.length()) {
                val r = list.getJSONObject(i)
                if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue
                val n = r.getString("tag_name").takeIf { it.startsWith("android-") }?.substringAfter("android-")?.toIntOrNull() ?: continue
                if (n <= best) continue
                val assets = r.getJSONArray("assets")
                val apk = (0 until assets.length()).map { assets.getJSONObject(it) }.firstOrNull { it.getString("name") == "Vela.apk" } ?: continue
                best = n; url = apk.getString("browser_download_url")
            }
            val found = url ?: return@Thread
            val askedAt = prefs.getLong("asked-$best", 0L)
            if (System.currentTimeMillis() - askedAt < 86_400_000L) return@Thread
            runOnUiThread {
                prefs.edit().putLong("asked-$best", System.currentTimeMillis()).apply()
                AlertDialog.Builder(this).setTitle(tr("New version of the Vela app", "Nueva versión de la app Vela"))
                    .setMessage(tr("A new version of the app is ready. Install it now? Your journal and your account stay as they are.",
                                   "Hay una versión nueva de la app. ¿Instalarla ahora? Tu diario y tu cuenta se quedan igual."))
                    .setPositiveButton(tr("Install", "Instalar")) { _, _ -> install(found) }
                    .setNegativeButton(tr("Later", "Más tarde"), null).show()
            }
        } catch (_: Exception) {}
    }.start()

    private fun install(url: String) {
        Toast.makeText(this, tr("Downloading the update", "Descargando la actualización"), Toast.LENGTH_SHORT).show()
        Thread {
            try {
                val pi = packageManager.packageInstaller
                val id = pi.createSession(PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL))
                pi.openSession(id).use { s ->
                    val c = URL(url).openConnection() as HttpURLConnection; c.instanceFollowRedirects = true
                    c.inputStream.use { inp -> s.openWrite("vela.apk", 0, -1).use { out -> inp.copyTo(out); s.fsync(out) } }
                    val back = Intent(this, MainActivity::class.java).setAction("vela.INSTALL")
                    val pend = PendingIntent.getActivity(this, 1, back, PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                    s.commit(pend.intentSender)
                }
            } catch (e: Exception) { runOnUiThread { Toast.makeText(this, tr("Couldn't update: ", "No se pudo actualizar: ") + (e.message ?: ""), Toast.LENGTH_LONG).show() } }
        }.start()
    }

    /**
     * vela://auth#access_token=…&refresh_token=… (or ?code=…), from the sign-in email: the page is opened with the same
     * fragment/query so Supabase picks up the session (detectSessionInUrl). Nothing else is ever taken from it.
     */
    private fun authUrl(i: Intent?): String? {
        val u = i?.data ?: return null
        if (i.action != Intent.ACTION_VIEW || u.scheme != "vela" || u.host != "auth") return null
        val frag = u.encodedFragment
        val query = u.encodedQuery
        val ok = Regex("^[A-Za-z0-9_.~%=&+\\-]*$")
        return when {
            !frag.isNullOrBlank() && ok.matches(frag) -> { addCrumb("sign-in link received"); "$home#$frag" }
            !query.isNullOrBlank() && ok.matches(query) -> { addCrumb("sign-in link received"); "$home?$query" }
            else -> null
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        authUrl(intent)?.let { u ->
            // Already open on Vela: a different query makes it a real page load (a fragment change alone would not
            // restart the page, so the session in it would never be read). The query is never read by Vela.
            if (::web.isInitialized) web.loadUrl(u.replaceFirst("$home#", "$home?signin=${System.currentTimeMillis()}#"))
            return
        }
        if (intent.action == "vela.INSTALL") {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    if (confirm != null) startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                PackageInstaller.STATUS_SUCCESS -> {}
                else -> Toast.makeText(this, tr("The update wasn't installed: ", "La actualización no se instaló: ") + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""), Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        for (id in saves.keys.toList()) drop(id)
        super.onDestroy()
    }
}
