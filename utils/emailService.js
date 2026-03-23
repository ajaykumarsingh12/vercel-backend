const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials not configured. Email notifications will be skipped.');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail', // You can change this to other services
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use App Password for Gmail
    },
  });
};

// Send booking confirmation email to hall owner
const sendBookingNotificationEmail = async (hallOwner, booking, user, hall) => {
  try {
    const transporter = createTransporter();
    
    // Skip if email not configured
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    const bookingDate = new Date(booking.bookingDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long'
    });

    const mailOptions = {
      from: {
        name: 'BookMyHall',
        address: process.env.EMAIL_USER
      },
      to: hallOwner.email,
      subject: `🎉 New Booking Confirmed - ${hall.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .booking-details {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #667eea;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .label {
              font-weight: bold;
              color: #667eea;
            }
            .value {
              color: #333;
            }
            .amount {
              font-size: 24px;
              font-weight: bold;
              color: #28a745;
              text-align: center;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              color: #666;
              font-size: 14px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🎉 New Booking Confirmed!</h1>
            <p>You have received a new booking for your hall</p>
          </div>
          
          <div class="content">
            <p>Dear ${hallOwner.name},</p>
            
            <p>Great news! A customer has successfully booked your hall and completed the payment.</p>
            
            <div class="booking-details">
              <h3 style="margin-top: 0; color: #667eea;">📋 Booking Details</h3>
              
              <div class="detail-row">
                <span class="label">Hall Name:</span>
                <span class="value">${hall.name}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Customer Name:</span>
                <span class="value">${user.name}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Customer Email:</span>
                <span class="value">${user.email}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Customer Phone:</span>
                <span class="value">${user.phone || 'Not provided'}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Booking Date:</span>
                <span class="value">${bookingDate}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Time Slot:</span>
                <span class="value">${booking.startTime} - ${booking.endTime}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Duration:</span>
                <span class="value">${booking.totalHours} hours</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Booking ID:</span>
                <span class="value">${booking._id}</span>
              </div>
            </div>
            
            <div class="amount">
              💰 Amount Paid: ₹${booking.totalAmount}
            </div>
            
            <p style="background: #e7f3ff; padding: 15px; border-radius: 5px; border-left: 4px solid #2196F3;">
              <strong>📞 Next Steps:</strong><br>
              Please contact the customer to confirm the booking details and discuss any special requirements.
            </p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/hall-owner/dashboard" class="button">
                View Dashboard
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p>This is an automated email from BookMyHall.</p>
            <p>Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} BookMyHall. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
New Booking Confirmed!

Dear ${hallOwner.name},

You have received a new booking for your hall.

Booking Details:
- Hall Name: ${hall.name}
- Customer Name: ${user.name}
- Customer Email: ${user.email}
- Customer Phone: ${user.phone || 'Not provided'}
- Booking Date: ${bookingDate}
- Time Slot: ${booking.startTime} - ${booking.endTime}
- Duration: ${booking.totalHours} hours
- Amount Paid: ₹${booking.totalAmount}
- Booking ID: ${booking._id}

Please contact the customer to confirm the booking details.

Best regards,
BookMyHall Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('Error sending email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send booking confirmation email to customer
const sendBookingConfirmationToCustomer = async (user, booking, hall) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    const bookingDate = new Date(booking.bookingDate).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long'
    });

    const mailOptions = {
      from: {
        name: 'BookMyHall',
        address: process.env.EMAIL_USER
      },
      to: user.email,
      subject: `✅ Booking Confirmed - ${hall.name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .booking-details {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #28a745;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .label {
              font-weight: bold;
              color: #28a745;
            }
            .value {
              color: #333;
            }
            .amount {
              font-size: 24px;
              font-weight: bold;
              color: #28a745;
              text-align: center;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              color: #666;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>✅ Booking Confirmed!</h1>
            <p>Your payment was successful</p>
          </div>
          
          <div class="content">
            <p>Dear ${user.name},</p>
            
            <p>Thank you for booking with BookMyHall! Your payment has been successfully processed and your booking is confirmed.</p>
            
            <div class="booking-details">
              <h3 style="margin-top: 0; color: #28a745;">📋 Your Booking Details</h3>
              
              <div class="detail-row">
                <span class="label">Hall Name:</span>
                <span class="value">${hall.name}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Location:</span>
                <span class="value">${hall.location?.city}, ${hall.location?.state}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Booking Date:</span>
                <span class="value">${bookingDate}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Time Slot:</span>
                <span class="value">${booking.startTime} - ${booking.endTime}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Duration:</span>
                <span class="value">${booking.totalHours} hours</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Booking ID:</span>
                <span class="value">${booking._id}</span>
              </div>
            </div>
            
            <div class="amount">
              💰 Amount Paid: ₹${booking.totalAmount}
            </div>
            
            <p style="background: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
              <strong>📞 Important:</strong><br>
              The hall owner will contact you shortly to confirm the booking details and discuss any special requirements.
            </p>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing BookMyHall!</p>
            <p>&copy; ${new Date().getFullYear()} BookMyHall. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Booking Confirmed!

Dear ${user.name},

Your payment has been successfully processed and your booking is confirmed.

Booking Details:
- Hall Name: ${hall.name}
- Location: ${hall.location?.city}, ${hall.location?.state}
- Booking Date: ${bookingDate}
- Time Slot: ${booking.startTime} - ${booking.endTime}
- Duration: ${booking.totalHours} hours
- Amount Paid: ₹${booking.totalAmount}
- Booking ID: ${booking._id}

The hall owner will contact you shortly.

Thank you for choosing BookMyHall!
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error('Error sending customer email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send Telegram notification to admin
const sendTelegramNotification = async (message) => {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return { success: false };
    }

    const axios = require('axios');
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }
    );
    return { success: true };
  } catch (error) {
    console.error('Telegram error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendBookingNotificationEmail,
  sendBookingConfirmationToCustomer,
  sendTelegramNotification,
};
