// Global Variables
let peer = null;
let operatorPeerId = null;
let currentSessionId = null;
let html5QrcodeScanner = null;

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
        
        // PeerJS: Menggunakan server publik gratis, tidak perlu API key!
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

    // Data yang dimasukkan ke QR adalah ID Jaringan Operator dan ID Sesi
    const qrData = JSON.stringify({
        peerId: operatorPeerId,
        sessionId: currentSessionId
    });

    document.getElementById('operatorForm').classList.add('hidden');
    document.getElementById('operatorQR').classList.remove('hidden');

    document.getElementById("qrcodeBox").innerHTML = "";
    new QRCode(document.getElementById("qrcodeBox"), {
        text: qrData,
        width: 250,
        height: 250,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
}

function resetOperator() {
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
        const qrData = JSON.parse(decodedText);
        
        if (!qrData.peerId || !qrData.sessionId) throw new Error("Format QR Tidak Valid");

        // Mahasiswa masuk ke P2P network hanya untuk mengirim pesan kesuksesan
        const studentPeer = new Peer();
        
        studentPeer.on('open', () => {
            const conn = studentPeer.connect(qrData.peerId);
            
            conn.on('open', () => {
                // Kirim sinyal sukses dengerin ke laptop operator
                conn.send({
                    action: 'scan_success',
                    sessionId: qrData.sessionId
                });
                
                // Tampilkan pesan sukses di HP
                document.getElementById('studentScanner').classList.add('hidden');
                document.getElementById('studentSuccess').classList.remove('hidden');
                
                // Tutup koneksi agar tidak memberatkan device hp
                setTimeout(() => studentPeer.destroy(), 2000);
            });
            
            conn.on('error', () => {
                alert("Gagal terhubung ke Laptop Operator. Coba scan lagi.");
                resetStudent();
            });
        });

        studentPeer.on('error', (err) => {
            console.error(err);
            alert("Sinyal internet terlalu lemah untuk terhubung. Coba lagi.");
            resetStudent();
        });

    } catch (error) {
        console.error(error);
        alert("Gagal membaca kode QR ini. Pastikan dari aplikasi yang benar.");
        resetStudent();
    }
}

function onScanFailure(error) {
    // Abaikan jika tidak ada QR yang terdeteksi diframe
}

function resetStudent() {
    startScanner();
}
