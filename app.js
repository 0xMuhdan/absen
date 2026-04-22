// Global Variables
let currentSessionId = null;
let ntfyTopic = null;
let html5QrcodeScanner = null;
let qrTimeout = null;
let qrInterval = null;
let eventSource = null; // Menampung koneksi jembatan (SSE) ke Server

// ==========================================
// 2. VIEW ROUTING LOGIC
// ==========================================
function selectRole(role) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    
    if (role === 'operator') {
        document.getElementById('operatorView').classList.add('active');
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
    if(eventSource) {
        eventSource.close();
    }
}

function generateUUID() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

    // Generate kode unik dan Topik Rahasia untuk Ntfy
    currentSessionId = generateUUID();
    ntfyTopic = "syncqr_" + currentSessionId.replace(/-/g, '');

    // Data dibikin sangat simpel: topiknya_apa|sessionId_nya_apa
    const qrData = `${ntfyTopic}|${currentSessionId}`;

    document.getElementById('operatorForm').classList.add('hidden');
    document.getElementById('operatorQR').classList.remove('hidden');

    document.getElementById("qrcodeBox").innerHTML = "";
    new QRCode(document.getElementById("qrcodeBox"), {
        text: qrData,
        width: 250,
        height: 250,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.L // Low agar lebih gampang discan
    });

    // Mulai mendengarkan jembatan Ntfy (Server-Sent Events)
    listenToNetwork(nama);

    // Mulai hitung mundur 5 menit otomatis
    startQRTimer(5 * 60);
}

function listenToNetwork(nama) {
    if(eventSource) {
        eventSource.close();
    }
    
    // Connect ke Ntfy.sh (API Publik Gratis, No API Key, Bebas NAT/Firewall)
    eventSource = new EventSource(`https://ntfy.sh/${ntfyTopic}/sse`);
    
    eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data); // data dikirim sebagai JSON dari server Ntfy
        
        if (data.event === 'message') {
            const payload = data.message;
            if (payload === currentSessionId) {
                // Success! Sinyal dari HP ditebak dengan benar!
                eventSource.close();
                clearQRTimer();

                document.getElementById('operatorQR').classList.add('hidden');
                const successView = document.getElementById('operatorSuccess');
                successView.classList.remove('hidden');
                document.getElementById('successMessageName').innerText = `${nama.toUpperCase()} BERHASIL ABSEN!`;
            }
        }
    };
    
    eventSource.onerror = (err) => {
        console.error("Koneksi Ntfy terputus, mencoba lagi otomatis...", err);
    };
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
            if(eventSource) eventSource.close();
            alert("Waktu scan QR sudah habis (5 Menit). Silakan Generate ulang.");
            resetOperator();
        }
    }, 1000);
}

function clearQRTimer() {
    if (qrInterval) clearInterval(qrInterval);
    if (qrTimeout) clearTimeout(qrTimeout);
    const timerDisplay = document.getElementById('qrTimer');
    if(timerDisplay) timerDisplay.innerText = "Waktu tersisa: 05:00";
}

function resetOperator() {
    clearQRTimer();
    if(eventSource) eventSource.close();
    
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
    document.getElementById('studentLoading').classList.add('hidden');
    document.getElementById('studentSuccess').classList.add('hidden');

    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: {width: 250, height: 250} },
        false
    );
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

async function onScanSuccess(decodedText, decodedResult) {
    html5QrcodeScanner.clear(); // Hentikan kamera
    
    // Tampilkan Animasi/Status Loading di HP!!
    document.getElementById('studentScanner').classList.add('hidden');
    document.getElementById('studentLoading').classList.remove('hidden');
    
    try {
        const parts = decodedText.split('|');
        if (parts.length !== 2) throw new Error("Format QR Tidak Valid");

        const scannedTopic = parts[0];
        const scannedSessionId = parts[1];

        // Tembak Server Publik Ntfy POST (Jauh lebih ampuh daripada PeerJS P2P)
        const response = await fetch(`https://ntfy.sh/${scannedTopic}`, {
            method: 'POST',
            body: scannedSessionId
        });

        if (response.ok) {
            // Berhasil diklik & sampai ke Laptop!
            document.getElementById('studentLoading').classList.add('hidden');
            document.getElementById('studentSuccess').classList.remove('hidden');
        } else {
            throw new Error("Gagal hit API publik");
        }
        
    } catch (error) {
        console.error(error);
        alert("Gagal koneksi! Pastikan jaringan internet stabil lalu coba lagi.");
        
        // Kembalikan ke scanner jika gagal
        document.getElementById('studentLoading').classList.add('hidden');
        resetStudent();
    }
}

function onScanFailure(error) {
    // Abaikan frame yang blur
}

function resetStudent() {
    startScanner();
}
