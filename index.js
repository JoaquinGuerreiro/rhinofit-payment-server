const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de entorno
const isProd = process.env.NODE_ENV === 'production';
const FRONTEND_URL = isProd 
    ? 'https://rhinofit-21a4a.web.app'
    : 'http://localhost:5173';

// Configuración de Mercado Pago con las credenciales de la aplicación
const client = new MercadoPagoConfig({ 
    accessToken: 'TEST-4934661515329482-020314-bfdaddff3de719c28021d78b1d2438b8-1076331166'
});

// Ruta de health check para Render
app.get('/', (req, res) => {
    res.send('RhinoFit Payment Server is running!');
});

// Almacén temporal de tokens de pago (en producción esto debería estar en una base de datos)
const paymentTokens = new Map();

app.post('/create-preference', async (req, res) => {
    try {
        // Generar token único para esta transacción
        const paymentToken = crypto.randomBytes(32).toString('hex');
        const expirationTime = Date.now() + 3600000; // 1 hora de validez

        const preference = new Preference(client);
        const preferenceData = {
            items: [
                {
                    title: "Suscripción Premium RhinoFit",
                    currency_id: "ARS",
                    picture_url: "https://rhinofit.app/logo.png",
                    description: "Suscripción mensual al plan premium",
                    quantity: 1,
                    unit_price: 49999
                }
            ],
            back_urls: {
                success: `${FRONTEND_URL}/#/payment/success?token=${paymentToken}`,
                failure: `${FRONTEND_URL}/#/payment/failure?token=${paymentToken}`,
                pending: `${FRONTEND_URL}/#/payment/pending?token=${paymentToken}`
            },
            auto_return: "approved",
            binary_mode: true,
            statement_descriptor: "RHINOFIT"
        };

        const result = await preference.create({ body: preferenceData });
        
        // Guardar el token con su tiempo de expiración
        paymentTokens.set(paymentToken, {
            expirationTime,
            used: false
        });

        res.json({
            ...result,
            paymentToken
        });
    } catch (error) {
        console.error('Error al crear preferencia:', error);
        res.status(500).json({ 
            error: 'Error al crear la preferencia',
            details: error.message 
        });
    }
});

// Nuevo endpoint para verificar token
app.post('/verify-payment', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ valid: false, message: 'Token no proporcionado' });
    }

    const tokenData = paymentTokens.get(token);
    
    if (!tokenData) {
        return res.status(400).json({ valid: false, message: 'Token inválido' });
    }

    if (tokenData.used) {
        return res.status(400).json({ valid: false, message: 'Token ya utilizado' });
    }

    if (Date.now() > tokenData.expirationTime) {
        paymentTokens.delete(token);
        return res.status(400).json({ valid: false, message: 'Token expirado' });
    }

    // Marcar el token como usado
    tokenData.used = true;
    paymentTokens.set(token, tokenData);

    res.json({ valid: true });
});

// Endpoint para webhooks
app.post('/webhook', async (req, res) => {
    console.log('Webhook recibido:', req.body);
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});