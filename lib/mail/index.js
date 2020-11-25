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
        throw(err);
    }
}

const validConfiguration = () => {
    let smtpAccount = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PW
        }
    });

    smtpAccount.verify((err, success) => {
        if(err){
            console.log(err);
            return false
        }
        else{
            console.log("Valid SMTP configuration!");
            return true
        }
    })
}

module.exports = {
    sendSMTPNotification,
    validConfiguration
}