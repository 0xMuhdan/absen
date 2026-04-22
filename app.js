// Global Variables
let peer = null;
let operatorPeerId = null;
let currentSessionId = null;
let html5QrcodeScanner = null;
let qrTimeout = null;
let qrInterval = null;

// ==========================================
// 2. VIEW ROUTING LOGIC
// ==========================================
function selectRole(role) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    
    if (role === 'operator') {
        document.getElementById('operatorView').classList.add('active');
        initOperatorPeer();
        resetOperator();
    } else if (role === 'student') {
        document.getElementById('studentView').classList.add('active');
        startScanner();
    }
}

function goBack() {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('roleSelection').classList.add('active');
    
    // Cleanup
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(error => console.error(error));
    }
    clearQRTimer();
}

function generateUUID() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function initOperatorPeer() {
    if (!peer) {
        const genBtn = document.getElementById('generateBtn');
        genBtn.disabled = true;
        genBtn.innerText = "Menghubungkan ke Jaringan...";
        
        // PeerJS: Menggunakan server publik gratis
        peer = new Peer(); 
        
        peer.on('open', (id) => {
            operatorPeerId = id;
            genBtn.disabled = false;
            genBtn.innerText = "Generate QR Code";
        });
        
        peer.on('connection', (conn) => {
            conn.on('data', (data) => {
                // Saat mahasiswa scan dan kirim data success
                if (data.action === 'scan_success' && data.sessionId === currentSessionId) {
                    clearQRTimer(); // Hentikan timer kalau berhasil

                    const nama = document.getElementById('nama').value.trim();
                    document.getElementById('operatorQR').classList.add('hidden');
                    const successView = document.getElementById('operatorSuccess');
                    successView.classList.remove('hidden');
                    document.getElementById('successMessageName').innerText = `${nama.toUpperCase()} BERHASIL ABSEN!`;
                }
            });
        });

        peer.on('error', (err) => {
             console.error(err);
             alert("Koneksi jaringan putus. Silakan muat ulang halaman.");
        });
    }
}

// ==========================================
// 3. OPERATOR LOGIC (LAPTOP)
// ==========================================
function generateQR() {
    const nama = document.getElementById('nama').value.trim();
    const nim = document.getElementById('nim').value.trim();
    const prodi = document.getElementById('prodi').value.trim();

    if (!nama || !nim) {
        alert("Nama dan NIM wajib diisi!");
        return;
    }

    if (!operatorPeerId) {
        alert("Sabar, masih menghubungi jaringan P2P...");
        return;
    }

    currentSessionId = generateUUID();

    // Data dibikin sangat simpel: peerId|sessionId
    // Tujuannya agar QR code jauh lebih mudah discan HP (tidak ribet/kecil)
    const qrData = `${operatorPeerId}|${currentSessionId}`;

    document.getElementById('operatorForm').classList.add('hidden');
    document.getElementById('operatorQR').classList.remove('hidden');

    document.getElementById("qrcodeBox").innerHTML = "";
    new QRCode(document.getElementById("qrcodeBox"), {
        text: qrData,
        width: 250,
        height: 250,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.L // Diubah dari H ke L agar garis QR besar & gampang discan
    });

    // Mulai hitung mundur 5 menit
    startQRTimer(5 * 60);
}

function startQRTimer(seconds) {
    clearQRTimer();
    
    let timeRemaining = seconds;
    const timerDisplay = document.getElementById('qrTimer');
    
    qrInterval = setInterval(() => {
        timeRemaining--;
        
        const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
        const s = (timeRemaining % 60).toString().padStart(2, '0');
        timerDisplay.innerText = `Waktu tersisa: ${m}:${s}`;
        
        if (timeRemaining <= 0) {
            clearQRTimer();
            alert("Waktu scan QR sudah habis (5 Menit). Silakan Generate ulang.");
            resetOperator();
        }
    }, 1000);
}

function clearQRTimer() {
    if (qrInterval) clearInterval(qrInterval);
    if (qrTimeout) clearTimeout(qrTimeout);
    document.getElementById('qrTimer').innerText = "Waktu tersisa: 05:00";
}

function resetOperator() {
    clearQRTimer();
    document.getElementById('operatorForm').classList.remove('hidden');
    document.getElementById('operatorQR').classList.add('hidden');
    document.getElementById('operatorSuccess').classList.add('hidden');
    
    document.getElementById('nama').value = '';
    document.getElementById('nim').value = '';
    document.getElementById('prodi').value = '';
    currentSessionId = null;
}

// ==========================================
// 4. STUDENT LOGIC (HP)
// ==========================================
function startScanner() {
    document.getElementById('studentScanner').classList.remove('hidden');
    document.getElementById('studentSuccess').classList.add('hidden');

    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 250} },
        false
    );
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function onScanSuccess(decodedText, decodedResult) {
    html5QrcodeScanner.clear(); // Hentikan kamera
    
    try {
        // Tadi pake JSON.parse menyebabkan QR ruwet. 
        // Sekarang pakai split '|' biasa yang simpel
        const parts = decodedText.split('|');
        if (parts.length !== 2) throw new Error("Format QR Tidak Valid");

        const scannedPeerId = parts[0];
        const scannedSessionId = parts[1];

        // Mahasiswa masuk ke P2P network untuk konfirmasi
        const studentPeer = new Peer();
        
        studentPeer.on('open', () => {
            const conn = studentPeer.connect(scannedPeerId);
            
            conn.on('open', () => {
                // Kirim pesan sukses ke laptop operator
                conn.send({
                    action: 'scan_success',
                    sessionId: scannedSessionId
                });
                
                // Tampilkan sukses di layar HP
                document.getElementById('studentScanner').classList.add('hidden');
                document.getElementById('studentSuccess').classList.remove('hidden');
                
                // Tutup koneksi agar hemat baterai/internet
                setTimeout(() => studentPeer.destroy(), 2000);
            });
            
            conn.on('error', () => {
                alert("Gagal terhubung ke Laptop Operator. Coba scan lagi.");
                resetStudent();
            });
        });

        studentPeer.on('error', (err) => {
            console.error(err);
            alert("Sinyal internet HP terlalu lemah. Coba scan sekali lagi.");
            resetStudent();
        });

    } catch (error) {
        console.error(error);
        alert("Gagal membaca kode QR ini (Tidak Valid/Expired).");
        resetStudent();
    }
}

function onScanFailure(error) {
    // Abaikan frame yang blur
}

function resetStudent() {
    startScanner();
}
