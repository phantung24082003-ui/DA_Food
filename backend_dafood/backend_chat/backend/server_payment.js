require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body; // đơn vị: cents (USD)
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
