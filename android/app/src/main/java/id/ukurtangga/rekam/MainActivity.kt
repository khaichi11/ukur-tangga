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
        val bawah = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.argb(170, 0, 0, 0))
            addView(teksStatus)
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
        val perlu = mutableListOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) perlu += Manifest.permission.POST_NOTIFICATIONS
        if (perlu.all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }) RekamService.mulai(this)
        else mintaIzin.launch(perlu.toTypedArray())
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
        teksStatus.text = waktu + RekamService.status +
            if (s?.merekam == true) "\nBoleh pindah ke Ukur Tangga atau matikan layar; rekaman jalan terus sampai Berhenti." else ""
    }
}
