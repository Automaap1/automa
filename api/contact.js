const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Faltan campos: nombre, email o mensaje.' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    await supabase.from('contact_messages').insert([{ name, email, message }]);

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM || 'onboarding@resend.dev',
      to: process.env.COMPANY_EMAIL,
      subject: `Nuevo mensaje de ${name} — AUTOMA`,
      html: `<p><b>Nombre:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Mensaje:</b> ${message}</p>`,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el mensaje.' });
  }
};
