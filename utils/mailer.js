const nodemailer = require("nodemailer");

// transporter setup
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: "jairo223555@gmail.com",
    pass: "dxok lvle zxag sxvi",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// sendMail function
async function sendMail(to, name, subject, message) {
  try {
    const info = await transporter.sendMail({
      from: `"Shwe Kone Tal" <jairo223555@gmail.com>`,
      to,
      subject,
      html: `
        <html>
        <head>
          <meta name="color-scheme" content="light dark">
          <meta name="supported-color-schemes" content="light dark">
          <style>
            body {
              background-color: #f3f4f6;
              color: #111827;
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            .card {
              background-color: #ffffff;
              border-radius: 10px;
              padding: 20px;
              max-width: 600px;
              margin: auto;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h2 { color: #2563eb; }
            a.button {
              display: inline-block;
              background-color: #2563eb;
              color: white !important;
              text-decoration: none;
              padding: 10px 20px;
              border-radius: 8px;
              font-weight: bold;
            }
            @media (prefers-color-scheme: dark) {
              body { background-color: #111827 !important; color: #e5e7eb !important; }
              .card { background-color: #1f2937 !important; box-shadow: none; }
              h2 { color: #60a5fa !important; }
              a.button { background-color: #3b82f6 !important; }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div style="text-align:center;">
              <h2>Shwe Kone Tal Notification</h2>
            </div>
            <p style="text-align:center;">Hi <b>${name}</b>,</p>
            <p style="text-align:center;">${message}</p>
            <div style="text-align:center;margin-top:30px;">
              <a href="#" class="button">Go to Login</a>
            </div>
            <hr style="margin-top:30px;border:none;border-top:1px solid #e5e7eb;">
            <p style="font-size:12px;color:#9ca3af;text-align:center;">
              © 2025 Shwe Kone Tal. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `,
      replyTo: "example@shwekontal.com",
    });

    console.log("✅ Mail sent:", info.response);
  } catch (err) {
    console.error("❌ Mail error:", err);
  }
}

module.exports = sendMail;