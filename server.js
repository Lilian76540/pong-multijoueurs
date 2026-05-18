const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// =====================
// 🔌 SOCKET IO
// =====================
const io = new Server(server, {
    transports: ["websocket", "polling"]
});

// Render tuning
io.engine.opts.pingTimeout = 5000;
io.engine.opts.pingInterval = 2000;

app.use(express.static("public"));

// =====================
// 🧠 ROOMS
// =====================
let rooms = {};

// =====================
const PADDLE_HEIGHT = 0.18;
const PADDLE_HALF = PADDLE_HEIGHT / 2;

// =====================
// 🎮 CREATE ROOM
// =====================
function createRoom(id) {
    rooms[id] = {
        players: [],
        ball: {
            x: 0.5,
            y: 0.5,
            vx: 0,
            vy: 0
        },
        paddles: {
            left: 0.5,
            right: 0.5
        },
        score: {
            left: 0,
            right: 0
        },
        winner: null,
        started: false,
        scoredLock: false,
        firstServe: Math.random() > 0.5 ? "left" : "right"
    };
}

// =====================
// ⚽ RESET BALL
// =====================
function resetBall(r, last) {
    r.ball.x = 0.5;
    r.ball.y = 0.5;

    let dir = (!last)
        ? (r.firstServe === "left" ? -1 : 1)
        : (last === "left" ? 1 : -1);

    const baseSpeed = 0.006;

    r.ball.vx = baseSpeed * dir;
    r.ball.vy = baseSpeed * (Math.random() > 0.5 ? 1 : -1);

    r.scoredLock = false;
}

// =====================
// 🔌 SOCKET CONNECTION
// =====================
io.on("connection", (socket) => {

    // =====================
    // CREATE / JOIN ROOM
    // =====================
    socket.on("createRoom", (roomId) => {
        if (!roomId) return;

        if (!rooms[roomId]) createRoom(roomId);

        let r = rooms[roomId];

        // éviter doublons
        if (!r.players.includes(socket.id)) {
            r.players.push(socket.id);
        }

        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit("joined", {
            roomId,
            role: r.players[0] === socket.id ? "left" : "right"
        });

        console.log("ROOM:", roomId, "PLAYERS:", r.players.length);

        // START GAME
        if (r.players.length === 2) {
            r.started = true;
            resetBall(r, null);
        }
    });

    // =====================
    // MOVE PADDLE
    // =====================
    socket.on("movePaddle", (data) => {
        const r = rooms[socket.roomId];
        if (!r) return;

        const y = Math.max(0, Math.min(1, data.y));

        if (r.players[0] === socket.id) r.paddles.left = y;
        if (r.players[1] === socket.id) r.paddles.right = y;
    });

    // =====================
    // RESTART GAME
    // =====================
    socket.on("restartGame", () => {
        const r = rooms[socket.roomId];
        if (!r) return;

        r.score.left = 0;
        r.score.right = 0;
        r.winner = null;
        resetBall(r, null);
    });

    // =====================
    // DISCONNECT CLEAN
    // =====================
    socket.on("disconnect", () => {
        const roomId = socket.roomId;
        if (!roomId || !rooms[roomId]) return;

        let r = rooms[roomId];

        r.players = r.players.filter(id => id !== socket.id);

        if (r.players.length === 0) {
            delete rooms[roomId];
        }
    });
});

// =====================
// 🎮 GAME LOOP
// =====================
setInterval(() => {
    for (let id in rooms) {
        let r = rooms[id];
        let b = r.ball;

        if (!r.started || r.winner) {
            io.to(id).emit("state", {
                ball: r.ball,
                paddles: r.paddles,
                score: r.score,
                winner: r.winner,
                started: r.started
            });
            continue;
        }

        const speedUp = 1.08;
        const maxSpeed = 4.0;

        // movement
        b.x += b.vx;
        b.y += b.vy;

        // bounce top/bottom
        if (b.y <= 0) { b.y = 0; b.vy *= -1; }
        if (b.y >= 1) { b.y = 1; b.vy *= -1; }

        const margin = 0.02;

        // left paddle
        if (
            b.x <= 0.03 &&
            b.y >= r.paddles.left - PADDLE_HALF + margin &&
            b.y <= r.paddles.left + PADDLE_HALF - margin
        ) {
            b.x = 0.03;
            b.vx = Math.abs(b.vx) * speedUp;
        }

        // right paddle
        if (
            b.x >= 0.97 &&
            b.y >= r.paddles.right - PADDLE_HALF + margin &&
            b.y <= r.paddles.right + PADDLE_HALF - margin
        ) {
            b.x = 0.97;
            b.vx = -Math.abs(b.vx) * speedUp;
        }

        // limit speed
        b.vx = Math.max(-maxSpeed, Math.min(maxSpeed, b.vx));
        b.vy = Math.max(-maxSpeed, Math.min(maxSpeed, b.vy));

        // score left
        if (b.x < 0 && !r.scoredLock) {
            r.score.right++;
            r.scoredLock = true;
            resetBall(r, "right");
        }

        // score right
        if (b.x > 1 && !r.scoredLock) {
            r.score.left++;
            r.scoredLock = true;
            resetBall(r, "left");
        }

        if (b.x > 0.1 && b.x < 0.9) {
            r.scoredLock = false;
        }

        if (r.score.left >= 10) r.winner = "left";
        if (r.score.right >= 10) r.winner = "right";

        // SEND STATE
        io.to(id).emit("state", {
            ball: r.ball,
            paddles: r.paddles,
            score: r.score,
            winner: r.winner,
            started: r.started
        });
    }
}, 1000 / 30);

// =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});