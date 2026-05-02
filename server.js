const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let rooms = {};

// 🧠 RAQUETTE EXACTE (plus précise)
const PADDLE_HEIGHT = 0.18; // ↓ légèrement réduit pour corriger "trop grand"
const PADDLE_HALF = PADDLE_HEIGHT / 2;

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
        flashTime: 0,
        scoredLock: false,
        firstServe: Math.random() > 0.5 ? "left" : "right",
        ready: {}
    };
}

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

io.on("connection", (socket) => {

    socket.on("createRoom", (roomId) => {
        if (!roomId) return;

        if (!rooms[roomId]) createRoom(roomId);

        let r = rooms[roomId];

        if (r.players.length >= 2) {
            socket.emit("errorMsg", "Salon plein");
            return;
        }

        r.players.push(socket.id);
        socket.join(roomId);
        socket.roomId = roomId;

        socket.emit("joined", {
            roomId,
            role: r.players.length === 1 ? "left" : "right"
        });

        if (r.players.length === 2) {
            r.started = true;
            resetBall(r, null);
        }
    });

    socket.on("movePaddle", (data) => {
        const r = rooms[socket.roomId];
        if (!r) return;

        const y = Math.max(0, Math.min(1, data.y));

        if (r.players[0] === socket.id) r.paddles.left = y;
        if (r.players[1] === socket.id) r.paddles.right = y;
    });

    socket.on("restartGame", () => {
        const r = rooms[socket.roomId];
        if (!r) return;

        r.ready[socket.id] = true;

        if (Object.keys(r.ready).length === r.players.length) {
            r.score.left = 0;
            r.score.right = 0;
            r.winner = null;
            r.ready = {};
            resetBall(r, null);
        }
    });
});

setInterval(() => {
    for (let id in rooms) {
        let r = rooms[id];
        let b = r.ball;

        if (!r.started || r.winner) {
            io.to(id).emit("state", r);
            continue;
        }

        const speedUp = 1.03;
        const maxSpeed = 0.02;

        // mouvement
        b.x += b.vx;
        b.y += b.vy;

        // rebonds
        if (b.y <= 0) { b.y = 0; b.vy *= -1; }
        if (b.y >= 1) { b.y = 1; b.vy *= -1; }

        // 🧱 HITBOX PLUS PRÉCISE (corrige "trop grande")
        const margin = 0.02; // 🔥 zone réelle de collision réduite

        if (
            b.x <= 0.03 &&
            b.y >= r.paddles.left - PADDLE_HALF + margin &&
            b.y <= r.paddles.left + PADDLE_HALF - margin
        ) {
            b.x = 0.03;
            b.vx = Math.abs(b.vx) * speedUp;
        }

        if (
            b.x >= 0.97 &&
            b.y >= r.paddles.right - PADDLE_HALF + margin &&
            b.y <= r.paddles.right + PADDLE_HALF - margin
        ) {
            b.x = 0.97;
            b.vx = -Math.abs(b.vx) * speedUp;
        }

        // limite vitesse
        b.vx = Math.max(-maxSpeed, Math.min(maxSpeed, b.vx));
        b.vy = Math.max(-maxSpeed, Math.min(maxSpeed, b.vy));

        // score gauche
        if (b.x < 0 && !r.scoredLock) {
            r.score.right++;
            r.flashTime = Date.now();
            r.scoredLock = true;
            resetBall(r, "right");
        }

        // score droite
        if (b.x > 1 && !r.scoredLock) {
            r.score.left++;
            r.flashTime = Date.now();
            r.scoredLock = true;
            resetBall(r, "left");
        }

        if (b.x > 0.1 && b.x < 0.9) {
            r.scoredLock = false;
        }

        if (r.score.left >= 10) r.winner = "left";
        if (r.score.right >= 10) r.winner = "right";

        io.to(id).emit("state", r);
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
    console.log("Serveur lancé sur le port " + PORT);
});