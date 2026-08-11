// BƯỚC 1: IMPORT THƯ VIỆN FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// BƯỚC 2: CẤU HÌNH FIREBASE (Tôi đã điền sẵn cho bạn rồi)
const firebaseConfig = {
    apiKey: "AIzaSyC7Q0aO0DmqEKxgruEsQxpIwf5I0TR1afE",
    authDomain: "vong-quay-app.firebaseapp.com",
    projectId: "vong-quay-app",
    storageBucket: "vong-quay-app.firebasestorage.app",
    messagingSenderId: "69861968161",
    appId: "1:69861968161:web:35457b824b3cfb5e17d660"
};

// KHỞI TẠO FIREBASE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// XÁC ĐỊNH VAI TRÒ DỰA VÀO ĐƯỜNG LINK (URL)
const urlParams = new URLSearchParams(window.location.search);
const userRole = urlParams.get('role') || 'client'; // Mặc định là client (Mẹ bạn)

// BIẾN TOÀN CỤC
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];
let namesArray = [];
const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
let lastProcessedSpinId = null; // Chốt chặn lỗi lưu đúp 2 lần

// THIẾT LẬP GIAO DIỆN THEO VAI TRÒ KHI TRANG VỪA TẢI
window.onload = () => {
    const roleIndicator = document.getElementById('roleIndicator');
    
    if (userRole === 'viewer') {
        roleIndicator.textContent = "Chế độ: Người Xem";
        roleIndicator.className = "badge viewer";
        document.getElementById('wheelArea').style.display = 'block'; 
        document.getElementById('displayTitle').textContent = "Đang chờ thiết lập...";
    } else if (userRole === 'admin') {
        roleIndicator.textContent = "Chế độ: Quản Trị Viên";
        roleIndicator.className = "badge admin";
    } else {
        // Chế độ Client (Mẹ bạn)
        roleIndicator.textContent = "Vai trò: Quản lý quay";
        roleIndicator.className = "badge client";
        document.getElementById('setupArea').style.display = 'block';
        document.getElementById('wheelArea').style.display = 'block';
        document.getElementById('btnSpin').style.display = 'block';
        document.getElementById('resultBox').style.display = 'none';

        // TỰ ĐỘNG RESET VÒNG QUAY TRÊN MÁY CHỦ KHI MẸ BẠN F5
        setDoc(doc(db, "app_data", "current_wheel"), {
            title: "Đang chờ thiết lập...",
            names: [],
            isSpinning: false,
            winnerIndex: -1,
            timestamp: new Date().getTime()
        });
    }

    listenToWheelState();
    listenToHistory();
};

// 1. TÍNH NĂNG GHI HÌNH (DÀNH CHO CLIENT)
// 1. TÍNH NĂNG GHI HÌNH (DÀNH CHO CLIENT)
document.getElementById('btnRecord')?.addEventListener('click', async () => {
    // KIỂM TRA: Nếu là trình duyệt điện thoại (không hỗ trợ getDisplayMedia) thì cho qua
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Tính năng tự quay màn hình không hoạt động trên điện thoại. Hệ thống sẽ đặc cách mở khóa vòng quay!");
        
        document.getElementById('btnRecord').innerText = "📱 Điện Thoại: Đã Bỏ Qua Ghi Hình";
        document.getElementById('btnRecord').style.border = "2px solid #10b981"; // Màu xanh lá
        document.getElementById('btnRecord').style.color = "#10b981";
        document.getElementById('btnRecord').style.backgroundColor = "#d1fae5";
        document.getElementById('recordStatus').innerText = "Đã bỏ qua yêu cầu ghi hình trên thiết bị di động.";
        document.getElementById('btnCreateWheel').disabled = false; // Mở khóa nút tạo vòng quay
        return; // Dừng tại đây, không chạy các lệnh quay màn hình bên dưới nữa
    }

    // Nếu là máy tính thì bắt buộc chạy ghi hình bình thường
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Lich_Su_Quay_${new Date().getTime()}.webm`;
            a.click();
            recordedChunks = [];
        };

        mediaRecorder.start();
        isRecording = true;
        
        document.getElementById('btnRecord').innerText = "🔴 Đang Ghi Hình Màn Hình...";
        document.getElementById('btnRecord').style.border = "2px solid #ef4444";
        document.getElementById('btnRecord').style.backgroundColor = "#fee2e2";
        document.getElementById('recordStatus').innerText = "Đã bật ghi hình. Bạn có thể thao tác.";
        document.getElementById('btnCreateWheel').disabled = false;

    } catch (err) {
        alert("Trên máy tính, bạn phải cho phép ghi hình thì mới tiếp tục được để đảm bảo minh bạch!");
    }
});

// 2. TẠO LINK VÀ CẬP NHẬT VÒNG QUAY (DÀNH CHO CLIENT)
document.getElementById('btnCreateWheel')?.addEventListener('click', async () => {
    const title = document.getElementById('wheelTitle').value || "Vòng quay ngẫu nhiên";
    const namesStr = document.getElementById('nameList').value;
    namesArray = namesStr.split('\n').map(n => n.trim()).filter(n => n !== "");

    if (namesArray.length < 2) {
        alert("Vui lòng nhập ít nhất 2 tên.");
        return;
    }

    await setDoc(doc(db, "app_data", "current_wheel"), {
        title: title,
        names: namesArray,
        isSpinning: false,
        winnerIndex: -1,
        timestamp: new Date().getTime()
    });

    document.getElementById('shareArea').style.display = 'block';
});

// Nút Copy Link Người Xem
document.getElementById('btnCopyLink')?.addEventListener('click', () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const viewerUrl = baseUrl + "?role=viewer";
    
    navigator.clipboard.writeText(viewerUrl).then(() => {
        alert("✅ Đã copy link thành công!\nMẹ bạn hãy dán gửi link này vào nhóm Zalo cho mọi người xem nhé.");
    });
});

// 3. THỰC HIỆN QUAY
document.getElementById('btnSpin')?.addEventListener('click', async () => {
    if (namesArray.length < 2) return;
    
    const btnSpin = document.getElementById('btnSpin');
    btnSpin.disabled = true;
    btnSpin.innerText = "ĐANG QUAY...";
    document.getElementById('resultBox').style.display = 'none';

    const winnerIndex = Math.floor(Math.random() * namesArray.length);

    await setDoc(doc(db, "app_data", "current_wheel"), {
        title: document.getElementById('displayTitle').innerText,
        names: namesArray,
        isSpinning: true,
        winnerIndex: winnerIndex,
        spinId: new Date().getTime() 
    });
});

// 4. LẮNG NGHE DỮ LIỆU
function listenToWheelState() {
    onSnapshot(doc(db, "app_data", "current_wheel"), (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        
        namesArray = data.names || [];
        document.getElementById('displayTitle').textContent = data.title;
        drawWheelCanvas(namesArray);

        // Kích hoạt hiệu ứng xoay (Có chốt chặn)
        if (data.isSpinning && data.spinId !== lastProcessedSpinId) {
            lastProcessedSpinId = data.spinId; 
            triggerSpinAnimation(data.winnerIndex, data.spinId, data.title);
        }
    });
}

// Vẽ Vòng Quay
function drawWheelCanvas(names) {
    const canvas = document.getElementById('wheel');
    if (!canvas.getContext) return; 
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // NẾU CHƯA CÓ DỮ LIỆU
    if (!names || names.length === 0) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#e2e8f0"; 
        ctx.fill();
        
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#64748b";
        ctx.font = "bold 20px 'Segoe UI', sans-serif";
        ctx.fillText("CHƯA CÓ DỮ LIỆU", centerX, centerY);
        
        canvas.style.transition = "none"; 
        canvas.style.transform = `rotate(0deg)`;
        return;
    }

    // NẾU CÓ DỮ LIỆU
    const step = (2 * Math.PI) / names.length;
    let currentAngle = -Math.PI / 2; 

    for (let i = 0; i < names.length; i++) {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + step);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(currentAngle + step / 2); 
        
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px 'Segoe UI', sans-serif";
        
        let text = names[i];
        if(text.length > 15) text = text.substring(0, 15) + '...';
        
        ctx.fillText(text, radius - 20, 0);
        ctx.restore();

        currentAngle += step;
    }
    
    canvas.style.transition = "none"; 
    canvas.style.transform = `rotate(0deg)`;
}

// Xử lý hiệu ứng quay & Lưu kết quả
function triggerSpinAnimation(winnerIndex, spinId, title) {
    const wheel = document.getElementById('wheel');
    const step = 360 / namesArray.length;
    
    const targetAngle = (winnerIndex * step) + (step / 2);
    const spinDegrees = (360 * 5) + (360 - targetAngle); 
    
    wheel.style.transition = "transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
    wheel.style.transform = `rotate(${spinDegrees}deg)`;

    setTimeout(async () => {
        const winnerName = namesArray[winnerIndex];
        
        const resultBox = document.getElementById('resultBox');
        resultBox.style.display = 'block';
        resultBox.innerText = `🎉 KẾT QUẢ: ${winnerName}`;
        
        if (userRole === 'client') {
            const btnSpin = document.getElementById('btnSpin');
            btnSpin.innerText = "🔒 ĐÃ KHÓA KẾT QUẢ"; // Đổi chữ thông báo khóa
            btnSpin.disabled = true; // Khóa cứng nút, không cho bấm nữa
            
            if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                isRecording = false;
                document.getElementById('btnRecord').innerText = "🎥 Video Đang Tải Xuống";
            }

            // LƯU LỊCH SỬ BẰNG CÁCH GHI ĐÈ ĐỂ TRÁNH TRÙNG LẶP
            await setDoc(doc(db, "history", String(spinId)), {
                title: title,
                winner: winnerName,
                time: new Date().getTime()
            });
        }
    }, 5000);
}

// 5. HIỂN THỊ LỊCH SỬ 
function listenToHistory() {
    const q = query(collection(db, "history"), orderBy("time", "desc"));
    onSnapshot(q, (snapshot) => {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = ''; 
        
        if (snapshot.empty) {
            historyList.innerHTML = '<p style="text-align: center; color: #7f8c8d;">Chưa có lượt quay nào.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const timeString = new Date(data.time).toLocaleString('vi-VN');
            
            const div = document.createElement('div');
            div.className = 'history-item';
            
            let htmlContent = `
                <div>
                    <strong>${data.title}</strong><br>
                    <span>Người trúng: <b style="color: #ef4444;">${data.winner}</b></span>
                </div>
                <div style="text-align: right;">
                    <span class="history-time">${timeString}</span>
                </div>
            `;

            if (userRole === 'admin') {
                htmlContent += `<button class="btn-delete" onclick="deleteHistory('${docSnap.id}')">Xóa</button>`;
            }

            div.innerHTML = htmlContent;
            historyList.appendChild(div);
        });
    });
}

window.deleteHistory = async (id) => {
    if (confirm("Chắc chắn xóa kết quả này?")) {
        await deleteDoc(doc(db, "history", id));
    }
};