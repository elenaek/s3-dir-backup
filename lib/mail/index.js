const nodemailer = require('nodemailer');

const { logger } = require('../logging');

// Send email notifcation
const sendSMTPNotification = async (receiverEmails, subject, text) => {
    try{
        let smtpAccount = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PW
            }
        });
        const email = {
            from: process.env.SMTP_USER,
            to: receiverEmails,
            subject,
            text
        }
        // console.log(email);
        const res = await smtpAccount.sendMail(email);
        logger.success(`Successfully sent `)
        return res;
    } catch(err){
        throw(err);
    }
}

module.exports = {
    sendSMTPNotification
}