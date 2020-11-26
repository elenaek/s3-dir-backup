const nodemailer = require('nodemailer');
const { logger } = require('../logging');

const { DEFAULT } = require("../constants");

// Send email notifcation
const sendSMTPNotification = async (receiverEmails, subject, text) => {
    try{
        let smtpAccount = await generateSmtpTransport();
        let email = {
            from: process.env.SMTP_USER,
            to: receiverEmails,
            subject,
            text
        }
        const res = await smtpAccount.sendMail(email);
        logger.success(`Successfully sent job notifcation to ${receiverEmails}`);
        return res;
    } catch(err){
        logger.error(JSON.stringify(err));
        throw(err);
    }
}

// Check if SMTP settings are valid
const validConfiguration = async () => {
    let smtpAccount = await generateSmtpTransport();
    try{
        await smtpAccount.verify();
        return true
    }catch(err){
        return false
    }
}

const generateSmtpTransport = async () => {
    let { SMTP_SECURE, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PW } = process.env;
    return await nodemailer.createTransport({
        host: SMTP_HOST || DEFAULT.SMTP_HOST,
        port: SMTP_PORT || DEFAULT.SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PW
        }
    });
}

module.exports = {
    sendSMTPNotification,
    validConfiguration
}