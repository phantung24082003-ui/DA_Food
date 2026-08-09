require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const axios = require('axios');
const admin = require('firebase-admin');

/* ---------------- FIREBASE INIT ---------------- */
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/* ---------------- EXPRESS + SOCKET.IO ---------------- */
const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
let history = [];

/* ---------------- REST ENDPOINTS ---------------- */
app.get('/history', (req, res) => res.json(history));

app.post('/history', (req, res) => {
  const msg = req.body;
  if (!msg || !msg.text) return res.status(400).json({ error: 'invalid message' });
  history.push(msg);
  res.status(201).json(msg);
});

/* ---------------- SOCKET.IO EVENTS ---------------- */
io.on('connection', (socket) => {
  console.log(' User connected:', socket.id);

  socket.on('message', async (payload) => {
    console.log(' Message received:', payload);

    io.emit('message', payload);
    history.push({ ...payload, id: Date.now() });

    if (payload.isBotRequest) {
      try {
        const botReply = await handleBotReply(payload.text);
        const botMsg = {
          text: botReply,
          from: 'bot',
          to: payload.from,
          id: Date.now() + 1,
          timestamp: new Date().toISOString(),
        };
        io.emit('message', botMsg);
        history.push(botMsg);
      } catch (err) {
        console.error(' Bot error:', err?.message || err);
      }
    }
  });

  socket.on('disconnect', () => console.log(' User disconnected:', socket.id));
});

/* ---------------- BOT LOGIC ---------------- */
async function handleBotReply(userText) {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) return 'Chưa cấu hình PERPLEXITY_API_KEY trong .env.';

  try {
    const lowerText = userText.toLowerCase(); 

    // ADDED: Phát hiện người dùng hỏi theo giá
    const pricePattern = /(\d+(\.\d+)?)(\s*)(k|nghìn|ngan|triệu|tr|m)?/g;
    const match = lowerText.match(pricePattern);

    if (lowerText.includes('dưới') && match) {
      const price = parsePrice(match[0]);
      const products = await findProductsUnderPrice(price);
      if (products.length > 0)
        return ` Các sản phẩm có giá dưới ${price.toLocaleString()}₫:\n\n${products.join('\n\n')}`;
      return `Không tìm thấy sản phẩm nào dưới ${price.toLocaleString()}₫ `;
    }

    if (lowerText.includes('trên') && match) {
      const price = parsePrice(match[0]);
      const products = await findProductsAbovePrice(price);
      if (products.length > 0)
        return ` Các sản phẩm có giá trên ${price.toLocaleString()}₫:\n\n${products.join('\n\n')}`;
      return `Không tìm thấy sản phẩm nào trên ${price.toLocaleString()}₫ `;
    }

    if (match && match.length >= 2 && lowerText.includes('đến')) {
      const min = parsePrice(match[0]);
      const max = parsePrice(match[1]);
      const products = await findProductsInRange(min, max);
      if (products.length > 0)
        return ` Sản phẩm trong khoảng ${min.toLocaleString()}₫ - ${max.toLocaleString()}₫:\n\n${products.join('\n\n')}`;
      return `Không tìm thấy sản phẩm nào trong khoảng ${min.toLocaleString()}₫ - ${max.toLocaleString()}₫ `;
    }

    // Tìm sản phẩm theo nội dung người dùng nhập
    const foundProducts = await findProductByTitle(userText);

    if (foundProducts.length > 0) {
      // Lấy tối đa 5 sản phẩm
      const topProducts = foundProducts.slice(0, 5);
      let replyText = " Các sản phẩm bạn tìm:\n\n";
      topProducts.forEach(p => {
        const price = p.SalePrice > 0 ? p.SalePrice : p.Price;
        replyText += `${p.Title}\nGiá: ${price?.toLocaleString() || 'Liên hệ'}₫\nThương hiệu: ${p.Brand?.Name || 'Không rõ'}\nMô tả: ${p.Description || 'Không có mô tả'}\n\n`;
      });
      return replyText.trim();
    }

    // Nếu không thấy sản phẩm thì fallback sang Perplexity
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content:
              'Bạn là chatbot bán hàng thân thiện, trả lời ngắn gọn, tự nhiên, bằng tiếng Việt.',
          },
          { role: 'user', content: userText },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices?.[0]?.message?.content || 'Xin lỗi, mình chưa hiểu ý bạn.';
  } catch (err) {
    console.error(' Lỗi xử lý bot:', err.message);
    return 'Xin lỗi, mình đang gặp lỗi khi xử lý tin nhắn .';
  }
}

/* ---------------- FIRESTORE PRODUCT QUERY ---------------- */
async function findProductByTitle(userInput) {
  const productsRef = db.collection('Products');
  const lowerInput = userInput.toLowerCase();

  const snapshot = await productsRef.get();
  if (snapshot.empty) return [];

  const products = snapshot.docs.map(doc => doc.data());

  // Lọc các sản phẩm Title bắt đầu bằng từ khóa
  const matched = products.filter(p => p.Title?.toLowerCase().startsWith(lowerInput));

  return matched; // trả về mảng sản phẩm
}

/* ----------------  ADDED: TÌM THEO GIÁ ---------------- */
function parsePrice(text) {
  let n = parseFloat(text);
  if (text.includes('tr') || text.includes('triệu') || text.includes('m')) n *= 1_000_000;
  else if (text.includes('k') || text.includes('nghìn') || text.includes('ngan')) n *= 1_000;
  return n;
}

async function findProductsUnderPrice(maxPrice) {
  const snapshot = await db.collection('Products').get();
  const result = [];
  snapshot.forEach((doc) => {
    const p = doc.data();
    const price = p.SalePrice > 0 ? p.SalePrice : p.Price;
    if (price && price <= maxPrice) {
      result.push(` ${p.Title} - ${price.toLocaleString()}₫\n Còn ${p.Stock || 0} sp\n ${p.Thumbnail}`);
    }
  });
  return result.slice(0, 5);
}

async function findProductsAbovePrice(minPrice) {
  const snapshot = await db.collection('Products').get();
  const result = [];
  snapshot.forEach((doc) => {
    const p = doc.data();
    const price = p.SalePrice > 0 ? p.SalePrice : p.Price;
    if (price && price >= minPrice) {
      result.push(` ${p.Title} - ${price.toLocaleString()}₫\n Còn ${p.Stock || 0} sp\n ${p.Thumbnail}`);
    }
  });
  return result.slice(0, 5);
}

async function findProductsInRange(min, max) {
  const snapshot = await db.collection('Products').get();
  const result = [];
  snapshot.forEach((doc) => {
    const p = doc.data();
    const price = p.SalePrice > 0 ? p.SalePrice : p.Price;
    if (price && price >= min && price <= max) {
      result.push(` ${p.Title} - ${price.toLocaleString()}₫\n Còn ${p.Stock || 0} sp\n ${p.Thumbnail}`);
    }
  });
  return result.slice(0, 5);
}

/* ---------------- START SERVER ---------------- */
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
