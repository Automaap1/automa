const { createClient } = require('@supabase/supabase-js');

const BUSINESS_HOURS = ['09:00','10:00','11:00','12:00','16:00','17:00','18:00'];

const tools = [{
  functionDeclarations: [
    {
      name: 'check_availability',
      description: 'Consulta los huecos disponibles para una fecha concreta (formato YYYY-MM-DD).',
      parameters: {
        type: 'OBJECT',
        properties: { date: { type: 'STRING', description: 'Fecha en formato YYYY-MM-DD' } },
        required: ['date'],
      },
    },
    {
      name: 'book_appointment',
      description: 'Reserva una cita una vez el cliente ha confirmado fecha, hora, servicio, nombre y email.',
      parameters: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          time: { type: 'STRING' },
          service: { type: 'STRING' },
          client_name: { type: 'STRING' },
          client_email: { type: 'STRING' },
        },
        required: ['date', 'time', 'service', 'client_name', 'client_email'],
      },
    },
  ],
}];

async function checkAvailability(supabase, date) {
  const { data } = await supabase.from('appointments').select('appointment_time').eq('appointment_date', date);
  const taken = (data || []).map(r => r.appointment_time);
  return BUSINESS_HOURS.filter(h => !taken.includes(h));
}

async function bookAppointment(supabase, args) {
  const free = await checkAvailability(supabase, args.date);
  if (!free.includes(args.time)) {
    return { ok: false, message: 'Ese horario ya no está disponible.' };
  }
  const { error } = await supabase.from('appointments').insert([{
    client_name: args.client_name,
    client_email: args.client_email,
    service: args.service,
    appointment_date: args.date,
    appointment_time: args.time,
  }]);
  if (error) return { ok: false, message: 'Error al guardar la cita.' };
  return { ok: true, message: 'Cita confirmada.' };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Faltan mensajes.' });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const today = new Date().toISOString().split('T')[0];

    const systemInstruction = {
      parts: [{ text: `Eres el asistente de reservas de AUTOMA. Ayudas a los clientes a reservar una cita.
Hoy es ${today}. Horario disponible cada día: ${BUSINESS_HOURS.join(', ')}.
Usa check_availability para ver huecos libres de una fecha antes de ofrecerlos.
Antes de reservar, confirma con el cliente: fecha, hora, servicio, nombre y email.
Usa book_appointment solo cuando tengas los 5 datos confirmados por el cliente.
Sé breve, cercano y en español.` }]
    };

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let response = await callGemini(contents, systemInstruction);

    // handle function calls (allow a couple of rounds)
    for (let i = 0; i < 3; i++) {
      const parts = response.candidates?.[0]?.content?.parts || [];
      const fnCall = parts.find(p => p.functionCall);
      if (!fnCall) break;

      const { name, args } = fnCall.functionCall;
      let result;
      if (name === 'check_availability') result = { available: await checkAvailability(supabase, args.date) };
      else if (name === 'book_appointment') result = await bookAppointment(supabase, args);

      contents.push({ role: 'model', parts });
      contents.push({ role: 'user', parts: [{ functionResponse: { name, response: result } }] });

      response = await callGemini(contents, systemInstruction);
    }

    const finalText = response.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join(' ') || 'Lo siento, no he podido procesar tu mensaje.';
    res.status(200).json({ reply: finalText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del agente.' });
  }
};

async function callGemini(contents, systemInstruction) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, tools, systemInstruction }),
    }
  );
  const data = await r.json();
  if (!r.ok) {
    console.error('GEMINI ERROR:', JSON.stringify(data));
    throw new Error(data?.error?.message || 'Error desconocido de Gemini');
  }
  return data;
}
