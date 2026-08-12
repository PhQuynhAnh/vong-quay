// BƯỚC 1: IMPORT THƯ VIỆN FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, orderBy, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// BƯỚC 2: CẤU HÌNH FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyC7Q0aO0DmqEKxgruEsQxpIwf5I0TR1afE",
    authDomain: "vong-quay-app.firebaseapp.com",
    projectId: "vong-quay-app",
    storageBucket: "vong-quay-app.firebasestorage.app",
    messagingSenderId: "69861968161",
    appId: "1:69861968161:web:35457b824b3cfb5e17d660"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// LẤY DỮ LIỆU TỪ LINK URL
const urlParams = new URLSearchParams(window.location.search);
const userRole = urlParams.get('role') || 'client'; 
const wheelIdParam = urlParams.get('id'); 

// BIẾN TOÀN CỤC
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];
let namesArray = [];
const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
let lastProcessedSpinId = null; 
let currentWheelId = wheelIdParam || null; 
let wheelUnsubscribe = null; 
let historyUnsubscribe = null; 

// THIẾT LẬP GIAO DIỆN KHI TRANG VỪA TẢI
window.onload = () => {
    const roleIndicator = document.getElementById('roleIndicator');
    
    if (userRole === 'viewer') {
        roleIndicator.textContent = "Chế độ: Người Xem";
        roleIndicator.className = "badge viewer";
        document.getElementById('wheelArea').style.display = 'block'; 
        
        if (currentWheelId) {
            document.getElementById('displayTitle').textContent = "Đang tải dữ liệu vòng quay...";
            startListeningToWheel(currentWheelId); 
            listenToHistory(currentWheelId); // Tải lịch sử CỦA RIÊNG VÒNG NÀY
        } else {
            document.getElementById('displayTitle').textContent = "Link không hợp lệ hoặc đã cũ!";
            drawWheelCanvas([]);
        }
    } else if (userRole === 'admin') {
        roleIndicator.textContent = "Chế độ: Quản Trị Viên";
        roleIndicator.className = "badge admin";
        listenToHistory(); // Quản trị viên tự động load toàn bộ "Sổ cái"
    } else {
        // CLIENT (QUẢN LÝ QUAY)
        roleIndicator.textContent = "Vai trò: Quản lý quay";
        roleIndicator.className = "badge client";
        document.getElementById('setupArea').style.display = 'block';
        document.getElementById('wheelArea').style.display = 'block';
        document.getElementById('btnSpin').style.display = 'block';
        document.getElementById('resultBox').style.display = 'none';

        drawWheelCanvas([]); 
        document.getElementById('historyList').innerHTML = '<p style="text-align: center; color: #7f8c8d;">Hãy tạo vòng quay để bắt đầu.</p>';
    }
};

// 1. TÍNH NĂNG GHI HÌNH
document.getElementById('btnRecord')?.addEventListener('click', async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        const confirmRecord = confirm(
            "⚠️ YÊU CẦU MINH BẠCH:\n\n" +
            "Trình duyệt điện thoại không cho phép tự quay video. Để đảm bảo công bằng, bạn hãy:\n" +
            "1. Vuốt màn hình điện thoại xuống.\n" +
            "2. Bật công cụ [Quay màn hình] của máy.\n" +
            "3. Sau khi chắc chắn ĐÃ BẬT, hãy bấm 'OK' ở đây để tiếp tục."
        );
        
        if (confirmRecord) {
            document.getElementById('btnRecord').innerText = "📱 Đã cam kết bật quay màn hình ngoài";
            document.getElementById('btnRecord').style.border = "2px solid #10b981";
            document.getElementById('btnRecord').style.color = "#10b981";
            document.getElementById('btnRecord').style.backgroundColor = "#d1fae5";
            document.getElementById('recordStatus').innerText = "Hãy giữ video trong máy để làm bằng chứng.";
            document.getElementById('btnCreateWheel').disabled = false; 
        }
        return; 
    }

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { displaySurface: "browser" },
            preferCurrentTab: true 
        });
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
        alert("Bạn phải cho phép ghi hình thì mới tiếp tục được!");
    }
});

// 2. TẠO VÒNG QUAY 
document.getElementById('btnCreateWheel')?.addEventListener('click', async () => {
    const title = document.getElementById('wheelTitle').value || "Vòng quay ngẫu nhiên";
    const namesStr = document.getElementById('nameList').value;
    namesArray = namesStr.split('\n').map(n => n.trim()).filter(n => n !== "");

    if (namesArray.length < 2) {
        alert("Vui lòng nhập ít nhất 2 tên.");
        return;
    }

    currentWheelId = "wheel_" + new Date().getTime();

    await setDoc(doc(db, "wheels", currentWheelId), {
        title: title,
        names: namesArray,
        isSpinning: false,
        winnerIndex: -1,
        timestamp: new Date().getTime()
    });

    document.getElementById('shareArea').style.display = 'block';
    
    startListeningToWheel(currentWheelId);
    listenToHistory(currentWheelId); 
});

// Copy Link 
document.getElementById('btnCopyLink')?.addEventListener('click', () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const viewerUrl = baseUrl + "?role=viewer&id=" + currentWheelId;
    
    navigator.clipboard.writeText(viewerUrl).then(() => {
        alert("✅ Đã copy link!\nLưu ý: Link này CHỈ DÀNH RIÊNG cho vòng quay hiện tại và kết quả sẽ lưu vĩnh viễn ở link này.");
    });
});

// 3. THỰC HIỆN QUAY
document.getElementById('btnSpin')?.addEventListener('click', async () => {
    if (namesArray.length < 2 || !currentWheelId) return;
    
    const btnSpin = document.getElementById('btnSpin');
    btnSpin.disabled = true;
    btnSpin.innerText = "ĐANG QUAY...";
    document.getElementById('resultBox').style.display = 'none';

    const winnerIndex = Math.floor(Math.random() * namesArray.length);

    await updateDoc(doc(db, "wheels", currentWheelId), {
        isSpinning: true,
        winnerIndex: winnerIndex,
        spinId: new Date().getTime() 
    });
});

// 4. LẮNG NGHE & VẼ VÒNG QUAY
function startListeningToWheel(wheelId) {
    if (wheelUnsubscribe) wheelUnsubscribe(); 

    wheelUnsubscribe = onSnapshot(doc(db, "wheels", wheelId), (snapshot) => {
        if (!snapshot.exists()) {
            document.getElementById('displayTitle').textContent = "Vòng quay không tồn tại!";
            return;
        }
        
        const data = snapshot.data();
        namesArray = data.names || [];
        document.getElementById('displayTitle').textContent = data.title;
        drawWheelCanvas(namesArray);

        if (data.isSpinning && data.spinId !== lastProcessedSpinId) {
            lastProcessedSpinId = data.spinId; 
            triggerSpinAnimation(data.winnerIndex, data.spinId, data.title);
        }
    });
}

function drawWheelCanvas(names) {
    const canvas = document.getElementById('wheel');
    if (!canvas.getContext) return; 
    
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
            btnSpin.innerText = "🔒 ĐÃ KHÓA KẾT QUẢ"; 
            btnSpin.disabled = true; 
            
            if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                isRecording = false;
                document.getElementById('btnRecord').innerText = "🎥 Video Đang Tải Xuống";
            }

            // GHI CHÉP KÉP: 1. Lưu vào thư mục riêng của vòng quay này
            await setDoc(doc(db, "wheels", currentWheelId, "history", String(spinId)), {
                title: title,
                winner: winnerName,
                time: new Date().getTime()
            });

            // GHI CHÉP KÉP: 2. Lưu thêm một bản vào sổ cái chung (để Admin dễ soi)
            await setDoc(doc(db, "history", String(spinId)), {
                title: title,
                winner: winnerName,
                time: new Date().getTime(),
                wheelId: currentWheelId // Đánh dấu xuất xứ vòng quay
            });
        }
    }, 5000);
}

// 5. HIỂN THỊ LỊCH SỬ ĐỘC LẬP / SỔ CÁI
function listenToHistory(wheelId) {
    if (historyUnsubscribe) historyUnsubscribe(); 

    let q;
    if (userRole === 'admin') {
        // Admin xem sổ cái tổng (tất cả các vòng quay)
        q = query(collection(db, "history"), orderBy("time", "desc"));
    } else {
        // Người xem và Client chỉ xem lịch sử của riêng vòng quay hiện tại
        if (!wheelId) return;
        q = query(collection(db, "wheels", wheelId, "history"), orderBy("time", "desc"));
    }
    
    historyUnsubscribe = onSnapshot(q, (snapshot) => {
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
                const wId = data.wheelId || '';
                htmlContent += `<button class="btn-delete" onclick="deleteHistory('${wId}', '${docSnap.id}')">Xóa</button>`;
            }

            div.innerHTML = htmlContent;
            historyList.appendChild(div);
        });
    });
}

// XÓA ĐỒNG BỘ Ở CẢ HAI NƠI
window.deleteHistory = async (wId, hId) => {
    if (confirm("Chắc chắn xóa kết quả này?")) {
        await deleteDoc(doc(db, "history", hId)); // Xóa ở sổ cái chung
        if (wId && wId !== 'undefined') {
            await deleteDoc(doc(db, "wheels", wId, "history", hId)); // Xóa ở vòng quay con
        }
    }
};