const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

/* ---- Config Sandbox ---- */
const config = {
  appid: "553", // ID sandbox của bạn
  key1: "9phuAOYhan4urywHTh0ndEXiV3pKHr5Q",
  key2: "Iyz2habzyr7AG8SgvoBCbKwKi3UzlLi3",
  endpoint: "https://sandbox.zalopay.com.vn/v001/tpe/createorder"
};

/* ---- Tạo đơn hàng ---- */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, description } = req.body;

    const embed_data = {
      redirecturl: 'zalopaydemo://success', // DeepLink sau khi thanh toán xong
    };

    const items = [
      { itemid: '001', itemname: 'Thanh toán sản phẩm demo', itemprice: amount },
    ];

    // const transID = Math.floor(Math.random() * 1000000);
    const order = {
      appid: config.appid,
      apptransid: `${moment().format('YYMMDD')}_${uuid()}`, // định danh duy nhất
      appuser: "demo",
      apptime: Date.now(),
      item: JSON.stringify(items),
      embeddata: JSON.stringify(embed_data),
      amount: 50000,
      description: "ZaloPay Integration Demo",
      bankcode: "zalopayapp", //  chính là DeepLink để mở app ZaloPay
    };


    const data = config.appid + "|" + order.apptransid + "|" + order.appuser + "|" +
      order.amount + "|" + order.apptime + "|" + order.embeddata + "|" + order.item;

    order.mac = CryptoJS.HmacSHA256(data, config.key1).toString();


    const response = await axios.post(config.endpoint, null, { params: order });
    console.log('ZaloPay response:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Tạo đơn hàng thất bại' });
  }
});

/* ---- Callback ---- */
router.post('/callback', express.json(), (req, res) => {
  console.log('ZaloPay callback:', req.body);
  res.json({ return_code: 1, return_message: 'success' });
});

module.exports = router;
