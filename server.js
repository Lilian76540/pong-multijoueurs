const socket = io();

let state = null;
let roomId = null;
let role = null;

// =====================
// 🎮 ELEMENTS HTML
// =====================
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const input = document.getElementById("roomCode");
const button = document.getElementById("playBtn");
const status = document.getElementById("status");

// canvas taille
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// =====================
// 🚪 REJOINDRE SALON
// =====================
button.addEventListener("click", () => {
    if (!input.value) return;

    roomId = input.value;

    socket.emit("createRoom", roomId);

    status.innerText = "Connexion au serveur...";
});

// =====================
// 🔌 EVENTS SOCKET
// =====================

// quand on rejoint la room
socket.on("joined", (data) => {
    role = data.role;

    console.log("JOINED:", data);

    status.innerText = "En attente d’un autre joueur...";
});

// erreur serveur
socket.on("errorMsg", (msg) => {
    alert(msg);
});

// état du jeu
socket.on("state", (s) => {
    state = s;

    // ⚡ gestion du texte "en attente"
    if (!state.started) {
        status.innerText = "En attente d’un autre joueur...";
        return;
    }

    if (state.winner) {
        if (state.winner === "left") {
            status.innerText = "Joueur gauche gagne 🎉";
        } else {
            status.innerText = "Joueur droite gagne 🎉";
        }
        return;
    }

    status.innerText = "En jeu 🎮";
});

// =====================
// 🎮 CONTROLES
// =====================
document.addEventListener("mousemove", (e) => {
    if (!roomId) return;

    let y = e.clientY / window.innerHeight;

    socket.emit("movePaddle", { y });
});

// =====================
// 🎨 GAME LOOP
// =====================
function loop() {
    requestAnimationFrame(loop);

    if (!state) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // =====================
    // ⚽ BALL
    // =====================
    ctx.fillStyle = "white";
    ctx.fillRect(
        state.ball.x * canvas.width,
        state.ball.y * canvas.height,
        10,
        10
    );

    // =====================
    // 🧱 PADDLES
    // =====================
    const paddleHeight = 120;

    // gauche
    ctx.fillRect(
        20,
        state.paddles.left * canvas.height - paddleHeight / 2,
        10,
        paddleHeight
    );

    // droite
    ctx.fillRect(
        canvas.width - 30,
        state.paddles.right * canvas.height - paddleHeight / 2,
        10,
        paddleHeight
    );

    // =====================
    // 🏆 SCORE
    // =====================
    ctx.fillStyle = "white";
    ctx.font = "30px Arial";

    ctx.fillText(state.score.left, canvas.width / 2 - 60, 50);
    ctx.fillText(state.score.right, canvas.width / 2 + 40, 50);
}

loop();