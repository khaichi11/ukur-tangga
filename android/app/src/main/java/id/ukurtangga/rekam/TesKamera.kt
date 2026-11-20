package id.ukurtangga.rekam

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import androidx.camera.lifecycle.ProcessCameraProvider
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicInteger

/**
 * Tes apakah HP ini mau mengalirkan gambar dari kamera belakang DAN depan bersamaan lewat Camera2
 * langsung (tanpa daftar resmi "concurrent camera"). Hasilnya teks untuk ditampilkan/dikirim.
 */
class TesKamera(private val ctx: Context, private val selesai: (String) -> Unit) {

    private val cm = ctx.getSystemService(CameraManager::class.java)
    private val utas = HandlerThread("tes-kamera").apply { start() }
    private val h = Handler(utas.looper)
    private val ex = Executor { h.post(it) }
    private val log = StringBuilder()
    private val perangkat = mutableListOf<CameraDevice>()
    private val pembaca = mutableListOf<ImageReader>()

    private fun tulis(s: String) { log.append(s).append('\n') }

    fun jalankan() { h.post { mulai() } }

    private fun mulai() {
        tulis("HP: ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        val belakang = mutableListOf<String>(); val depan = mutableListOf<String>()
        for (id in cm.cameraIdList) {
            val c = cm.getCameraCharacteristics(id)
            when (c.get(CameraCharacteristics.LENS_FACING)) {
                CameraMetadata.LENS_FACING_BACK -> belakang += id
                CameraMetadata.LENS_FACING_FRONT -> depan += id
            }
        }
        tulis("Kamera belakang: $belakang · depan: $depan")
        if (Build.VERSION.SDK_INT >= 30) {
            val pasangan = cm.concurrentCameraIds
            tulis("Pasangan resmi bersamaan (Camera2): ${if (pasangan.isEmpty()) "TIDAK ADA" else pasangan}")
        } else tulis("Pasangan resmi: Android di bawah 11, tidak ada API-nya")
        try {
            val n = ProcessCameraProvider.getInstance(ctx).get().availableConcurrentCameraInfos.size
            tulis("Pasangan menurut CameraX: $n")
        } catch (e: Exception) { tulis("CameraX: ${e.message}") }

        val a = belakang.firstOrNull(); val b = depan.firstOrNull()
        if (a == null || b == null) { akhiri("Tidak ada kamera depan atau belakang."); return }
        tulis("Mencoba membuka kamera $a (belakang) lalu $b (depan) sekaligus…")
        val bingkaiA = AtomicInteger(); val bingkaiB = AtomicInteger()
        buka(a, bingkaiA) { okA ->
            if (!okA) { akhiri("Kamera belakang sendiri pun gagal dibuka."); return@buka }
            buka(b, bingkaiB) { okB ->
                if (!okB) { akhiri("KESIMPULAN: HP menolak membuka kamera kedua saat kamera pertama menyala."); return@buka }
                h.postDelayed({
                    val fa = bingkaiA.get(); val fb = bingkaiB.get()
                    tulis("Gambar dalam 3 detik · belakang: $fa · depan: $fb")
                    akhiri(if (fa > 5 && fb > 5) "KESIMPULAN: BISA. Dua kamera mengalir bersamaan lewat Camera2 langsung."
                        else "KESIMPULAN: kamera terbuka tapi salah satu tidak mengirim gambar (HP membatasi).")
                }, 3000)
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun buka(id: String, hitung: AtomicInteger, hasil: (Boolean) -> Unit) {
        var sudah = false
        val sekali = { ok: Boolean -> if (!sudah) { sudah = true; hasil(ok) } }
        try {
            cm.openCamera(id, ex, object : CameraDevice.StateCallback() {
                override fun onOpened(d: CameraDevice) {
                    perangkat += d
                    val r = ImageReader.newInstance(640, 480, ImageFormat.YUV_420_888, 4)
                    pembaca += r
                    r.setOnImageAvailableListener({ ir -> ir.acquireLatestImage()?.close(); hitung.incrementAndGet() }, h)
                    val konf = SessionConfiguration(SessionConfiguration.SESSION_REGULAR, listOf(OutputConfiguration(r.surface)), ex,
                        object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(s: CameraCaptureSession) {
                                try {
                                    val req = d.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(r.surface) }.build()
                                    s.setRepeatingRequest(req, null, h)
                                    tulis("Kamera $id: terbuka dan mengalir")
                                    sekali(true)
                                } catch (e: Exception) { tulis("Kamera $id: gagal mulai (${e.message})"); sekali(false) }
                            }
                            override fun onConfigureFailed(s: CameraCaptureSession) { tulis("Kamera $id: sesi ditolak"); sekali(false) }
                        })
                    try { d.createCaptureSession(konf) } catch (e: Exception) { tulis("Kamera $id: sesi galat (${e.message})"); sekali(false) }
                }
                override fun onDisconnected(d: CameraDevice) { tulis("Kamera $id: terputus (direbut kamera lain)"); sekali(false) }
                override fun onError(d: CameraDevice, error: Int) {
                    val arti = when (error) {
                        CameraDevice.StateCallback.ERROR_MAX_CAMERAS_IN_USE -> "batas jumlah kamera terbuka"
                        CameraDevice.StateCallback.ERROR_CAMERA_IN_USE -> "kamera sedang dipakai"
                        CameraDevice.StateCallback.ERROR_CAMERA_DISABLED -> "dimatikan kebijakan"
                        CameraDevice.StateCallback.ERROR_CAMERA_DEVICE -> "galat perangkat"
                        else -> "galat layanan kamera"
                    }
                    tulis("Kamera $id: GAGAL ($error, $arti)"); sekali(false)
                }
            })
        } catch (e: Exception) { tulis("Kamera $id: ${e.message}"); sekali(false) }
    }

    private fun akhiri(kesimpulan: String) {
        tulis(kesimpulan)
        perangkat.forEach { runCatching { it.close() } }
        pembaca.forEach { runCatching { it.close() } }
        utas.quitSafely()
        selesai(log.toString())
    }
}
