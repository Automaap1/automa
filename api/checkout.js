const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, price, mode } = req.body || {};
  if (!plan || !price) return res.status(400).json({ error: 'Falta el plan o el precio.' });

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: mode === 'subscription' ? 'subscription' : 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: plan },
          unit_amount: Math.round(price * 100),
          ...(mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
        },
        quantity: 1,
      }],
      success_url: `${process.env.SITE_URL}/?pago=exito`,
      cancel_url: `${process.env.SITE_URL}/?pago=cancelado`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el pago.' });
  }
};
