package id.ukurtangga.rekam

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat

/**
 * Layar perekam: pratinjau, tombol Mulai/Berhenti, dan tombol untuk membuka Ukur Tangga di Chrome.
 * Rekaman dijalankan RekamService, jadi tetap berjalan sesudah layar ini ditinggal.
 */
class MainActivity : ComponentActivity() {

    private val URL_APLIKASI = "https://khaichi11.github.io/ukur-tangga/"

    private lateinit var pratinjau: PreviewView
    private lateinit var teksStatus: TextView
    private lateinit var tombol: Button
    private val jam = Handler(Looper.getMainLooper())
    private val detak = object : Runnable {
        override fun run() { segarkan(); jam.postDelayed(this, 1000) }
    }

    private val mintaIzin = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { hasil ->
        if (hasil[Manifest.permission.CAMERA] == true) RekamService.mulai(this)
        else teksStatus.text = "Izin kamera ditolak. Buka Setelan › Aplikasi › Rekam Ukur Tangga › Izin."
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        pratinjau = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FIT_CENTER; setBackgroundColor(Color.BLACK) }
        teksStatus = TextView(this).apply { setTextColor(Color.WHITE); textSize = 15f; setPadding(24, 16, 24, 16) }
        tombol = Button(this).apply { setOnClickListener { tekanTombol() } }
        val buka = Button(this).apply {
            text = "Buka Ukur Tangga"
            setOnClickListener { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(URL_APLIKASI))) }
        }
        val tes = Button(this).apply { text = "Tes dua kamera"; setOnClickListener { tesKamera() } }
        val bawah = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.argb(170, 0, 0, 0))
            addView(teksStatus)
            addView(tes, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(tombol, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
                addView(buka, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
            })
        }
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(pratinjau, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
            addView(bawah, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM))
        })
    }

    override fun onStart() {
        super.onStart()
        RekamService.saatBerubah = { runOnUiThread { segarkan() } }
        jam.post(detak)
    }

    override fun onStop() {
        RekamService.saatBerubah = null
        RekamService.aktif?.preview?.setSurfaceProvider(null)   // rekaman jalan terus tanpa pratinjau
        jam.removeCallbacks(detak)
        super.onStop()
    }

    private fun tekanTombol() {
        val s = RekamService.aktif
        if (s != null) { RekamService.berhenti(this); return }
        hasilTes = null
        val perlu = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) perlu += Manifest.permission.POST_NOTIFICATIONS
        if (perlu.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }) RekamService.mulai(this)
        else mintaIzin.launch(perlu.toTypedArray())
    }

    private var hasilTes: String? = null

    private fun tesKamera() {
        if (RekamService.aktif != null) { teksStatus.text = "Hentikan rekaman dulu, lalu tekan Tes dua kamera."; return }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            mintaIzinTes.launch(Manifest.permission.CAMERA); return
        }
        hasilTes = "Menguji… (±5 detik)"
        segarkan()
        TesKamera(this) { hasil -> runOnUiThread {
            hasilTes = hasil
            segarkan()
            startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, hasil), "Kirim hasil tes"))
        } }.jalankan()
    }

    private val mintaIzinTes = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) tesKamera() else teksStatus.text = "Izin kamera ditolak."
    }

    private var pratinjauTerpasang: RekamService? = null

    private fun segarkan() {
        val s = RekamService.aktif
        if (s != null && pratinjauTerpasang !== s) {
            s.preview.setSurfaceProvider(pratinjau.surfaceProvider)
            pratinjauTerpasang = s
        }
        if (s == null) pratinjauTerpasang = null
        tombol.text = if (s != null) "■ Berhenti" else "● Mulai rekam"
        val waktu = if (s?.merekam == true) {
            val d = (System.currentTimeMillis() - s.mulaiMs) / 1000
            String.format("%d:%02d:%02d · ", d / 3600, d / 60 % 60, d % 60)
        } else ""
        if (s == null && hasilTes != null) { teksStatus.text = hasilTes; return }
        teksStatus.text = waktu + RekamService.status +
            if (s?.merekam == true) "\nBoleh pindah ke Ukur Tangga atau matikan layar; rekaman jalan terus sampai Berhenti." else ""
    }
}
