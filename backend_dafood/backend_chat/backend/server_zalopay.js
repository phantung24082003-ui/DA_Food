// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const CryptoJS = require('crypto-js');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(bodyParser.json());

/* ---------------- ZALOPAY CONFIG (SANDBOX) ---------------- */
const config = {
  app_id: 553, // App ID demo ZaloPay
  key1: "sdnghweP6vd22nOwUhzDNGym2gU7W8yU", // key1 của sandbox
  key2: "Iyz2habzyr7AG8SgvoBCbKwKi3UzlLi3", // không cần nếu chưa xác minh callback
  endpoint: "https://sandbox.zalopay.com.vn/v001/tpe/createorder", // endpoint chính xác
};

/* ---------------- API TẠO ĐƠN HÀNG ---------------- */
app.post('/api/zalopay/create-order', async (req, res) => {
  try {
    const { amount, description } = req.body;

    // Dữ liệu điều hướng (deep link)
    const embeddata = {
      redirecturl: "tshop://payment-success", // dùng deep link của Flutter app
    };

    const items = [
      { itemid: 'sp001', itemname: 'Sản phẩm demo', itemprice: amount, itemquantity: 1 },
    ];

    const transID = uuidv4().split('-')[0]; // rút gọn ID cho dễ đọc
    const appTransId = `${moment().format('YYMMDD')}_${transID}`;

    const order = {
      app_id: config.app_id,
      app_trans_id: appTransId,
      app_user: 'flutter_user',
      app_time: Date.now(),
      item: JSON.stringify(items),
      embed_data: JSON.stringify(embeddata),
      amount,
      description: description || `Thanh toán đơn hàng #${transID}`,
      bank_code: 'zalopayapp', // bắt buộc để mở ZaloPay app
      callback_url: "https://yourdomain.com/api/zalopay/callback", // tạm để mẫu
    };

    // Tạo chữ ký HMAC SHA256
    const data =
      `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
    order.mac = CryptoJS.HmacSHA256(data, config.key1).toString();

    // Gửi request tạo đơn hàng đến ZaloPay
    const response = await axios.post(config.endpoint, null, { params: order });

    console.log(" ZaloPay Response:", response.data);
    res.json(response.data);
  } catch (err) {
    console.error(" Lỗi tạo đơn hàng:", err);
    res.status(500).json({ message: 'Tạo đơn hàng thất bại', error: err.message });
  }
});

/* ---------------- SERVER START ---------------- */
const PORT = 4242;
app.listen(PORT, () => console.log(` Server running on http://localhost:${PORT}`));
