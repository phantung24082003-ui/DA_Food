require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const axios = require('axios');
const mongoose = require('mongoose');

const connectDB = require('./db');
connectDB();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
let history = [];

/* ---------------- REST endpoints ---------------- */
app.get('/history', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    // Chỉ trả về tin nhắn của user đó
    const userHistory = history.filter(msg => msg.userId === userId);
    res.json(userHistory);
});

app.post('/history', (req, res) => {
    const msg = req.body;
    // Cần đảm bảo msg có userId
    if (!msg || !msg.text || !msg.userId) return res.status(400).json({ error: 'invalid message or missing userId' });
    history.push(msg);
    res.status(201).json(msg);
});

/* ---------------- SOCKET.IO events ---------------- */
io.on('connection', (socket) => {
    console.log(' user connected', socket.id);

    socket.on('message', async (payload) => {
        console.log(' message received', payload);

        io.emit('message', payload);
        history.push({ ...payload, id: Date.now() });

        if (payload.isBotRequest) {
            try {
                // CẬP NHẬT: Truyền thêm userId vào hàm xử lý
                const botReply = await handleBotReply(payload.text, payload.userId);

                const botMsg = {
                    text: botReply,
                    from: 'bot',
                    to: payload.from, // ID user nhận
                    userId: payload.userId, // Gán userId để lưu vào history cho đúng người
                    id: Date.now() + 1,
                    timestamp: new Date().toISOString()
                };

                io.emit('message', botMsg);
                history.push(botMsg);
            } catch (err) {
                console.error(' bot error', err?.message || err);
            }
        }
    });

    socket.on('disconnect', () => console.log(' user disconnected', socket.id));
});

/* ---------------- BOT HANDLER ---------------- */
const Food = require('./foodModel');
const { Recipe } = require('./recipeModel');

// CẬP NHẬT: Nhận thêm tham số userId
async function handleBotReply(userText, userId) {
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityKey) return " Chưa cấu hình PERPLEXITY_API_KEY trong .env.";

    // Kiểm tra nếu thiếu userId (đề phòng)
    if (!userId) return "Lỗi: Không xác định được danh tính người dùng.";

    try {
        const lower = userText.toLowerCase();
        let foods = [];
        let prompt = "";

        /* Liệt kê thực phẩm trong tủ lạnh */
        if (
            lower.includes("liệt kê") ||
            lower.includes("có gì") ||
            lower.includes("thực phẩm còn") ||
            lower.includes("trong tủ lạnh") ||
            lower.includes("còn những gì")
        ) {
            // CẬP NHẬT: Chỉ tìm thực phẩm của User này
            foods = await Food.find({ status: "available", userId: userId });

            if (!foods.length) {
                return "Tủ lạnh của bạn hiện không còn thực phẩm nào.";
            }

            let list = "Dưới đây là các thực phẩm hiện có trong tủ của bạn:\n";
            for (const f of foods) {
                const expiry = f.expiryDate
                    ? new Date(f.expiryDate).toLocaleDateString("vi-VN")
                    : "Không rõ";
                list += `- ${f.name}, còn ${f.quantity}, HSD: ${expiry}\n`;
            }
            return list;
        }

        /* Gợi ý món ăn hoặc công thức */
        if (
            lower.includes("thực đơn") ||
            lower.includes("món ăn") ||
            lower.includes("nấu được gì") ||
            lower.includes("công thức") ||
            lower.includes("recipe")
        ) {
            // CẬP NHẬT: Chỉ lấy nguyên liệu của User này
            const foods = await Food.find({ status: "available", userId: userId });

            if (!foods.length) {
                return "Tủ lạnh của bạn trống trơn, mình không thể gợi ý món ăn.";
            }

            const normalize = (text) => text.trim().toLowerCase();
            const userIngredients = foods.map(f => normalize(f.name));

            // CẬP NHẬT: Recipe lấy TOÀN BỘ (Global) - Không cần lọc userId
            const recipes = await Recipe.find();

            // So khớp nguyên liệu
            const matches = recipes
                .map(r => {
                    const recipeIngs = r.ingredients.map(i => normalize(i.name));
                    const matched = recipeIngs.filter(i => userIngredients.includes(i));
                    const score = matched.length / recipeIngs.length;
                    return { recipe: r, matched, score };
                })
                .filter(r => r.score >= 0.3)
                .sort((a, b) => b.score - a.score);

            // Nếu không có món phù hợp trong recipe → gợi ý thực đơn phổ biến
            if (!matches.length) {
                // Logic gợi ý món phổ biến (giữ nguyên)
                const commonSuggestions = {
                    "trứng": ["Trứng chiên", "Trứng luộc", "Trứng hấp thịt", "Trứng xào cà chua"],
                    "táo": ["Salad táo", "Táo dầm sữa chua", "Bánh táo nướng"],
                    "gà": ["Gà kho gừng", "Gà chiên mắm", "Gà nướng mật ong"],
                    "cá": ["Cá kho tộ", "Cá chiên giòn", "Canh chua cá"],
                    "thịt": ["Thịt kho trứng", "Thịt rang cháy cạnh", "Thịt xào rau củ"]
                };

                let suggestions = [];
                for (const ing of userIngredients) {
                    if (commonSuggestions[ing]) {
                        suggestions.push(...commonSuggestions[ing]);
                    }
                }

                if (suggestions.length) {
                    return `Mình chưa tìm thấy công thức phù hợp, nhưng với nguyên liệu của bạn, có thể thử:\n${suggestions.map(s => "• " + s).join("\n")}`;
                }
                return "Hiện không tìm thấy món ăn phù hợp với nguyên liệu của bạn.";
            }

            // Trả về kết quả khớp recipe
            let reply = "Dưới đây là các món bạn có thể nấu với nguyên liệu hiện có:";

            // Duyệt qua tối đa 5 món phù hợp nhất
            matches.slice(0, 5).forEach(m => {
                const normalize = (text) => text.trim().toLowerCase(); // Đảm bảo hàm này có sẵn
                const recipeIngs = m.recipe.ingredients.map(i => normalize(i.name));
                const missing = recipeIngs.filter(n => !userIngredients.includes(n));

                reply += `\n--------------------\n`; // Thêm dòng kẻ phân cách cho dễ nhìn
                reply += `${m.recipe.name} (Khớp ${Math.round(m.score * 100)}%)\n`;
                reply += `Có sẵn: ${m.matched.join(", ") || "Không có"}\n`;
                reply += `Thiếu: ${missing.join(", ") || "Không thiếu gì!"}\n`;

                // SỬA PHẦN NÀY: Hiển thị đầy đủ các bước
                reply += `Cách làm:\n`;
                if (Array.isArray(m.recipe.instructions)) {
                    // Duyệt qua từng bước và đánh số thứ tự
                    m.recipe.instructions.forEach((step, index) => {
                        reply += `${index + 1}. ${step}\n`;
                    });
                } else {
                    // Trường hợp instructions là string (nếu có)
                    reply += `${m.recipe.instructions}\n`;
                }
            });

            return reply;
        }

        /* Trò chuyện thông thường */
        else {
            prompt = `Người dùng vừa nói: "${userText}". Hãy trả lời thân thiện, tự nhiên bằng tiếng Việt.`;
        }


        /*  Gọi API Perplexity */
        const response = await axios.post(
            "https://api.perplexity.ai/chat/completions",
            {
                model: "sonar-pro",
                messages: [
                    {
                        role: "system",
                        content: "Bạn là trợ lý ảo thân thiện, biết nói chuyện tự nhiên, có thể gợi ý món ăn hoặc liệt kê thực phẩm từ MongoDB."
                    },
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${perplexityKey}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const reply = response.data.choices?.[0]?.message?.content;
        return reply || "Xin lỗi, mình chưa nghĩ ra câu trả lời phù hợp .";
    } catch (err) {
        console.error(" Perplexity error:", err.message);
        return "Xin lỗi, mình đang gặp lỗi khi gọi Perplexity .";
    }
}

/* ---------------- START SERVER ---------------- */
server.listen(PORT, () => {
    console.log(` Server listening on port ${PORT}`);
});
