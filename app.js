// Global Variables
let currentSessionId = null;
let html5QrcodeScanner = null;
let pollingInterval = null;

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
    if (pollingInterval) clearInterval(pollingInterval);
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
async function generateQR() {
    const nama = document.getElementById('nama').value.trim();
    const nim = document.getElementById('nim').value.trim();
    const prodi = document.getElementById('prodi').value.trim();

    if (!nama || !nim) {
        alert("Nama dan NIM wajib diisi!");
        return;
    }

    currentSessionId = generateUUID();

    const sessionData = {
        id: currentSessionId,
        nama: nama,
        nim: nim,
        prodi: prodi
    };

    try {
        const response = await fetch('/api/post-qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });

        if (response.ok) {
            document.getElementById('operatorForm').classList.add('hidden');
            document.getElementById('operatorQR').classList.remove('hidden');

            document.getElementById("qrcodeBox").innerHTML = "";
            new QRCode(document.getElementById("qrcodeBox"), {
                text: currentSessionId,
                width: 250,
                height: 250,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });

            // Mulai Polling
            listenToStatus(currentSessionId, nama);
        } else {
            alert("Gagal koneksi ke server lokal.");
        }
    } catch (e) {
        console.error(e);
        alert("Terjadi kesalahan jaringan.");
    }
}

function listenToStatus(sessionId, nama) {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/status?id=' + sessionId);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'success') {
                    clearInterval(pollingInterval);
                    document.getElementById('operatorQR').classList.add('hidden');
                    const successView = document.getElementById('operatorSuccess');
                    successView.classList.remove('hidden');
                    document.getElementById('successMessageName').innerText = `${nama.toUpperCase()} BERHASIL ABSEN!`;
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, 1500); // Cek tiap 1.5 detik
}

function resetOperator() {
    document.getElementById('operatorForm').classList.remove('hidden');
    document.getElementById('operatorQR').classList.add('hidden');
    document.getElementById('operatorSuccess').classList.add('hidden');
    
    document.getElementById('nama').value = '';
    document.getElementById('nim').value = '';
    document.getElementById('prodi').value = '';
    
    if (pollingInterval) clearInterval(pollingInterval);
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

async function onScanSuccess(decodedText, decodedResult) {
    const scannedSessionId = decodedText;
    html5QrcodeScanner.clear();

    try {
        const response = await fetch(`/api/scan?id=${scannedSessionId}`);
        if (response.ok) {
            document.getElementById('studentScanner').classList.add('hidden');
            document.getElementById('studentSuccess').classList.remove('hidden');
        } else {
            alert("Sesi QR tidak valid atau kadaluarsa.");
            resetStudent();
        }
    } catch (error) {
        console.error("Error updating status: ", error);
        alert("Gagal update status.");
        resetStudent();
    }
}

function onScanFailure(error) {
    // Ignore scan failures
}

function resetStudent() {
    startScanner();
}
