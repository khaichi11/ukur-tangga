package id.ukurtangga.rekam

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.provider.MediaStore
import androidx.camera.core.CameraSelector
import androidx.camera.core.CompositionSettings
import androidx.camera.core.ConcurrentCamera.SingleCameraConfig
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Merekam kamera belakang + kamera depan kecil di pojok (bila HP mendukung dua kamera bersamaan) ke SATU
 * berkas MP4 di galeri (Movies/UkurTangga) sampai Berhenti ditekan. Berjalan sebagai foreground service,
 * jadi rekaman tetap jalan saat layar mati atau saat pindah ke aplikasi Ukur Tangga di Chrome.
 */
class RekamService : LifecycleService() {

    companion object {
        const val AKSI_MULAI = "mulai"
        const val AKSI_BERHENTI = "berhenti"
        private const val KANAL = "rekam"
        private const val ID_NOTIF = 1

        /** Dibaca MainActivity untuk menampilkan pratinjau dan status. */
        var aktif: RekamService? = null
            private set
        var saatBerubah: (() -> Unit)? = null
        /** Tetap ada sesudah service berhenti, agar layar bisa menampilkan di mana berkasnya tersimpan. */
        var status = "Siap merekam."
            private set

        fun mulai(ctx: Context) = ContextCompat.startForegroundService(ctx, Intent(ctx, RekamService::class.java).setAction(AKSI_MULAI))
        fun berhenti(ctx: Context) = ctx.startService(Intent(ctx, RekamService::class.java).setAction(AKSI_BERHENTI))
    }

    val preview: Preview = Preview.Builder().build()
    var duaKamera = false
        private set
    var merekam = false
        private set
    var mulaiMs = 0L
        private set

    private var penyedia: ProcessCameraProvider? = null
    private var rekaman: Recording? = null

    override fun onCreate() {
        super.onCreate()
        aktif = this
    }

    override fun onDestroy() {
        aktif = null
        rekaman?.stop()
        penyedia?.unbindAll()
        saatBerubah?.invoke()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            AKSI_MULAI -> if (!merekam && rekaman == null) {
                status = "Menyiapkan kamera…"
                naikKeDepan()
                siapkanDanRekam()
            }
            AKSI_BERHENTI -> {
                if (rekaman != null) rekaman?.stop() else selesai()
            }
        }
        return START_NOT_STICKY
    }

    private fun naikKeDepan() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(KANAL, "Rekaman video", NotificationManager.IMPORTANCE_LOW))
        }
        val jenis = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            var j = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
            if (izin(Manifest.permission.RECORD_AUDIO)) j = j or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            j
        } else 0
        ServiceCompat.startForeground(this, ID_NOTIF, notifikasi("Merekam…"), jenis)
    }

    private fun notifikasi(teks: String): Notification {
        val buka = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val henti = PendingIntent.getService(this, 1, Intent(this, RekamService::class.java).setAction(AKSI_BERHENTI),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, KANAL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("Rekam Ukur Tangga")
            .setContentText(teks)
            .setOngoing(true)
            .setContentIntent(buka)
            .addAction(android.R.drawable.ic_media_pause, "Berhenti", henti)
            .build()
    }

    private fun izin(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun ubahStatus(teks: String) {
        status = teks
        saatBerubah?.invoke()
    }

    private fun siapkanDanRekam() {
        val f = ProcessCameraProvider.getInstance(this)
        f.addListener({
            try {
                val p = f.get()
                penyedia = p
                val perekam = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
                    .build()
                val video = VideoCapture.withOutput(perekam)
                p.unbindAll()
                duaKamera = ikatDuaKamera(p, video)
                if (!duaKamera) {
                    p.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, video)
                }
                mulaiRekam(perekam)
            } catch (e: Exception) {
                ubahStatus("Gagal menyalakan kamera: ${e.message}")
                selesai()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    /** Kamera belakang penuh + depan 1/3 di pojok, digabung CameraX menjadi satu video. */
    private fun ikatDuaKamera(p: ProcessCameraProvider, video: VideoCapture<Recorder>): Boolean {
        var belakang: CameraSelector? = null
        var depan: CameraSelector? = null
        for (pasangan in p.availableConcurrentCameraInfos) {
            belakang = pasangan.firstOrNull { it.lensFacing == CameraSelector.LENS_FACING_BACK }?.cameraSelector
            depan = pasangan.firstOrNull { it.lensFacing == CameraSelector.LENS_FACING_FRONT }?.cameraSelector
            if (belakang != null && depan != null) break
        }
        if (belakang == null || depan == null) return false
        return try {
            val grup = UseCaseGroup.Builder().addUseCase(preview).addUseCase(video).build()
            val utama = SingleCameraConfig(belakang, grup,
                CompositionSettings.Builder().setAlpha(1f).setOffset(0f, 0f).setScale(1f, 1f).build(), this)
            val kecil = SingleCameraConfig(depan, grup,
                CompositionSettings.Builder().setAlpha(1f).setOffset(2 / 3f - 0.1f, -2 / 3f + 0.1f).setScale(1 / 3f, 1 / 3f).build(), this)
            p.bindToLifecycle(listOf(utama, kecil))
            true
        } catch (e: Exception) {
            p.unbindAll()
            false
        }
    }

    private fun mulaiRekam(perekam: Recorder) {
        val nama = "ukur_tangga_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val isi = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, nama)
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Movies/UkurTangga")
        }
        val keluaran = MediaStoreOutputOptions.Builder(contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
            .setContentValues(isi)
            .build()
        var siap = perekam.prepareRecording(this, keluaran)
        if (izin(Manifest.permission.RECORD_AUDIO)) siap = siap.withAudioEnabled()
        rekaman = siap.start(ContextCompat.getMainExecutor(this)) { e ->
            when (e) {
                is VideoRecordEvent.Start -> {
                    merekam = true
                    mulaiMs = System.currentTimeMillis()
                    ubahStatus(if (duaKamera) "Merekam kamera belakang + depan" else
                        "HP ini tidak mendukung dua kamera bersamaan: merekam kamera belakang saja")
                }
                is VideoRecordEvent.Finalize -> {
                    merekam = false
                    rekaman = null
                    ubahStatus(if (e.hasError() && e.error != VideoRecordEvent.Finalize.ERROR_NONE)
                        "Rekaman berhenti dengan galat ${e.error}${e.cause?.message?.let { ": $it" } ?: ""}. " +
                            "Bagian yang sudah terekam ada di Galeri › Movies/UkurTangga bila bisa diselamatkan."
                    else "Tersimpan di Galeri › Movies/UkurTangga/$nama.mp4")
                    selesai()
                }
                else -> {}
            }
        }
    }

    private fun selesai() {
        penyedia?.unbindAll()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
}
